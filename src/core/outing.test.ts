import { describe, expect, it } from "vitest";
import { computeOuting, paidFromLine } from "./outing";

const A = "+962790000001", B = "+962790000002", C = "+962790000003", D = "+962790000004";

describe("outing", () => {
  it("reads lines", () => {
    expect(paidFromLine("25")).toBe(25000);
    expect(paidFromLine("١٢٫٥")).toBe(12500);
    expect(paidFromLine("-")).toBeNull();
    expect(paidFromLine("")).toBeNull();
    expect(paidFromLine("20 بنزين + 10 فحم")).toBe(30000);
    expect(paidFromLine("المزرعة ٤٠، أكل 12.5")).toBe(52500);
    expect(paidFromLine("بنزين")).toBeNull();
    expect(paidFromLine("12,5")).toBe(12500);
    expect(paidFromLine("15 لحمة و 5 خبز")).toBe(20000);
  });

  it("splits equally and routes through the hub", () => {
    // Farm 60 paid by B, food 30 paid by A, C paid nothing. 90 / 3 = 30 each.
    const r = computeOuting({ [A]: 30000, [B]: 60000, [C]: 0 }, [A, B, C], A);
    expect(r.total).toBe(90000);
    expect(r.share).toBe(30000);
    expect(r.transfers).toEqual([
      { creditor: B, debtor: A, amount: 30000 },
      { creditor: A, debtor: C, amount: 30000 },
    ]);
  });

  it("nets out to zero for everyone", () => {
    const paid = { [A]: 10000, [B]: 0, [C]: 7000, [D]: 3001 };
    const r = computeOuting(paid, [A, B, C, D], B);
    const sumShares = r.people.reduce((s, p) => s + p.share, 0);
    expect(sumShares).toBe(r.total);
    // Each person's balance from the transfers equals their net
    for (const p of r.people) {
      const bal = r.transfers.reduce((s, t) => s + (t.creditor === p.phone ? t.amount : 0) - (t.debtor === p.phone ? t.amount : 0), 0);
      expect(bal).toBe(p.net);
    }
  });

  it("works when the hub didn't come", () => {
    const r = computeOuting({ [B]: 20000, [C]: 0 }, [B, C], A);
    expect(r.transfers).toEqual([
      { creditor: B, debtor: A, amount: 10000 },
      { creditor: A, debtor: C, amount: 10000 },
    ]);
  });
});
