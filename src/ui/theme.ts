export type Theme = "system" | "light" | "dark";
const KEY = "daftarna-theme";

export function getTheme(): Theme {
  try { return (localStorage.getItem(KEY) as Theme) || "system"; } catch { return "system"; }
}

export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#121a26" : "#eef1ea");
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* */ }
  applyTheme(t);
}
