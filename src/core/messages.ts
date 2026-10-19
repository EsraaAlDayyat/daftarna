// Notification and message text (WhatsApp/SMS), in simplified Modern Standard Arabic.
// Shared by the app and Cloud Functions.
import { formatJodLatin, type Fils } from "./money";
import type { Phone } from "./phone";
import { signedFor, type Txn } from "./ledger";

const j = (f: Fils) => `${formatJodLatin(f)} د.أ`;

/** Kept so older callers still type-check; every dialect now reads the same. */
export type Dialect = "jo" | "eg";

/** Balance line from the viewer's perspective. */
function balanceLine(balance: Fils): string {
  if (balance === 0) return "لا يوجد رصيد بينكما ✓";
  return balance > 0 ? `لك عنده ${j(balance)}` : `عليك له ${j(-balance)}`;
}

/** Describes an entry to the other party (the notification recipient, `viewer`). */
function describeForOther(t: Txn, viewer: Phone, place: string | undefined): string {
  const who = t.createdByName || "صديقك";
  const note = t.note ? `، ${t.note}` : "";
  const a = j(t.amount);
  const viewerOwes = t.debtor === viewer;
  switch (t.kind) {
    case "split":
      return viewerOwes
        ? `أضاف ${who} عليك ${a}${place ? `، ${place}` : note}`
        : `أضاف ${who} لك ${a}${place ? `، ${place}` : note}`;
    case "settle":
      return `سوّى ${who} الحساب بينكما (${a})`;
    case "reversal":
      return `ألغى ${who} قيدًا بقيمة ${a}${t.note ? `، ${t.note.replace(/^إلغاء: /, "")}` : ""}`;
    // The creditor is whoever paid. If the viewer owes, the author paid them; otherwise the viewer paid the author.
    case "repay":
    case "paidFor":
      return viewerOwes ? `سجّل ${who} أنه دفع عنك ${a}${note}` : `سجّل ${who} أنك دفعت عنه ${a}${note}`;
    case "lend":
    default:
      return viewerOwes ? `سجّل ${who} أنه أقرضك ${a}${note}` : `سجّل ${who} أنك أقرضته ${a}${note}`;
  }
}

/** Full notification text, including the recipient's new balance. */
export function notificationText(t: Txn, viewer: Phone, balanceAfter: Fils, place?: string, _d: Dialect = "jo"): string {
  return `${describeForOther(t, viewer, place)}. ${balanceLine(balanceAfter)}`;
}

/** The app's address, added under every message so the friend can open their account. */
export const APP_URL = "https://daftarna-99fad.web.app";
const footer = `\n\n📒 دفترنا: ${APP_URL}`;

/** Message to a friend about one entry (WhatsApp or SMS). Short lines, the total last, then the app link. */
export function waTxnMessage(t: Txn, me: Phone, otherName: string, balanceAfterForMe: Fils, _d: Dialect = "jo"): string {
  const a = j(t.amount);
  const what = t.note ? t.note.replace(/^إلغاء: /, "") : "";
  const mine = signedFor(t, me) > 0; // the entry is in my favour: they owe me for it
  let line: string;
  switch (t.kind) {
    case "split":
      line = `حصتك من الفاتورة${what ? ` (${what})` : ""}: ${a}`;
      break;
    case "settle":
      line = `تمت تسوية الحساب بيننا (${a}) ✅`;
      break;
    case "reversal":
      line = `ألغيت قيدًا سُجّل بالخطأ${what ? `: ${what}` : ""} (${a})`;
      break;
    case "lend":
      line = mine ? `أقرضتك ${a}${what ? ` مقابل: ${what}` : ""}` : `أقرضتني ${a}${what ? ` مقابل: ${what}` : ""}، شكرًا لك 🙏`;
      break;
    default:
      line = mine
        ? `دفعت عنك ${a}${what ? ` مقابل: ${what}` : ""}`
        : `دفعت عني ${a}${what ? ` مقابل: ${what}` : ""}، شكرًا لك 🙏`;
  }
  return `مرحبًا ${otherName} 👋\n${line}\n${balanceForThem(balanceAfterForMe)}${footer}`;
}

/** The balance phrased from the friend's side (the opposite of mine). */
function balanceForThem(balanceForMe: Fils): string {
  if (balanceForMe === 0) return "✅ لا يوجد رصيد بيننا الآن";
  return balanceForMe > 0 ? `👈 إجمالي المستحق عليك: ${j(balanceForMe)}` : `👈 رصيدك لديّ: ${j(-balanceForMe)}`;
}

export function waReminder(otherName: string, balanceForMe: Fils, _d: Dialect = "jo", myCliq = ""): string {
  const pay = myCliq ? `\n💳 يمكنك التحويل عبر CliQ: ${myCliq}` : "";
  return `مرحبًا ${otherName} 🌷\nتذكير لطيف بأن المستحق عليك ${j(balanceForMe)}.\nشكرًا لك 🙏${pay}${footer}`;
}

const dfmt = new Intl.DateTimeFormat("ar-JO", { day: "numeric", month: "short", year: "numeric", numberingSystem: "latn" });

/** Full account statement. */
export function waStatement(txns: Txn[], me: Phone, otherName: string, myName: string, _d: Dialect = "jo"): string {
  const rows = [...txns].sort((a, b) => a.createdAt - b.createdAt).map((t) => {
    const v = signedFor(t, me);
    const sign = v > 0 ? "+" : "−";
    return `• ${dfmt.format(t.createdAt)}: ${sign}${formatJodLatin(t.amount)}${t.note ? ` ${t.note}` : ""}`;
  });
  const bal = txns.reduce((s, t) => s + signedFor(t, me), 0);
  return [
    `كشف الحساب بين ${myName} و${otherName}`,
    `(+ مستحق عليك، − مستحق لك)`,
    ...(rows.length ? rows : ["لا توجد قيود"]),
    "──────",
    balanceForThem(bal),
  ].join("\n") + footer;
}

/** Notification for a new comment on an entry. */
export function commentText(byName: string, text: string, note: string, _d: Dialect = "jo"): string {
  const who = byName || "صديقك";
  const on = note ? ` على «${note}»` : "";
  const short = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return `💬 ${who}${on}: ${short}`;
}
