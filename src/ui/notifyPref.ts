// How to tell a friend without the app about a new entry: a text message (default), WhatsApp, or ask each time.
export type NotifyVia = "wa" | "sms" | "ask";
const KEY = "daftarna-notify-via";
export function getNotifyVia(): NotifyVia {
  try { const v = localStorage.getItem(KEY); return v === "wa" || v === "ask" ? v : "sms"; } catch { return "sms"; }
}
export function setNotifyVia(v: NotifyVia) { try { localStorage.setItem(KEY, v); } catch { /* */ } }
