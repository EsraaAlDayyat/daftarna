// Notification and WhatsApp message text. Shared by the app and Cloud Functions.
import { formatJodLatin, type Fils } from "./money";
import type { Phone } from "./phone";
import { signedFor, type Txn } from "./ledger";

const j = (f: Fils) => `${formatJodLatin(f)} د.أ`;

/** Balance line from the viewer's perspective. */
function balanceLine(balance: Fils): string {
  if (balance === 0) return "الرصيد صار خالص ✓";
  return balance > 0 ? `إلك عنده ${j(balance)}` : `عليك إله ${j(-balance)}`;
}

/** Describes an entry to the other party (the notification recipient, `viewer`). */
function describeForOther(t: Txn, viewer: Phone, place?: string): string {
  const who = t.createdByName || "صاحبك";
  const note = t.note ? `، ${t.note}` : "";
  const a = j(t.amount);
  const viewerOwes = t.debtor === viewer;
  switch (t.kind) {
    case "split":
      return viewerOwes
        ? `ضاف ${who} عليك ${a}${place ? `، ${place}` : note}`
        : `ضاف ${who} إلك ${a}${place ? `، ${place}` : note}`;
    case "settle":
      return `صفّى ${who} الحساب بينكم (${a})`;
    case "reversal":
      return `ألغى ${who} حركة بقيمة ${a}${t.note ? `، ${t.note.replace(/^إلغاء: /, "")}` : ""}`;
    // The creditor is whoever paid. If the viewer owes, the author paid them; otherwise the viewer paid the author.
    case "repay":
    case "paidFor":
      return viewerOwes
        ? `سجّل ${who} إنه دفعلك ${a}${note}`
        : `سجّل ${who} إنك دفعتله ${a}${note}`;
    case "lend":
    default:
      return viewerOwes
        ? `سجّل ${who} إنه أعطاك دين ${a}${note}`
        : `سجّل ${who} إنك أعطيته دين ${a}${note}`;
  }
}

/** Full notification text, including the recipient's new balance. */
export function notificationText(t: Txn, viewer: Phone, balanceAfter: Fils, place?: string): string {
  return `${describeForOther(t, viewer, place)}. ${balanceLine(balanceAfter)}`;
}

/** WhatsApp message from the author to the other party (for people without the app). */
export function waTxnMessage(t: Txn, me: Phone, otherName: string, balanceAfterForMe: Fils): string {
  const a = j(t.amount);
  const note = t.note ? ` (${t.note})` : "";
  const mine = signedFor(t, me) > 0;
  let line: string;
  switch (t.kind) {
    case "split": line = `حصتك من الفاتورة${note}: ${a}`; break;
    case "settle": line = `صفّينا الحساب (${a})`; break;
    case "reversal": line = `لغيت حركة بقيمة ${a}${t.note ? ` (${t.note.replace(/^إلغاء: /, "")})` : ""}`; break;
    case "lend": line = `سجّلت إني أعطيتك ${a}${note}`; break;
    default: line = mine ? `سجّلت إني دفعتلك ${a}${note}` : `سجّلت إنك دفعتلي ${a}${note}`;
  }
  return `مرحبا ${otherName}، ${line}.\n${balanceForThem(balanceAfterForMe)}`;
}

/** The balance phrased from the friend's side (the opposite of mine). */
function balanceForThem(balanceForMe: Fils): string {
  if (balanceForMe === 0) return "الحساب بيناتنا خالص ✓";
  return balanceForMe > 0 ? `صار عليك إلي ${j(balanceForMe)}` : `صار إلك عندي ${j(-balanceForMe)}`;
}

export function waReminder(otherName: string, balanceForMe: Fils): string {
  return `مرحبا ${otherName} 🌷 حبيت أذكّرك إنه الرصيد اللي عليك إلي ${j(balanceForMe)}. شكراً إلك.`;
}

const dfmt = new Intl.DateTimeFormat("ar-JO", { day: "numeric", month: "short", year: "numeric", numberingSystem: "latn" });

/** Full account statement. */
export function waStatement(txns: Txn[], me: Phone, otherName: string, myName: string): string {
  const rows = [...txns].sort((a, b) => a.createdAt - b.createdAt).map((t) => {
    const v = signedFor(t, me);
    const sign = v > 0 ? "+" : "−";
    return `• ${dfmt.format(t.createdAt)}: ${sign}${formatJodLatin(t.amount)}${t.note ? ` ${t.note}` : ""}`;
  });
  const bal = txns.reduce((s, t) => s + signedFor(t, me), 0);
  return [
    `كشف حساب بين ${myName} و${otherName}`,
    `(+ يعني عليك إلي، − يعني إلك عندي)`,
    ...(rows.length ? rows : ["ما في حركات"]),
    "──────",
    balanceForThem(bal),
  ].join("\n");
}
