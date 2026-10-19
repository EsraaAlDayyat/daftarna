import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import type { Txn } from "../../src/core/ledger";
import { readReceiptWithClaude, ReceiptError } from "./receipt";
import { commentPayload, pushPayload, recipientsOf } from "./notify";

initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 5 });
const db = getFirestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const RECEIPT_MODEL = defineString("RECEIPT_MODEL", { default: "claude-haiku-5-5" });
const DAILY_LIMIT = 30; // receipt reads per user per day

/** Reads a receipt photo. The API key never leaves the server. */
export const readReceipt = onCall(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 90, memory: "512MiB", enforceAppCheck: false },
  async (req) => {
    if (!req.auth?.token.phone_number) throw new HttpsError("unauthenticated", "سجّل الدخول أولًا");
    const { image, mediaType, orders } = (req.data ?? {}) as { image?: string; mediaType?: string; orders?: unknown };
    // Optional list of who ordered what; ids are short placeholders chosen by the app
    const orderList = Array.isArray(orders)
      ? orders.slice(0, 50)
        .filter((o): o is { id: string; text: string } => typeof o?.id === "string" && typeof o?.text === "string")
        .map((o) => ({ id: o.id.slice(0, 8), text: o.text.slice(0, 200) }))
      : [];

    // Daily quota so the API key can't be abused
    const day = new Date().toISOString().slice(0, 10);
    const usage = db.doc(`usage/${req.auth.uid}_${day}`);
    const count = await db.runTransaction(async (tx) => {
      const n = ((await tx.get(usage)).data()?.count as number | undefined) ?? 0;
      if (n >= DAILY_LIMIT) return n + 1;
      tx.set(usage, { count: n + 1, at: FieldValue.serverTimestamp() }, { merge: true });
      return n + 1;
    });
    if (count > DAILY_LIMIT) throw new HttpsError("resource-exhausted", "بلغت الحد اليومي لقراءة الفواتير");

    try {
      return await readReceiptWithClaude({
        image: image ?? "", mediaType: mediaType ?? "image/jpeg",
        apiKey: ANTHROPIC_API_KEY.value(), model: RECEIPT_MODEL.value(), orders: orderList,
      });
    } catch (e) {
      if (e instanceof ReceiptError) {
        logger.warn("receipt failed", { code: e.code, msg: e.message });
        if (e.code === "too-big") throw new HttpsError("invalid-argument", "الصورة كبيرة جدًا");
        if (e.code === "bad-image") throw new HttpsError("invalid-argument", "الصورة غير صالحة");
        if (e.code === "unreadable") throw new HttpsError("failed-precondition", "غير واضحة");
      }
      logger.error("receipt error", e);
      throw new HttpsError("internal", "تعذّرت قراءة الفاتورة");
    }
  },
);

/** Sends a push to every device of one user. Skips people who aren't on the app. */
async function pushTo(phone: string, payload: Record<string, string>) {
  const owner = await db.doc(`phones/${phone}`).get();
  const uid = owner.data()?.uid as string | undefined;
  if (!uid) return; // not on the app; WhatsApp covers them
  const tokensSnap = await db.collection(`users/${uid}/tokens`).get();
  if (tokensSnap.empty) return;
  const tokens = tokensSnap.docs.map((x) => x.data().token as string);
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: payload,
    webpush: { headers: { Urgency: "high", TTL: String(3 * 24 * 3600) } },
  });
  // Drop tokens for devices that are gone
  await Promise.all(res.responses.map((r, i) => {
    const code = r.error?.code ?? "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
      return tokensSnap.docs[i].ref.delete();
    }
    return null;
  }));
}

/** Sends a push notification to the other party of every new transaction. */
export const notifyOnTxn = onDocumentCreated("txns/{id}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const d = snap.data();
  const t = { ...d, id: snap.id, createdAt: (d.createdAt as Timestamp | undefined)?.toMillis() ?? Date.now() } as Txn;

  for (const phone of recipientsOf(t)) {
    const all = (await db.collection("txns").where("parties", "array-contains", phone).get())
      .docs.map((x) => ({ ...x.data(), id: x.id }) as Txn);
    await pushTo(phone, pushPayload(t, phone, all));
  }
});

/** Tells the other party of an entry about a new comment on it. */
export const notifyOnComment = onDocumentCreated("comments/{id}", async (event) => {
  const c = event.data?.data();
  if (!c) return;
  const txn = (await db.doc(`txns/${c.txnId}`).get()).data();
  const payload = commentPayload(
    { by: c.by, byName: c.byName, text: c.text, parties: c.parties },
    (txn?.note as string | undefined) ?? "",
    String(c.txnId),
  );
  for (const phone of (c.parties as string[]).filter((p) => p !== c.by)) await pushTo(phone, payload);
});
