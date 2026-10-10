// Demo backend that runs entirely in the browser, with no server. Data is kept in
// localStorage, and each tab can sign in as a different user to see both sides.
import { makeTxn, type NewTxn, type Txn } from "../core/ledger";
import type { Phone } from "../core/phone";
import type { RawReceipt } from "../core/receipt";
import type { Backend, Bill, Contact, NewBill, PushState } from "./backend";

interface Store {
  users: Record<Phone, string>;
  contacts: Record<Phone, Contact[]>;
  txns: Txn[];
  bills: Bill[];
}

const KEY = "daftarna-demo-v1";
const SESSION = "daftarna-demo-me";
export const DEMO_CODE = "123456";

const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

// In-memory copy, so the demo still works when browser storage is blocked
let memory: Store | null = null;

function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.users) return (memory = s);
  } catch { /* storage unavailable */ }
  return memory ?? (memory = { users: {}, contacts: {}, txns: [], bills: [] });
}

function persist(s: Store) {
  memory = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* keep the in-memory copy */ }
}

export function createDemoBackend(): Backend {
  let store = load();
  let me: Phone | null = null;
  try { me = sessionStorage.getItem(SESSION) || localStorage.getItem(SESSION); } catch { /* */ }
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const save = () => { persist(store); emit(); };
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) { store = load(); emit(); }
  });
  const sub = (fn: () => void) => { listeners.add(fn); fn(); return () => { listeners.delete(fn); }; };
  const setMe = (p: Phone | null) => {
    me = p;
    try {
      if (p) { sessionStorage.setItem(SESSION, p); localStorage.setItem(SESSION, p); }
      else { sessionStorage.removeItem(SESSION); localStorage.removeItem(SESSION); }
    } catch { /* */ }
    emit();
  };

  return {
    mode: "demo",
    onAuth(cb) {
      return sub(() => cb(me ? { phone: me, name: store.users[me] ?? null } : null));
    },
    async startPhoneSignIn(phone) {
      await new Promise((r) => setTimeout(r, 300));
      return {
        async confirm(code) {
          if (code.trim() !== DEMO_CODE) throw new Error("bad-code");
          setMe(phone);
        },
      };
    },
    async saveName(name) {
      if (!me) throw new Error("not-signed-in");
      store.users[me] = name;
      save();
    },
    async signOut() { setMe(null); },

    watchContacts(cb) {
      return sub(() => cb(me ? [...(store.contacts[me] ?? [])] : []));
    },
    async saveContact(c) {
      if (!me) throw new Error("not-signed-in");
      const list = store.contacts[me] ?? (store.contacts[me] = []);
      const i = list.findIndex((x) => x.phone === c.phone);
      if (i >= 0) list[i] = c; else list.push(c);
      save();
    },
    async lookupUser(phone) {
      const n = store.users[phone];
      return n ? { name: n } : null;
    },

    watchTxns(cb) {
      // Same privacy rule as the server: only entries I'm a party to
      return sub(() => cb(me ? store.txns.filter((t) => t.parties.includes(me!)) : []));
    },
    async addTxns(news: NewTxn[], bill?: NewBill) {
      if (!me) throw new Error("not-signed-in");
      const now = Date.now();
      let billId: string | undefined;
      if (bill) {
        billId = uid();
        const parties = [...new Set([me, bill.payer, ...Object.keys(bill.shares)])];
        store.bills.push({ ...bill, id: billId, createdBy: me, parties, createdAt: now });
      }
      const made = news.map((t) => {
        if (t.createdBy !== me) throw new Error("permission-denied");
        const isParty = t.creditor === me || t.debtor === me;
        if (!isParty && !(bill && t.creditor === bill.payer)) throw new Error("permission-denied");
        if (t.kind === "reversal" && store.txns.some((x) => x.reverses === t.reverses)) throw new Error("already-reversed");
        return makeTxn({ ...t, billId: billId ?? t.billId }, uid(), now);
      });
      store.txns.push(...made);
      save();
      return made;
    },

    async readReceipt() {
      await new Promise((r) => setTimeout(r, 1200));
      return SAMPLE_RECEIPT;
    },

    async pushState(): Promise<PushState> { return "unsupported"; },
    async enablePush(): Promise<PushState> { return "unsupported"; },
  };
}

/** Sample data: a few friends and entries created by both sides. */
export function seedDemo(backendMe: Phone, myName: string) {
  const store = load();
  const AHMAD = "+962782222222", LINA = "+962773333333", OMAR = "+962794444444";
  store.users[AHMAD] = "أحمد";
  store.users[LINA] = "لينا";
  store.users[backendMe] = myName;
  store.contacts[backendMe] = [
    { phone: AHMAD, name: "أحمد" },
    { phone: LINA, name: "لينا" },
    { phone: OMAR, name: "عمر" },
  ];
  store.contacts[AHMAD] = [{ phone: backendMe, name: myName }];
  store.contacts[LINA] = [{ phone: backendMe, name: myName }];
  const day = 86_400_000, now = Date.now();
  const mk = (t: NewTxn, ago: number) => makeTxn(t, uid(), now - ago * day);
  store.txns.push(
    mk({ creditor: backendMe, debtor: AHMAD, amount: 12000, kind: "lend", note: "تكسي المطار", createdBy: backendMe, createdByName: myName }, 6),
    mk({ creditor: LINA, debtor: backendMe, amount: 5500, kind: "split", note: "غدا من مطعم الريم", createdBy: LINA, createdByName: "لينا" }, 3),
    mk({ creditor: backendMe, debtor: LINA, amount: 2000, kind: "paidFor", note: "قهوة", createdBy: backendMe, createdByName: myName }, 2),
    mk({ creditor: backendMe, debtor: OMAR, amount: 3750, kind: "lend", note: "اشتراك نتفلكس", createdBy: backendMe, createdByName: myName }, 1),
  );
  persist(store);
  window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
}

const SAMPLE_RECEIPT: RawReceipt = {
  readable: true,
  restaurant: "مطعم الريم",
  currency: "JOD",
  items: [
    { name: "شاورما عربي دبل", qty: 2, unit_price: 3.75, line_total: 7.5 },
    { name: "Fattoush سلطة فتوش", qty: 1, unit_price: 2.5, line_total: 2.5 },
    { name: "حمص بيروتي", qty: 1, unit_price: 1.75, line_total: 1.75 },
    { name: "Mixed Grill مشاوي مشكلة", qty: 1, unit_price: 9.5, line_total: 9.5 },
    { name: "ليمون ونعنع", qty: 3, unit_price: 1.5, line_total: 4.5 },
  ],
  subtotal: 25.75,
  tax: 4.532,
  service: 2.575,
  delivery: 0,
  discount: 0,
  total: 32.857,
};
