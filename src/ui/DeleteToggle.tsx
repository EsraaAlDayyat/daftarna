import { useEffect, useState } from "react";
import { useT } from "./i18n";

/**
 * A small trash icon. The first tap turns it into "تأكيد الحذف؟" with ✓ and ✕
 * (it goes back on its own after a few seconds); ✓ does the deletion.
 */
export function DeleteToggle({ label, onConfirm }: { label: string; onConfirm: () => Promise<void> | void }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const id = setTimeout(() => setAsking(false), 5000);
    return () => clearTimeout(id);
  }, [asking]);

  if (!asking) {
    return (
      <button type="button" className="del-btn" aria-label={`${t.deleteWord}: ${label}`} onClick={(e) => { e.stopPropagation(); setAsking(true); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
      </button>
    );
  }
  return (
    <span className="del-ask" onClick={(e) => e.stopPropagation()}>
      <span className="del-q">{t.deleteQ}</span>
      <button type="button" className="del-yes" aria-label={`${t.confirmDelete} ${label}`} disabled={busy}
        onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); setAsking(false); } }}>✓</button>
      <button type="button" className="del-no" aria-label={t.no} onClick={() => setAsking(false)}>✕</button>
    </span>
  );
}
