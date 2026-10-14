import { useMemo, useState } from "react";
import {
  manualTxn, reversalOf, reversedIds, settlementFor, signedFor, type ManualAction, type Txn,
} from "../core/ledger";
import { waReminder, waStatement, waTxnMessage } from "../core/messages";
import { jod, parseJod } from "../core/money";
import { displayPhone, waLink, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { WhatsApp } from "./icons";
import { balanceAfter } from "./model";
import { dateLabel } from "./util";
import { useDialect, type Strings } from "./i18n";

// Two clear choices: money they owe me, or money I owe them
const actions = (s: Strings): { id: ManualAction; label: string; hint: string }[] => [
  { id: "iLentHim", label: s.theyOweMeTab, hint: s.theyOweMeHint },
  { id: "hePaidMe", label: s.iOweThemTab, hint: s.iOweThemHint },
];

function chipFor(t: Txn, me: Phone, s: Strings): { text: string; cls: string } {
  const mine = signedFor(t, me) > 0;
  if (t.kind === "split") return { text: s.chipBill, cls: mine ? "p" : "o" };
  if (t.kind === "settle") return { text: s.chipSettle, cls: "" };
  if (t.kind === "reversal") return { text: s.chipCancel, cls: "" };
  return mine ? { text: s.theyOweMeTab, cls: "p" } : { text: s.iOweThemTab, cls: "o" };
}

type Panel = null | { kind: "sent"; txn: Txn } | { kind: "settle" } | { kind: "undo"; txn: Txn } | { kind: "rename" };

export function FriendSheet({ phone, onClose }: { phone: Phone; onClose: () => void }) {
  const { friends, me, myName, backend, toast, registered } = useApp();
  const { t: s, dialect } = useDialect();
  const ACTIONS = actions(s);
  const f = friends.find((x) => x.phone === phone);
  const [action, setAction] = useState<ManualAction>("iLentHim");
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
    if (!fils || fils <= 0) { setErr(s.amountMissing); return; }
    setErr(""); setBusy(true);
    try {
      const [t] = await backend.addTxns([manualTxn(action, me, phone, fils, note.trim(), myName)]);
      setAmount(""); setNote("");
      setPanel({ kind: "sent", txn: t });
      toast(s.recorded);
    } catch { setErr(s.saveFailed); }
    finally { setBusy(false); }
  }

  async function settle() {
    const st = settlementFor(f!.balance, me, phone, myName);
    if (!st) return;
    setBusy(true);
    try {
      const [t] = await backend.addTxns([st]);
      setPanel({ kind: "sent", txn: t });
      toast(s.nowSettled);
    } catch { toast(s.saveFailed); }
    finally { setBusy(false); }
  }

  async function undo(t: Txn) {
    setBusy(true);
    try {
      const [r] = await backend.addTxns([reversalOf(t, me, myName)]);
      setPanel({ kind: "sent", txn: r });
      toast(s.cancelled);
    } catch { toast(s.tryAgain); }
    finally { setBusy(false); }
  }

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await backend.saveContact({ phone, name: newName.trim() });
    setPanel(null);
    toast(s.saved);
  }

  const sentMsg = panel?.kind === "sent"
    ? waTxnMessage(panel.txn, me, f.name, balanceAfter(f.txns.some((x) => x.id === panel.txn.id) ? f.txns : [...f.txns, panel.txn], me), dialect)
    : "";
  const statement = waStatement(f.txns, me, f.name, myName, dialect);

  return (
    <Sheet title={f.name} onClose={onClose} lead={<Avatar name={f.name} id={phone} size={48} />}>
      <div className="muted" style={{ marginTop: -10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span dir="ltr">{displayPhone(phone)}</span>
        <span>{reg ? `· ${s.hasApp}` : reg === false ? `· ${s.noApp}` : ""}</span>
        <button className="link-btn" onClick={() => { setNewName(f.name); setPanel({ kind: "rename" }); }}>
          {f.saved ? s.rename : s.saveFriend}
        </button>
      </div>

      {panel?.kind === "rename" && (
        <form className="confirm calm" onSubmit={rename}>
          <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} aria-label={s.name} maxLength={40} />
          <div className="actions"><button className="btn">{s.save}</button><button type="button" className="btn ghost" onClick={() => setPanel(null)}>{s.no}</button></div>
        </form>
      )}

      <div className="big-bal">
        <div className="lbl">{cls === "pos" ? s.owesMe : cls === "neg" ? s.iOweThem : s.balance}</div>
        <div className={`amt num ${cls}`}>{jod(Math.abs(f.balance))}</div>
      </div>

      {panel?.kind === "sent" && (
        <div className="notice">
          <div>
            <b>{reg ? s.notified(f.name) : s.tellOnWa(f.name)}</b>
            <div className="msg">{sentMsg}</div>
          </div>
          <div className="actions">
            <a className={`btn ${reg ? "ghost" : "wa"}`} href={waLink(phone, sentMsg)} target="_blank" rel="noopener" onClick={() => setPanel(null)}><WhatsApp />{s.sendWa}</a>
            <button className="btn ghost" onClick={() => setPanel(null)}>{s.ok}</button>
          </div>
        </div>
      )}

      <form onSubmit={record} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="seg two" role="group" aria-label={s.newDebt}>
          {ACTIONS.map((a) => (
            <button type="button" key={a.id} aria-pressed={action === a.id} onClick={() => setAction(a.id)}>
              {a.label}<small>{a.hint}</small>
            </button>
          ))}
        </div>
        <div className="form">
          <div>
            <label className="l" htmlFor="amt">{s.amount} ({s.jod})</label>
            <input id="amt" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.000" />
          </div>
          <div>
            <label className="l" htmlFor="nt">{s.note}</label>
            <input id="nt" value={note} onChange={(e) => setNote(e.target.value)} placeholder={s.notePh} maxLength={80} />
          </div>
        </div>
        {err && <p className="err">{err}</p>}
        <button className={`btn big ${action === "hePaidMe" ? "owe" : "paid"}`} disabled={busy}>
          {s.recordIt}
        </button>
      </form>

      {panel?.kind === "settle" && (
        <div className="confirm calm">
          <span>{s.settleConfirm(f.name, jod(Math.abs(f.balance)), f.balance > 0)}</span>
          <div className="actions"><button className="btn paid" disabled={busy} onClick={settle}>{s.yesSettle}</button><button className="btn ghost" onClick={() => setPanel(null)}>{s.no}</button></div>
        </div>
      )}
      {panel?.kind === "undo" && (
        <div className="confirm">
          <span>{s.cancelConfirm(panel.txn.note || chipFor(panel.txn, me, s).text, jod(panel.txn.amount))}</span>
          <div className="actions"><button className="btn owe" disabled={busy} onClick={() => undo(panel.txn)}>{s.yesCancel}</button><button className="btn ghost" onClick={() => setPanel(null)}>{s.no}</button></div>
        </div>
      )}

      <div className="actions">
        {f.balance !== 0 && <button className="btn soft" onClick={() => setPanel({ kind: "settle" })}>{s.settleUp}</button>}
        {f.balance > 0 && (
          <a className="btn soft" href={waLink(phone, waReminder(f.name, f.balance, dialect))} target="_blank" rel="noopener"><WhatsApp />{s.remind}</a>
        )}
        {f.txns.length > 0 && (
          <a className="btn soft" href={waLink(phone, statement)} target="_blank" rel="noopener"><WhatsApp />{s.sendAll}</a>
        )}
      </div>

      <div className="entries">
        {!f.txns.length ? <div className="empty">{s.nothingYet}</div> : f.txns.map((t) => {
          const v = signedFor(t, me);
          const c = chipFor(t, me, s);
          const isVoid = voided.has(t.id);
          const canUndo = !isVoid && t.kind !== "reversal" && t.createdBy === me;
          return (
            <div key={t.id} className={`entry${isVoid ? " void" : ""}`}>
              <div className="txt">
                <span className={`chip ${c.cls}`}>{c.text}</span>{t.note}
                <div className="meta">{dateLabel(t.createdAt, s)} · {t.createdBy === me ? s.youAdded : s.theyAdded(t.createdByName)}{isVoid ? ` · ${s.cancelledTag}` : ""}</div>
              </div>
              <div className={`amt num ${v > 0 ? "pos" : "neg"}`}>{jod(t.amount)}<span className="sr-only">{v > 0 ? ` ${s.owedShort}` : ` ${s.oweShort}`}</span></div>
              {canUndo && <button className="undo" onClick={() => setPanel({ kind: "undo", txn: t })}>{s.cancel}</button>}
            </div>
          );
        })}
      </div>
      <p className="note">{s.colorsNote}</p>
    </Sheet>
  );
}
