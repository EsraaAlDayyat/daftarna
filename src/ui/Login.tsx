import { useRef, useState } from "react";
import { displayPhone, normalizePhone, type Phone } from "../core/phone";
import type { Backend, PhoneSignIn } from "../data/backend";
import { DEMO_CODE } from "../data/demoBackend";
import { DIALECTS, useDialect } from "./i18n";

/** Small switch to pick the app's dialect. Shown on sign-in and in settings. */
export function DialectPicker() {
  const { t, dialect, setDialect } = useDialect();
  return (
    <div className="dialects" role="radiogroup" aria-label={t.dialect}>
      {DIALECTS.map((d) => (
        <button type="button" key={d.id} role="radio" aria-checked={dialect === d.id} onClick={() => setDialect(d.id)}>
          <span aria-hidden="true">{d.flag}</span> {d.label}
        </button>
      ))}
    </div>
  );
}

export function Login({ backend, user, invited }: { backend: Backend; user: { phone: Phone; name: string | null } | null; invited?: boolean }) {
  const { t } = useDialect();
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
    if (!p) { setErr(t.badPhone); return; }
    setErr(""); setBusy(true);
    try {
      pending.current = await backend.startPhoneSignIn(p, captcha.current!);
      setPhone(p); setStep("code");
    } catch {
      setErr(t.codeFailed);
    } finally { setBusy(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await pending.current!.confirm(code); }
    catch { setErr(t.wrongCode); }
    finally { setBusy(false); }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await backend.saveName(name.trim()); }
    catch { setErr(t.nameFailed); setBusy(false); }
  }

  if (user && !user.name) {
    return (
      <form className="login" onSubmit={saveName}>
        <h1>{t.hello}</h1>
        <p className="tag">{t.whatsYourName}</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} aria-label={t.nameLabel} maxLength={40} />
        {err && <p className="err">{err}</p>}
        <button className="btn big block" disabled={busy || !name.trim()}>{t.start}</button>
      </form>
    );
  }

  return (
    <div className="login">
      <DialectPicker />
      <p className="saying">{t.saying}</p>
      <div className="login-art" aria-hidden="true"><span>🍕</span><span>☕</span><span>🧾</span></div>
      <h1>{t.appName}</h1>
      <p className="tag">{t.tagline}</p>
      {invited && <p className="banner"><span>{t.invitedLogin}</span></p>}
      {step === "phone" ? (
        <form onSubmit={sendCode} style={{ display: "contents" }}>
          <label className="l" htmlFor="ph">{t.phoneLabel}</label>
          <input id="ph" autoFocus inputMode="tel" dir="ltr" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="079 123 4567" />
          {err && <p className="err">{err}</p>}
          <button className="btn big block" disabled={busy}>{busy ? t.wait : t.sendCode}</button>
          <p className="note">{t.phoneHint}</p>
        </form>
      ) : (
        <form onSubmit={confirm} style={{ display: "contents" }}>
          <p>{t.codeSent} <b dir="ltr">{displayPhone(phone)}</b></p>
          <input className="code-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label={t.codeLabel} placeholder="••••••" />
          {err && <p className="err">{err}</p>}
          <button className="btn big block" disabled={busy || code.length < 6}>{busy ? t.wait : t.confirm}</button>
          <button type="button" className="link-btn" onClick={() => { setStep("phone"); setCode(""); setErr(""); }}>{t.changeNumber}</button>
        </form>
      )}
      {demo && <p className="banner"><span>{t.demoLogin(DEMO_CODE)}</span></p>}
      <div ref={captcha} />
    </div>
  );
}
