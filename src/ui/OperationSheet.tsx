import { useMemo, useRef, useState } from "react";
import type { Txn } from "../core/ledger";
import { waTxnMessage } from "../core/messages";
import { filsToInput, jod, parseJod, type Fils } from "../core/money";
import {
  myImpact, operationNote, operationShares, operationTxns, validateOperation,
  type OperationInput, type OperationKind, type OperationProblem,
} from "../core/operation";
import { smsLink, waLink, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { WhatsApp } from "./icons";
import { balanceAfter } from "./model";
import { getNotifyVia } from "./notifyPref";
import { Sheet } from "./Sheet";
import { useT } from "./i18n";
import { newId } from "./util";

type Kind = OperationKind | "bill";
type Step = "type" | "details" | "payer" | "recipient" | "people" | "split" | "review" | "done";

const KINDS: { id: Kind; emoji: string }[] = [
  { id: "bill", emoji: "🧾" },
  { id: "gift", emoji: "🎁" },
  { id: "trip", emoji: "🏕️" },
  { id: "shared", emoji: "🧺" },
];

/**
 * "Add an operation" for a group: a gift, a trip or a shared expense with one
 * payer, split equally or by fixed amounts. A restaurant bill goes to the
 * bill flow (photo and items); a trip where several people paid goes to the outing.
 */
export function OperationSheet({ groupId, onClose, onBill, onOuting, onDone }: {
  groupId: string; onClose: () => void; onBill: () => void; onOuting: () => void; onDone: () => void;
}) {
  const { groups, friends, me, myName, backend, toast, registered, txns } = useApp();
  const t = useT();
  const g = groups.find((x) => x.id === groupId);
  const [step, setStep] = useState<Step>("type");
  const [kind, setKind] = useState<OperationKind>("shared");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [payer, setPayer] = useState<Phone>(me);
  const [recipient, setRecipient] = useState<{ phone?: Phone; name: string } | null>(null);
  const [otherName, setOtherName] = useState("");
  const [people, setPeople] = useState<Phone[]>([]);
  const [method, setMethod] = useState<"equal" | "custom">("equal");
  const [custom, setCustom] = useState<Record<Phone, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Txn[]>([]);
  // One id per submission, so pressing save again after a network error can't record it twice
  const opId = useRef(newId());

  const members = g ? [me, ...g.members.filter((p) => p !== me)] : [];
  const nameOf = (p: Phone) => (p === me ? t.meNamed(myName) : friends.find((f) => f.phone === p)?.name ?? g?.names[p] ?? p);
  const shortName = (p: Phone) => (p === me ? t.me : friends.find((f) => f.phone === p)?.name ?? g?.names[p] ?? p);
  const total = parseJod(amount) ?? 0;
  // Entries are dated by the server when saved, so the date is always today
  const today = new Date().toLocaleDateString("ar-JO", { day: "numeric", month: "long", year: "numeric" });
  const contributors = members.filter((p) => !(kind === "gift" && recipient?.phone === p));

  const op: OperationInput = {
    kind, title, total, payer,
    participants: people.filter((p) => contributors.includes(p)),
    split: method === "equal" ? { method: "equal" } : { method: "custom", amounts: Object.fromEntries(people.map((p) => [p, parseJod(custom[p] ?? "") ?? 0])) },
    ...(kind === "gift" && recipient ? { recipient } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  const problem = useMemo(() => validateOperation(op), [JSON.stringify(op)]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = problem ? null : operationShares(op);

  if (!g) return null;

  const problemText = (p: OperationProblem): string => {
    switch (p.kind) {
      case "noTitle": return t.opNeedTitle;
      case "badTotal": return t.opNeedTotal;
      case "noParticipants": return t.opNeedPeople;
      case "noRecipient": return t.opNeedRecipient;
      case "recipientContributes": return t.opRecipientNotPayer;
      case "recipientPays": return t.opRecipientPays;
      case "customMismatch": return p.diff > 0 ? t.opCustomLeft(jod(p.diff)) : t.opCustomOver(jod(-p.diff));
      case "badCustom": return t.badPrice;
    }
  };

  function go(next: Step) { setErr(""); setStep(next); }
  function pickKind(k: Kind) {
    if (k === "bill") { onBill(); return; }
    setKind(k);
    go("details");
  }
  function detailsNext() {
    if (!title.trim()) { setErr(t.opNeedTitle); return; }
    if (!(total > 0)) { setErr(t.opNeedTotal); return; }
    go("payer");
  }
  function payerNext() {
    if (kind === "gift") { go("recipient"); return; }
    go("people");
  }
  function recipientNext() {
    const r = recipient?.phone ? recipient : otherName.trim() ? { name: otherName.trim() } : null;
    if (!r) { setErr(t.opNeedRecipient); return; }
    if (r.phone && r.phone === payer) { setErr(t.opRecipientPays); return; }
    setRecipient(r);
    setPeople((ps) => ps.filter((p) => p !== r.phone));
    go("people");
  }
  function peopleNext() {
    if (!op.participants.length) { setErr(t.opNeedPeople); return; }
    go("split");
  }
  function splitNext() {
    if (problem) { setErr(problemText(problem)); return; }
    go("review");
  }
  async function save() {
    if (problem) { setErr(problemText(problem)); return; }
    const r = operationShares(op);
    setBusy(true); setErr("");
    try {
      const out = await backend.addTxns(operationTxns(op, me, myName), {
        restaurant: title.trim().slice(0, 60),
        payer,
        items: [{ id: "op", name: operationNote(op) || title.trim(), qty: 1, price: total }],
        eaters: { op: op.participants },
        extras: { tax: 0, service: 0, delivery: 0, discount: 0 },
        shares: r.shares,
        total,
        kind,
        ...(kind === "gift" && recipient ? { recipient: recipient.name.slice(0, 40) } : {}),
      }, opId.current);
      setMade(out);
      toast(t.opSaved);
      go("done");
    } catch {
      setErr(t.saveFailed);
    } finally { setBusy(false); }
  }

  const STEPS: Step[] = kind === "gift"
    ? ["details", "payer", "recipient", "people", "split", "review"]
    : ["details", "payer", "people", "split", "review"];
  const idx = STEPS.indexOf(step);
  const back = () => (idx > 0 ? go(STEPS[idx - 1]) : step === "details" ? go("type") : onClose());
  const progress = idx >= 0 && (
    <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= idx ? "on" : ""} />)}</div>
  );
  const kindLabel: Record<Kind, string> = { bill: t.opBill, gift: t.opGift, trip: t.opTrip, shared: t.opShared };
  const titles: Record<Step, string> = {
    type: t.addOperation, details: kindLabel[kind], payer: t.opWhoPaid, recipient: t.opForWhom,
    people: t.opWhoShares, split: t.opHowSplit, review: t.opReview, done: t.opDone,
  };
  const chip = (p: Phone, on: boolean, onClick: () => void, disabled = false) => (
    <button key={p} className="pchip" aria-pressed={on} disabled={disabled} onClick={onClick}>{shortName(p)}</button>
  );
  const foot = (label: string, onNext: () => void, disabled = false) => (
    <div className="sticky-foot">
      <button className="btn ghost" onClick={back}>{t.back}</button>
      <button className="btn big" disabled={disabled} onClick={onNext}>{label}</button>
    </div>
  );

  return (
    <Sheet title={titles[step]} onClose={onClose} full lead={<span className="g-emoji" aria-hidden="true">{step === "type" ? "➕" : KINDS.find((k) => k.id === kind)!.emoji}</span>}>
      {progress}

      {step === "type" && (
        <>
          <p className="muted" style={{ margin: "-8px 0 0" }}>{t.opTypeHint(g.name)}</p>
          <div className="list">
            {KINDS.map((k) => (
              <button key={k.id} className="row op-type" onClick={() => pickKind(k.id)}>
                <span className="g-emoji" aria-hidden="true">{k.emoji}</span>
                <span className="who"><b>{kindLabel[k.id]}</b><span>{t.opTypeDesc[k.id]}</span></span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "details" && (
        <>
          <div className="form">
            <div>
              <label className="l" htmlFor="op-title">{t.opName}</label>
              <input id="op-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.opNamePh[kind]} maxLength={60} autoFocus />
            </div>
            <div>
              <label className="l" htmlFor="op-amt">{t.opTotal} ({t.jod})</label>
              <input id="op-amt" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.000" />
            </div>
            <div>
              <label className="l" htmlFor="op-note">{t.opNote}</label>
              <input id="op-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.opNotePh} maxLength={80} />
            </div>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t.opInGroup(g.emoji, g.name)} · {t.opDate(today)}</p>
          {kind === "trip" && <button className="link-btn" onClick={onOuting}>{t.opManyPaid}</button>}
          {err && <p className="err">{err}</p>}
          {foot(t.next, detailsNext)}
        </>
      )}

      {step === "payer" && (
        <>
          <p className="muted" style={{ margin: "-8px 0 0" }}>{t.opPayerHint}</p>
          <div className="people">{members.map((p) => chip(p, payer === p, () => setPayer(p)))}</div>
          {err && <p className="err">{err}</p>}
          {foot(t.next, payerNext)}
        </>
      )}

      {step === "recipient" && (
        <>
          <p className="muted" style={{ margin: "-8px 0 0" }}>{t.opRecipientHint}</p>
          <div className="people">
            {members.filter((p) => p !== me).map((p) => chip(p, recipient?.phone === p, () => { setRecipient({ phone: p, name: shortName(p) }); setOtherName(""); }, p === payer))}
          </div>
          <div>
            <label className="l" htmlFor="op-rec">{t.opRecipientOther}</label>
            <input id="op-rec" value={otherName} maxLength={40} placeholder={t.opRecipientOtherPh}
              onChange={(e) => { setOtherName(e.target.value); if (e.target.value.trim()) setRecipient(null); }} />
          </div>
          {err && <p className="err">{err}</p>}
          {foot(t.next, recipientNext)}
        </>
      )}

      {step === "people" && (
        <>
          <p className="muted" style={{ margin: "-8px 0 0" }}>{kind === "gift" ? t.opPeopleGiftHint(recipient?.name ?? "") : t.opPeopleHint}</p>
          <div className="mini-actions">
            <button className="btn small soft" onClick={() => setPeople(contributors)}>{t.selectAll}</button>
            <button className="btn small ghost" onClick={() => setPeople([])} disabled={!people.length}>{t.clearSelection}</button>
          </div>
          <div className="people">{contributors.map((p) => chip(p, people.includes(p), () => setPeople((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]))))}</div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            {op.participants.length ? t.opSelectedCount(op.participants.length) : t.opNoneSelected}
            {!op.participants.includes(payer) && op.participants.length > 0 ? ` · ${t.opPayerNotSharing(shortName(payer))}` : ""}
          </p>
          {err && <p className="err">{err}</p>}
          {foot(t.next, peopleNext, !op.participants.length)}
        </>
      )}

      {step === "split" && (
        <>
          <div className="seg two" role="group" aria-label={t.opHowSplit}>
            <button type="button" aria-pressed={method === "equal"} onClick={() => setMethod("equal")}>{t.opEqual}<small>{t.opEqualHint}</small></button>
            <button type="button" aria-pressed={method === "custom"} onClick={() => {
              // Start from the equal split, so only the differences need typing
              if (method !== "custom") {
                const eq = operationShares({ ...op, split: { method: "equal" } }).shares;
                setCustom(Object.fromEntries(op.participants.map((p) => [p, filsToInput(eq[p] ?? 0)])));
              }
              setMethod("custom");
            }}>{t.opCustom}<small>{t.opCustomHint}</small></button>
          </div>
          <div className="ledger">
            {op.participants.map((p) => (
              <div key={p} className="share-row">
                <Avatar name={p === me ? myName : nameOf(p)} id={p} size={36} />
                <span className="who"><b>{nameOf(p)}</b></span>
                {method === "equal"
                  ? <span className="amt num">{result ? jod(result.shares[p] ?? 0) : "—"}</span>
                  : <input className="share-input" inputMode="decimal" dir="ltr" aria-label={t.shareOf(shortName(p))} value={custom[p] ?? ""} placeholder="0.000"
                      onChange={(e) => setCustom({ ...custom, [p]: e.target.value })} />}
              </div>
            ))}
          </div>
          <div className="sumline total"><span>{t.opTotal}</span><span className="num">{jod(total)}</span></div>
          {method === "custom" && problem?.kind === "customMismatch" && <p className="warn">{problemText(problem)}</p>}
          {method === "equal" && result && result.roundingFils > 0 && (
            <p className="note">{t.opRounding(result.roundingFils, result.roundedUp.map(shortName).join("، "))}</p>
          )}
          {err && <p className="err">{err}</p>}
          {foot(t.opToReview, splitNext, !!problem)}
        </>
      )}

      {step === "review" && result && (
        <>
          <div className="big-bal">
            <div className="lbl">{operationNote(op) || title}</div>
            <div className="amt num">{jod(total)}</div>
            <div className="lbl">{payer === me ? t.opPaidByMe : t.opPaidBy(shortName(payer))}</div>
          </div>
          <div className="ledger">
            {op.participants.map((p) => (
              <div key={p} className="share-row">
                <Avatar name={p === me ? myName : nameOf(p)} id={p} size={36} />
                <span className="who"><b>{nameOf(p)}</b><span>{p === payer ? t.opPayerShare : payer === me ? t.opOwesToMe : t.opOwesTo(shortName(payer))}</span></span>
                <span className="amt num">{jod(result.shares[p] ?? 0)}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ margin: 0 }}>{t.opDate(today)}</p>
          {kind === "gift" && recipient && <p className="muted" style={{ margin: 0 }}>{t.opGiftFor(recipient.name)}</p>}
          {note.trim() && <p className="muted" style={{ margin: 0 }}>{t.opNote}: {note.trim()}</p>}
          {result.roundingFils > 0 && <p className="note">{t.opRounding(result.roundingFils, result.roundedUp.map(shortName).join("، "))}</p>}
          <ImpactLine impact={myImpact(op, me)} />
          {err && <p className="err">{err}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={back}>{t.back}</button>
            <button className="btn big paid" disabled={busy} onClick={save}>{busy ? t.wait : t.opSave}</button>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <div className="big-bal">
            <div className="lbl">{t.opSaved}</div>
            <div className="amt num">{jod(total)}</div>
          </div>
          {payer === me && made.length > 0 && (
            <>
              <p style={{ margin: 0 }}>{t.opTellThem}</p>
              <div className="ledger">
                {made.map((tx) => {
                  const reg = registered(tx.debtor);
                  const msg = waTxnMessage(tx, me, shortName(tx.debtor), balanceAfter([...txns.filter((x) => x.parties.includes(tx.debtor) && x.id !== tx.id), tx], me));
                  const sms = getNotifyVia() === "sms";
                  return (
                    <div key={tx.id} className="share-row">
                      <span className="who"><b>{nameOf(tx.debtor)}</b><span>{reg ? t.hasApp : t.noApp}</span></span>
                      <span className="amt num">{jod(tx.amount)}</span>
                      <span className="send-pair">
                        <a className={`btn small ${reg || sms ? "ghost" : "wa"}`} href={waLink(tx.debtor, msg)} target="_blank" rel="noopener" aria-label={t.waTo(nameOf(tx.debtor))}><WhatsApp />{t.whatsapp}</a>
                        {!reg && <a className={`btn small ${sms ? "" : "ghost"}`} href={smsLink(tx.debtor, msg)} aria-label={t.smsTo(nameOf(tx.debtor))}>💬 {t.viaSms}</a>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div className="sticky-foot"><button className="btn big" onClick={onDone}>{t.seeAccounts}</button></div>
        </>
      )}
    </Sheet>
  );
}

function ImpactLine({ impact }: { impact: Fils }) {
  const t = useT();
  if (impact === 0) return <p className="note">{t.opImpactNone}</p>;
  return (
    <div className={`my-outing ${impact > 0 ? "pos" : "neg"}`}>
      <div className="mo-net">{impact > 0 ? t.opImpactGet(jod(impact)) : t.opImpactOwe(jod(-impact))}</div>
    </div>
  );
}
