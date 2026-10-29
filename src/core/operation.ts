import type { NewTxn } from "./ledger";
import type { Fils } from "./money";
import type { Phone } from "./phone";

/**
 * A shared operation with one payer: a group gift, a trip, a shared expense.
 * (Restaurant bills with items have their own flow in split.ts.)
 *
 * Rounding policy: amounts are whole fils. An equal split gives everyone the
 * same share rounded down, and the leftover fils (fewer than the number of
 * people) go one each to the first participants in the order shown, so the
 * shares always add up to the total exactly.
 */
export type OperationKind = "gift" | "trip" | "shared";

export interface OperationInput {
  kind: OperationKind;
  title: string;
  total: Fils;
  payer: Phone;
  /** Who shares the cost. The payer is included only if they share it too. */
  participants: Phone[];
  /** "equal", or a fixed amount per participant. */
  split: { method: "equal" } | { method: "custom"; amounts: Record<Phone, Fils> };
  /** Gifts only: who the gift is for. Never counted as a contributor. */
  recipient?: { phone?: Phone; name: string };
  note?: string;
}

export type OperationProblem =
  | { kind: "noTitle" }
  | { kind: "badTotal" }
  | { kind: "noParticipants" }
  | { kind: "recipientContributes" }
  | { kind: "recipientPays" }
  | { kind: "noRecipient" }
  | { kind: "customMismatch"; diff: Fils }
  | { kind: "badCustom" };

export interface OperationResult {
  shares: Record<Phone, Fils>;
  /** People who got one extra fils from the equal-split rounding. */
  roundedUp: Phone[];
  /** Fils that rounding moved (0 when the total divides evenly). */
  roundingFils: Fils;
}

const uniq = (xs: Phone[]) => [...new Set(xs)];

export function validateOperation(op: OperationInput): OperationProblem | null {
  if (!op.title.trim()) return { kind: "noTitle" };
  if (!Number.isInteger(op.total) || op.total <= 0) return { kind: "badTotal" };
  const people = uniq(op.participants);
  if (!people.length) return { kind: "noParticipants" };
  if (op.kind === "gift") {
    if (!op.recipient?.name.trim()) return { kind: "noRecipient" };
    if (op.recipient.phone && people.includes(op.recipient.phone)) return { kind: "recipientContributes" };
    if (op.recipient.phone && op.recipient.phone === op.payer) return { kind: "recipientPays" };
  }
  if (op.split.method === "custom") {
    const amounts = op.split.amounts;
    if (people.some((p) => !Number.isInteger(amounts[p] ?? 0) || (amounts[p] ?? 0) < 0)) return { kind: "badCustom" };
    const sum = people.reduce((s, p) => s + (amounts[p] ?? 0), 0);
    if (sum !== op.total) return { kind: "customMismatch", diff: op.total - sum };
  }
  return null;
}

export function equalShares(total: Fils, participants: Phone[]): OperationResult {
  const people = uniq(participants);
  const base = Math.floor(total / people.length);
  const extra = total - base * people.length;
  const shares: Record<Phone, Fils> = {};
  people.forEach((p, i) => { shares[p] = base + (i < extra ? 1 : 0); });
  return { shares, roundedUp: people.slice(0, extra), roundingFils: extra };
}

export function operationShares(op: OperationInput): OperationResult {
  const problem = validateOperation(op);
  if (problem) throw new Error(`عملية غير صالحة: ${problem.kind}`);
  const people = uniq(op.participants);
  if (op.split.method === "equal") return equalShares(op.total, people);
  const shares: Record<Phone, Fils> = {};
  for (const p of people) shares[p] = op.split.amounts[p] ?? 0;
  return { shares, roundedUp: [], roundingFils: 0 };
}

/** The note on each entry, e.g. "هدية إلى ليلى: عيد ميلاد" or "رحلة العقبة". */
export function operationNote(op: Pick<OperationInput, "kind" | "title" | "recipient">): string {
  const title = op.title.trim();
  if (op.kind === "gift" && op.recipient?.name.trim()) {
    const r = op.recipient.name.trim();
    return (title ? `هدية إلى ${r}: ${title}` : `هدية إلى ${r}`).slice(0, 120);
  }
  return title.slice(0, 120);
}

/** Entries to write: each participant other than the payer owes the payer their share. */
export function operationTxns(op: OperationInput, me: Phone, myName: string): NewTxn[] {
  const { shares } = operationShares(op);
  const note = operationNote(op);
  return Object.entries(shares)
    .filter(([p, v]) => p !== op.payer && v > 0)
    .map(([p, v]) => ({ creditor: op.payer, debtor: p, amount: v, kind: "split" as const, note, createdBy: me, createdByName: myName }));
}

/** How my own balance changes. Positive: others will owe me more. */
export function myImpact(op: OperationInput, me: Phone): Fils {
  const { shares } = operationShares(op);
  if (op.payer === me) return Object.entries(shares).reduce((s, [p, v]) => s + (p === me ? 0 : v), 0);
  return -(shares[me] ?? 0);
}
