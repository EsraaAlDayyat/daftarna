import { useCallback, useEffect, useState } from "react";
import { jod } from "../core/money";
import type { Phone } from "../core/phone";
import type { PushState } from "../data/backend";
import { seedDemo } from "../data/demoBackend";
import { useApp } from "./AppContext";
import { Contacts, Gear, Logo, People, Plus, Scale } from "./icons";
import { AccountsTab, FriendsTab } from "./Tabs";
import { FriendSheet } from "./FriendSheet";
import { AddFriendSheet } from "./AddFriendSheet";
import { SplitFlow } from "./SplitFlow";
import { SettingsSheet } from "./SettingsSheet";
import { GroupSheet, JoinSheet, NewGroupSheet } from "./GroupSheets";
import { OrderSheet } from "./OrderSheet";
import { OutingSheet } from "./OutingSheet";
import { groupBalance } from "./model";
import { pendingJoin } from "./invite";
import { useT } from "./i18n";

type Open =
  | { kind: "friend"; phone: Phone; back?: Open }
  | { kind: "add"; groupId?: string; back?: Open }
  | { kind: "split"; groupId?: string; orderId?: string; back?: Open }
  | { kind: "order"; id: string; back?: Open }
  | { kind: "settings" }
  | { kind: "group"; id: string }
  | { kind: "newGroup" }
  | { kind: "join"; id: string }
  | null;

type Tab = "groups" | "friends" | "accounts";
const TAB_KEY = "daftarna-tab";

export function Home() {
  const { friends, me, myName, backend, groups, orders } = useApp();
  const t = useT();
  const [open, setOpen] = useState<Open>(() => {
    const j = pendingJoin();
    return j ? { kind: "join", id: j } : null;
  });
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const v = localStorage.getItem(TAB_KEY);
      return v === "accounts" || v === "friends" ? v : "groups";
    } catch { return "groups"; }
  });
  const setTab = (x: Tab) => { setTabState(x); try { localStorage.setItem(TAB_KEY, x); } catch { /* */ } window.scrollTo(0, 0); };
  const [accPart, setAccPart] = useState<"in" | "out" | null>("in");
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => { backend.pushState().then(setPush).catch(() => setPush("unsupported")); }, [backend, open]);

  const close = () => setOpen(null);
  // Closing a sheet opened from a group goes back to that group
  const back = () => setOpen((o) => (o && "back" in o && o.back) || null);
  const openGroup = useCallback((id: string) => setOpen({ kind: "group", id }), []);
  const openFriend = (p: Phone) => setOpen({ kind: "friend", phone: p });
  const empty = !groups.length && !friends.length;

  return (
    <>
      <div className="wrap" inert={!!open} aria-hidden={open ? true : undefined}>
        <div className="topbar">
          <div className="brand">
            <span className="logo"><Logo /></span>
            <div>
              <h1>{t.appName}</h1>
              <div className="sub">{tab === "groups" ? t.hi(myName) : tab === "friends" ? t.tabFriends : t.tabAccounts}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={() => setOpen({ kind: "settings" })} aria-label={t.settings}>
            <Gear />
          </button>
        </div>

        {backend.mode === "demo" && (
          <div className="banner">
            <span style={{ flex: 1 }}>{t.demoBanner}</span>
            {empty && <button className="btn small" onClick={() => seedDemo(me, myName)}>{t.fillDemo}</button>}
          </div>
        )}
        {(push === "default" || push === "needsInstall") && (
          <div className="banner">
            <span style={{ flex: 1 }}>{push === "needsInstall" ? t.pushIos : t.pushAsk}</span>
            <button className="btn small" onClick={() => setOpen({ kind: "settings" })}>{push === "needsInstall" ? t.how : t.enable}</button>
          </div>
        )}

        {tab === "groups" ? (
          <section aria-label={t.tabGroups}>
            <div className="groups">
              {groups.map((g) => {
                const b = groupBalance(g, friends, me);
                return (
                  <button key={g.id} className="gtile" onClick={() => openGroup(g.id)}>
                    <span className="g-emoji" aria-hidden="true">{g.emoji}</span>
                    <b>{g.name}</b>
                    <span className="muted">{t.people(g.members.length)}</span>
                    {b !== 0 && (
                      <span className={`gbal num ${b > 0 ? "pos" : "neg"}`}>{`${b > 0 ? t.owedShort : t.oweShort} ${jod(Math.abs(b))}`}</span>
                    )}
                  </button>
                );
              })}
              <button className="gtile new" onClick={() => setOpen({ kind: "newGroup" })}>
                <span className="g-emoji" aria-hidden="true"><Plus /></span>
                <b>{t.newGroup}</b>
                <span className="muted">{t.newGroupHint}</span>
              </button>
            </div>
          </section>
        ) : tab === "friends" ? (
          <FriendsTab friends={friends} onFriend={openFriend} onAdd={() => setOpen({ kind: "add" })} />
        ) : (
          <AccountsTab friends={friends} onFriend={openFriend} onAdd={() => setOpen({ kind: "add" })} part={accPart} setPart={setAccPart} />
        )}
      </div>

      <nav className="tabbar" inert={!!open} aria-hidden={open ? true : undefined} aria-label={t.appName}>
        <button aria-current={tab === "groups" ? "page" : undefined} onClick={() => setTab("groups")}>
          <People />{t.tabGroups}
        </button>
        <button aria-current={tab === "accounts" ? "page" : undefined} onClick={() => setTab("accounts")}>
          <Scale />{t.tabAccounts}
        </button>
        <button aria-current={tab === "friends" ? "page" : undefined} onClick={() => setTab("friends")}>
          <Contacts />{t.tabFriends}
        </button>
      </nav>

      {open?.kind === "friend" && <FriendSheet phone={open.phone} onClose={back} />}
      {open?.kind === "add" && (
        <AddFriendSheet groupId={open.groupId} onClose={back}
          onAdded={(p) => setOpen(open.groupId ? { kind: "group", id: open.groupId } : { kind: "friend", phone: p })} />
      )}
      {open?.kind === "split" && (
        <SplitFlow groupId={open.groupId} orderId={open.orderId} onClose={back}
          // After a bill, go straight to "settle my accounts" with the right list open
          onDone={(iPaid) => { setOpen(null); setAccPart(iPaid ? "in" : "out"); setTab("accounts"); }} />
      )}
      {open?.kind === "settings" && <SettingsSheet onClose={close} />}
      {open?.kind === "newGroup" && <NewGroupSheet onClose={close} onCreated={openGroup} />}
      {open?.kind === "join" && <JoinSheet id={open.id} onClose={close} onJoined={openGroup} />}
      {open?.kind === "group" && (
        <GroupSheet id={open.id} onClose={close}
          onFriend={(p) => setOpen({ kind: "friend", phone: p, back: open })}
          onAddMember={() => setOpen({ kind: "add", groupId: open.id, back: open })}
          onSplit={() => setOpen({ kind: "split", groupId: open.id, back: open })}
          onOrder={(oid) => setOpen({ kind: "order", id: oid, back: open })} />
      )}
      {open?.kind === "order" && orders.find((o) => o.id === open.id)?.kind === "outing" && <OutingSheet id={open.id} onClose={back} />}
      {open?.kind === "order" && orders.find((o) => o.id === open.id)?.kind !== "outing" && (
        <OrderSheet id={open.id} onClose={back}
          onBill={() => setOpen({ kind: "split", orderId: open.id, back: open })} />
      )}
    </>
  );
}
