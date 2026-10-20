import type { Fils } from "./money";
import { parseJod } from "./money";
import type { Phone } from "./phone";

/**
 * An outing (a farm day, a trip): everyone writes what they paid, the total is
 * split equally among those who came.
 *
 * Every entry the app writes must include the person writing it, so the one who
 * closes the outing acts as the hub: whoever paid more than their share is owed
 * by the hub, whoever paid less owes the hub. Net per person comes out right.
 */

/** What someone wrote on their line: an amount, or "-" for "I didn't come". */
export const NOT_COMING = "-";

/**
 * Reads what someone paid. Accepts a plain amount ("25") or a few amounts with
 * what they were for ("20 بنزين + 10 فحم"), which are added up.
 */
export function paidFromLine(line: string | undefined): Fils | null {
  const s = (line ?? "").trim();
  if (!s || s === NOT_COMING) return null;
  let sum = 0;
  let any = false;
  for (const part of s.split(/[+＋،]|,\s|\sو\s?/)) {
    const digits = part.replace(/[^\d٠-٩۰-۹.٫,]/g, "");
    if (!digits) continue; // just a word, like "بنزين"
    const f = parseJod(digits);
    if (f === null || f < 0) return null;
    sum += f;
    any = true;
  }
  return any ? sum : null;
}

/** True when the line is more than a single bare number, so the total is worth showing. */
export function lineHasParts(line: string | undefined): boolean {
  const s = (line ?? "").trim();
  return !!s && s !== NOT_COMING && !/^[\d٠-٩۰-۹.٫\s]+$/.test(s);
}

export interface OutingPerson {
  phone: Phone;
  paid: Fils;
  share: Fils;
  /** Positive: they paid more than their share and are owed. Negative: they owe. */
  net: Fils;
}

export interface OutingTransfer {
  creditor: Phone;
  debtor: Phone;
  amount: Fils;
}

export interface OutingResult {
  total: Fils;
  /** The share of most people; a few may carry one extra fils so it adds up. */
  share: Fils;
  people: OutingPerson[];
  /** Entries between the hub and each other attendee. */
  transfers: OutingTransfer[];
}

export function computeOuting(paid: Record<Phone, Fils>, attendees: Phone[], hub: Phone): OutingResult {
  const list = [...new Set(attendees)];
  const n = list.length;
  const total = list.reduce((s, p) => s + Math.max(0, paid[p] ?? 0), 0);
  if (n === 0) return { total: 0, share: 0, people: [], transfers: [] };
  const base = Math.floor(total / n);
  let extra = total - base * n; // leftover fils, one each to the first few
  const people: OutingPerson[] = list.map((p) => {
    const share = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    const pd = Math.max(0, paid[p] ?? 0);
    return { phone: p, paid: pd, share, net: pd - share };
  });
  const transfers: OutingTransfer[] = [];
  for (const x of people) {
    if (x.phone === hub || x.net === 0) continue;
    transfers.push(x.net > 0
      ? { creditor: x.phone, debtor: hub, amount: x.net }
      : { creditor: hub, debtor: x.phone, amount: -x.net });
  }
  return { total, share: base, people, transfers };
}
