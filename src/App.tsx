import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { balancesFor, type Txn } from "./core/ledger";
import { notificationText } from "./core/messages";
import type { Phone } from "./core/phone";
import type { Backend, Contact } from "./data/backend";
import { createBackend } from "./data";
import { Ctx, type AppCtx } from "./ui/AppContext";
import { buildFriends } from "./ui/model";
import { Login } from "./ui/Login";
import { Home } from "./ui/Home";

type Toast = { id: number; text: string; push?: boolean };

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<{ phone: Phone; name: string | null } | null | undefined>(undefined);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reg, setReg] = useState<Record<Phone, boolean>>({});

  const toast = useCallback((text: string, push = false) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, push }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), push ? 5000 : 2200);
  }, []);

  useEffect(() => { createBackend().then(setBackend); }, []);
  useEffect(() => backend?.onAuth(setUser), [backend]);

  const me = user?.name ? user.phone : null;
  useEffect(() => {
    if (!backend || !me) return;
    let seen: Set<string> | null = null;
    const unsubContacts = backend.watchContacts(setContacts);
    const unsubTxns = backend.watchTxns((all) => {
      if (seen) {
        // Show an in-app notification for new entries someone else created while the app is open
        for (const t of all) {
          if (seen.has(t.id) || t.createdBy === me) continue;
          const other = t.creditor === me ? t.debtor : t.creditor;
          toast(notificationText(t, me, balancesFor(all, me).get(other) ?? 0), true);
        }
      }
      // The first snapshot is existing history, not news
      seen = new Set(all.map((t) => t.id));
      setTxns(all);
    });
    return () => { unsubContacts(); unsubTxns(); setContacts([]); setTxns([]); };
  }, [backend, me, toast]);

  const friends = useMemo(() => (me ? buildFriends(me, contacts, txns) : []), [me, contacts, txns]);

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
    backend, me: user.phone, myName: user.name, contacts, txns, friends,
    toast: (t: string) => toast(t),
    registered: (p: Phone) => (p in reg ? reg[p] : null),
  } : null, [backend, user, contacts, txns, friends, toast, reg]);

  const toastsEl = (
    <>
    <div className="toast-stack" aria-live="polite">
      {toasts.filter((t) => t.push).map((t) => (
        <div key={t.id} className={`toast${t.push ? " push" : ""}`}>
          {t.push && <b>دفترنا · إشعار جديد</b>}
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
    return <div className="center" style={{ minHeight: "100dvh", justifyContent: "center" }}><div className="spinner" /></div>;
  }
  if (!ctx) return <>{<Login backend={backend} user={user} />}{toastsEl}</>;
  return (
    <Ctx.Provider value={ctx}>
      <Home />
      {toastsEl}
    </Ctx.Provider>
  );
}
