const s = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const Camera = () => (
  <svg viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
export const ImageIc = () => (
  <svg viewBox="0 0 24 24" {...s} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
);
export const Pen = () => (
  <svg viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m14 6 4 4" /></svg>
);
export const Menu = () => (
  <svg viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const Plus = () => (
  <svg viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
export const Receipt = () => (
  <svg viewBox="0 0 24 24" {...s} aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
);
export const WhatsApp = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z" /></svg>
);
export const Gear = () => (
  <svg viewBox="0 0 24 24" {...s} aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);

// Line icons for the tabs and cards (24×24, stroke 2, like the rest)
const I = ({ children }: { children: React.ReactNode }) => <svg viewBox="0 0 24 24" {...s} aria-hidden="true">{children}</svg>;
export const Search = () => <I><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></I>;
export const Chat = () => <I><path d="M5 5h14v10H10l-5 4z" /></I>;
export const Contacts = () => <I><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="2.5" /><path d="M8 16c1-2 7-2 8 0" /></I>;
export const Dialpad = () => <I>{[6, 12, 18].flatMap((y) => [6, 12, 18].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.2" fill="currentColor" />))}</I>;
export const Handshake = () => <I><path d="m3 11 4-4 5 2 5-2 4 4-7 7-2-2-2 2-2-2" /><path d="m9 13 2 2M12 11l3 3" /></I>;
export const Share = () => <I><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></I>;
export const Wallet = () => <I><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></I>;
export const Scale = () => <I><path d="M12 4v16M6 20h12M5 8h14" /><path d="m5 8-3 6h6zM19 8l-3 6h6z" /></I>;
export const People = () => <I><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.3" /><path d="M3 19c.5-3.5 3-5 6-5s5.5 1.5 6 5M15 14.5c2.5 0 4.5 1.2 5 4" /></I>;
export const Logo = () => <I><path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z" /><path d="M6 3v18M9 8h6M9 12h6M9 16h4" /></I>;
export const Trend = ({ dir }: { dir: "up" | "down" }) => (
  <I>{dir === "up" ? <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></> : <><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>}</I>
);
export const Arrow = ({ dir }: { dir: "up" | "down" | "up-right" | "down-left" }) => {
  const d = { up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6", "up-right": "M7 17 17 7M9 7h8v8", "down-left": "M17 7 7 17M15 17H7V9" }[dir];
  return <I><path d={d} /></I>;
};
export const Book = () => <I><path d="M12 6c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5z" /><path d="M12 6v14M15 9.5h2.5M15 12.5h2.5" /></I>;
export const Bolt = () => <I><path d="M13 3 5 13h6l-1 8 8-10h-6z" /></I>;
export const Phone = () => <I><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></I>;
export const Send = () => <I><path d="M4 12 20 4l-4 16-4-6z" /><path d="m12 14 8-10" /></I>;
export const Shield = () => <I><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></I>;
export const Install = () => <I><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M12 8v6M9.5 11.5 12 14l2.5-2.5" /></I>;
export const Heart = () => <I><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></I>;
export const Bell = () => <I><path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 0 0 4 0" /></I>;
export const Sun = () => <I><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>;
export const Moon = () => <I><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></I>;
export const Globe = () => <I><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></I>;
export const Palette = () => <I><path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7" r="1" /></I>;
export const Pencil = () => <I><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></I>;
export const Exit = () => <I><path d="M10 4H5v16h5" /><path d="M14 8l4 4-4 4M18 12H9" /></I>;
export const Gift = () => <I><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z" /></I>;
