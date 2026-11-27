import { describe, expect, it } from "vitest";
import { makeTxn, manualTxn, paidStates, paymentFor, reversalOf, settlementFor, balancesFor, type Txn } from "./ledger";

const ME = "+962791111111", A = "+962782222222";
let n = 0;
const at = (t: Parameters<typeof makeTxn>[0]) => makeTxn(t, `t${++n}`, 1_700_000_000_000 + n * 1000);

describe("paid items", () => {
  it("marks one item paid without touching the others", () => {
    const taxi = at(manualTxn("iLentHim", ME, A, 3500, "تكسي", "سارة"));
    const lunch = at(manualTxn("iLentHim", ME, A, 5000, "غدا", "سارة"));
    const pay = at(paymentFor(taxi, 3500, ME, "سارة"));
    const s = paidStates([taxi, lunch, pay]);
    expect(s.get(taxi.id)).toEqual({ paid: 3500, left: 0, done: true });
    expect(s.get(lunch.id)?.done).toBe(false);
    expect(s.has(pay.id)).toBe(false);
    expect(balancesFor([taxi, lunch, pay], ME).get(A)).toBe(5000);
    expect(pay).toMatchObject({ creditor: A, debtor: ME, kind: "repay", pays: taxi.id, note: "سداد: تكسي" });
  });

  it("works for what I owe too", () => {
    const owe: Txn = at(manualTxn("hePaidMe", ME, A, 2000, "قهوة", "سارة"));
    const pay = at(paymentFor(owe, 2000, ME, "سارة"));
    expect(pay.creditor).toBe(ME);
    expect(paidStates([owe, pay]).get(owe.id)?.done).toBe(true);
    expect(balancesFor([owe, pay], ME).get(A) ?? 0).toBe(0);
  });

  it("a settlement marks everything before it as paid", () => {
    const a = at(manualTxn("iLentHim", ME, A, 1000, "a", "سارة"));
    const b = at(manualTxn("iLentHim", ME, A, 2000, "b", "سارة"));
    const st = at(settlementFor(3000, ME, A, "سارة")!);
    const c = at(manualTxn("iLentHim", ME, A, 500, "c", "سارة"));
    const s = paidStates([a, b, st, c]);
    expect([s.get(a.id)?.done, s.get(b.id)?.done, s.get(c.id)?.done]).toEqual([true, true, false]);
  });

  it("partial payments leave the rest open; cancelled payments don't count", () => {
    const a = at(manualTxn("iLentHim", ME, A, 10000, "a", "سارة"));
    const p = at({ ...paymentFor(a, 4000, ME, "سارة") });
    expect(paidStates([a, p]).get(a.id)).toEqual({ paid: 4000, left: 6000, done: false });
    const r = at(reversalOf(p, ME, "سارة"));
    expect(paidStates([a, p, r]).get(a.id)).toEqual({ paid: 0, left: 10000, done: false });
  });
});

describe("payment messages", async () => {
  const { waTxnMessage, notificationText } = await import("./messages");
  it("says who paid whom for which item", () => {
    const taxi = at(manualTxn("iLentHim", ME, A, 3500, "تكسي", "سارة"));
    const p = at(paymentFor(taxi, 3500, ME, "سارة"));
    expect(waTxnMessage(p, ME, "أحمد", 0)).toContain("استلمت منك 3.500 د.أ سدادًا لـ«تكسي»");
    expect(notificationText(p, A, 0)).toBe("سجّل سارة أنك دفعت له 3.500 د.أ، سداد: تكسي. لا يوجد رصيد بينكما ✓");
    const owe = at(manualTxn("hePaidMe", ME, A, 2000, "قهوة", "سارة"));
    const q = at(paymentFor(owe, 2000, ME, "سارة"));
    expect(waTxnMessage(q, ME, "أحمد", 0)).toContain("دفعت لك 2 د.أ سدادًا لـ«قهوة»");
    expect(notificationText(q, A, 0)).toContain("سجّل سارة أنه دفع لك 2 د.أ");
  });
});
