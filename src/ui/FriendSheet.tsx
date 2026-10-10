import { useMemo, useState } from "react";
import {
  manualTxn, reversalOf, reversedIds, settlementFor, signedFor, type ManualAction, type Txn,
} from "../core/ledger";
import { waReminder, waStatement, waTxnMessage } from "../core/messages";
import { jod, parseJod } from "../core/money";
import { displayPhone, waLink, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";
import { WhatsApp } from "./icons";
import { balanceAfter } from "./model";
import { dateLabel } from "./util";

const ACTIONS: { id: ManualAction; label: string; hint: string }[] = [
  { id: "iPaidHim", label: "دفعتله", hint: "أو دفعت عنه" },
  { id: "hePaidMe", label: "دفعلي", hint: "أو دفع عني" },
  { id: "iLentHim", label: "أعطيته دين", hint: "سلفة" },
];

function chipFor(t: Txn, me: Phone): { text: string; cls: string } {
  const mine = signedFor(t, me) > 0;
  if (t.kind === "split") return { text: "فاتورة", cls: mine ? "p" : "o" };
  if (t.kind === "settle") return { text: "تصفية", cls: "" };
  if (t.kind === "reversal") return { text: "إلغاء", cls: "" };
  if (t.kind === "lend") return mine ? { text: "أعطيته دين", cls: "p" } : { text: "أعطاني دين", cls: "o" };
  return mine ? { text: "دفعتله", cls: "p" } : { text: "دفعلي", cls: "o" };
}

type Panel = null | { kind: "sent"; txn: Txn } | { kind: "settle" } | { kind: "undo"; txn: Txn } | { kind: "rename" };

export function FriendSheet({ phone, onClose }: { phone: Phone; onClose: () => void }) {
  const { friends, me, myName, backend, toast, registered } = useApp();
  const f = friends.find((x) => x.phone === phone);
  const [action, setAction] = useState<ManualAction>("iPaidHim");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [newName, setNewName] = useState("");
  const voided = useMemo(() => reversedIds(f?.txns ?? []), [f?.txns]);

  if (!f) return null;
  const reg = registered(phone);
  const cls = f.balance > 0 ? "pos" : f.balance < 0 ? "neg" : "zero";

  async function record(e: React.FormEvent) {
    e.preventDefault();
    const fils = parseJod(amount);
    if (!fils || fils <= 0) { setErr("اكتب مبلغ أكبر من صفر"); return; }
    setErr(""); setBusy(true);
    try {
      const [t] = await backend.addTxns([manualTxn(action, me, phone, fils, note.trim(), myName)]);
      setAmount(""); setNote("");
      setPanel({ kind: "sent", txn: t });
      toast("انسجّلت ✓");
    } catch { setErr("ما انسجّلت، جرّب كمان مرة."); }
    finally { setBusy(false); }
  }

  async function settle() {
    const s = settlementFor(f!.balance, me, phone, myName);
    if (!s) return;
    setBusy(true);
    try {
      const [t] = await backend.addTxns([s]);
      setPanel({ kind: "sent", txn: t });
      toast("الحساب صار خالص ✓");
    } catch { toast("ما انسجّلت، جرّب كمان مرة."); }
    finally { setBusy(false); }
  }

  async function undo(t: Txn) {
    setBusy(true);
    try {
      const [r] = await backend.addTxns([reversalOf(t, me, myName)]);
      setPanel({ kind: "sent", txn: r });
      toast("انلغت الحركة");
    } catch { toast("ما انلغت، جرّب كمان مرة."); }
    finally { setBusy(false); }
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await backend.saveContact({ phone, name: newName.trim() });
    setPanel(null);
    toast("انحفظ");
  }

  const sentMsg = panel?.kind === "sent"
    ? waTxnMessage(panel.txn, me, f.name, balanceAfter(f.txns.some((x) => x.id === panel.txn.id) ? f.txns : [...f.txns, panel.txn], me))
    : "";
  const statement = waStatement(f.txns, me, f.name, myName);

  return (
    <Sheet title={f.name} onClose={onClose} lead={<span className="av">{f.name.trim()[0] ?? "؟"}</span>}>
      <div className="muted" style={{ marginTop: -10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span dir="ltr">{displayPhone(phone)}</span>
        <span>{reg ? "· عنده التطبيق ✓" : reg === false ? "· ما عنده التطبيق" : ""}</span>
        <button className="link-btn" onClick={() => { setNewName(f.name); setPanel({ kind: "rename" }); }}>
          {f.saved ? "غيّر الاسم" : "احفظ بأصحابي"}
        </button>
      </div>

      {panel?.kind === "rename" && (
        <form className="confirm calm" onSubmit={rename}>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="الاسم" maxLength={40} />
          <div className="actions"><button className="btn">احفظ</button><button type="button" className="btn ghost" onClick={() => setPanel(null)}>لا</button></div>
        </form>
      )}

      <div className="big-bal">
        <div className="lbl">{cls === "pos" ? "إلك عنده" : cls === "neg" ? "عليك إله" : "الحساب"}</div>
        <div className={`amt num ${cls}`}>{cls === "zero" ? "خالص ✓" : jod(f.balance)}</div>
      </div>

      {panel?.kind === "sent" && (
        <div className="notice">
          <div>
            <b>{reg ? `وصل ${f.name} إشعار بالحركة.` : `${f.name} ما عنده التطبيق. بلّغه واتساب؟`}</b>
            <div className="msg">{sentMsg}</div>
          </div>
          <div className="actions">
            <a className={`btn ${reg ? "ghost" : "wa"}`} href={waLink(phone, sentMsg)} target="_blank" rel="noopener" onClick={() => setPanel(null)}><WhatsApp />ابعت واتساب</a>
            <button className="btn ghost" onClick={() => setPanel(null)}>تمام</button>
          </div>
        </div>
      )}

      <form onSubmit={record} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="seg" role="group" aria-label="نوع الحركة">
          {ACTIONS.map((a) => (
            <button type="button" key={a.id} aria-pressed={action === a.id} onClick={() => setAction(a.id)}>
              {a.label}<small>{a.hint}</small>
            </button>
          ))}
        </div>
        <div className="form">
          <div>
            <label className="l" htmlFor="amt">المبلغ (د.أ)</label>
            <input id="amt" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.000" />
          </div>
          <div>
            <label className="l" htmlFor="nt">ملاحظة</label>
            <input id="nt" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: تكسي" maxLength={80} />
          </div>
        </div>
        {err && <p className="err">{err}</p>}
        <button className={`btn big ${action === "hePaidMe" ? "owe" : "paid"}`} disabled={busy}>
          سجّل: {ACTIONS.find((a) => a.id === action)!.label}
        </button>
      </form>

      {panel?.kind === "settle" && (
        <div className="confirm calm">
          <span>{f.balance > 0 ? `رح نسجّل إنه ${f.name} دفعلك ${jod(f.balance)}` : `رح نسجّل إنك دفعت لـ${f.name} ${jod(f.balance)}`}، ويصير الحساب خالص. تمام؟</span>
          <div className="actions"><button className="btn paid" disabled={busy} onClick={settle}>آه، صفّي</button><button className="btn ghost" onClick={() => setPanel(null)}>لا</button></div>
        </div>
      )}
      {panel?.kind === "undo" && (
        <div className="confirm">
          <span>رح تنضاف حركة عكسية بتلغي "{panel.txn.note || chipFor(panel.txn, me).text}" ({jod(panel.txn.amount)}). الحركة الأصلية بتضل بالسجل مشطوبة.</span>
          <div className="actions"><button className="btn owe" disabled={busy} onClick={() => undo(panel.txn)}>ألغيها</button><button className="btn ghost" onClick={() => setPanel(null)}>لا</button></div>
        </div>
      )}

      <div className="actions">
        {f.balance !== 0 && <button className="btn soft" onClick={() => setPanel({ kind: "settle" })}>صفّي الحساب</button>}
        {f.balance > 0 && (
          <a className="btn soft" href={waLink(phone, waReminder(f.name, f.balance))} target="_blank" rel="noopener"><WhatsApp />ذكّره</a>
        )}
        {f.txns.length > 0 && (
          <a className="btn soft" href={waLink(phone, statement)} target="_blank" rel="noopener"><WhatsApp />كشف حساب</a>
        )}
      </div>

      <div className="entries">
        {!f.txns.length ? <div className="empty">ما في حركات لسا</div> : f.txns.map((t) => {
          const v = signedFor(t, me);
          const c = chipFor(t, me);
          const isVoid = voided.has(t.id);
          const canUndo = !isVoid && t.kind !== "reversal" && t.createdBy === me;
          return (
            <div key={t.id} className={`entry${isVoid ? " void" : ""}`}>
              <div className="txt">
                <span className={`chip ${c.cls}`}>{c.text}</span>{t.note}
                <div className="meta">{dateLabel(t.createdAt)} · {t.createdBy === me ? "سجّلتها إنت" : `سجّلها ${t.createdByName}`}{isVoid ? " · انلغت" : ""}</div>
              </div>
              <div className={`amt num ${v > 0 ? "pos" : "neg"}`}>{jod(t.amount)}<span className="sr-only">{v > 0 ? " إلك" : " عليك"}</span></div>
              {canUndo && <button className="undo" onClick={() => setPanel({ kind: "undo", txn: t })}>إلغاء</button>}
            </div>
          );
        })}
      </div>
      <p className="note">الأخضر إلك والأحمر عليك. الحركات ما بتنمسح، والإلغاء بيبين للطرفين.</p>
    </Sheet>
  );
}
