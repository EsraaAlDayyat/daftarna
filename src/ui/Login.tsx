import { useRef, useState } from "react";
import { displayPhone, normalizePhone, type Phone } from "../core/phone";
import type { Backend, PhoneSignIn } from "../data/backend";
import { DEMO_CODE } from "../data/demoBackend";

export function Login({ backend, user, invited }: { backend: Backend; user: { phone: Phone; name: string | null } | null; invited?: boolean }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<PhoneSignIn | null>(null);
  const captcha = useRef<HTMLDivElement>(null);
  const demo = backend.mode === "demo";

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePhone(phone);
    if (!p) { setErr("الرقم مش مزبوط. اكتبه زي هيك: 079 123 4567"); return; }
    setErr(""); setBusy(true);
    try {
      pending.current = await backend.startPhoneSignIn(p, captcha.current!);
      setPhone(p); setStep("code");
    } catch {
      setErr("ما قدرنا نبعت الكود. تأكد من الرقم وجرّب كمان مرة.");
    } finally { setBusy(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await pending.current!.confirm(code); }
    catch { setErr("الكود غلط. جرّب كمان مرة."); }
    finally { setBusy(false); }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await backend.saveName(name.trim()); }
    catch { setErr("ما انحفظ الاسم، جرّب كمان مرة."); setBusy(false); }
  }

  if (user && !user.name) {
    return (
      <form className="login" onSubmit={saveName}>
        <h1>أهلاً 👋</h1>
        <p className="tag">شو اسمك؟ هيك رح يشوفه أصحابك.</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: سارة" aria-label="اسمك" maxLength={40} />
        {err && <p className="err">{err}</p>}
        <button className="btn big block" disabled={busy || !name.trim()}>يلا نبلش</button>
      </form>
    );
  }

  return (
    <div className="login">
      <div className="login-art" aria-hidden="true"><span>🍕</span><span>☕</span><span>🧾</span></div>
      <h1>دفترنا</h1>
      <p className="tag">مين إلك ومين عليك، وتقسيم الفواتير بين الشلة.</p>
      {invited && <p className="banner"><span>انعزمت على جروب 🎉 سجّل دخول عشان تنضم.</span></p>}
      {step === "phone" ? (
        <form onSubmit={sendCode} style={{ display: "contents" }}>
          <label className="l" htmlFor="ph">رقم تلفونك</label>
          <input id="ph" autoFocus inputMode="tel" dir="ltr" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="079 123 4567" />
          {err && <p className="err">{err}</p>}
          <button className="btn big block" disabled={busy}>{busy ? "لحظة…" : "ابعتلي كود"}</button>
          <p className="note">رقمك هو اللي بيربطك بأصحابك. ما بنعرضه لحدا غيرهم.</p>
        </form>
      ) : (
        <form onSubmit={confirm} style={{ display: "contents" }}>
          <p>بعتنا كود على <b dir="ltr">{displayPhone(phone)}</b></p>
          <input className="code-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="الكود" placeholder="••••••" />
          {err && <p className="err">{err}</p>}
          <button className="btn big block" disabled={busy || code.length < 6}>{busy ? "لحظة…" : "تأكيد"}</button>
          <button type="button" className="link-btn" onClick={() => { setStep("phone"); setCode(""); setErr(""); }}>غيّر الرقم</button>
        </form>
      )}
      {demo && (
        <p className="banner"><span><b>نسخة تجريبية:</b> اكتب أي رقم أردني، والكود <b dir="ltr">{DEMO_CODE}</b>. ما في رسائل حقيقية.</span></p>
      )}
      <div ref={captcha} />
    </div>
  );
}
