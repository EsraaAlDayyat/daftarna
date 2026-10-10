import { useEffect, useMemo, useState } from "react";
import { totalsFor } from "../core/ledger";
import { formatJod, jod } from "../core/money";
import type { Phone } from "../core/phone";
import type { PushState } from "../data/backend";
import { seedDemo } from "../data/demoBackend";
import { useApp } from "./AppContext";
import { Menu, Plus, Receipt } from "./icons";
import { FriendSheet } from "./FriendSheet";
import { AddFriendSheet } from "./AddFriendSheet";
import { SplitFlow } from "./SplitFlow";
import { SettingsSheet } from "./SettingsSheet";
import { dateLabel } from "./util";

type Open = { kind: "friend"; phone: Phone } | { kind: "add" } | { kind: "split" } | { kind: "settings" } | null;

export function Home() {
  const app = useApp();
  const { friends, txns, me, myName, backend } = app;
  const [open, setOpen] = useState<Open>(null);
  const [q, setQ] = useState("");
  const [push, setPush] = useState<PushState | null>(null);
  useEffect(() => { backend.pushState().then(setPush).catch(() => setPush("unsupported")); }, [backend, open]);

  const { owedToMe, iOwe } = useMemo(() => totalsFor(txns, me), [txns, me]);
  const shown = friends.filter((f) => !q.trim() || f.name.includes(q.trim()) || f.phone.includes(q.replace(/\D/g, "")));
  const close = () => setOpen(null);
  const [today] = useState(() => new Date().toLocaleDateString("ar-JO", { weekday: "long", day: "numeric", month: "long" }));

  return (
    <>
      <div className="wrap" inert={!!open} aria-hidden={open ? true : undefined}>
        <div className="topbar">
          <div>
            <h1>دفترنا</h1>
            <div className="hello">أهلاً {myName} · {today}</div>
          </div>
          <button className="icon-btn" onClick={() => setOpen({ kind: "settings" })} aria-label="الإعدادات"><Menu /></button>
        </div>

        {backend.mode === "demo" && (
          <div className="banner"><span><b>نسخة تجريبية.</b> البيانات على هاد الجهاز بس. افتح تبويب تاني وسجّل برقم صاحبك عشان تشوف الطرف التاني.</span></div>
        )}
        {(push === "default" || push === "needsInstall") && (
          <div className="banner">
            <span style={{ flex: 1 }}>{push === "needsInstall" ? "عشان توصلك الإشعارات على الآيفون، ضيف التطبيق للشاشة الرئيسية." : "فعّل الإشعارات عشان تعرف أول بأول مين ضاف عليك."}</span>
            <button className="btn small" onClick={() => setOpen({ kind: "settings" })}>{push === "needsInstall" ? "كيف؟" : "فعّل"}</button>
          </div>
        )}

        <div className="totals">
          <div className="tot mine"><div className="lbl">إلك عند الناس</div><div className={`amt num${owedToMe ? "" : " is-zero"}`}>{formatJod(owedToMe)}<small>د.أ</small></div></div>
          <div className="tot theirs"><div className="lbl">عليك للناس</div><div className={`amt num${iOwe ? "" : " is-zero"}`}>{formatJod(iOwe)}<small>د.أ</small></div></div>
        </div>

        <div className="bar">
          <input type="search" placeholder="دوّر على اسم…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="دوّر على اسم" />
          <button className="btn" onClick={() => setOpen({ kind: "add" })}><Plus />صاحب</button>
        </div>

        <div className="ledger">
          {!friends.length ? (
            <div className="empty">
              <h3>الدفتر فاضي</h3>
              <div>ضيف أصحابك برقم تلفونهم، أو صوّر أول فاتورة وقسّمها.</div>
              <button className="btn" onClick={() => setOpen({ kind: "add" })}><Plus />ضيف صاحب</button>
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
                <span className="av">{f.name.trim()[0] ?? "؟"}</span>
                <span className="who">
                  <b>{f.name}</b>
                  <span>{f.lastAt ? `آخر حركة: ${dateLabel(f.lastAt)}` : "ما في حركات"}</span>
                </span>
                <span className={`bal num ${cls}`}>
                  {cls === "zero" ? "خالص" : jod(f.balance)}
                  <small>{cls === "pos" ? "إلك عنده" : cls === "neg" ? "عليك إله" : ""}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button className="btn big fab" inert={!!open} aria-hidden={open ? true : undefined} onClick={() => setOpen({ kind: "split" })}><Receipt />قسّم فاتورة</button>

      {open?.kind === "friend" && <FriendSheet phone={open.phone} onClose={close} />}
      {open?.kind === "add" && <AddFriendSheet onClose={close} onAdded={(p) => setOpen({ kind: "friend", phone: p })} />}
      {open?.kind === "split" && <SplitFlow onClose={close} />}
      {open?.kind === "settings" && <SettingsSheet onClose={close} />}
    </>
  );
}
