import { paidStates, reversedIds, signedFor, type Txn } from "../core/ledger";
import { jod } from "../core/money";
import { displayPhone, type Phone } from "../core/phone";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const dfmt = new Intl.DateTimeFormat("ar-JO", { day: "numeric", month: "short", year: "numeric" });

/**
 * A printable statement for one friend. Opens the phone's print screen, where
 * "Save as PDF" gives a file to send.
 */
export function statementHtml(o: { txns: Txn[]; me: Phone; myName: string; name: string; phone: Phone; balance: number }): string {
  const voided = reversedIds(o.txns);
  const paid = paidStates(o.txns);
  const rows = [...o.txns]
    .filter((t) => !voided.has(t.id) && t.kind !== "reversal")
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((t) => {
      const v = signedFor(t, o.me);
      const p = paid.get(t.id);
      const kind = t.pays ? "سداد" : t.kind === "settle" ? "تسوية" : t.kind === "split" ? "حصة" : v > 0 ? "لي عنده" : "له عندي";
      const state = p ? (p.done ? "✓ مدفوع" : p.paid ? `بقي ${jod(p.left)}` : "لم يُدفع") : "";
      return `<tr class="${p?.done ? "done" : ""}"><td>${dfmt.format(t.createdAt)}</td><td>${esc(kind)}</td><td>${esc(t.note.replace(/^سداد: /, "") || "—")}</td>`
        + `<td class="n ${v > 0 ? "pos" : "neg"}">${jod(t.amount)}</td><td class="st">${state}</td></tr>`;
    }).join("");
  const bal = o.balance === 0 ? "لا يوجد رصيد ✓" : o.balance > 0 ? `لك عند ${esc(o.name)}: ${jod(o.balance)}` : `عليك لـ${esc(o.name)}: ${jod(-o.balance)}`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف حساب ${esc(o.name)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", Tahoma, sans-serif; color: #1c2b24; margin: 0; padding: 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1f5c47; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { margin: 0; font-size: 22px; font-weight: 600; } .sub { color: #64746b; font-size: 13px; margin-top: 4px; }
  .brand { color: #1f5c47; font-weight: 600; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: start; color: #64746b; font-weight: 500; border-bottom: 1px solid #dfe7e1; padding: 8px 6px; }
  td { padding: 9px 6px; border-bottom: 1px solid #eef2ef; }
  td.n { font-variant-numeric: tabular-nums; white-space: nowrap; } .pos { color: #1f7a55; } .neg { color: #b4483c; }
  tr.done td.n { text-decoration: line-through; opacity: .6; } td.st { color: #64746b; white-space: nowrap; }
  .total { margin-top: 18px; padding: 14px 16px; background: #e2eee7; border-radius: 12px; font-size: 17px; font-weight: 600; color: #1f5c47; }
  footer { margin-top: 22px; color: #64746b; font-size: 12px; text-align: center; }
</style></head><body>
<header><div><h1>كشف حساب: ${esc(o.name)}</h1><div class="sub">${esc(displayPhone(o.phone))} · بين ${esc(o.myName)} و${esc(o.name)} · ${dfmt.format(Date.now())}</div></div><div class="brand">📒 دفترنا</div></header>
<table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows || `<tr><td colspan="5">لا توجد قيود</td></tr>`}</tbody></table>
<div class="total">${bal}</div>
<footer>الأخضر: لي عنده · الأحمر: له عندي · daftarna-99fad.web.app</footer>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
}

export function openStatement(o: Parameters<typeof statementHtml>[0]): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(statementHtml(o));
  w.document.close();
  return true;
}
