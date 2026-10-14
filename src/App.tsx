import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { balancesFor, type Txn } from "./core/ledger";
import { notificationText } from "./core/messages";
import type { Phone } from "./core/phone";
import type { Backend, Contact, Group } from "./data/backend";
import { createBackend } from "./data";
import { Ctx, type AppCtx } from "./ui/AppContext";
import { buildFriends } from "./ui/model";
import { Login } from "./ui/Login";
import { Home } from "./ui/Home";
import { pendingJoin } from "./ui/invite";
import { getDialect, LangCtx, saveDialect, STRINGS, type Dialect } from "./ui/i18n";

type Toast = { id: number; text: string; push?: boolean };

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<{ phone: Phone; name: string | null } | null | undefined>(undefined);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reg, setReg] = useState<Record<Phone, boolean>>({});
  const [dialect, setDialectState] = useState<Dialect>(getDialect);
  const lang = useMemo(() => ({
    t: STRINGS[dialect], dialect,
    setDialect: (d: Dialect) => { saveDialect(d); setDialectState(d); },
  }), [dialect]);
  const dialectRef = useRef(dialect);
  dialectRef.current = dialect;

  const toast = useCallback((text: string, push = false) => {
    const id = Math.random();
    // One message at a time at the bottom; at most two notifications at the top
    setToasts((t) => push
      ? [...t.filter((x) => x.push).slice(-1), ...t.filter((x) => !x.push), { id, text, push }]
      : [...t.filter((x) => x.push), { id, text, push }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), push ? 5000 : 2200);
  }, []);

  // If start-up hangs or fails, show what went wrong instead of an endless spinner
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const onErr = (e: ErrorEvent | PromiseRejectionEvent) => {
      const r = "reason" in e ? e.reason : e.error ?? e.message;
      setBootErr(String((r as Error)?.message ?? r));
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onErr);
    const timer = setTimeout(() => setSlow(true), 10_000);
    createBackend().then(setBackend).catch((e) => setBootErr(String(e?.message ?? e)));
    return () => { clearTimeout(timer); window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onErr); };
  }, []);
  useEffect(() => backend?.onAuth(setUser), [backend]);

  const me = user?.name ? user.phone : null;
  useEffect(() => {
    if (!backend || !me) return;
    let seen: Set<string> | null = null;
    const unsubContacts = backend.watchContacts(setContacts);
    const unsubGroups = backend.watchGroups(setGroups);
    const unsubTxns = backend.watchTxns((all) => {
      if (seen) {
        // Show an in-app notification for new entries someone else created while the app is open
        for (const t of all) {
          // Skip my own entries, and old ones that just became visible (e.g. sample data)
          if (seen.has(t.id) || t.createdBy === me || Date.now() - t.createdAt > 120_000) continue;
          const other = t.creditor === me ? t.debtor : t.creditor;
          toast(notificationText(t, me, balancesFor(all, me).get(other) ?? 0, undefined, dialectRef.current), true);
        }
      }
      // The first snapshot is existing history, not news
      seen = new Set(all.map((t) => t.id));
      setTxns(all);
    });
    return () => { unsubContacts(); unsubGroups(); unsubTxns(); setContacts([]); setGroups([]); setTxns([]); };
  }, [backend, me, toast]);

  const friends = useMemo(() => (me ? buildFriends(me, contacts, txns, groups) : []), [me, contacts, txns, groups]);

  // Find out who has the app, so WhatsApp can be suggested for everyone else
  const asked = useRef(new Set<Phone>());
  useEffect(() => {
    if (!backend) return;
    for (const f of friends) {
      if (asked.current.has(f.phone)) continue;
      asked.current.add(f.phone);
      backend.lookupUser(f.phone)
        .then((u) => setReg((r) => ({ ...r, [f.phone]: !!u })))
        .catch(() => asked.current.delete(f.phone));
    }
  }, [backend, friends]);

  const ctx: AppCtx | null = useMemo(() => backend && user && user.name ? {
    backend, me: user.phone, myName: user.name, contacts, txns, friends, groups,
    toast: (t: string) => toast(t),
    registered: (p: Phone) => (p in reg ? reg[p] : null),
  } : null, [backend, user, contacts, txns, friends, toast, reg]);

  const toastsEl = (
    <>
    <div className="toast-stack" aria-live="polite">
      {toasts.filter((t) => t.push).map((t) => (
        <div key={t.id} className={`toast${t.push ? " push" : ""}`} onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
          {t.push && <b>{lang.t.pushTitle}</b>}
          {t.text}
        </div>
      ))}
    </div>
    <div className="toast-bottom" aria-live="polite">
      {toasts.filter((t) => !t.push).map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
    </>
  );

  if (!backend || user === undefined) {
    const t = lang.t;
    return (
      <div className="center" style={{ minHeight: "100dvh", justifyContent: "center" }}>
        {slow || bootErr ? (
          <>
            <div className="empty-emoji" aria-hidden="true">😕</div>
            <h3 style={{ margin: 0 }}>{t.stuckTitle}</h3>
            <p className="muted" style={{ margin: 0 }}>{t.stuckHint}</p>
            <button className="btn big" onClick={() => location.reload()}>{t.retry}</button>
            <a className="link-btn" href="/?demo">{t.openDemo}</a>
            <small className="muted" dir="ltr" style={{ wordBreak: "break-all" }}>
              {bootErr ?? `waiting: ${!backend ? "backend" : "auth"}`} · {navigator.onLine ? "online" : "offline"}
            </small>
          </>
        ) : <div className="spinner" />}
      </div>
    );
  }
  return (
    <LangCtx.Provider value={lang}>
      {!ctx ? <Login backend={backend} user={user} invited={!!pendingJoin()} /> : (
        <Ctx.Provider value={ctx}><Home /></Ctx.Provider>
      )}
      {toastsEl}
    </LangCtx.Provider>
  );
}
