import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "./i18n";

export function Sheet({ title, onClose, children, full, lead }: {
  title: ReactNode; onClose: () => void; children: ReactNode; full?: boolean; lead?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet${full ? " full" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} tabIndex={-1} ref={ref}>
        <div className="grip" />
        <div className="sheet-head">
          {lead}
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label={t.close}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
