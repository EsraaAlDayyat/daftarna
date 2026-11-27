/** Calm empty screens: a simple flat drawing and one line. */
type Art = "ledger" | "group" | "people";

function Drawing({ art }: { art: Art }) {
  const soft = "var(--accent-soft)", acc = "var(--accent)", page = "var(--paper)";
  if (art === "group") return (
    <svg viewBox="0 0 160 110" aria-hidden="true">
      <rect x="10" y="70" width="140" height="10" rx="5" fill={soft} />
      <circle cx="52" cy="38" r="14" fill={soft} /><rect x="32" y="54" width="40" height="18" rx="9" fill={soft} />
      <circle cx="108" cy="38" r="14" fill={soft} /><rect x="88" y="54" width="40" height="18" rx="9" fill={soft} />
      <circle cx="80" cy="30" r="16" fill={acc} opacity=".85" /><rect x="57" y="48" width="46" height="24" rx="12" fill={acc} opacity=".85" />
    </svg>
  );
  if (art === "people") return (
    <svg viewBox="0 0 160 110" aria-hidden="true">
      <rect x="30" y="14" width="100" height="82" rx="14" fill={soft} />
      <circle cx="80" cy="44" r="15" fill={acc} opacity=".85" />
      <rect x="56" y="64" width="48" height="16" rx="8" fill={acc} opacity=".85" />
      <circle cx="128" cy="22" r="13" fill={page} /><path d="M128 15v14M121 22h14" stroke={acc} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg viewBox="0 0 160 110" aria-hidden="true">
      <rect x="34" y="10" width="92" height="90" rx="12" fill={soft} />
      <rect x="48" y="28" width="52" height="7" rx="3.5" fill={page} />
      <rect x="48" y="44" width="64" height="7" rx="3.5" fill={page} />
      <rect x="48" y="60" width="40" height="7" rx="3.5" fill={page} />
      <circle cx="118" cy="80" r="18" fill={acc} />
      <path d="m110 80 6 6 11-12" fill="none" stroke={page} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptyState({ art, title, line }: { art: Art; title: string; line?: string }) {
  return (
    <div className="empty-state">
      <Drawing art={art} />
      <b>{title}</b>
      {line && <span>{line}</span>}
    </div>
  );
}
