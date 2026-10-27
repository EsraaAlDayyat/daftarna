import type { Fils } from "./money";

export interface BillItem {
  id: string;
  name: string;
  qty: number;
  price: Fils; // line total (qty × unit price)
}

export interface BillExtras {
  tax: Fils;      // sales tax
  service: Fils;  // service charge
  delivery: Fils;
  discount: Fils; // positive; subtracted from the total
}

export interface SplitInput {
  items: BillItem[];
  /** For each item, who had it. A shared item is split evenly. */
  eaters: Record<string, string[]>;
  extras: BillExtras;
  payer: string;
}

export interface SplitResult {
  subtotal: Fils;
  total: Fils;
  /** Each person's share in fils. Sums to `total` exactly. */
  shares: Record<string, Fils>;
  /** For display: each person's items before extras, rounded to fils. */
  itemsOf: Record<string, Fils>;
}

export const emptyExtras = (): BillExtras => ({ tax: 0, service: 0, delivery: 0, discount: 0 });

function billSubtotal(items: BillItem[]): Fils {
  return items.reduce((s, i) => s + i.price, 0);
}

export function billTotal(items: BillItem[], e: BillExtras): Fils {
  return billSubtotal(items) + e.tax + e.service + e.delivery - e.discount;
}

export type SplitProblem =
  | { kind: "noItems" }
  | { kind: "unassigned"; itemIds: string[] }
  | { kind: "badPrice"; itemIds: string[] }
  | { kind: "negativeTotal" };

export function validateSplit(input: SplitInput): SplitProblem | null {
  if (!input.items.length) return { kind: "noItems" };
  const bad = input.items.filter((i) => !Number.isInteger(i.price) || i.price < 0).map((i) => i.id);
  if (bad.length) return { kind: "badPrice", itemIds: bad };
  const un = input.items.filter((i) => !(input.eaters[i.id]?.length)).map((i) => i.id);
  if (un.length) return { kind: "unassigned", itemIds: un };
  if (billTotal(input.items, input.extras) < 0) return { kind: "negativeTotal" };
  return null;
}

const gcd = (a: bigint, b: bigint): bigint => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };
const lcm = (a: bigint, b: bigint): bigint => (a / gcd(a, b)) * b;

/**
 * Splits a bill:
 * - each item is divided evenly among the people who had it;
 * - tax, service and discount are allocated in proportion to each person's items;
 * - delivery is a flat fee, so it is split equally among the people who had something.
 * Math is exact (BigInt fractions). Everyone except the payer is rounded down,
 * and the payer takes the remainder, so the shares always sum to the exact total.
 */
export function splitBill(input: SplitInput): SplitResult {
  const problem = validateSplit(input);
  if (problem) throw new Error(`فاتورة غير صالحة: ${problem.kind}`);
  const { items, eaters, extras, payer } = input;
  const subtotal = billSubtotal(items);
  const total = billTotal(items, extras);

  const people = new Set<string>([payer]);
  for (const i of items) for (const p of eaters[i.id]) people.add(p);

  // Common denominator for every per-item division
  let L = 1n;
  for (const i of items) L = lcm(L, BigInt(new Set(eaters[i.id]).size));

  // itemsNum[p] / L = exact item total for person p
  const itemsNum = new Map<string, bigint>();
  for (const p of people) itemsNum.set(p, 0n);
  for (const i of items) {
    const who = [...new Set(eaters[i.id])];
    const part = (BigInt(i.price) * L) / BigInt(who.length); // exact, since L is a multiple of the count
    for (const p of who) itemsNum.set(p, itemsNum.get(p)! + part);
  }

  // Delivery: equal per person who ate. The rest of the extras: proportional.
  const ate = [...people].filter((p) => itemsNum.get(p)! > 0n);
  const deliveryEach = ate.length ? Math.floor(extras.delivery / ate.length) : 0;
  const propTotal = total - extras.delivery;

  const shares: Record<string, Fils> = {};
  const itemsOf: Record<string, Fils> = {};
  let assigned = 0;
  for (const p of people) {
    const num = itemsNum.get(p)!;
    itemsOf[p] = Number(num / L);
    if (p === payer) continue;
    // share = items × (total / subtotal)
    const prop = subtotal === 0
      ? 0n
      : (num * BigInt(propTotal)) / (L * BigInt(subtotal)); // floor (values are non-negative)
    const share = Number(prop) + (num > 0n ? deliveryEach : 0);
    shares[p] = share;
    assigned += share;
  }
  shares[payer] = total - assigned;
  return { subtotal, total, shares, itemsOf };
}

const EXTRA_WORDS: [keyof BillExtras, RegExp][] = [
  ["tax", /ضريب|tax|vat|g\.?s\.?t/i],
  ["service", /خدم|service|svc/i],
  ["delivery", /توصيل|delivery/i],
  ["discount", /خصم|discount/i],
];

/** Which extra a line really is, when someone wrote tax, service, delivery or a discount as an item. */
export function extraKindOf(name: string): keyof BillExtras | null {
  const n = name.trim();
  if (!n || n.length > 30) return null;
  for (const [k, re] of EXTRA_WORDS) if (re.test(n)) return k;
  return null;
}
