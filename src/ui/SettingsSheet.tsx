import { useEffect, useState } from "react";
import { displayPhone } from "../core/phone";
import type { PushState } from "../data/backend";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";
import { getTheme, setTheme, type Theme } from "./theme";
import { useT } from "./i18n";
import { DialectPicker, InstallTip } from "./Login";
import { Bell, Bolt, Exit, Globe, Moon, Palette, Pencil, Phone as PhoneIcon, Shield, Sun } from "./icons";

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { backend, me, myName, toast } = useApp();
  const t = useT();
  const [push, setPush] = useState<PushState | null>(null);
  const [theme, setT] = useState<Theme>(getTheme());
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(myName);
  const [busy, setBusy] = useState(false);
  useEffect(() => { backend.pushState().then(setPush).catch(() => setPush("unsupported")); }, [backend]);
  const demo = backend.mode === "demo";

  const pushText: Record<PushState, string> = {
    granted: t.pushOn, denied: t.pushDenied, default: t.pushDefault,
    unsupported: t.pushUnsupported, needsInstall: t.pushInstall,
  };

  async function enable() {
    try {
      const s = await backend.enablePush();
      setPush(s);
      if (s === "granted") toast(t.pushOn);
    } catch { toast(t.tryAgain); }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || n === myName) { setEditing(false); return; }
    setBusy(true);
    try { await backend.saveName(n); toast(t.nameSaved); setEditing(false); }
    catch { toast(t.tryAgain); }
    finally { setBusy(false); }
  }

  const themes: [Theme, string, React.ReactNode][] = [
    ["system", t.themeSystem, <PhoneIcon key="s" />], ["light", t.themeLight, <Sun key="l" />], ["dark", t.themeDark, <Moon key="d" />],
  ];

  return (
    <Sheet title={t.settings} onClose={onClose}>
      <div className="settings-list">
        {demo && (
          <div className="demo-card">
            <span className="who"><b>{t.inDemoTitle}</b><span>{t.inDemoText}</span></span>
            <a className="btn small" href="/">{t.openReal}</a>
          </div>
        )}

        <section className="set-card me-card">
          <Avatar name={(editing ? name : myName) || "؟"} id={me} size={72} />
          {editing ? (
            <form className="name-edit" onSubmit={saveName}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={t.nameLabel} maxLength={40} />
              <button className="btn small" disabled={busy || !name.trim()}>{t.save}</button>
            </form>
          ) : (
            <div className="who">
              <b>{myName}</b>
              <span className="phone-line" dir="ltr">{displayPhone(me)}</span>
              {!demo && <span className="status pos"><Bolt /> {t.verified}</span>}
            </div>
          )}
          {!editing && (
            <button className="icon-btn" onClick={() => { setName(myName); setEditing(true); }} aria-label={t.editName}><Pencil /></button>
          )}
        </section>

        <section className="set-card">
          <div className="set-head"><span className="ic"><Globe /></span><b>{t.dialect}</b></div>
          <DialectPicker />
        </section>

        <section className="set-card">
          <div className="set-head"><span className="ic"><Palette /></span><b>{t.look}</b></div>
          <div className="seg theme-seg" role="group" aria-label={t.look}>
            {themes.map(([k, l, ic]) => (
              <button key={k} aria-pressed={theme === k} onClick={() => { setTheme(k); setT(k); }}>{ic}{l}</button>
            ))}
          </div>
        </section>

        <section className="set-card">
          <div className="set-head">
            <span className="ic"><Bell /></span><b>{t.notifications}</b>
          </div>
          {demo ? (
            <span className="muted">{t.demoPush}</span>
          ) : push && (
            <>
              <span className="muted">{pushText[push]}</span>
              {push === "needsInstall" && (
                <ol className="muted" style={{ margin: 0, paddingInlineStart: 20 }}>
                  {t.iosSteps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              )}
              {push === "default" && <button className="btn" onClick={enable}>{t.enablePush}</button>}
            </>
          )}
        </section>

        <InstallTip />

        <p className="privacy-line"><Shield />{t.privacyText}</p>

        <button className="btn signout" onClick={() => backend.signOut()}><Exit />{t.signOut}</button>
        <p className="login-foot">{t.version}</p>
      </div>
    </Sheet>
  );
}
