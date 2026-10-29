import { describe, expect, it } from "vitest";
import { equalShares, myImpact, operationNote, operationShares, operationTxns, validateOperation, type OperationInput } from "./operation";

const ME = "+962791111111", A = "+962782222222", L = "+962773333333", O = "+962794444444";
const base = (o: Partial<OperationInput> = {}): OperationInput => ({
  kind: "shared", title: "إيجار شاليه", total: 90000, payer: ME, participants: [ME, A, L], split: { method: "equal" }, ...o,
});

describe("operations", () => {
  it("splits equally and the shares add up", () => {
    const r = operationShares(base());
    expect(r.shares).toEqual({ [ME]: 30000, [A]: 30000, [L]: 30000 });
    expect(r.roundingFils).toBe(0);
  });

  it("rounding: leftover fils go one each to the first participants", () => {
    const r = equalShares(10000, [A, L, O]); // 10 JOD / 3
    expect(r.shares).toEqual({ [A]: 3334, [L]: 3333, [O]: 3333 });
    expect(r.roundedUp).toEqual([A]);
    expect(Object.values(r.shares).reduce((s, v) => s + v, 0)).toBe(10000);
  });

  it("the payer only shares the cost when selected", () => {
    const op = base({ payer: ME, participants: [A, L] });
    expect(operationShares(op).shares).toEqual({ [A]: 45000, [L]: 45000 });
    expect(myImpact(op, ME)).toBe(90000);
    const withMe = base();
    expect(myImpact(withMe, ME)).toBe(60000);
  });

  it("someone else paid: I owe them my share, entries point to the payer", () => {
    const op = base({ payer: A });
    expect(myImpact(op, ME)).toBe(-30000);
    const txns = operationTxns(op, ME, "سارة");
    expect(txns.map((t) => [t.creditor, t.debtor, t.amount])).toEqual([[A, ME, 30000], [A, L, 30000]]);
    expect(txns.every((t) => t.kind === "split" && t.createdBy === ME)).toBe(true);
  });

  it("custom amounts must add up to the total", () => {
    const ok = base({ split: { method: "custom", amounts: { [ME]: 50000, [A]: 25000, [L]: 15000 } } });
    expect(validateOperation(ok)).toBeNull();
    expect(operationShares(ok).shares[L]).toBe(15000);
    const short = base({ split: { method: "custom", amounts: { [ME]: 50000, [A]: 25000, [L]: 10000 } } });
    expect(validateOperation(short)).toEqual({ kind: "customMismatch", diff: 5000 });
  });

  it("gifts: the recipient never contributes", () => {
    const gift = base({ kind: "gift", title: "عيد ميلاد", recipient: { phone: L, name: "لينا" }, participants: [ME, A] });
    expect(operationShares(gift).shares).toEqual({ [ME]: 45000, [A]: 45000 });
    expect(operationTxns(gift, ME, "سارة").some((t) => t.debtor === L || t.creditor === L)).toBe(false);
    expect(operationNote(gift)).toBe("هدية إلى لينا: عيد ميلاد");
    expect(validateOperation({ ...gift, participants: [ME, A, L] })).toEqual({ kind: "recipientContributes" });
    expect(validateOperation({ ...gift, recipient: { name: " " } })).toEqual({ kind: "noRecipient" });
    expect(validateOperation({ ...gift, payer: L })).toEqual({ kind: "recipientPays" });
  });

  it("needs a title, a positive total and at least one participant", () => {
    expect(validateOperation(base({ title: " " }))).toEqual({ kind: "noTitle" });
    expect(validateOperation(base({ total: 0 }))).toEqual({ kind: "badTotal" });
    expect(validateOperation(base({ participants: [] }))).toEqual({ kind: "noParticipants" });
  });

  it("only the payer participating means no entries", () => {
    expect(operationTxns(base({ participants: [ME] }), ME, "سارة")).toEqual([]);
  });
});

describe("operation messages", async () => {
  const { waTxnMessage } = await import("./messages");
  const { makeTxn } = await import("./ledger");
  it("names the operation instead of calling it a bill", () => {
    const t = makeTxn({ creditor: ME, debtor: A, amount: 45000, kind: "split", note: "هدية إلى لينا: عيد ميلاد", createdBy: ME, createdByName: "سارة", billId: "b" }, "x");
    expect(waTxnMessage(t, ME, "أحمد", 45000)).toContain("حصتك من «هدية إلى لينا: عيد ميلاد»: 45 د.أ");
    const b = makeTxn({ creditor: ME, debtor: A, amount: 5000, kind: "split", note: "فاتورة الريم", createdBy: ME, createdByName: "سارة", billId: "b" }, "y");
    expect(waTxnMessage(b, ME, "أحمد", 5000)).toContain("حصتك من الفاتورة (فاتورة الريم)");
  });
});
