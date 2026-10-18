// Chrome on Android fires this when the app can be installed; we keep it to show our own "install" button.
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallPrompt | null = null;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPrompt; subs.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { deferred = null; subs.forEach((f) => f()); });
}
export const canInstall = () => !!deferred;
export function onInstallChange(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export async function promptInstall() {
  const d = deferred; if (!d) return;
  await d.prompt();
  await d.userChoice.catch(() => null);
  deferred = null; subs.forEach((f) => f());
}
