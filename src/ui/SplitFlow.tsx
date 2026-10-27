import { useMemo, useState } from "react";
import type { NewTxn, Txn } from "../core/ledger";
import { waTxnMessage } from "../core/messages";
import { filsToInput, jod, parseJod, type Fils } from "../core/money";
import { normalizePhone, smsLink, waLink, type Phone } from "../core/phone";
import { getNotifyVia } from "./notifyPref";
import { normalizeReceipt } from "../core/receipt";
import { billTotal, extraKindOf, splitBill, validateSplit, type BillExtras, type BillItem } from "../core/split";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";
import { Avatar } from "./Avatar";
import { Camera, ImageIc, Pen, WhatsApp } from "./icons";
import { balanceAfter } from "./model";
import { newId, shrinkImage } from "./util";
import { matchOrders } from "../core/match";
import { useDialect } from "./i18n";

type Step = "source" | "reading" | "items" | "people" | "assign" | "summary" | "done";
interface EditItem { id: string; name: string; qty: number; price: string }
type ExtrasStr = Record<keyof BillExtras, string>;

const STEPS: Step[] = ["items", "people", "assign", "summary"];

/** onDone runs after a bill is saved and the person taps OK; iPaid = I was the payer. */
export function SplitFlow({ onClose, onDone, groupId, orderId }: {
  onClose: () => void; onDone?: (iPaid: boolean) => void; groupId?: string; orderId?: string;
}) {
  const { backend, me, myName, friends, toast, registered, txns, groups, orders } = useApp();
  const order = orders.find((o) => o.id === orderId);
  const group = groups.find((g) => g.id === (groupId ?? order?.groupId));
  // People who wrote something in the order
  const orderPeople = order ? order.parties.filter((p) => order.lines[p]?.trim()) : [];
  const { t, dialect } = useDialect();
  const EXTRA_LABELS: Record<keyof BillExtras, string> = { tax: t.tax, service: t.service, delivery: t.delivery, discount: t.discount };
  const [step, setStep] = useState<Step>("source");
  const [restaurant, setRestaurant] = useState("");
  const [items, setItems] = useState<EditItem[]>([]);
  const [extras, setExtras] = useState<ExtrasStr>({ tax: "", service: "", delivery: "", discount: "" });
  const [printedTotal, setPrintedTotal] = useState<Fils>(0);
  const [readNote, setReadNote] = useState("");
  // In a group, everyone starts as present; untick whoever wasn't there
  const [present, setPresent] = useState<Phone[]>(() =>
    order ? [me, ...orderPeople.filter((p) => p !== me)]
      : group ? [me, ...group.members.filter((p) => p !== me)] : [me]);
  const [extraPeople, setExtraPeople] = useState<{ phone: Phone; name: string }[]>([]);
  const [eaters, setEaters] = useState<Record<string, Phone[]>>({});
  const [payer, setPayer] = useState<Phone>(me);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<Txn[]>([]);
  const [showMissing, setShowMissing] = useState(false);

  const nameOf = (p: Phone) => p === me ? t.meNamed(myName) : friends.find((f) => f.phone === p)?.name ?? extraPeople.find((x) => x.phone === p)?.name ?? p;
  const shortName = (p: Phone) => p === me ? t.me : nameOf(p);

  // ---- Items in fils ----
  const billItems: BillItem[] = useMemo(() => items.map((i) => ({ id: i.id, name: i.name.trim() || t.theItem, qty: i.qty, price: parseJod(i.price) ?? -1 })), [items]);
  const billExtras: BillExtras = useMemo(() => ({
    tax: parseJod(extras.tax) ?? 0, service: parseJod(extras.service) ?? 0,
    delivery: parseJod(extras.delivery) ?? 0, discount: parseJod(extras.discount) ?? 0,
  }), [extras]);
  const validItems = billItems.filter((i) => i.price > 0);
  const subtotal = validItems.reduce((s, i) => s + i.price, 0);
  const total = billTotal(validItems, billExtras);

  // ---- 1. Source: photo or manual ----
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setStep("reading"); setErr("");
    try {
      // With an order, tell the reader who wanted what (short ids instead of phone numbers)
      const ids = orderPeople.map((_, i) => `p${i + 1}`);
      const sent = order ? orderPeople.map((p, i) => ({ id: ids[i], text: order.lines[p] })) : [];
      const raw = await backend.readReceipt(await shrinkImage(file), sent.length ? sent : undefined);
      if (!raw.readable) throw new Error("unreadable");
      const r = normalizeReceipt(raw, newId, ids);
      if (!r.items.length) throw new Error("empty");
      let matched = false;
      if (order) {
        const byId = Object.fromEntries(ids.map((id, i) => [id, orderPeople[i]]));
        const guess = matchOrders(r.items, Object.fromEntries(orderPeople.map((p) => [p, order.lines[p]])));
        const pre: Record<string, Phone[]> = {};
        for (const it of r.items) {
          const fromReader = (r.who[it.id] ?? []).map((id) => byId[id]).filter(Boolean);
          pre[it.id] = fromReader.length ? fromReader : guess[it.id] ?? [];
          if (pre[it.id].length) matched = true;
        }
        setEaters(pre);
      }
      setRestaurant(r.restaurant);
      setItems(r.items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: filsToInput(i.price) })));
      const ex = (f: Fils) => (f ? filsToInput(f) : "");
      setExtras({ tax: ex(r.extras.tax), service: ex(r.extras.service), delivery: ex(r.extras.delivery), discount: ex(r.extras.discount) });
      setPrintedTotal(r.printedTotal);
      setReadNote(matched ? t.matchedNote : backend.mode === "demo" ? t.demoReadNote : t.readNote);
      setStep("items");
    } catch {
      startManual(t.readFailed);
    }
  }
  function startManual(note = "") {
    setReadNote(note);
    setItems((it) => (it.length ? it : [{ id: newId(), name: "", qty: 1, price: "" }]));
    setStep("items");
  }

  // ---- 2. Review items ----
  const updItem = (id: string, patch: Partial<EditItem>) => setItems((it) => it.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const addItem = () => setItems((it) => [...it, { id: newId(), name: "", qty: 1, price: "" }]);
  const pct = (k: "tax" | "service", p: number) => {
    const base = k === "tax" ? subtotal + (billExtras.service) : subtotal;
    setExtras((e) => ({ ...e, [k]: filsToInput(Math.round((base * p) / 100)) }));
  };
  function itemsNext() {
    // "ضريبة" or "خدمة" typed as an item: it belongs to everyone, so move it to the extras
    const asExtra = items.filter((i) => extraKindOf(i.name) && (parseJod(i.price) ?? 0) > 0);
    if (asExtra.length && items.length > asExtra.length) {
      const ex = { ...extras };
      for (const i of asExtra) {
        const k = extraKindOf(i.name)!;
        ex[k] = filsToInput((parseJod(ex[k]) ?? 0) + (parseJod(i.price) ?? 0));
      }
      setExtras(ex);
      setItems((it) => it.filter((i) => !asExtra.includes(i)));
      setErr("");
      toast(t.movedToExtras);
      return; // let them see it, then press next again
    }
    const bad = items.filter((i) => (i.name.trim() || i.price.trim()) && !((parseJod(i.price) ?? 0) > 0));
    if (!validItems.length) { setErr(t.needOneItem); return; }
    if (bad.length) { setErr(t.badPrice); return; }
    if (total < 0) { setErr(t.discountTooBig); return; }
    setItems((it) => it.filter((i) => (parseJod(i.price) ?? 0) > 0));
    setErr(""); setStep("people");
  }

  // ---- 3. Who was there ----
  const togglePresent = (p: Phone) => {
    if (p === me && payer === me && present.length === 1) return;
    setPresent((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));
  };
  const [np, setNp] = useState({ name: "", phone: "", open: false, err: "" });
  async function addNewPerson(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePhone(np.phone);
    if (!np.name.trim() || !p) { setNp({ ...np, err: t.nameAndPhone }); return; }
    if (p === me) { setNp({ ...np, err: t.thatsYou }); return; }
    try { await backend.saveContact({ phone: p, name: np.name.trim() }); } catch { /* not fatal; continue */ }
    setExtraPeople((x) => [...x, { phone: p, name: np.name.trim() }]);
    setPresent((s) => (s.includes(p) ? s : [...s, p]));
    setNp({ name: "", phone: "", open: false, err: "" });
  }
  function peopleNext() {
    if (present.length < 2) { setErr(t.pickOneMore); return; }
    setErr("");
    setEaters((e) => Object.fromEntries(items.map((i) => [i.id, (e[i.id] ?? []).filter((p) => present.includes(p))])));
    if (!present.includes(payer)) setPayer(me);
    setStep("assign");
  }

  // ---- 4. Who had what ----
  const toggleEater = (itemId: string, p: Phone) =>
    setEaters((e) => {
      const cur = e[itemId] ?? [];
      return { ...e, [itemId]: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] };
    });
  const setAll = (itemId: string) =>
    setEaters((e) => ({ ...e, [itemId]: (e[itemId]?.length === present.length ? [] : [...present]) }));
  const missing = validItems.filter((i) => !(eaters[i.id]?.length)).map((i) => i.id);
  const preview = useMemo(() => {
    if (missing.length) return null;
    try { return splitBill({ items: validItems, eaters, extras: billExtras, payer }); } catch { return null; }
  }, [validItems, eaters, billExtras, payer, missing.length]);
  function assignNext() {
    if (missing.length) { setShowMissing(true); return; }
    setErr(""); setStep("summary");
  }

  // ---- 5. Summary and confirm ----
  async function confirm() {
    const input = { items: validItems, eaters, extras: billExtras, payer };
    if (validateSplit(input)) return;
    const r = splitBill(input);
    const label = t.billLabel(restaurant.trim());
    const news: NewTxn[] = Object.entries(r.shares)
      .filter(([p, v]) => p !== payer && v > 0)
      .map(([p, v]) => ({ creditor: payer, debtor: p, amount: v, kind: "split", note: label, createdBy: me, createdByName: myName }));
    setBusy(true);
    try {
      const out = await backend.addTxns(news, {
        restaurant: restaurant.trim(), payer, items: validItems, eaters, extras: billExtras, shares: r.shares, total: r.total,
      });
      setMade(out);
      // The bill came in, so the order is done
      if (order) backend.closeOrder(order.id).catch(() => { /* stays open; harmless */ });
      setStep("done");
      toast(t.billSaved);
    } catch {
      setErr(t.saveFailed);
    } finally { setBusy(false); }
  }

  const stepIdx = STEPS.indexOf(step);
  const back = () => setStep(STEPS[Math.max(0, stepIdx - 1)]);
  const progress = stepIdx >= 0 && (
    <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= stepIdx ? "on" : ""} />)}</div>
  );
  const titles: Record<Step, string> = {
    source: group ? t.splitIn(group.name) : t.split, reading: t.reading, items: t.items, people: t.whoWasThere,
    assign: t.whoHadWhat, summary: t.summary, done: t.done,
  };
  const pool = group ? group.members.filter((p) => p !== me) : friends.map((f) => f.phone);
  const candidates: Phone[] = [me, ...pool, ...extraPeople.map((x) => x.phone).filter((p) => !pool.includes(p))];

  return (
    <Sheet title={titles[step]} onClose={onClose} full>
      {progress}

      {step === "source" && (
        <>
          <div className="pick">
            <label className="main">
              <Camera />{t.takePhoto}
              <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            <label>
              <ImageIc />{t.uploadPhoto}
              <input className="sr-only" type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            <button onClick={() => startManual()}><Pen />{t.typeIt}</button>
          </div>
          <p className="note">{t.sourceNote}</p>
        </>
      )}

      {step === "reading" && (
        <div className="center"><div className="spinner" /><p>{t.reading}<br /><span className="muted">{t.readingHint}</span></p></div>
      )}

      {step === "items" && (
        <>
          {readNote && <div className="banner">{readNote}</div>}
          <div>
            <label className="l" htmlFor="rest">{t.restaurant}</label>
            <input id="rest" value={restaurant} onChange={(e) => setRestaurant(e.target.value)} placeholder={t.restaurantPh} maxLength={60} />
          </div>
          <div className="items">
            {items.map((i, idx) => (
              <div className="item-edit" key={i.id}>
                <input value={i.name} autoFocus={idx > 0 && idx === items.length - 1 && !i.name && !i.price} onChange={(e) => updItem(i.id, { name: e.target.value })} placeholder={t.itemPh(idx + 1)} aria-label={t.itemName} />
                <input value={i.price} dir="ltr" inputMode="decimal" placeholder="0.000" aria-label={t.priceOf(i.name || t.theItem)}
                  onChange={(e) => updItem(i.id, { price: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} />
                <button className="del" onClick={() => setItems((it) => it.filter((x) => x.id !== i.id))} aria-label={t.removeItem(i.name || t.theItem)}>×</button>
              </div>
            ))}
            <button className="btn ghost" onClick={addItem}>{t.addItem}</button>
          </div>
          <div className="extras">
            {(Object.keys(EXTRA_LABELS) as (keyof BillExtras)[]).map((k) => (
              <div key={k}>
                <label className="l" htmlFor={`ex-${k}`}>{EXTRA_LABELS[k]}</label>
                <input id={`ex-${k}`} dir="ltr" inputMode="decimal" placeholder="0.000" value={extras[k]} onChange={(e) => setExtras({ ...extras, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="actions">
            <button className="btn soft small" onClick={() => pct("service", 10)}>{t.service10}</button>
            <button className="btn soft small" onClick={() => pct("tax", 16)}>{t.tax16}</button>
          </div>
          <div>
            <div className="sumline"><span>{t.itemsTotal}</span><span className="num">{jod(subtotal)}</span></div>
            <div className="sumline total"><span>{t.total}</span><span className="num">{jod(total)}</span></div>
            {printedTotal > 0 && Math.abs(printedTotal - total) > 5 && (
              <div className="warn">{t.totalMismatch(jod(printedTotal), jod(total))}</div>
            )}
          </div>
          {err && <p className="err">{err}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={() => setStep("source")}>{t.back}</button>
            <button className="btn big" onClick={itemsNext}>{t.nextPeople}</button>
          </div>
        </>
      )}

      {step === "people" && (
        <>
          <p className="muted" style={{ margin: 0 }}>{group ? t.groupPreselected : t.tapWhoWasThere}</p>
          <div className="people">
            {candidates.map((p) => (
              <button key={p} className="pchip" aria-pressed={present.includes(p)} onClick={() => togglePresent(p)}>{nameOf(p)}</button>
            ))}
            <button className="pchip add" onClick={() => setNp({ ...np, open: true })}>{t.someoneNew}</button>
          </div>
          {np.open && (
            <form className="confirm calm" onSubmit={addNewPerson}>
              <div className="form">
                <input autoFocus placeholder={t.name} value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} aria-label={t.name} />
                <input placeholder="079 123 4567" dir="ltr" inputMode="tel" value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} aria-label={t.phone} />
              </div>
              {np.err && <p className="err" style={{ margin: 0 }}>{np.err}</p>}
              <div className="actions"><button className="btn">{t.addThem}</button><button type="button" className="btn ghost" onClick={() => setNp({ name: "", phone: "", open: false, err: "" })}>{t.no}</button></div>
            </form>
          )}
          {err && <p className="err">{err}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={back}>{t.back}</button>
            <button className="btn big" onClick={peopleNext}>{t.nextAssign}</button>
          </div>
        </>
      )}

      {step === "assign" && (
        <>
          <p className="muted" style={{ margin: 0 }}>{t.tapWhoAte}</p>
          {validItems.map((i) => {
            const who = eaters[i.id] ?? [];
            return (
              <div key={i.id} className={`assign${showMissing && !who.length ? " missing" : ""}`}>
                <div className="assign-head">
                  <b>{i.name}{i.qty > 1 ? ` ×${i.qty.toLocaleString("ar-JO")}` : ""}</b>
                  <span className="num">{jod(i.price)}</span>
                </div>
                <div className="people">
                  {present.map((p) => (
                    <button key={p} className="pchip" aria-pressed={who.includes(p)} onClick={() => toggleEater(i.id, p)}>{shortName(p)}</button>
                  ))}
                  <button className="pchip add" onClick={() => setAll(i.id)}>{who.length === present.length ? t.nobody : t.everyone}</button>
                </div>
                {who.length > 1 && <div className="per">{t.perPerson(who.length, jod(Math.round(i.price / who.length)))}</div>}
              </div>
            );
          })}
          {showMissing && missing.length > 0 && <p className="err">{missing.length === 1 ? t.oneMissing : t.manyMissing(missing.length)}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={back}>{t.back}</button>
            <button className="btn big" onClick={assignNext}>{missing.length ? t.left(missing.length) : t.nextSummary}</button>
          </div>
        </>
      )}

      {step === "summary" && preview && (
        <>
          <div>
            <p className="muted" style={{ margin: "0 0 6px" }}>{t.whoPaid}</p>
            <div className="people">
              {present.map((p) => (
                <button key={p} className="pchip" aria-pressed={payer === p} onClick={() => setPayer(p)}>{shortName(p)}</button>
              ))}
            </div>
          </div>
          <div className="ledger">
            {present.map((p) => {
              const v = preview.shares[p] ?? 0;
              return (
                <div key={p} className="share-row">
                  <Avatar name={p === me ? myName : nameOf(p)} id={p} size={40} />
                  <span className="who"><b>{nameOf(p)}</b><span>{p === payer ? t.paidTheBill : t.itemsPlusShare(jod(preview.itemsOf[p] ?? 0))}</span></span>
                  <span className={`amt num ${p === payer ? "zero" : ""}`}>{jod(v)}</span>
                </div>
              );
            })}
          </div>
          <div>
            <div className="sumline"><span>{t.itemsTotal}</span><span className="num">{jod(preview.subtotal)}</span></div>
            {(Object.keys(EXTRA_LABELS) as (keyof BillExtras)[]).filter((k) => billExtras[k]).map((k) => (
              <div key={k} className="sumline"><span>{EXTRA_LABELS[k]}</span><span className="num">{k === "discount" ? "−" : ""}{jod(billExtras[k])}</span></div>
            ))}
            <div className="sumline total"><span>{t.total}</span><span className="num">{jod(preview.total)}</span></div>
            <p className="note">{t.fairNote}</p>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={back}>{t.back}</button>
            <button className="btn big paid" disabled={busy} onClick={confirm}>{busy ? t.wait : t.confirmSplit}</button>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <div className="big-bal">
            <div className="lbl">{t.paidBy(restaurant || t.theBill, shortName(payer))}</div>
            <div className="amt num">{jod(total)}</div>
          </div>
          <p style={{ margin: 0 }}>{t.splitDoneNote}</p>
          {payer === me && (
            <div className="ledger">
              {made.map((tx) => {
                const reg = registered(tx.debtor);
                const msg = waTxnMessage(tx, me, nameOf(tx.debtor), balanceAfter([...txns.filter((x) => x.parties.includes(tx.debtor) && x.id !== tx.id), tx], me), dialect);
                return (
                  <div key={tx.id} className="share-row">
                    <span className="who"><b>{nameOf(tx.debtor)}</b><span>{reg ? t.hasApp : t.noApp}</span></span>
                    <span className="amt num">{jod(tx.amount)}</span>
                    <span className="send-pair">
                      <a className={`btn small ${reg || getNotifyVia() === "sms" ? "ghost" : "wa"}`} href={waLink(tx.debtor, msg)} target="_blank" rel="noopener" aria-label={t.waTo(nameOf(tx.debtor))}><WhatsApp />{t.whatsapp}</a>
                      {!reg && <a className={`btn small ${getNotifyVia() === "sms" ? "" : "ghost"}`} href={smsLink(tx.debtor, msg)} aria-label={t.smsTo(nameOf(tx.debtor))}>💬 {t.viaSms}</a>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="sticky-foot"><button className="btn big" onClick={() => (onDone ? onDone(payer === me) : onClose())}>{t.seeAccounts}</button></div>
        </>
      )}
    </Sheet>
  );
}
