import type { ReactNode } from "react";

/** A modern action button: a line icon with a small word under it. */
export function IconTile({ icon, label, onClick, href, primary, expanded, disabled }: {
  icon: ReactNode; label: string; onClick?: () => void; href?: string; primary?: boolean; expanded?: boolean; disabled?: boolean;
}) {
  const cls = `tile${primary ? " primary" : ""}`;
  const body = <><span className="tile-ic" aria-hidden="true">{icon}</span><span className="tile-lbl">{label}</span></>;
  if (href) return <a className={cls} href={href} target="_blank" rel="noopener">{body}</a>;
  return <button type="button" className={cls} onClick={onClick} aria-expanded={expanded} disabled={disabled}>{body}</button>;
}
