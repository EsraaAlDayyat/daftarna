import { useEffect, useState } from "react";
import { displayPhone } from "../core/phone";
import type { PushState } from "../data/backend";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";
import { getTheme, setTheme, type Theme } from "./theme";
import { useT } from "./i18n";
import { DialectPicker } from "./Login";

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { backend, me, myName, toast } = useApp();
  const t = useT();
  const [push, setPush] = useState<PushState | null>(null);
  const [theme, setT] = useState<Theme>(getTheme());
  useEffect(() => { backend.pushState().then(setPush).catch(() => setPush("unsupported")); }, [backend]);

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

  return (
    <Sheet title={t.settings} onClose={onClose}>
      <div className="settings-list">
        <div className="card">
          <b>{myName}</b>
          <span className="muted" dir="ltr" style={{ textAlign: "right" }}>{displayPhone(me)}</span>
        </div>

        <div className="card">
          <b>{t.dialect}</b>
          <DialectPicker />
        </div>

        <div className="card">
          <b>{t.notifications}</b>
          {backend.mode === "demo" ? (
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
        </div>

        <div className="card">
          <b>{t.look}</b>
          <div className="seg" role="group" aria-label={t.look}>
            {([["system", t.themeSystem], ["light", t.themeLight], ["dark", t.themeDark]] as [Theme, string][]).map(([k, l]) => (
              <button key={k} aria-pressed={theme === k} onClick={() => { setTheme(k); setT(k); }}>{l}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <b>{t.privacy}</b>
          <span className="muted">{t.privacyText}</span>
        </div>

        <button className="btn ghost" onClick={() => backend.signOut()}>{t.signOut}</button>
      </div>
    </Sheet>
  );
}
