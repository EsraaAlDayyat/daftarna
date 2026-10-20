export type Theme = "system" | "light" | "dark";
const KEY = "daftarna-theme";

export function getTheme(): Theme {
  // Light unless the person picks otherwise: the app keeps its colours even when the phone is in dark mode
  try { return (localStorage.getItem(KEY) as Theme) || "light"; } catch { return "light"; }
}

export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#141c18" : "#f3f6f3");
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* */ }
  applyTheme(t);
}
