import { balancesFor, otherParty, signedFor, type Txn } from "../core/ledger";
import type { Fils } from "../core/money";
import { displayPhone, type Phone } from "../core/phone";
import type { Contact } from "../data/backend";

export interface Friend {
  phone: Phone;
  name: string;
  /** Positive = they owe me, negative = I owe them. */
  balance: Fils;
  lastAt: number | null;
  txns: Txn[];
  saved: boolean; // in my contacts
}

/** Friends list: saved contacts plus anyone I share an entry with. */
export function buildFriends(me: Phone, contacts: Contact[], txns: Txn[]): Friend[] {
  const byPhone = new Map<Phone, Friend>();
  const nameFromTxns = new Map<Phone, string>();
  for (const t of txns) if (t.createdBy !== me && t.createdByName) nameFromTxns.set(t.createdBy, t.createdByName);
  for (const c of contacts) {
    byPhone.set(c.phone, { phone: c.phone, name: c.name, balance: 0, lastAt: null, txns: [], saved: true });
  }
  const bal = balancesFor(txns, me);
  for (const t of txns) {
    if (!t.parties.includes(me)) continue;
    const o = otherParty(t, me);
    let f = byPhone.get(o);
    if (!f) {
      f = { phone: o, name: nameFromTxns.get(o) ?? displayPhone(o), balance: 0, lastAt: null, txns: [], saved: false };
      byPhone.set(o, f);
    }
    f.txns.push(t);
    f.lastAt = Math.max(f.lastAt ?? 0, t.createdAt);
  }
  for (const f of byPhone.values()) {
    f.balance = bal.get(f.phone) ?? 0;
    f.txns.sort((a, b) => b.createdAt - a.createdAt);
  }
  return [...byPhone.values()].sort(
    (a, b) => Math.abs(b.balance) - Math.abs(a.balance) || (b.lastAt ?? 0) - (a.lastAt ?? 0) || a.name.localeCompare(b.name, "ar"),
  );
}

export const balanceAfter = (txns: Txn[], me: Phone) => txns.reduce((s, t) => s + signedFor(t, me), 0);
