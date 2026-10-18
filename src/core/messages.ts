// Notification and WhatsApp message text. Shared by the app and Cloud Functions.
import { formatJodLatin, type Fils } from "./money";
import type { Phone } from "./phone";
import { signedFor, type Txn } from "./ledger";

const j = (f: Fils) => `${formatJodLatin(f)} د.أ`;

/** "jo" = Jordanian (default, also used for push notifications), "eg" = Egyptian. */
export type Dialect = "jo" | "eg";

/** Balance line from the viewer's perspective. */
function balanceLine(balance: Fils, d: Dialect): string {
  if (balance === 0) return d === "eg" ? "بقيتوا خالصين ✓" : "الرصيد صار خالص ✓";
  if (d === "eg") return balance > 0 ? `ليك عنده ${j(balance)}` : `عليك له ${j(-balance)}`;
  return balance > 0 ? `إلك عنده ${j(balance)}` : `عليك إله ${j(-balance)}`;
}

/** Describes an entry to the other party (the notification recipient, `viewer`). */
function describeForOther(t: Txn, viewer: Phone, place: string | undefined, d: Dialect): string {
  if (d === "eg") return describeForOtherEg(t, viewer, place);
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

function describeForOtherEg(t: Txn, viewer: Phone, place?: string): string {
  const who = t.createdByName || "صاحبك";
  const note = t.note ? `، ${t.note}` : "";
  const a = j(t.amount);
  const viewerOwes = t.debtor === viewer;
  switch (t.kind) {
    case "split":
      return viewerOwes ? `${who} سجّل عليك ${a}${place ? `، ${place}` : note}` : `${who} سجّلك ${a}${place ? `، ${place}` : note}`;
    case "settle":
      return `${who} قفل الحساب بينكم (${a})`;
    case "reversal":
      return `${who} لغى حاجة بـ ${a}${t.note ? `، ${t.note.replace(/^إلغاء: /, "")}` : ""}`;
    case "repay":
    case "paidFor":
      return viewerOwes ? `${who} سجّل إنه دفعلك ${a}${note}` : `${who} سجّل إنك دفعتله ${a}${note}`;
    case "lend":
    default:
      return viewerOwes ? `${who} سجّل إنه سلّفك ${a}${note}` : `${who} سجّل إنك سلّفته ${a}${note}`;
  }
}

/** Full notification text, including the recipient's new balance. */
export function notificationText(t: Txn, viewer: Phone, balanceAfter: Fils, place?: string, d: Dialect = "jo"): string {
  return `${describeForOther(t, viewer, place, d)}. ${balanceLine(balanceAfter, d)}`;
}

/** WhatsApp message from the author to the other party (for people without the app). */
export function waTxnMessage(t: Txn, me: Phone, otherName: string, balanceAfterForMe: Fils, d: Dialect = "jo"): string {
  const a = j(t.amount);
  const note = t.note ? ` (${t.note})` : "";
  const mine = signedFor(t, me) > 0;
  let line: string;
  if (d === "eg") {
    switch (t.kind) {
      case "split": line = `نصيبك من الفاتورة${note}: ${a}`; break;
      case "settle": line = `قفلنا الحساب (${a})`; break;
      case "reversal": line = `لغيت حاجة بـ ${a}${t.note ? ` (${t.note.replace(/^إلغاء: /, "")})` : ""}`; break;
      case "lend": line = `سجّلت إني سلّفتك ${a}${note}`; break;
      default: line = mine ? `سجّلت إني دفعتلك ${a}${note}` : `سجّلت إنك دفعتلي ${a}${note}`;
    }
    return `أهلاً يا ${otherName}، ${line}.\n${balanceForThem(balanceAfterForMe, d)}`;
  }
  switch (t.kind) {
    case "split": line = `حصتك من الفاتورة${note}: ${a}`; break;
    case "settle": line = `صفّينا الحساب (${a})`; break;
    case "reversal": line = `لغيت حركة بقيمة ${a}${t.note ? ` (${t.note.replace(/^إلغاء: /, "")})` : ""}`; break;
    case "lend": line = `سجّلت إني أعطيتك ${a}${note}`; break;
    default: line = mine ? `سجّلت إني دفعتلك ${a}${note}` : `سجّلت إنك دفعتلي ${a}${note}`;
  }
  return `مرحبا ${otherName}، ${line}.\n${balanceForThem(balanceAfterForMe, d)}`;
}

/** The balance phrased from the friend's side (the opposite of mine). */
function balanceForThem(balanceForMe: Fils, d: Dialect = "jo"): string {
  if (d === "eg") {
    if (balanceForMe === 0) return "إحنا خالصين ✓";
    return balanceForMe > 0 ? `كده عليك ليا ${j(balanceForMe)}` : `كده ليك عندي ${j(-balanceForMe)}`;
  }
  if (balanceForMe === 0) return "الحساب بيناتنا خالص ✓";
  return balanceForMe > 0 ? `صار عليك إلي ${j(balanceForMe)}` : `صار إلك عندي ${j(-balanceForMe)}`;
}

export function waReminder(otherName: string, balanceForMe: Fils, d: Dialect = "jo", myCliq = ""): string {
  const pay = myCliq ? (d === "eg" ? `\nتقدر تحوّل على CliQ: ${myCliq}` : `\nبتقدر تحوّل على CliQ: ${myCliq}`) : "";
  if (d === "eg") return `أهلاً يا ${otherName} 🌷 حبيت أفكّرك إن عليك ليا ${j(balanceForMe)}. شكراً ليك.${pay}`;
  return `مرحبا ${otherName} 🌷 حبيت أذكّرك إنه الرصيد اللي عليك إلي ${j(balanceForMe)}. شكراً إلك.${pay}`;
}

const dfmt = new Intl.DateTimeFormat("ar-JO", { day: "numeric", month: "short", year: "numeric", numberingSystem: "latn" });

/** Full account statement. */
export function waStatement(txns: Txn[], me: Phone, otherName: string, myName: string, d: Dialect = "jo"): string {
  const rows = [...txns].sort((a, b) => a.createdAt - b.createdAt).map((t) => {
    const v = signedFor(t, me);
    const sign = v > 0 ? "+" : "−";
    return `• ${dfmt.format(t.createdAt)}: ${sign}${formatJodLatin(t.amount)}${t.note ? ` ${t.note}` : ""}`;
  });
  const bal = txns.reduce((s, t) => s + signedFor(t, me), 0);
  const eg = d === "eg";
  return [
    eg ? `الحساب بين ${myName} و${otherName}` : `الحساب بين ${myName} و${otherName}`,
    eg ? `(+ يعني عليك ليا، − يعني ليك عندي)` : `(+ يعني عليك إلي، − يعني إلك عندي)`,
    ...(rows.length ? rows : [eg ? "مفيش حاجة" : "ما في إشي"]),
    "──────",
    balanceForThem(bal, d),
  ].join("\n");
}

/** Notification for a new comment on an entry. */
export function commentText(byName: string, text: string, note: string, d: Dialect = "jo"): string {
  const who = byName || (d === "eg" ? "صاحبك" : "صاحبك");
  const on = note ? ` على «${note}»` : "";
  const short = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return `💬 ${who}${on}: ${short}`;
}
