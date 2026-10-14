import { balancesFor, otherParty, signedFor, type Txn } from "../core/ledger";
import type { Fils } from "../core/money";
import { displayPhone, type Phone } from "../core/phone";
import type { Contact, Group } from "../data/backend";

export interface Friend {
  phone: Phone;
  name: string;
  /** Positive = they owe me, negative = I owe them. */
  balance: Fils;
  lastAt: number | null;
  txns: Txn[];
  saved: boolean; // in my contacts
}

/** Friends list: saved contacts, people in my groups, and anyone I share an entry with. */
export function buildFriends(me: Phone, contacts: Contact[], txns: Txn[], groups: Group[] = []): Friend[] {
  const byPhone = new Map<Phone, Friend>();
  const nameFromTxns = new Map<Phone, string>();
  for (const t of txns) if (t.createdBy !== me && t.createdByName) nameFromTxns.set(t.createdBy, t.createdByName);
  for (const c of contacts) {
    byPhone.set(c.phone, { phone: c.phone, name: c.name, balance: 0, lastAt: null, txns: [], saved: true });
  }
  for (const g of groups) {
    for (const p of g.members) {
      if (p === me || byPhone.has(p)) continue;
      byPhone.set(p, { phone: p, name: g.names[p] || displayPhone(p), balance: 0, lastAt: null, txns: [], saved: false });
    }
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

/** Sum of my balances with the members of a group. Positive = they owe me. */
export function groupBalance(g: Group, friends: Friend[], me: Phone): Fils {
  return friends.filter((f) => f.phone !== me && g.members.includes(f.phone)).reduce((s, f) => s + f.balance, 0);
}

/** A soft colour per person, stable across sessions. */
const AV_COLORS = [
  ["#c8f2dc", "#13774a"], ["#ffe0e6", "#b8304c"], ["#dbe8ff", "#2d55c4"], ["#ffe8c7", "#9a5300"],
  ["#eadcff", "#6a3fc9"], ["#d4f3f6", "#0f6f7a"], ["#fbe0f4", "#a1307f"], ["#e7f2c8", "#4f6b0d"],
];
export function avatarColors(key: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AV_COLORS[h % AV_COLORS.length];
  return { bg, fg };
}
