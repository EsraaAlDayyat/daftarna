import type { Fils } from "./money";
import type { Phone } from "./phone";

/**
 * An entry between two people. Stored once; each side reads it from their own perspective.
 * creditor is owed, debtor owes. The amount is always positive.
 * Entries are never edited or deleted; cancelling one adds a `reversal` entry pointing at it.
 */
export type TxnKind = "lend" | "paidFor" | "repay" | "split" | "settle" | "reversal";

export interface Txn {
  id: string;
  creditor: Phone;
  debtor: Phone;
  parties: [Phone, Phone]; // = [creditor, debtor], for security rules and queries
  amount: Fils;
  kind: TxnKind;
  note: string;
  createdBy: Phone;
  createdByName: string;
  createdAt: number; // ms
  billId?: string;
  reverses?: string;
  /** A payment for one specific entry ("تم الدفع" next to it). */
  pays?: string;
}

export type NewTxn = Omit<Txn, "id" | "parties" | "createdAt"> & { createdAt?: number };

export function makeTxn(t: NewTxn, id: string, now = Date.now()): Txn {
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error("يجب أن يكون المبلغ أكبر من صفر");
  if (t.creditor === t.debtor) throw new Error("يجب أن يكون الطرفان مختلفين");
  return { ...t, id, parties: [t.creditor, t.debtor], createdAt: t.createdAt ?? now };
}

/** Effect of an entry on `me`: positive = they owe me, negative = I owe them. */
export function signedFor(t: Txn, me: Phone): Fils {
  if (t.creditor === me) return t.amount;
  if (t.debtor === me) return -t.amount;
  return 0;
}

export function otherParty(t: Txn, me: Phone): Phone {
  return t.creditor === me ? t.debtor : t.creditor;
}

/** Net balance with each person. Positive = they owe me, negative = I owe them. */
export function balancesFor(txns: Txn[], me: Phone): Map<Phone, Fils> {
  const m = new Map<Phone, Fils>();
  for (const t of txns) {
    if (!t.parties.includes(me)) continue;
    const o = otherParty(t, me);
    m.set(o, (m.get(o) ?? 0) + signedFor(t, me));
  }
  return m;
}

export function totalsFor(txns: Txn[], me: Phone): { owedToMe: Fils; iOwe: Fils } {
  let owedToMe = 0, iOwe = 0;
  for (const v of balancesFor(txns, me).values()) {
    if (v > 0) owedToMe += v; else iOwe += -v;
  }
  return { owedToMe, iOwe };
}

/** IDs of entries that have been reversed. */
export function reversedIds(txns: Txn[]): Set<string> {
  const s = new Set<string>();
  for (const t of txns) if (t.kind === "reversal" && t.reverses) s.add(t.reverses);
  return s;
}

/** Builds the reversal that cancels an earlier entry. */
export function reversalOf(t: Txn, by: Phone, byName: string): NewTxn {
  if (t.kind === "reversal") throw new Error("لا يمكن إلغاء عملية إلغاء");
  return {
    creditor: t.debtor,
    debtor: t.creditor,
    amount: t.amount,
    kind: "reversal",
    note: t.note ? `إلغاء: ${t.note}` : "إلغاء قيد",
    createdBy: by,
    createdByName: byName,
    reverses: t.id,
  };
}

/** Builds the entry that settles a balance to zero, or null if already settled. */
export function settlementFor(balance: Fils, me: Phone, other: Phone, myName: string): NewTxn | null {
  if (balance === 0) return null;
  return {
    // If they owed me (positive), they paid me: they become creditor, I become debtor
    creditor: balance > 0 ? other : me,
    debtor: balance > 0 ? me : other,
    amount: Math.abs(balance),
    kind: "settle",
    note: "تسوية الحساب",
    createdBy: me,
    createdByName: myName,
  };
}

/** The three manual actions, in the user's terms. */
export type ManualAction = "iPaidHim" | "hePaidMe" | "iLentHim";

export function manualTxn(action: ManualAction, me: Phone, other: Phone, amount: Fils, note: string, myName: string): NewTxn {
  const meCreditor = action !== "hePaidMe";
  return {
    creditor: meCreditor ? me : other,
    debtor: meCreditor ? other : me,
    amount,
    kind: action === "iLentHim" ? "lend" : action === "iPaidHim" ? "paidFor" : "repay",
    note,
    createdBy: me,
    createdByName: myName,
  };
}


/** An entry that creates a debt (as opposed to a payment, settlement or cancellation). */
export function isDebtItem(t: Txn): boolean {
  return t.kind === "lend" || t.kind === "paidFor" || t.kind === "split" || (t.kind === "repay" && !t.pays);
}

export interface PaidState {
  /** Paid back so far through "تم الدفع". */
  paid: Fils;
  left: Fils;
  done: boolean;
}

/**
 * Which debt items between me and one friend are paid. An item is paid when:
 * - payments marked against it ("تم الدفع") cover it, or
 * - the account between us came back to zero after it (a settlement, or
 *   payments that evened everything out).
 */
export function paidStates(txns: Txn[]): Map<string, PaidState> {
  const voided = reversedIds(txns);
  const live = txns.filter((t) => !voided.has(t.id) && t.kind !== "reversal").sort((a, b) => a.createdAt - b.createdAt);
  const paidFor = new Map<string, Fils>();
  for (const t of live) if (t.pays) paidFor.set(t.pays, (paidFor.get(t.pays) ?? 0) + t.amount);

  // The last moment the account was even: everything before it is paid
  let lastZero = -Infinity;
  if (live.length) {
    const a = live[0].parties[0];
    let bal = 0;
    for (const t of live) {
      bal += signedFor(t, a);
      if (bal === 0) lastZero = t.createdAt;
    }
  }

  const out = new Map<string, PaidState>();
  for (const t of live) {
    if (!isDebtItem(t)) continue;
    const paid = Math.min(t.amount, paidFor.get(t.id) ?? 0);
    const done = paid >= t.amount || t.createdAt <= lastZero;
    out.set(t.id, { paid, left: done ? 0 : t.amount - paid, done });
  }
  return out;
}

/** "تم الدفع" for one item: a payment in the other direction for what's left of it. */
export function paymentFor(item: Txn, left: Fils, me: Phone, myName: string): NewTxn {
  return {
    creditor: item.debtor,
    debtor: item.creditor,
    amount: left,
    kind: "repay",
    note: `سداد: ${item.note || "دين"}`.slice(0, 120),
    pays: item.id,
    createdBy: me,
    createdByName: myName,
  };
}
