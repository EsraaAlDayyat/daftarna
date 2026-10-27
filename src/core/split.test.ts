import { describe, expect, it } from "vitest";
import { extraKindOf, splitBill, validateSplit, emptyExtras, type BillItem, type SplitInput } from "./split";

const item = (id: string, price: number, name = id): BillItem => ({ id, name, qty: 1, price });
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe("splitBill", () => {
  it("one item each, no extras", () => {
    const r = splitBill({
      items: [item("a", 5000), item("b", 3000)],
      eaters: { a: ["sara"], b: ["ahmad"] },
      extras: emptyExtras(),
      payer: "sara",
    });
    expect(r.shares).toEqual({ sara: 5000, ahmad: 3000 });
    expect(r.total).toBe(8000);
  });

  it("a shared item is split evenly among the people who had it", () => {
    const r = splitBill({
      items: [item("salad", 3000), item("m1", 6000)],
      eaters: { salad: ["sara", "ahmad", "lina"], m1: ["lina"] },
      extras: emptyExtras(),
      payer: "sara",
    });
    expect(r.shares).toEqual({ sara: 1000, ahmad: 1000, lina: 7000 });
  });

  it("16% tax and 10% service are allocated in proportion to each order", () => {
    // Subtotal 10 JOD: Sara 6, Ahmad 4. Service 1 JOD, tax 1.760 (16% of 11)
    const r = splitBill({
      items: [item("a", 6000), item("b", 4000)],
      eaters: { a: ["sara"], b: ["ahmad"] },
      extras: { tax: 1760, service: 1000, delivery: 0, discount: 0 },
      payer: "sara",
    });
    expect(r.total).toBe(12760);
    expect(r.shares.ahmad).toBe(5104); // 4 × 1.276
    expect(r.shares.sara).toBe(7656);  // 6 × 1.276
  });

  it("discount is proportional; delivery is split equally", () => {
    const r = splitBill({
      items: [item("a", 3000), item("b", 1000)],
      eaters: { a: ["x"], b: ["y"] },
      extras: { tax: 0, service: 0, delivery: 2000, discount: 400 },
      payer: "x",
    });
    // Without delivery 3.600, y ordered a quarter: 0.900, plus half the delivery: 1.000
    expect(r.shares.y).toBe(1900);
    expect(r.shares.x).toBe(3700);
  });

  it("delivery 3 among 3 people is 1 each", () => {
    const r = splitBill({
      items: [item("shawarma", 2000), item("chicken", 5000), item("burger", 3000)],
      eaters: { shawarma: ["a"], chicken: ["b"], burger: ["c"] },
      extras: { tax: 0, service: 0, delivery: 3000, discount: 0 },
      payer: "a",
    });
    expect(r.shares).toEqual({ a: 3000, b: 6000, c: 4000 });
  });

  it("delivery skips a payer who didn't eat", () => {
    const r = splitBill({
      items: [item("x", 4000), item("y", 4000)],
      eaters: { x: ["b"], y: ["c"] },
      extras: { tax: 0, service: 0, delivery: 2000, discount: 0 },
      payer: "a",
    });
    expect(r.shares.b).toBe(5000);
    expect(r.shares.c).toBe(5000);
    expect(r.shares.a).toBe(0);
  });

  it("the rounding remainder goes to the payer", () => {
    // 10 JOD across 3 people = 3.333… each
    const r = splitBill({
      items: [item("pizza", 10000)],
      eaters: { pizza: ["a", "b", "c"] },
      extras: emptyExtras(),
      payer: "a",
    });
    expect(r.shares).toEqual({ a: 3334, b: 3333, c: 3333 });
    expect(sum(r.shares)).toBe(10000);
  });

  it("a payer who ate nothing only absorbs the remainder", () => {
    const r = splitBill({
      items: [item("x", 1000)],
      eaters: { x: ["b", "c", "d"] },
      extras: emptyExtras(),
      payer: "a",
    });
    expect(r.shares).toEqual({ a: 1, b: 333, c: 333, d: 333 });
  });

  it("duplicate eaters on one item are counted once", () => {
    const r = splitBill({
      items: [item("x", 1000)],
      eaters: { x: ["b", "b", "a"] },
      extras: emptyExtras(),
      payer: "a",
    });
    expect(r.shares).toEqual({ a: 500, b: 500 });
  });

  it("rejects a bill with an unassigned item", () => {
    const input: SplitInput = {
      items: [item("x", 1000), item("y", 2000)],
      eaters: { x: ["a"] },
      extras: emptyExtras(),
      payer: "a",
    };
    expect(validateSplit(input)).toEqual({ kind: "unassigned", itemIds: ["y"] });
    expect(() => splitBill(input)).toThrow();
  });

  it("rejects empty bills, negative prices and fractional fils", () => {
    expect(validateSplit({ items: [], eaters: {}, extras: emptyExtras(), payer: "a" })?.kind).toBe("noItems");
    expect(validateSplit({ items: [item("x", -5)], eaters: { x: ["a"] }, extras: emptyExtras(), payer: "a" })?.kind).toBe("badPrice");
    expect(validateSplit({ items: [item("x", 1.5)], eaters: { x: ["a"] }, extras: emptyExtras(), payer: "a" })?.kind).toBe("badPrice");
  });

  it("shares always sum to the exact total (1000 random bills)", () => {
    let seed = 42;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    const people = ["p0", "p1", "p2", "p3", "p4", "p5", "p6"];
    for (let k = 0; k < 1000; k++) {
      const n = 1 + rnd(12);
      const items = Array.from({ length: n }, (_, i) => item(`i${i}`, 1 + rnd(25000)));
      const eaters: Record<string, string[]> = {};
      for (const it of items) {
        const c = 1 + rnd(people.length);
        eaters[it.id] = Array.from({ length: c }, () => people[rnd(people.length)]);
      }
      const extras = { tax: rnd(5000), service: rnd(3000), delivery: rnd(2) ? rnd(2000) : 0, discount: 0 };
      const payer = people[rnd(people.length)];
      const r = splitBill({ items, eaters, extras, payer });
      expect(sum(r.shares)).toBe(r.total);
      for (const [p, v] of Object.entries(r.shares)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        if (p !== payer) {
          // each share is within one fils of the exact value
          const mine = items.reduce((s, it) => {
            const w = new Set(eaters[it.id]);
            return s + (w.has(p) ? it.price / w.size : 0);
          }, 0);
          const ate = new Set(Object.values(eaters).flat()).size;
          const exact = mine * ((r.total - extras.delivery) / r.subtotal) + (mine > 0 ? extras.delivery / ate : 0);
          // proportional part and delivery part are each rounded down
          expect(Math.abs(v - exact)).toBeLessThan(2);
        }
      }
    }
  });
});

describe("extra lines written as items", () => {
  it("recognises tax, service, delivery and discount", () => {
    expect(extraKindOf("ضريبة 16%")).toBe("tax");
    expect(extraKindOf("Sales Tax")).toBe("tax");
    expect(extraKindOf("خدمة")).toBe("service");
    expect(extraKindOf("توصيل")).toBe("delivery");
    expect(extraKindOf("خصم")).toBe("discount");
    expect(extraKindOf("شاورما")).toBeNull();
  });
});
