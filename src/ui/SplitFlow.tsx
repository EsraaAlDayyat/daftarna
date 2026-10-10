import { useMemo, useState } from "react";
import type { NewTxn, Txn } from "../core/ledger";
import { waTxnMessage } from "../core/messages";
import { filsToInput, jod, parseJod, type Fils } from "../core/money";
import { normalizePhone, waLink, type Phone } from "../core/phone";
import { normalizeReceipt } from "../core/receipt";
import { billTotal, splitBill, validateSplit, type BillExtras, type BillItem } from "../core/split";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";
import { Camera, ImageIc, Pen, WhatsApp } from "./icons";
import { balanceAfter } from "./model";
import { newId, shrinkImage } from "./util";

type Step = "source" | "reading" | "items" | "people" | "assign" | "summary" | "done";
interface EditItem { id: string; name: string; qty: number; price: string }
type ExtrasStr = Record<keyof BillExtras, string>;

const STEPS: Step[] = ["items", "people", "assign", "summary"];
const EXTRA_LABELS: Record<keyof BillExtras, string> = { tax: "ضريبة المبيعات", service: "خدمة", delivery: "توصيل", discount: "خصم" };

export function SplitFlow({ onClose }: { onClose: () => void }) {
  const { backend, me, myName, friends, toast, registered, txns } = useApp();
  const [step, setStep] = useState<Step>("source");
  const [restaurant, setRestaurant] = useState("");
  const [items, setItems] = useState<EditItem[]>([]);
  const [extras, setExtras] = useState<ExtrasStr>({ tax: "", service: "", delivery: "", discount: "" });
  const [printedTotal, setPrintedTotal] = useState<Fils>(0);
  const [readNote, setReadNote] = useState("");
  const [present, setPresent] = useState<Phone[]>([me]);
  const [extraPeople, setExtraPeople] = useState<{ phone: Phone; name: string }[]>([]);
  const [eaters, setEaters] = useState<Record<string, Phone[]>>({});
  const [payer, setPayer] = useState<Phone>(me);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState<Txn[]>([]);
  const [showMissing, setShowMissing] = useState(false);

  const nameOf = (p: Phone) => p === me ? `أنا (${myName})` : friends.find((f) => f.phone === p)?.name ?? extraPeople.find((x) => x.phone === p)?.name ?? p;
  const shortName = (p: Phone) => p === me ? "أنا" : nameOf(p);

  // ---- Items in fils ----
  const billItems: BillItem[] = useMemo(() => items.map((i) => ({ id: i.id, name: i.name.trim() || "صنف", qty: i.qty, price: parseJod(i.price) ?? -1 })), [items]);
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
      const raw = await backend.readReceipt(await shrinkImage(file));
      if (!raw.readable) throw new Error("unreadable");
      const r = normalizeReceipt(raw, newId);
      if (!r.items.length) throw new Error("empty");
      setRestaurant(r.restaurant);
      setItems(r.items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: filsToInput(i.price) })));
      const ex = (f: Fils) => (f ? filsToInput(f) : "");
      setExtras({ tax: ex(r.extras.tax), service: ex(r.extras.service), delivery: ex(r.extras.delivery), discount: ex(r.extras.discount) });
      setPrintedTotal(r.printedTotal);
      setReadNote(backend.mode === "demo" ? "النسخة التجريبية ما بتقرأ صور حقيقية، فحطينا فاتورة مثال. راجع الأصناف وصلّح أي إشي." : "راجع الأصناف والأسعار، وصلّح أي إشي انقرأ غلط.");
      setStep("items");
    } catch {
      startManual("ما قدرنا نقرأ الفاتورة. دخّلها يدوي: صنف وسعر، صنف وسعر.");
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
    const bad = items.filter((i) => (i.name.trim() || i.price.trim()) && !((parseJod(i.price) ?? 0) > 0));
    if (!validItems.length) { setErr("ضيف صنف واحد على الأقل بسعره"); return; }
    if (bad.length) { setErr("في صنف سعره مش مزبوط"); return; }
    if (total < 0) { setErr("الخصم أكبر من الفاتورة"); return; }
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
    if (!np.name.trim() || !p) { setNp({ ...np, err: "اكتب الاسم ورقم صحيح" }); return; }
    if (p === me) { setNp({ ...np, err: "هاد رقمك 🙂" }); return; }
    try { await backend.saveContact({ phone: p, name: np.name.trim() }); } catch { /* not fatal; continue */ }
    setExtraPeople((x) => [...x, { phone: p, name: np.name.trim() }]);
    setPresent((s) => (s.includes(p) ? s : [...s, p]));
    setNp({ name: "", phone: "", open: false, err: "" });
  }
  function peopleNext() {
    if (present.length < 2) { setErr("اختار شخص واحد على الأقل غيرك"); return; }
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
    const label = restaurant.trim() ? `فاتورة ${restaurant.trim()}` : "فاتورة";
    const news: NewTxn[] = Object.entries(r.shares)
      .filter(([p, v]) => p !== payer && v > 0)
      .map(([p, v]) => ({ creditor: payer, debtor: p, amount: v, kind: "split", note: label, createdBy: me, createdByName: myName }));
    setBusy(true);
    try {
      const out = await backend.addTxns(news, {
        restaurant: restaurant.trim(), payer, items: validItems, eaters, extras: billExtras, shares: r.shares, total: r.total,
      });
      setMade(out);
      setStep("done");
      toast("انسجّلت الفاتورة ✓");
    } catch {
      setErr("ما انسجّلت، جرّب كمان مرة.");
    } finally { setBusy(false); }
  }

  const stepIdx = STEPS.indexOf(step);
  const back = () => setStep(STEPS[Math.max(0, stepIdx - 1)]);
  const progress = stepIdx >= 0 && (
    <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= stepIdx ? "on" : ""} />)}</div>
  );
  const titles: Record<Step, string> = {
    source: "قسّم فاتورة", reading: "عم نقرأ الفاتورة…", items: "الأصناف", people: "مين كان موجود؟",
    assign: "مين أكل شو؟", summary: "الملخص", done: "انسجّلت ✓",
  };
  const candidates: Phone[] = [me, ...friends.map((f) => f.phone), ...extraPeople.map((x) => x.phone).filter((p) => !friends.some((f) => f.phone === p))];

  return (
    <Sheet title={titles[step]} onClose={onClose} full>
      {progress}

      {step === "source" && (
        <>
          <div className="pick">
            <label className="main">
              <Camera />صوّر الفاتورة
              <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            <label>
              <ImageIc />ارفع صورة
              <input className="sr-only" type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            <button onClick={() => startManual()}><Pen />دخّلها يدوي</button>
          </div>
          <p className="note">التطبيق بيقرأ الأصناف والأسعار والضريبة والخدمة، وإنت بتراجعها قبل التقسيم.</p>
        </>
      )}

      {step === "reading" && (
        <div className="center"><div className="spinner" /><p>عم نقرأ الأصناف والأسعار…<br /><span className="muted">بتاخد كم ثانية</span></p></div>
      )}

      {step === "items" && (
        <>
          {readNote && <div className="banner">{readNote}</div>}
          <div>
            <label className="l" htmlFor="rest">المطعم</label>
            <input id="rest" value={restaurant} onChange={(e) => setRestaurant(e.target.value)} placeholder="مثلاً: مطعم الريم" maxLength={60} />
          </div>
          <div className="items">
            {items.map((i, idx) => (
              <div className="item-edit" key={i.id}>
                <input value={i.name} autoFocus={idx > 0 && idx === items.length - 1 && !i.name && !i.price} onChange={(e) => updItem(i.id, { name: e.target.value })} placeholder={`صنف ${idx + 1}`} aria-label="اسم الصنف" />
                <input value={i.price} dir="ltr" inputMode="decimal" placeholder="0.000" aria-label={`سعر ${i.name || "الصنف"}`}
                  onChange={(e) => updItem(i.id, { price: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} />
                <button className="del" onClick={() => setItems((it) => it.filter((x) => x.id !== i.id))} aria-label={`احذف ${i.name || "الصنف"}`}>×</button>
              </div>
            ))}
            <button className="btn ghost" onClick={addItem}>+ صنف</button>
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
            <button className="btn soft small" onClick={() => pct("service", 10)}>خدمة 10%</button>
            <button className="btn soft small" onClick={() => pct("tax", 16)}>ضريبة 16%</button>
          </div>
          <div>
            <div className="sumline"><span>مجموع الأصناف</span><span className="num">{jod(subtotal)}</span></div>
            <div className="sumline total"><span>المجموع</span><span className="num">{jod(total)}</span></div>
            {printedTotal > 0 && Math.abs(printedTotal - total) > 5 && (
              <div className="warn">المجموع المكتوب بالفاتورة {jod(printedTotal)}، والحساب هون {jod(total)}. راجع الأصناف أو الإضافات.</div>
            )}
          </div>
          {err && <p className="err">{err}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={() => setStep("source")}>رجوع</button>
            <button className="btn big" onClick={itemsNext}>التالي: مين كان موجود</button>
          </div>
        </>
      )}

      {step === "people" && (
        <>
          <p className="muted" style={{ margin: 0 }}>اضغط على أسماء اللي كانوا معك.</p>
          <div className="people">
            {candidates.map((p) => (
              <button key={p} className="pchip" aria-pressed={present.includes(p)} onClick={() => togglePresent(p)}>{nameOf(p)}</button>
            ))}
            <button className="pchip add" onClick={() => setNp({ ...np, open: true })}>+ حد جديد</button>
          </div>
          {np.open && (
            <form className="confirm calm" onSubmit={addNewPerson}>
              <div className="form">
                <input autoFocus placeholder="الاسم" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} aria-label="الاسم" />
                <input placeholder="079 123 4567" dir="ltr" inputMode="tel" value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} aria-label="رقم التلفون" />
              </div>
              {np.err && <p className="err" style={{ margin: 0 }}>{np.err}</p>}
              <div className="actions"><button className="btn">ضيفه</button><button type="button" className="btn ghost" onClick={() => setNp({ name: "", phone: "", open: false, err: "" })}>لا</button></div>
            </form>
          )}
          {err && <p className="err">{err}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={back}>رجوع</button>
            <button className="btn big" onClick={peopleNext}>التالي: مين أكل شو</button>
          </div>
        </>
      )}

      {step === "assign" && (
        <>
          <p className="muted" style={{ margin: 0 }}>لكل صنف، اضغط على اللي أكلوا منه. الصنف المشترك بيتقسم بالتساوي.</p>
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
                  <button className="pchip add" onClick={() => setAll(i.id)}>{who.length === present.length ? "ولا حدا" : "الكل"}</button>
                </div>
                {who.length > 1 && <div className="per">{who.length.toLocaleString("ar-JO")} أشخاص، كل واحد {jod(Math.round(i.price / who.length))}</div>}
              </div>
            );
          })}
          {showMissing && missing.length > 0 && <p className="err">{missing.length === 1 ? "في صنف ما حدا اختاره" : `في ${missing.length.toLocaleString("ar-JO")} أصناف ما حدا اختارها`}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={back}>رجوع</button>
            <button className="btn big" onClick={assignNext}>{missing.length ? `ضايل ${missing.length.toLocaleString("ar-JO")}` : "التالي: الملخص"}</button>
          </div>
        </>
      )}

      {step === "summary" && preview && (
        <>
          <div>
            <p className="muted" style={{ margin: "0 0 6px" }}>مين دفع؟</p>
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
                  <span className="av">{shortName(p).trim()[0]}</span>
                  <span className="who"><b>{nameOf(p)}</b><span>{p === payer ? "دفع الفاتورة" : `أصنافه ${jod(preview.itemsOf[p] ?? 0)} + حصته من الإضافات`}</span></span>
                  <span className={`amt num ${p === payer ? "zero" : ""}`}>{jod(v)}</span>
                </div>
              );
            })}
          </div>
          <div>
            <div className="sumline"><span>الأصناف</span><span className="num">{jod(preview.subtotal)}</span></div>
            {(Object.keys(EXTRA_LABELS) as (keyof BillExtras)[]).filter((k) => billExtras[k]).map((k) => (
              <div key={k} className="sumline"><span>{EXTRA_LABELS[k]}</span><span className="num">{k === "discount" ? "−" : ""}{jod(billExtras[k])}</span></div>
            ))}
            <div className="sumline total"><span>المجموع</span><span className="num">{jod(preview.total)}</span></div>
            <p className="note">الضريبة والخدمة متوزعة على كل واحد بنسبة طلبه. ومجموع الحصص بيساوي الفاتورة بالضبط.</p>
          </div>
          {err && <p className="err">{err}</p>}
          <div className="sticky-foot">
            <button className="btn ghost" onClick={back}>رجوع</button>
            <button className="btn big paid" disabled={busy} onClick={confirm}>{busy ? "لحظة…" : "أكّد وسجّل بالدفاتر"}</button>
          </div>
        </>
      )}

      {step === "done" && (
        <>
          <div className="big-bal">
            <div className="lbl">{restaurant || "الفاتورة"} · دفع {shortName(payer)}</div>
            <div className="amt num">{jod(total)}</div>
          </div>
          <p style={{ margin: 0 }}>انضافت حصة كل واحد لدفتره، واللي عندهم التطبيق وصلهم إشعار.</p>
          {payer === me && (
            <div className="ledger">
              {made.map((t) => {
                const reg = registered(t.debtor);
                const msg = waTxnMessage(t, me, nameOf(t.debtor), balanceAfter([...txns.filter((x) => x.parties.includes(t.debtor) && x.id !== t.id), t], me));
                return (
                  <div key={t.id} className="share-row">
                    <span className="who"><b>{nameOf(t.debtor)}</b><span>{reg ? "عنده التطبيق ✓" : "ما عنده التطبيق"}</span></span>
                    <span className="amt num">{jod(t.amount)}</span>
                    <a className={`btn small ${reg ? "ghost" : "wa"}`} href={waLink(t.debtor, msg)} target="_blank" rel="noopener" aria-label={`ابعت واتساب لـ${nameOf(t.debtor)}`}><WhatsApp />واتساب</a>
                  </div>
                );
              })}
            </div>
          )}
          <div className="sticky-foot"><button className="btn big" onClick={onClose}>تمام</button></div>
        </>
      )}
    </Sheet>
  );
}
