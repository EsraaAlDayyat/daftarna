// Writes the Firebase web config for the build into .env.production.local.
// First choice: ask Firebase itself (needs the deploy service account), so a badly pasted secret can't break the app.
// Fallback: the VITE_* secrets, cleaned of stray quotes, commas and "apiKey:" prefixes.
// The web config is public by design (it ships in the page), but we only log whether it looks right.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const KEYS = { apiKey: "API_KEY", authDomain: "AUTH_DOMAIN", projectId: "PROJECT_ID", storageBucket: "STORAGE_BUCKET", messagingSenderId: "MESSAGING_SENDER_ID", appId: "APP_ID" };
const clean = (v) => String(v ?? "").trim().replace(/^[A-Za-z]+\s*:\s*/, "").replace(/[",;']/g, "").trim();

function firebase(args) {
  const out = execFileSync("npx", ["--yes", "firebase", ...args, "--json", "--non-interactive"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out.slice(out.indexOf("{")));
}

let cfg = null, source = "";
try {
  const apps = firebase(["apps:list", "WEB"]).result ?? [];
  if (apps.length) {
    const r = firebase(["apps:sdkconfig", "WEB", apps[0].appId]).result;
    cfg = r?.sdkConfig ?? (r?.fileContents ? JSON.parse(r.fileContents.match(/\{[\s\S]*\}/)[0]) : null);
    if (cfg?.apiKey) source = "Firebase";
    else cfg = null;
  } else console.log("::warning::No web app found in the Firebase project.");
} catch (e) {
  console.log(`::warning::Could not read the web config from Firebase (${String(e.message).split("\n")[0]}); using the secrets.`);
}
if (!cfg) {
  cfg = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, clean(process.env[`SECRET_${v}`])]));
  source = "secrets";
}
const vapid = clean(process.env.SECRET_VAPID_KEY);
const lines = Object.entries(KEYS).map(([k, v]) => `VITE_FIREBASE_${v}=${clean(cfg[k])}`);
if (vapid) lines.push(`VITE_FIREBASE_VAPID_KEY=${vapid}`);
writeFileSync(".env.production.local", lines.join("\n") + "\n");

const key = clean(cfg.apiKey);
const ok = /^AIza[0-9A-Za-z_-]{35}$/.test(key);
console.log(`Web config from ${source}: apiKey ${ok ? "looks right" : `looks WRONG (length ${key.length}, starts "${key.slice(0, 4)}")`}, project "${clean(cfg.projectId)}".`);
if (!ok) console.log("::error::The Firebase apiKey doesn't look right, so the app won't open. Check the VITE_FIREBASE_API_KEY secret.");
