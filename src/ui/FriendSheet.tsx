import { useMemo, useState } from "react";
import {
  manualTxn, reversalOf, reversedIds, settlementFor, signedFor, type ManualAction, type Txn,
} from "../core/ledger";
import { waReminder, waStatement, waTxnMessage } from "../core/messages";
import { jod, parseJod } from "../core/money";
import { displayPhone, smsLink, waLink, type Phone } from "../core/phone";
import { getNotifyVia } from "./notifyPref";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { Pencil, WhatsApp } from "./icons";
import { normalizeCliq } from "../core/cliq";
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

type Panel = null | { kind: "sent"; txn: Txn } | { kind: "settle" } | { kind: "undo"; txn: Txn } | { kind: "rename" } | { kind: "cliq" };

export function FriendSheet({ phone, onClose }: { phone: Phone; onClose: () => void }) {
  const { friends, me, myName, myCliq, backend, toast, registered, comments, contacts } = useApp();
  const [openThread, setOpenThread] = useState<string | null>(null);
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
  const [cliqIn, setCliqIn] = useState("");
  const voided = useMemo(() => reversedIds(f?.txns ?? []), [f?.txns]);

  if (!f) return null;
  const reg = registered(phone);
  const cls = f.balance > 0 ? "pos" : f.balance < 0 ? "neg" : "zero";

  /** Friends without the app hear about every entry, added or paid back: WhatsApp or SMS opens with the words ready. */
  function tellThem(t: Txn) {
    if (reg === true) return; // they get a notification in the app
    const via = getNotifyVia();
    if (via === "ask") return; // the panel offers both
    const msg = waTxnMessage(t, me, f!.name, balanceAfter([...f!.txns, t], me), dialect);
    if (via === "sms") location.href = smsLink(phone, msg);
    else window.open(waLink(phone, msg), "_blank", "noopener");
  }

  async function record(e: React.FormEvent) {
    e.preventDefault();
    const fils = parseJod(amount);
    if (!fils || fils <= 0) { setErr(s.amountMissing); return; }
    setErr(""); setBusy(true);
    try {
      const [t] = await backend.addTxns([manualTxn(action, me, phone, fils, note.trim(), myName)]);
      setAmount(""); setNote("");
      // Only ask in-page when the setting says "ask"; otherwise the message already opened
      if (reg !== true && getNotifyVia() === "ask") setPanel({ kind: "sent", txn: t });
      tellThem(t);
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
      // Only ask in-page when the setting says "ask"; otherwise the message already opened
      if (reg !== true && getNotifyVia() === "ask") setPanel({ kind: "sent", txn: t });
      tellThem(t);
      toast(s.nowSettled);
    } catch { toast(s.saveFailed); }
    finally { setBusy(false); }
  }

  async function undo(t: Txn) {
    setBusy(true);
    try {
      const [r] = await backend.addTxns([reversalOf(t, me, myName)]);
      // Only ask in-page when the setting says "ask"; otherwise the message already opened
      if (reg !== true && getNotifyVia() === "ask") setPanel({ kind: "sent", txn: r });
      tellThem(r);
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

  const cliq = contacts.find((c) => c.phone === phone)?.cliq ?? "";
  async function saveCliq(e: React.FormEvent) {
    e.preventDefault();
    const v = cliqIn.trim() ? normalizeCliq(cliqIn) : "";
    if (v === null) { toast(s.badCliq); return; }
    try { await backend.saveContact({ phone, name: f!.name, cliq: v }); setPanel(null); toast(s.saved); }
    catch { toast(s.tryAgain); }
  }
  async function copyCliq() {
    try { await navigator.clipboard.writeText(cliq); toast(s.cliqCopied); } catch { /* */ }
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
        {!cliq && panel?.kind !== "cliq" && (
          <button className="link-btn" onClick={() => { setCliqIn(""); setPanel({ kind: "cliq" }); }}>+ CliQ</button>
        )}
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

      {panel?.kind === "cliq" ? (
        <form className="cliq-card" onSubmit={saveCliq}>
          <span className="cliq-logo" aria-hidden="true">CliQ</span>
          <input autoFocus dir="ltr" value={cliqIn} onChange={(e) => setCliqIn(e.target.value)} placeholder={s.cliqPh} aria-label={s.cliqOf(f.name)} maxLength={20} />
          <button className="btn small">{s.save}</button>
        </form>
      ) : cliq ? (
        <div className={`cliq-card ${f.balance < 0 ? "due" : ""}`}>
          <span className="cliq-logo" aria-hidden="true">CliQ</span>
          <span className="who">
            <b dir="ltr">{cliq}</b>
            <span className="muted">{f.balance < 0 ? s.cliqPayHint(jod(-f.balance)) : s.cliqOf(f.name)}</span>
          </span>
          <button className="btn small" onClick={copyCliq}>{s.copy}</button>
          <button className="icon-btn" onClick={() => { setCliqIn(cliq); setPanel({ kind: "cliq" }); }} aria-label={s.editCliq}><Pencil /></button>
        </div>
      ) : null}

      {panel?.kind === "sent" && (
        <div className="notice">
          <div>
            <b>{reg ? s.notified(f.name) : s.tellOnWa(f.name)}</b>
            <div className="msg">{sentMsg}</div>
          </div>
          <div className="actions">
            <a className={`btn ${reg ? "ghost" : "wa"}`} href={waLink(phone, sentMsg)} target="_blank" rel="noopener" onClick={() => setPanel(null)}><WhatsApp />{s.sendWa}</a>
            {!reg && <a className="btn ghost" href={smsLink(phone, sentMsg)} onClick={() => setPanel(null)}>💬 {s.sendSms}</a>}
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
          <a className="btn soft" href={waLink(phone, waReminder(f.name, f.balance, dialect, myCliq))} target="_blank" rel="noopener"><WhatsApp />{s.remind}</a>
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
              <div className="entry-actions">
                {(() => {
                  const n = comments.filter((x) => x.txnId === t.id).length;
                  const isOpen = openThread === t.id;
                  return (
                    <button className={`talk${n ? " has" : ""}`} aria-expanded={isOpen} onClick={() => setOpenThread(isOpen ? null : t.id)}>
                      💬 {n ? s.commentsCount(n) : s.addComment}
                    </button>
                  );
                })()}
                {canUndo && <button className="undo" onClick={() => setPanel({ kind: "undo", txn: t })}>{s.cancel}</button>}
              </div>
              {openThread === t.id && <Thread txn={t} />}
            </div>
          );
        })}
      </div>
      <p className="note">{s.colorsNote}</p>
    </Sheet>
  );
}

/** Comments under one entry: both people can write, nobody can edit or delete. */
function Thread({ txn }: { txn: Txn }) {
  const { comments, backend, me, toast } = useApp();
  const { t: s } = useDialect();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = comments.filter((c) => c.txnId === txn.id).sort((a, b) => a.createdAt - b.createdAt);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setBusy(true);
    try { await backend.addComment(txn, v.slice(0, 300)); setText(""); }
    catch { toast(s.tryAgain); }
    finally { setBusy(false); }
  }

  return (
    <div className="thread">
      {list.map((c) => (
        <div key={c.id} className={`bubble${c.by === me ? " mine" : ""}`}>
          <span className="who">{c.by === me ? s.me : c.byName}</span>
          <span className="text">{c.text}</span>
          <span className="when">{dateLabel(c.createdAt, s)}</span>
        </div>
      ))}
      <form className="say" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={s.commentPh} aria-label={s.commentPh} maxLength={300} autoFocus />
        <button className="btn small" disabled={busy || !text.trim()}>{s.send}</button>
      </form>
    </div>
  );
}
