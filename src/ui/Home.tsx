import { useCallback, useEffect, useMemo, useState } from "react";
import { totalsFor } from "../core/ledger";
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
import { groupBalance } from "./model";
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

export function Home() {
  const app = useApp();
  const { friends, txns, me, myName, backend, groups } = app;
  const t = useT();
  const [open, setOpen] = useState<Open>(() => {
    const j = pendingJoin();
    return j ? { kind: "join", id: j } : null;
  });
  const [q, setQ] = useState("");
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => { backend.pushState().then(setPush).catch(() => setPush("unsupported")); }, [backend, open]);

  const { owedToMe, iOwe } = useMemo(() => totalsFor(txns, me), [txns, me]);
  const net = owedToMe - iOwe;
  const shown = friends.filter((f) => !q.trim() || f.name.includes(q.trim()) || f.phone.includes(q.replace(/\D/g, "")));
  const close = () => setOpen(null);
  // Closing a sheet opened from a group goes back to that group
  const back = () => setOpen((o) => (o && "back" in o && o.back) || null);
  const openGroup = useCallback((id: string) => setOpen({ kind: "group", id }), []);

  return (
    <>
      <div className="wrap" inert={!!open} aria-hidden={open ? true : undefined}>
        <div className="topbar">
          <div>
            <div className="hello">{t.hi(myName)}</div>
            <h1>{t.appName}</h1>
          </div>
          <button className="me-btn" onClick={() => setOpen({ kind: "settings" })} aria-label={t.settings}>
            <Avatar name={myName} id={me} size={46} />
          </button>
        </div>

        <div className="hero-card">
          <div className="lbl">{net > 0 ? t.netMine : net < 0 ? t.netTheirs : t.netNone}</div>
          <div className="big num"><>{formatJod(Math.abs(net))} <small>{t.jod}</small></></div>
          <div className="pills">
            <div className="pill"><span>{t.owedToMe}</span><b className="num">{formatJod(owedToMe)}</b></div>
            <div className="pill"><span>{t.iOwe}</span><b className="num">{formatJod(iOwe)}</b></div>
          </div>
        </div>

        {backend.mode === "demo" && (
          <div className="banner"><span>{t.demoBanner}</span></div>
        )}
        {(push === "default" || push === "needsInstall") && (
          <div className="banner">
            <span style={{ flex: 1 }}>{push === "needsInstall" ? t.pushIos : t.pushAsk}</span>
            <button className="btn small" onClick={() => setOpen({ kind: "settings" })}>{push === "needsInstall" ? t.how : t.enable}</button>
          </div>
        )}

        <section aria-labelledby="groups-h">
          <div className="section-h"><h2 id="groups-h">{t.yourGroups}</h2></div>
          <div className="groups">
            {groups.map((g) => {
              const b = groupBalance(g, friends, me);
              return (
                <button key={g.id} className="gtile" onClick={() => openGroup(g.id)}>
                  <span className="g-emoji" aria-hidden="true">{g.emoji}</span>
                  <b>{g.name}</b>
                  <span className="muted">{t.people(g.members.length)}</span>
                  <span className={`gbal num ${b > 0 ? "pos" : b < 0 ? "neg" : "zero"}`}>
                    {b === 0 ? t.settled : `${b > 0 ? t.owedShort : t.oweShort} ${jod(Math.abs(b))}`}
                  </span>
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

        <section aria-labelledby="friends-h">
          <div className="section-h">
            <h2 id="friends-h">{t.yourFriends}</h2>
            <button className="btn small soft" onClick={() => setOpen({ kind: "add" })}><Plus />{t.friend}</button>
          </div>
          {friends.length > 5 && (
            <input type="search" className="search" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.search} />
          )}
          <div className="list">
            {!friends.length ? (
              <div className="empty">
                <div className="empty-emoji" aria-hidden="true">🤝</div>
                <h3>{t.noOneYet}</h3>
                <div>{t.noOneYetHint}</div>
                {backend.mode === "demo" && (
                  <button className="link-btn" onClick={() => seedDemo(me, myName)}>{t.fillDemo}</button>
                )}
              </div>
            ) : !shown.length ? (
              <div className="empty">{t.noMatch(q)}</div>
            ) : shown.map((f) => {
              const cls = f.balance > 0 ? "pos" : f.balance < 0 ? "neg" : "zero";
              return (
                <button key={f.phone} className="row" onClick={() => setOpen({ kind: "friend", phone: f.phone })}>
                  <Avatar name={f.name} id={f.phone} />
                  <span className="who">
                    <b>{f.name}</b>
                    <span>{f.txns[0] ? `${f.txns[0].note || t.entry} · ${dateLabel(f.txns[0].createdAt, t)}` : t.nothingYet}</span>
                  </span>
                  <span className={`bal num ${cls}`}>
                    {cls === "zero" ? t.settled : jod(Math.abs(f.balance))}
                    <small>{cls === "pos" ? t.owesMe : cls === "neg" ? t.iOweThem : ""}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

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
