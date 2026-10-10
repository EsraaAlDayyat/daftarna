import { useEffect, useState } from "react";
import { displayPhone } from "../core/phone";
import type { PushState } from "../data/backend";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";
import { getTheme, setTheme, type Theme } from "./theme";

const PUSH_TEXT: Record<PushState, string> = {
  granted: "الإشعارات شغّالة ✓",
  denied: "الإشعارات مسكّرة من إعدادات المتصفح. افتح إعدادات الموقع وخلّي الإشعارات «سماح».",
  default: "فعّلها عشان يوصلك إشعار لما حد يضيف عليك، حتى لو التطبيق مسكّر.",
  unsupported: "هاد المتصفح ما بيدعم الإشعارات. جرّب Chrome على أندرويد، أو أضف التطبيق للشاشة الرئيسية على الآيفون.",
  needsInstall: "على الآيفون، الإشعارات بتشتغل بس لما تضيف التطبيق للشاشة الرئيسية:",
};

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { backend, me, myName, toast } = useApp();
  const [push, setPush] = useState<PushState | null>(null);
  const [theme, setT] = useState<Theme>(getTheme());
  useEffect(() => { backend.pushState().then(setPush).catch(() => setPush("unsupported")); }, [backend]);

  async function enable() {
    try {
      const s = await backend.enablePush();
      setPush(s);
      if (s === "granted") toast("الإشعارات شغّالة ✓");
    } catch { toast("ما زبطت، جرّب كمان مرة."); }
  }

  return (
    <Sheet title="الإعدادات" onClose={onClose}>
      <div className="settings-list">
        <div className="card">
          <b>{myName}</b>
          <span className="muted" dir="ltr" style={{ textAlign: "right" }}>{displayPhone(me)}</span>
        </div>

        <div className="card">
          <b>الإشعارات</b>
          {backend.mode === "demo" ? (
            <span className="muted">بالنسخة التجريبية الإشعارات بتطلع جوّا التطبيق بس. بالنسخة الحقيقية بتوصل على التلفون حتى لو التطبيق مسكّر.</span>
          ) : push && (
            <>
              <span className="muted">{PUSH_TEXT[push]}</span>
              {push === "needsInstall" && (
                <ol className="muted" style={{ margin: 0, paddingInlineStart: 20 }}>
                  <li>افتح التطبيق بـ Safari.</li>
                  <li>اضغط زر المشاركة (المربع والسهم لفوق).</li>
                  <li>اختار «Add to Home Screen» أو «إضافة إلى الشاشة الرئيسية».</li>
                  <li>افتح «دفترنا» من الأيقونة الجديدة، وارجع هون وفعّل الإشعارات.</li>
                </ol>
              )}
              {push === "default" && <button className="btn" onClick={enable}>فعّل الإشعارات</button>}
            </>
          )}
        </div>

        <div className="card">
          <b>الشكل</b>
          <div className="seg" role="group" aria-label="الشكل">
            {([["system", "حسب الجهاز"], ["light", "فاتح"], ["dark", "ليلي"]] as [Theme, string][]).map(([k, l]) => (
              <button key={k} aria-pressed={theme === k} onClick={() => { setTheme(k); setT(k); }}>{l}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <b>الخصوصية</b>
          <span className="muted">كل واحد بيشوف بس الحركات اللي هو طرف فيها. هاد مفروض على السيرفر نفسه، مش بس بالتطبيق.</span>
        </div>

        <button className="btn ghost" onClick={() => backend.signOut()}>سجّل خروج</button>
      </div>
    </Sheet>
  );
}
