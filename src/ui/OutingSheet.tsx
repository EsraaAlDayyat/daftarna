import { useEffect, useMemo, useRef, useState } from "react";
import type { NewTxn } from "../core/ledger";
import { waOutingMessage } from "../core/messages";
import { jod, type Fils } from "../core/money";
import { computeOuting, lineHasParts, NOT_COMING, paidFromLine } from "../core/outing";
import { smsLink, waLink, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { WhatsApp } from "./icons";
import { getNotifyVia } from "./notifyPref";
import { Sheet } from "./Sheet";
import { useT } from "./i18n";

type Step = "fill" | "calc" | "done";

/**
 * An outing: next to each member, what they paid. Then whoever presses
 * "calculate" picks who came, and the total is split equally among them.
 */
export function OutingSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { orders, groups, friends, me, myName, backend, toast } = useApp();
  const t = useT();
  const o = orders.find((x) => x.id === id);
  const g = groups.find((x) => x.id === o?.groupId);
  const [step, setStep] = useState<Step>("fill");
  const [came, setCame] = useState<Phone[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Frozen once saved, so the "done" step doesn't change if someone edits after
  const [saved, setSaved] = useState<ReturnType<typeof computeOuting> | null>(null);

  const people = o ? [me, ...o.parties.filter((p) => p !== me)].filter((p) => o.parties.includes(p)) : [];
  const paid: Record<Phone, Fils> = {};
  for (const p of people) paid[p] = paidFromLine(o?.lines[p]) ?? 0;
  const defaultCame = o ? people.filter((p) => paidFromLine(o.lines[p]) !== null) : [];
  const attendees = came ?? defaultCame;
  const result = useMemo(() => computeOuting(paid, attendees, me), [JSON.stringify(paid), attendees.join(","), me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o) return null;
  const nameOf = (p: Phone) => (p === me ? t.meNamed(myName) : friends.find((f) => f.phone === p)?.name ?? g?.names[p] ?? p);
  const shortName = (p: Phone) => (p === me ? myName : friends.find((f) => f.phone === p)?.name ?? g?.names[p] ?? p);

  async function confirm() {
    if (!o) return;
    const r = result;
    const note = `طلعة: ${o.title}`.slice(0, 120);
    const news: NewTxn[] = r.transfers.map((x) => ({
      creditor: x.creditor, debtor: x.debtor, amount: x.amount, kind: "paidFor", note, createdBy: me, createdByName: myName,
    }));
    setBusy(true);
    try {
      if (news.length) await backend.addTxns(news);
      backend.closeOrder(o.id).catch(() => { /* stays open; harmless */ });
      setSaved(r);
      setStep("done");
      toast(t.outingSaved);
    } catch {
      toast(t.tryAgain);
    } finally { setBusy(false); }
  }

  const title = step === "calc" ? t.calcOuting : o.title;
  const mine = result.people.find((x) => x.phone === me);
  const onBack = step === "calc" ? () => setStep("fill") : undefined;

  return (
    <Sheet title={title} lead={<span className="g-emoji" aria-hidden="true">🏕️</span>} onClose={onBack ?? onClose} full>
      {step === "fill" && (
        <>
          <p className="muted" style={{ margin: "-8px 0 0" }}>{t.outingHint}</p>
          <OutingName orderId={o.id} value={o.title} />
          <div className="list">
            {people.map((p) => <PaidLine key={p} orderId={o.id} phone={p} name={nameOf(p)} value={o.lines[p] ?? ""} />)}
          </div>
          <div className="sticky-foot">
            <button className="btn big warm" disabled={defaultCame.length < 2 || o.status === "done"} onClick={() => { setCame(null); setStep("calc"); }}>
              🧮 {o.status === "done" ? t.outingClosed : defaultCame.length < 2 ? t.outingNeedsTwo : t.calcOuting}
            </button>
          </div>
        </>
      )}

      {step === "calc" && (
        <>
          <div className="big-bal">
            <div className="lbl">{t.outingTotal}</div>
            <div className="amt num">{jod(result.total)}</div>
            <div className="lbl">{t.outingShare(jod(result.share), attendees.length)}</div>
          </div>

          {mine && (
            <div className={`my-outing ${mine.net > 0 ? "pos" : mine.net < 0 ? "neg" : ""}`}>
              <div className="mo-cells">
                <span><small>{t.yourShare}</small><b className="num">{jod(mine.share)}</b></span>
                <span><small>{t.youPaid}</small><b className="num">{jod(mine.paid)}</b></span>
              </div>
              <div className="mo-net">{mine.net === 0 ? t.youreEven : mine.net > 0 ? t.youGetBack(jod(mine.net)) : t.youStillOwe(jod(-mine.net))}</div>
            </div>
          )}

          <div className="section-h"><h3>{t.outingWho}</h3></div>
          <p className="muted" style={{ margin: "-6px 0 0", fontSize: 14 }}>{t.outingWhoHint}</p>
          <div className="list">
            {people.map((p) => {
              const on = attendees.includes(p);
              const x = result.people.find((y) => y.phone === p);
              const tr = result.transfers.find((y) => y.creditor === p || y.debtor === p);
              const rel = p === me || !on || !tr ? null : tr.debtor === p ? t.owesYouAmt(jod(tr.amount)) : t.youPayAmt(jod(tr.amount));
              return (
                <label key={p} className={`row static outing-row${on ? "" : " off"}`}>
                  <input type="checkbox" checked={on} aria-label={nameOf(p)}
                    onChange={() => setCame(on ? attendees.filter((y) => y !== p) : [...attendees, p])} />
                  <Avatar name={nameOf(p)} id={p} size={36} />
                  <span className="who">
                    <b>{nameOf(p)}</b>
                    <span>{on ? t.paidLabel(jod(paid[p] ?? 0)) : t.notComing}</span>
                  </span>
                  {on && x && p !== me && <span className={`rel ${rel ? (tr!.debtor === p ? "pos" : "neg") : ""}`}>{rel ?? t.evenAmt}</span>}
                </label>
              );
            })}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t.outingHubNote}</p>
          <div className="sticky-foot">
            <button className="btn big warm" disabled={busy || attendees.length < 2} onClick={confirm}>
              {attendees.length < 2 ? t.outingNeedsTwo : t.confirmOuting}
            </button>
          </div>
        </>
      )}

      {step === "done" && saved && (
        <>
          <div className="big-bal">
            <div className="lbl">{t.outingShare(jod(saved.share), saved.people.length)}</div>
            <div className="amt num">{jod(saved.total)}</div>
          </div>
          <p style={{ margin: 0 }}>{t.outingDoneNote}</p>
          <div className="ledger">
            {saved.people.filter((x) => x.phone !== me).map((x) => {
              const msg = waOutingMessage(shortName(x.phone), o.title, saved.total, x.share, x.paid, x.net);
              const sms = getNotifyVia() === "sms";
              return (
                <div key={x.phone} className="share-row">
                  <span className="who"><b>{nameOf(x.phone)}</b><span>{x.net === 0 ? t.evenAmt : x.net < 0 ? t.owesYouAmt(jod(-x.net)) : t.youPayAmt(jod(x.net))}</span></span>
                  <span className="send-pair">
                    <a className={`btn small ${sms ? "ghost" : "wa"}`} href={waLink(x.phone, msg)} target="_blank" rel="noopener" aria-label={t.waTo(nameOf(x.phone))}><WhatsApp />{t.whatsapp}</a>
                    <a className={`btn small ${sms ? "" : "ghost"}`} href={smsLink(x.phone, msg)} aria-label={t.smsTo(nameOf(x.phone))}>💬 {t.viaSms}</a>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="sticky-foot"><button className="btn big" onClick={onClose}>{t.seeAccounts}</button></div>
        </>
      )}
    </Sheet>
  );
}

/** One person's amount. Saves when you leave the field, like the order lines. */
function PaidLine({ orderId, phone, name, value }: { orderId: string; phone: Phone; name: string; value: string }) {
  const { backend, toast } = useApp();
  const t = useT();
  const out = value.trim() === NOT_COMING;
  const [text, setText] = useState(out ? "" : value);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(value.trim() === NOT_COMING ? "" : value); }, [value]);

  async function put(v: string) {
    if (v === value.trim()) return;
    try { await backend.setOrderLine(orderId, phone, v); }
    catch { toast(t.tryAgain); }
  }
  async function save() {
    editing.current = false;
    const v = text.trim().slice(0, 60);
    if (v && paidFromLine(v) === null) { toast(t.badAmount); return; }
    await put(v);
  }

  return (
    <div className={`row static order-line paid-line${out ? " off" : ""}`}>
      <Avatar name={name} id={phone} size={40} />
      <span className="who">
        <b>{name}</b>
        {out ? <span className="muted">{t.notComing}</span> : (
          <input
            value={text} placeholder={t.outingPh} aria-label={t.outingOf(name)} maxLength={60}
            onFocus={() => { editing.current = true; }}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        )}
        {!out && lineHasParts(text) && paidFromLine(text) !== null && <span className="line-sum">{t.lineSum(jod(paidFromLine(text)!))}</span>}
      </span>
      <button className="chip-btn" onClick={() => put(out ? "" : NOT_COMING)}>{out ? t.coming : t.notComing}</button>
    </div>
  );
}

/** The outing's name, editable by anyone in it. Saves when you leave the field. */
function OutingName({ orderId, value }: { orderId: string; value: string }) {
  const { backend, toast } = useApp();
  const t = useT();
  const [text, setText] = useState(value);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(value); }, [value]);
  async function save() {
    editing.current = false;
    const v = text.trim().slice(0, 60);
    if (!v) { setText(value); return; }
    if (v === value) return;
    try { await backend.renameOrder(orderId, v); }
    catch { toast(t.tryAgain); }
  }
  return (
    <label className="field outing-name">
      <span>{t.outingName}</span>
      <input value={text} placeholder={t.outingNamePh} maxLength={60}
        onFocus={() => { editing.current = true; }}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}
