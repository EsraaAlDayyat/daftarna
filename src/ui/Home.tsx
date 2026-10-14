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
            <div className="hello">أهلاً {myName} 👋</div>
            <h1>دفترنا</h1>
          </div>
          <button className="me-btn" onClick={() => setOpen({ kind: "settings" })} aria-label="الإعدادات">
            <Avatar name={myName} id={me} size={46} />
          </button>
        </div>

        <div className="hero-card">
          <div className="lbl">{net > 0 ? "الصافي إلك" : net < 0 ? "الصافي عليك" : "حساباتك"}</div>
          <div className="big num">{net === 0 ? "خالصة ✨" : <>{formatJod(Math.abs(net))} <small>د.أ</small></>}</div>
          <div className="pills">
            <div className="pill"><span>إلك عند الناس</span><b className="num">{formatJod(owedToMe)}</b></div>
            <div className="pill"><span>عليك للناس</span><b className="num">{formatJod(iOwe)}</b></div>
          </div>
        </div>

        {backend.mode === "demo" && (
          <div className="banner"><span><b>نسخة تجريبية.</b> البيانات على هاد الجهاز بس.</span></div>
        )}
        {(push === "default" || push === "needsInstall") && (
          <div className="banner">
            <span style={{ flex: 1 }}>{push === "needsInstall" ? "عشان توصلك الإشعارات على الآيفون، ضيف التطبيق للشاشة الرئيسية." : "فعّل الإشعارات عشان تعرف أول بأول مين ضاف عليك."}</span>
            <button className="btn small" onClick={() => setOpen({ kind: "settings" })}>{push === "needsInstall" ? "كيف؟" : "فعّل"}</button>
          </div>
        )}

        <section aria-labelledby="groups-h">
          <div className="section-h"><h2 id="groups-h">جروباتك</h2></div>
          <div className="groups">
            {groups.map((g) => {
              const b = groupBalance(g, friends, me);
              return (
                <button key={g.id} className="gtile" onClick={() => openGroup(g.id)}>
                  <span className="g-emoji" aria-hidden="true">{g.emoji}</span>
                  <b>{g.name}</b>
                  <span className="muted">{g.members.length.toLocaleString("ar-JO")} {g.members.length === 1 ? "شخص" : "أشخاص"}</span>
                  <span className={`gbal num ${b > 0 ? "pos" : b < 0 ? "neg" : "zero"}`}>
                    {b === 0 ? "خالص" : `${b > 0 ? "إلك" : "عليك"} ${jod(Math.abs(b))}`}
                  </span>
                </button>
              );
            })}
            <button className="gtile new" onClick={() => setOpen({ kind: "newGroup" })}>
              <span className="g-emoji" aria-hidden="true"><Plus /></span>
              <b>جروب جديد</b>
              <span className="muted">للشلة، للشغل، للبيت</span>
            </button>
          </div>
        </section>

        <section aria-labelledby="friends-h">
          <div className="section-h">
            <h2 id="friends-h">أصحابك</h2>
            <button className="btn small soft" onClick={() => setOpen({ kind: "add" })}><Plus />صاحب</button>
          </div>
          {friends.length > 5 && (
            <input type="search" className="search" placeholder="دوّر على اسم…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="دوّر على اسم" />
          )}
          <div className="list">
            {!friends.length ? (
              <div className="empty">
                <div className="empty-emoji" aria-hidden="true">🤝</div>
                <h3>لسا ما في حدا</h3>
                <div>اعمل جروب واعزم الشلة، أو ضيف صاحب برقم تلفونه.</div>
                {backend.mode === "demo" && (
                  <button className="link-btn" onClick={() => seedDemo(me, myName)}>أو عبّي بيانات تجريبية</button>
                )}
              </div>
            ) : !shown.length ? (
              <div className="empty">ما في اسم بطابق "{q}"</div>
            ) : shown.map((f) => {
              const cls = f.balance > 0 ? "pos" : f.balance < 0 ? "neg" : "zero";
              return (
                <button key={f.phone} className="row" onClick={() => setOpen({ kind: "friend", phone: f.phone })}>
                  <Avatar name={f.name} id={f.phone} />
                  <span className="who">
                    <b>{f.name}</b>
                    <span>{f.txns[0] ? `${f.txns[0].note || "حركة"} · ${dateLabel(f.txns[0].createdAt)}` : "ما في حركات"}</span>
                  </span>
                  <span className={`bal num ${cls}`}>
                    {cls === "zero" ? "خالص" : jod(Math.abs(f.balance))}
                    <small>{cls === "pos" ? "إلك عنده" : cls === "neg" ? "عليك إله" : ""}</small>
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
