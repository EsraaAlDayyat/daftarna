import { useEffect, useRef, useState } from "react";
import { displayPhone, normalizePhone, type Phone } from "../core/phone";
import type { Backend, PhoneSignIn } from "../data/backend";
import { DEMO_CODE } from "../data/demoBackend";
import { DIALECTS, STRINGS, useDialect } from "./i18n";
import { Avatar } from "./Avatar";
import { Bolt, Book, Contacts, Install, Phone as PhoneIcon, Send, Shield } from "./icons";
import { canInstall, onInstallChange, promptInstall } from "./install";
import { isIos, isStandalone } from "./util";

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
    } catch (e) {
      // Say what went wrong in plain words where we can, and keep the code for me to read
      const code = String((e as { code?: string })?.code ?? (e as Error)?.message ?? "").replace(/^auth\//, "");
      const why = code === "too-many-requests" || code === "quota-exceeded" ? t.codeTooMany
        : code === "invalid-phone-number" ? t.badPhone
        : code === "network-request-failed" ? t.codeNetwork
        : t.codeFailed;
      setErr(code ? `${why} (${code})` : why);
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

  const hero = (
    <div className="login-hero">
      <span className="app-icon" aria-hidden="true"><Book /><span className="ver num"><Bolt />٢.٠</span></span>
      <h1>{t.appName}</h1>
      <p className="saying">{t.saying}</p>
    </div>
  );

  if (user && !user.name) {
    return (
      <form className="login profile" onSubmit={saveName}>
        <div className="login-hero">
          <div className="profile-pic"><Avatar name={name || "؟"} id={user.phone} size={120} /></div>
          <h1 className="welcome-h">{t.welcomeTitle}</h1>
        </div>

        <section className="login-card">
          <div className="pc-head"><b>{t.nameChip}</b></div>
          <div className="field-ic">
            <input id="nm" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} aria-label={t.nameLabel} maxLength={40} />
            <Contacts />
          </div>
        </section>


        {err && <p className="err">{err}</p>}
        <button className="btn big block" disabled={busy || !name.trim()}>{t.start}</button>
      </form>
    );
  }

  return (
    <div className="login">
      {hero}
      {invited && <p className="banner"><span>{t.invitedLogin}</span></p>}
      <div className="login-card">
        {step === "phone" ? (
          <form onSubmit={sendCode} className="login-form">
            <label className="l with-ic" htmlFor="ph"><PhoneIcon />{t.phoneLabel}</label>
            <div className="phone-field" dir="ltr">
              <span className="cc"><span aria-hidden="true">🇯🇴</span> +962</span>
              <input id="ph" autoFocus inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="79 123 4567" />
            </div>
            <p className="note">{t.phoneExample}</p>
            {err && <p className="err">{err}</p>}
            <button className="btn big block" disabled={busy}><Send />{busy ? t.wait : t.sendCode}</button>
          </form>
        ) : (
          <form onSubmit={confirm} className="login-form">
            <p>{t.codeSent} <b dir="ltr">{displayPhone(phone)}</b></p>
            <input className="code-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label={t.codeLabel} placeholder="••••••" />
            {err && <p className="err">{err}</p>}
            <button className="btn big block" disabled={busy || code.length < 6}>{busy ? t.wait : t.confirm}</button>
            <button type="button" className="link-btn" onClick={() => { setStep("phone"); setCode(""); setErr(""); }}>{t.changeNumber}</button>
          </form>
        )}
        <p className="secure"><Shield />{t.secureNote}</p>
      </div>
      {demo && (
        <div className="demo-card">
          <span className="who"><b>{t.inDemoTitle}</b><span>{t.demoLogin(DEMO_CODE)} {t.noSmsInDemo}</span></span>
          <a className="btn small" href="/">{t.openReal}</a>
        </div>
      )}
      <InstallTip />
      <div ref={captcha} />
    </div>
  );
}

/** Big dialect choice with a taste of the words each one uses. */
export function DialectCards() {
  const { t, dialect, setDialect } = useDialect();
  return (
    <div className="dialect-cards" role="radiogroup" aria-label={t.dialect}>
      {DIALECTS.map((d) => (
        <button type="button" key={d.id} role="radio" aria-checked={dialect === d.id} className="dcard" onClick={() => setDialect(d.id)}>
          <span className="flag" aria-hidden="true">{d.flag}</span>
          <span className="who">
            <b>{d.title}</b>
            <span className="muted">"{STRINGS[d.id].saying.replace(/\s*💜$/, "")}"</span>
            <span className="ex">{d.examples.map((x) => <span key={x}>{x}</span>)}</span>
          </span>
          <span className="radio" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** "Install it like an app": a real button on Android Chrome, otherwise the steps. Hidden once installed. */
export function InstallTip() {
  const { t } = useDialect();
  const [, bump] = useState(0);
  useEffect(() => onInstallChange(() => bump((n) => n + 1)), []);
  if (isStandalone()) return null;
  return (
    <div className="tip-card soft">
      <span className="ic"><Install /></span>
      <span className="who">
        <b>{t.installTitle} <Bolt /></b>
        <span className="muted">{isIos() ? t.installIos : t.installAndroid}</span>
      </span>
      {canInstall() && <button className="btn small" onClick={() => promptInstall()}>{t.installNow}</button>}
    </div>
  );
}
