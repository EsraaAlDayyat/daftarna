import { useCallback, useEffect, useState } from "react";
import { formatJod, jod } from "../core/money";
import type { Phone } from "../core/phone";
import type { PushState } from "../data/backend";
import { seedDemo } from "../data/demoBackend";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { Plus } from "./icons";
import { FriendSheet } from "./FriendSheet";
import { AddFriendSheet } from "./AddFriendSheet";
import { SplitFlow } from "./SplitFlow";
import { SettingsSheet } from "./SettingsSheet";
import { GroupSheet, JoinSheet, NewGroupSheet } from "./GroupSheets";
import { groupBalance, type Friend } from "./model";
import { pendingJoin } from "./invite";
import { dateLabel } from "./util";
import { useT } from "./i18n";

type Open =
  | { kind: "friend"; phone: Phone; back?: Open }
  | { kind: "add"; groupId?: string; back?: Open }
  | { kind: "split"; groupId?: string; back?: Open }
  | { kind: "settings" }
  | { kind: "group"; id: string }
  | { kind: "newGroup" }
  | { kind: "join"; id: string }
  | null;

type Tab = "groups" | "accounts";
const TAB_KEY = "daftarna-tab";

export function Home() {
  const { friends, me, myName, backend, groups } = useApp();
  const t = useT();
  const [open, setOpen] = useState<Open>(() => {
    const j = pendingJoin();
    return j ? { kind: "join", id: j } : null;
  });
  const [tab, setTabState] = useState<Tab>(() => {
    try { return localStorage.getItem(TAB_KEY) === "accounts" ? "accounts" : "groups"; } catch { return "groups"; }
  });
  const setTab = (x: Tab) => { setTabState(x); try { localStorage.setItem(TAB_KEY, x); } catch { /* */ } window.scrollTo(0, 0); };
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
          <div>
            <div className="hello">{t.hi(myName)}</div>
            <h1>{tab === "groups" ? t.appName : t.tabAccounts}</h1>
          </div>
          <button className="me-btn" onClick={() => setOpen({ kind: "settings" })} aria-label={t.settings}>
            <Avatar name={myName} id={me} size={46} />
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
        ) : (
          <Accounts friends={friends} onFriend={openFriend} onAdd={() => setOpen({ kind: "add" })} />
        )}
      </div>

      <nav className="tabbar" inert={!!open} aria-hidden={open ? true : undefined} aria-label={t.appName}>
        <button aria-current={tab === "groups" ? "page" : undefined} onClick={() => setTab("groups")}>
          <span aria-hidden="true">👥</span>{t.tabGroups}
        </button>
        <button aria-current={tab === "accounts" ? "page" : undefined} onClick={() => setTab("accounts")}>
          <span aria-hidden="true">🧾</span>{t.tabAccounts}
        </button>
      </nav>

      {open?.kind === "friend" && <FriendSheet phone={open.phone} onClose={back} />}
      {open?.kind === "add" && (
        <AddFriendSheet groupId={open.groupId} onClose={back}
          onAdded={(p) => setOpen(open.groupId ? { kind: "group", id: open.groupId } : { kind: "friend", phone: p })} />
      )}
      {open?.kind === "split" && <SplitFlow groupId={open.groupId} onClose={back} />}
      {open?.kind === "settings" && <SettingsSheet onClose={close} />}
      {open?.kind === "newGroup" && <NewGroupSheet onClose={close} onCreated={openGroup} />}
      {open?.kind === "join" && <JoinSheet id={open.id} onClose={close} onJoined={openGroup} />}
      {open?.kind === "group" && (
        <GroupSheet id={open.id} onClose={close}
          onFriend={(p) => setOpen({ kind: "friend", phone: p, back: open })}
          onAddMember={() => setOpen({ kind: "add", groupId: open.id, back: open })}
          onSplit={() => setOpen({ kind: "split", groupId: open.id, back: open })} />
      )}
    </>
  );
}

/** "Settle my accounts" tab: what people owe me, what I owe, and who exactly. */
function Accounts({ friends, onFriend, onAdd }: { friends: Friend[]; onFriend: (p: Phone) => void; onAdd: () => void }) {
  const t = useT();
  const [openPart, setOpenPart] = useState<"in" | "out" | null>("in");
  const theyOwe = friends.filter((f) => f.balance > 0).sort((a, b) => b.balance - a.balance);
  const iOwe = friends.filter((f) => f.balance < 0).sort((a, b) => a.balance - b.balance);
  const rest = friends.filter((f) => f.balance === 0);
  const sum = (l: Friend[]) => l.reduce((s, f) => s + Math.abs(f.balance), 0);

  const row = (f: Friend) => (
    <button key={f.phone} className="row" onClick={() => onFriend(f.phone)}>
      <Avatar name={f.name} id={f.phone} />
      <span className="who">
        <b>{f.name}</b>
        <span>{f.txns[0] ? `${f.txns[0].note || t.entry} · ${dateLabel(f.txns[0].createdAt, t)}` : t.nothingYet}</span>
      </span>
      {f.balance !== 0 && <span className={`bal num ${f.balance > 0 ? "pos" : "neg"}`}>{jod(Math.abs(f.balance))}</span>}
    </button>
  );

  const part = (key: "in" | "out", title: string, list: Friend[]) => {
    const isOpen = openPart === key;
    return (
      <div className={`acc ${key}`}>
        <button className="acc-head" aria-expanded={list.length ? isOpen : undefined} onClick={() => setOpenPart(isOpen ? null : key)}>
          <span className="acc-title">{title}</span>
          <span className="acc-sum num">{formatJod(sum(list))} <small>{t.jod}</small></span>
          <span className="acc-more">{list.length ? (isOpen ? t.hideDetails : t.showDetails(list.length)) : t.nobodyHere}</span>
        </button>
        {isOpen && list.length > 0 && <div className="list">{list.map(row)}</div>}
      </div>
    );
  };

  return (
    <>
      {part("in", t.owedToMe, theyOwe)}
      {part("out", t.iOwe, iOwe)}
      <section aria-labelledby="rest-h">
        <div className="section-h">
          <h2 id="rest-h">{rest.length ? t.restFriends : t.yourFriends}</h2>
          <button className="btn small soft" onClick={onAdd}><Plus />{t.friend}</button>
        </div>
        <div className="list">
          {!friends.length ? (
            <div className="empty">
              <div className="empty-emoji" aria-hidden="true">🤝</div>
              <h3>{t.noOneYet}</h3>
              <div>{t.noOneYetHint}</div>
            </div>
          ) : rest.map(row)}
        </div>
      </section>
    </>
  );
}
