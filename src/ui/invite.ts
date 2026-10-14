// Invite links look like https://…/?join=<groupId>. The group ID is random,
// so the link itself is what lets someone join.
const KEY = "daftarna-join";

/** Remembers an invite from the URL, so it survives signing in. */
export function captureInvite() {
  const url = new URL(location.href);
  const id = url.searchParams.get("join");
  if (!id) return;
  try { sessionStorage.setItem(KEY, id); } catch { /* storage blocked: keep it in the URL */ }
  url.searchParams.delete("join");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  memo = id;
}

let memo: string | null = null;
export function pendingJoin(): string | null {
  if (memo) return memo;
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
export function clearInvite() {
  memo = null;
  try { sessionStorage.removeItem(KEY); } catch { /* */ }
}

export function inviteLink(groupId: string): string {
  const url = new URL(location.origin + location.pathname);
  if (new URLSearchParams(location.search).has("demo")) url.searchParams.set("demo", "");
  url.searchParams.set("join", groupId);
  return url.toString().replace("demo=&", "demo&");
}
