// Production backend: Firebase phone auth, Firestore, Cloud Functions and FCM push.
import { initializeApp, type FirebaseOptions } from "firebase/app";
import {
  getAuth, onAuthStateChanged, RecaptchaVerifier, signInWithPhoneNumber, signOut as fbSignOut,
} from "firebase/auth";
import {
  collection, doc, getDoc, getFirestore, onSnapshot, query, runTransaction, serverTimestamp, setDoc, Timestamp,
  where, writeBatch, type DocumentData,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { makeTxn, type NewTxn, type Txn } from "../core/ledger";
import type { Phone } from "../core/phone";
import type { RawReceipt } from "../core/receipt";
import type { Backend, Contact, Group, NewBill, PushState } from "./backend";
import { blobToBase64, isIos, isStandalone } from "../ui/util";

export function createFirebaseBackend(config: FirebaseOptions, vapidKey: string | undefined): Backend {
  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = "ar";
  const db = getFirestore(app);
  const fns = getFunctions(app, "europe-west1");

  let me: { uid: string; phone: Phone } | null = null;
  const need = () => { if (!me) throw new Error("not-signed-in"); return me; };

  const toTxn = (id: string, d: Record<string, unknown>): Txn => ({
    ...(d as unknown as Txn),
    id,
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Date.now(),
  });

  const toGroup = (id: string, d: DocumentData): Group => ({
    id, name: d.name, emoji: d.emoji, members: d.members ?? [], names: d.names ?? {}, createdBy: d.createdBy,
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : Date.now(),
  });
  let myName = "";

  /** Adds one person to a group (read, merge, write in a transaction so concurrent joins don't clash). */
  async function addToGroup(groupId: string, phone: Phone, name: string) {
    const ref = doc(db, "groups", groupId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("not-found");
      const g = snap.data();
      const members: Phone[] = g.members ?? [];
      if (members.includes(phone) && g.names?.[phone]) return;
      tx.update(ref, {
        members: members.includes(phone) ? members : [...members, phone],
        names: { ...(g.names ?? {}), [phone]: g.names?.[phone] || name },
      });
    });
  }

  return {
    mode: "firebase",
    onAuth(cb) {
      let unsubProfile: (() => void) | null = null;
      const un = onAuthStateChanged(auth, (u) => {
        unsubProfile?.(); unsubProfile = null;
        if (!u || !u.phoneNumber) { me = null; cb(null); return; }
        me = { uid: u.uid, phone: u.phoneNumber };
        // Open straight away with the name remembered on this device; the profile read can be slow
        const nameKey = `daftarna-name-${u.uid}`;
        let cached = "";
        try { cached = localStorage.getItem(nameKey) ?? ""; } catch { /* */ }
        if (cached) { myName = cached; cb({ phone: u.phoneNumber, name: cached }); }
        unsubProfile = onSnapshot(doc(db, "users", u.uid), (s) => {
          myName = (s.data()?.name as string) || "";
          try { if (myName) localStorage.setItem(nameKey, myName); } catch { /* */ }
          if (myName !== cached || !cached) cb({ phone: u.phoneNumber!, name: myName || null });
          cached = myName;
        }, () => { if (!cached) cb({ phone: u.phoneNumber!, name: null }); });
      });
      return () => { un(); unsubProfile?.(); };
    },
    async startPhoneSignIn(phone, recaptchaEl) {
      const verifier = new RecaptchaVerifier(auth, recaptchaEl, { size: "invisible" });
      const res = await signInWithPhoneNumber(auth, phone, verifier);
      return { async confirm(code) { await res.confirm(code.trim()); } };
    },
    async saveName(name) {
      const m = need();
      const batch = writeBatch(db);
      batch.set(doc(db, "users", m.uid), { phone: m.phone, name }, { merge: true });
      batch.set(doc(db, "phones", m.phone), { uid: m.uid, name });
      await batch.commit();
    },
    async signOut() { await fbSignOut(auth); },

    watchContacts(cb) {
      const m = need();
      return onSnapshot(collection(db, "users", m.uid, "contacts"), (s) => {
        cb(s.docs.map((d) => d.data() as Contact));
      });
    },
    async saveContact(c) {
      const m = need();
      await setDoc(doc(db, "users", m.uid, "contacts", c.phone), { phone: c.phone, name: c.name });
    },
    async lookupUser(phone) {
      const s = await getDoc(doc(db, "phones", phone));
      return s.exists() ? { name: String(s.data().name ?? "") } : null;
    },

    watchGroups(cb) {
      const m = need();
      const q = query(collection(db, "groups"), where("members", "array-contains", m.phone));
      return onSnapshot(q, (s) => cb(s.docs.map((d) => toGroup(d.id, d.data({ serverTimestamps: "estimate" })))));
    },
    async createGroup(name, emoji) {
      const m = need();
      const ref = doc(collection(db, "groups"));
      const data = { name, emoji, members: [m.phone], names: { [m.phone]: myName }, createdBy: m.phone };
      await setDoc(ref, { ...data, createdAt: serverTimestamp() });
      return { ...data, id: ref.id, createdAt: Date.now() };
    },
    async addGroupMember(groupId, c) { need(); await addToGroup(groupId, c.phone, c.name); },
    async getGroup(groupId) {
      need();
      try {
        const s = await getDoc(doc(db, "groups", groupId));
        return s.exists() ? toGroup(s.id, s.data()) : null;
      } catch { return null; }
    },
    async joinGroup(groupId) { const m = need(); await addToGroup(groupId, m.phone, myName); },

    watchTxns(cb) {
      const m = need();
      const q = query(collection(db, "txns"), where("parties", "array-contains", m.phone));
      return onSnapshot(q, (s) => {
        cb(s.docs.map((d) => toTxn(d.id, d.data({ serverTimestamps: "estimate" }))));
      });
    },
    async addTxns(news: NewTxn[], bill?: NewBill) {
      const m = need();
      const batch = writeBatch(db);
      let billId: string | undefined;
      if (bill) {
        const ref = doc(collection(db, "bills"));
        billId = ref.id;
        const parties = [...new Set([m.phone, bill.payer, ...Object.keys(bill.shares)])];
        batch.set(ref, { ...bill, createdBy: m.phone, parties, createdAt: serverTimestamp() });
      }
      const made: Txn[] = [];
      for (const t of news) {
        const ref = doc(collection(db, "txns"));
        const full = makeTxn({ ...t, ...(billId ? { billId } : {}) }, ref.id);
        const { id: _id, createdAt: _c, ...data } = full;
        // Firestore rejects undefined fields
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        batch.set(ref, { ...clean, createdAt: serverTimestamp() });
        // Marker that the original was reversed (security rules use it to block double reversals)
        if (full.kind === "reversal" && full.reverses) batch.set(doc(db, "reversals", full.reverses), { by: m.phone });
        made.push(full);
      }
      await batch.commit();
      return made;
    },

    async readReceipt(image) {
      const call = httpsCallable<{ image: string; mediaType: string }, RawReceipt>(fns, "readReceipt", { timeout: 90_000 });
      const res = await call({ image: await blobToBase64(image), mediaType: image.type || "image/jpeg" });
      return res.data;
    },

    async pushState(): Promise<PushState> {
      if (isIos() && !isStandalone()) return "needsInstall";
      if (!("Notification" in window) || !(await isSupported())) return "unsupported";
      return Notification.permission as PushState;
    },
    async enablePush(): Promise<PushState> {
      const m = need();
      if (isIos() && !isStandalone()) return "needsInstall";
      if (!("Notification" in window) || !(await isSupported()) || !vapidKey) return "unsupported";
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return perm as PushState;
      const reg = await navigator.serviceWorker.ready;
      const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
      if (token) {
        await setDoc(doc(db, "users", m.uid, "tokens", token.slice(-40)), { token, createdAt: serverTimestamp() });
      }
      return "granted";
    },
  };
}
