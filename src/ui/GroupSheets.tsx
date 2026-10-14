import { useEffect, useState } from "react";
import { jod } from "../core/money";
import type { Phone } from "../core/phone";
import type { Group } from "../data/backend";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";
import { Receipt, WhatsApp } from "./icons";
import { groupBalance } from "./model";
import { clearInvite, inviteLink } from "./invite";

export const GROUP_EMOJIS = ["🍕", "💼", "🏠", "☕", "✈️", "⚽", "🎓", "🎉"];

export function NewGroupSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { backend, toast } = useApp();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("اكتب اسم للجروب"); return; }
    setBusy(true);
    try {
      const g = await backend.createGroup(name.trim(), emoji);
      toast(`انعمل جروب ${g.name} ${g.emoji}`);
      onCreated(g.id);
    } catch {
      setErr("ما انعمل الجروب، جرّب كمان مرة.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="جروب جديد" onClose={onClose}>
      <form className="stack" onSubmit={create}>
        <div>
          <label className="l" htmlFor="gname">اسم الجروب</label>
          <input id="gname" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: الشلة، الشغل، البيت" maxLength={40} />
        </div>
        <div>
          <span className="l" id="emoji-l">اختار شكل</span>
          <div className="emoji-pick" role="radiogroup" aria-labelledby="emoji-l">
            {GROUP_EMOJIS.map((x) => (
              <button type="button" key={x} role="radio" aria-checked={emoji === x} onClick={() => setEmoji(x)}>{x}</button>
            ))}
          </div>
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn big block" disabled={busy}>{busy ? "لحظة…" : "اعمل الجروب"}</button>
        <p className="note">بعدها بتبعت رابط للأصحاب على واتساب أو Teams أو الإيميل، ومين ما فتحه بينضم.</p>
      </form>
    </Sheet>
  );
}

function InviteCard({ group }: { group: Group }) {
  const { toast } = useApp();
  const link = inviteLink(group.id);
  const text = `تعال انضم لجروب "${group.name}" ${group.emoji} على دفترنا، عشان نسجّل مين إله ومين عليه:\n${link}`;
  const canShare = typeof navigator.share === "function";
  async function share() {
    try { await navigator.share({ title: `جروب ${group.name}`, text }); } catch { /* cancelled */ }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast("انتسخ الرابط ✓"); }
    catch { toast("ما قدرنا ننسخ، انسخه يدوي"); }
  }
  return (
    <div className="invite">
      <b>اعزم أصحابك على الجروب</b>
      <span className="muted">ابعت الرابط بأي مكان: واتساب، Teams، أو الإيميل.</span>
      <div className="invite-link" dir="ltr">{link.replace(/^https?:\/\//, "")}</div>
      <div className="actions">
        {canShare && <button className="btn small" onClick={share}>شارك الرابط</button>}
        <button className="btn small soft" onClick={copy}>انسخ</button>
        <a className="btn small soft" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener"><WhatsApp />واتساب</a>
        <a className="btn small soft" href={`mailto:?subject=${encodeURIComponent(`جروب ${group.name} على دفترنا`)}&body=${encodeURIComponent(text)}`}>إيميل</a>
      </div>
    </div>
  );
}

export function GroupSheet({ id, onClose, onFriend, onAddMember, onSplit }: {
  id: string; onClose: () => void; onFriend: (p: Phone) => void; onAddMember: () => void; onSplit: () => void;
}) {
  const { groups, friends, me, myName } = useApp();
  const g = groups.find((x) => x.id === id);
  if (!g) return null;
  const net = groupBalance(g, friends, me);
  const others = g.members.filter((p) => p !== me);
  const alone = others.length === 0;

  return (
    <Sheet title={g.name} lead={<span className="g-emoji" aria-hidden="true">{g.emoji}</span>} onClose={onClose} full>
      <div className="muted" style={{ marginTop: -8 }}>{(g.members.length).toLocaleString("ar-JO")} {g.members.length === 1 ? "شخص" : "أشخاص"}</div>

      {!alone && (
        <div className={`net-strip ${net > 0 ? "pos" : net < 0 ? "neg" : "zero"}`}>
          <span>{net > 0 ? "إلك عند الجروب" : net < 0 ? "عليك للجروب" : "كل الحسابات خالصة"}</span>
          {net !== 0 && <b className="num">{jod(Math.abs(net))}</b>}
        </div>
      )}

      <InviteCard group={g} />

      <div className="section-h">
        <h3>الأعضاء</h3>
        <button className="btn small soft" onClick={onAddMember}>+ ضيف برقم التلفون</button>
      </div>
      <div className="list">
        <div className="row static">
          <Avatar name={myName} id={me} />
          <span className="who"><b>أنا ({myName})</b></span>
        </div>
        {others.map((p) => {
          const f = friends.find((x) => x.phone === p);
          const bal = f?.balance ?? 0;
          const cls = bal > 0 ? "pos" : bal < 0 ? "neg" : "zero";
          const name = f?.name ?? g.names[p] ?? p;
          return (
            <button key={p} className="row" onClick={() => onFriend(p)}>
              <Avatar name={name} id={p} />
              <span className="who"><b>{name}</b></span>
              <span className={`bal num ${cls}`}>
                {cls === "zero" ? "خالص" : jod(Math.abs(bal))}
                <small>{cls === "pos" ? "إلك عنده" : cls === "neg" ? "عليك إله" : ""}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className="sticky-foot">
        <button className="btn big warm" onClick={onSplit} disabled={alone}><Receipt />{alone ? "ضيف حدا عشان تقسّم" : "قسّم فاتورة بالجروب"}</button>
      </div>
    </Sheet>
  );
}

export function JoinSheet({ id, onClose, onJoined }: { id: string; onClose: () => void; onJoined: (id: string) => void }) {
  const { backend, groups, toast } = useApp();
  const [g, setG] = useState<Group | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const already = groups.some((x) => x.id === id);

  useEffect(() => {
    if (already) { clearInvite(); onJoined(id); return; }
    backend.getGroup(id).then(setG);
  }, [backend, id, already, onJoined]);

  const close = () => { clearInvite(); onClose(); };
  async function join() {
    setBusy(true);
    try {
      await backend.joinGroup(id);
      clearInvite();
      toast(`صرت بجروب ${g?.name ?? ""} ✓`);
      onJoined(id);
    } catch {
      toast("ما زبط الانضمام، جرّب كمان مرة");
      setBusy(false);
    }
  }

  return (
    <Sheet title="دعوة لجروب" onClose={close}>
      {g === undefined ? (
        <div className="center"><div className="spinner" /></div>
      ) : g === null ? (
        <div className="empty">
          <h3>الرابط مش شغال</h3>
          <div>اطلب من صاحبك يبعتلك الرابط كمان مرة.</div>
          <button className="btn" onClick={close}>تمام</button>
        </div>
      ) : (
        <div className="stack center-text">
          <div className="join-emoji" aria-hidden="true">{g.emoji}</div>
          <h3 className="join-name">{g.name}</h3>
          <div className="avatars" aria-label={`الأعضاء: ${g.members.map((p) => g.names[p]).join("، ")}`}>
            {g.members.slice(0, 6).map((p) => <Avatar key={p} name={g.names[p] || "؟"} id={p} size={40} />)}
          </div>
          <p className="muted" style={{ margin: 0 }}>{g.members.map((p) => g.names[p]).filter(Boolean).join("، ")}</p>
          <button className="btn big block" disabled={busy} onClick={join}>{busy ? "لحظة…" : "انضم للجروب"}</button>
          <button className="link-btn" onClick={close}>مش هلأ</button>
        </div>
      )}
    </Sheet>
  );
}
