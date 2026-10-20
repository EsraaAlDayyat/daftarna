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
import { useT } from "./i18n";

export const GROUP_EMOJIS = ["🍕", "💼", "🏠", "☕", "✈️", "⚽", "🎓", "🎉"];

export function NewGroupSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { backend, toast } = useApp();
  const t = useT();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr(t.groupNameMissing); return; }
    setBusy(true);
    try {
      const g = await backend.createGroup(name.trim(), emoji);
      toast(`${t.groupCreated(g.name)} ${g.emoji}`);
      onCreated(g.id);
    } catch {
      setErr(t.tryAgain);
      setBusy(false);
    }
  }

  return (
    <Sheet title={t.newGroup} onClose={onClose}>
      <form className="stack" onSubmit={create}>
        <div>
          <label className="l" htmlFor="gname">{t.groupName}</label>
          <input id="gname" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.groupNamePh} maxLength={40} />
        </div>
        <div>
          <span className="l" id="emoji-l">{t.pickIcon}</span>
          <div className="emoji-pick" role="radiogroup" aria-labelledby="emoji-l">
            {GROUP_EMOJIS.map((x) => (
              <button type="button" key={x} role="radio" aria-checked={emoji === x} onClick={() => setEmoji(x)}>{x}</button>
            ))}
          </div>
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn big block" disabled={busy}>{busy ? t.wait : t.createGroup}</button>
        <p className="note">{t.newGroupNote}</p>
      </form>
    </Sheet>
  );
}

function InviteCard({ group }: { group: Group }) {
  const { toast } = useApp();
  const t = useT();
  const link = inviteLink(group.id);
  const text = t.inviteText(`${group.name} ${group.emoji}`, link);
  const canShare = typeof navigator.share === "function";
  async function share() {
    try { await navigator.share({ title: t.inviteSubject(group.name), text }); } catch { /* cancelled */ }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast(t.copied); }
    catch { toast(t.copyFailed); }
  }
  return (
    <div className="invite">
      <b>{t.inviteTitle}</b>
      <span className="muted">{t.inviteHint}</span>
      <div className="invite-link" dir="ltr">{link.replace(/^https?:\/\//, "")}</div>
      <div className="actions">
        {canShare && <button className="btn small" onClick={share}>{t.share}</button>}
        <button className="btn small soft" onClick={copy}>{t.copy}</button>
        <a className="btn small soft" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener"><WhatsApp />{t.whatsapp}</a>
        <a className="btn small soft" href={`mailto:?subject=${encodeURIComponent(t.inviteSubject(group.name))}&body=${encodeURIComponent(text)}`}>{t.email}</a>
      </div>
    </div>
  );
}

export function GroupSheet({ id, onClose, onFriend, onAddMember, onSplit, onOrder }: {
  id: string; onClose: () => void; onFriend: (p: Phone) => void; onAddMember: () => void; onSplit: () => void;
  onOrder: (orderId: string) => void;
}) {
  const { groups, friends, me, myName, orders, backend, toast } = useApp();
  const [starting, setStarting] = useState(false);
  const [invite, setInvite] = useState<boolean | null>(null);
  const t = useT();
  const g = groups.find((x) => x.id === id);
  if (!g) return null;
  const net = groupBalance(g, friends, me);
  const others = g.members.filter((p) => p !== me);
  const alone = others.length === 0;
  // The invite card is open while you're alone in the group, and folds away once people have joined
  const showInvite = invite ?? alone;
  const openOrders = orders.filter((o) => o.groupId === g.id && o.status === "open").sort((a, b) => b.createdAt - a.createdAt);

  return (
    <Sheet title={g.name} lead={<span className="g-emoji" aria-hidden="true">{g.emoji}</span>} onClose={onClose} full>
      <div className="muted" style={{ marginTop: -8 }}>{t.people(g.members.length)}</div>

      {net !== 0 && (
        <div className={`net-strip ${net > 0 ? "pos" : "neg"}`}>
          <span>{net > 0 ? t.groupOwesMe : t.iOweGroup}</span>
          <b className="num">{jod(Math.abs(net))}</b>
        </div>
      )}

      <div className="section-h">
        <h3>{t.members}</h3>
        <div className="mini-actions">
          <button className="btn small soft" onClick={onAddMember}>{t.addByPhone}</button>
          <button className="btn small soft" aria-expanded={showInvite} onClick={() => setInvite(!showInvite)}>🔗 {t.inviteShort}</button>
        </div>
      </div>
      {showInvite && <InviteCard group={g} />}
      <div className="list">
        <div className="row static">
          <Avatar name={myName} id={me} />
          <span className="who"><b>{t.meNamed(myName)}</b></span>
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
                {cls === "zero" ? t.settled : jod(Math.abs(bal))}
                <small>{cls === "pos" ? t.owesMe : cls === "neg" ? t.iOweThem : ""}</small>
              </span>
            </button>
          );
        })}
      </div>

      {openOrders.length > 0 && (
        <section className="orders">
          <div className="section-h"><h3>{t.orders}</h3></div>
          {openOrders.map((o) => {
            const filled = o.parties.filter((p) => o.lines[p]?.trim()).length;
            return (
              <button key={o.id} className="row" onClick={() => onOrder(o.id)}>
                <span className="g-emoji" aria-hidden="true">🛒</span>
                <span className="who"><b>{o.title}</b><span>{t.orderFilled(filled, o.parties.length)}</span></span>
              </button>
            );
          })}
        </section>
      )}

      <div className="sticky-foot group-foot">
        {!alone && (
          <button className="btn big outline" disabled={starting} onClick={async () => {
            setStarting(true);
            try {
              const o = await backend.createOrder(g, t.orderTitle(new Date().toLocaleDateString("ar-JO", { weekday: "long" })));
              onOrder(o.id);
            } catch { toast(t.tryAgain); setStarting(false); }
          }}>🛒 {t.newOrder}</button>
        )}
        <button className="btn big warm" onClick={onSplit} disabled={alone}><Receipt />{alone ? t.addSomeoneFirst : t.splitInGroup}</button>
      </div>
    </Sheet>
  );
}

export function JoinSheet({ id, onClose, onJoined }: { id: string; onClose: () => void; onJoined: (id: string) => void }) {
  const { backend, groups, toast } = useApp();
  const t = useT();
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
      toast(t.joined(g?.name ?? ""));
      onJoined(id);
    } catch {
      toast(t.tryAgain);
      setBusy(false);
    }
  }

  return (
    <Sheet title={t.joinTitle} onClose={close}>
      {g === undefined ? (
        <div className="center"><div className="spinner" /></div>
      ) : g === null ? (
        <div className="empty">
          <h3>{t.badLink}</h3>
          <div>{t.badLinkHint}</div>
          <button className="btn" onClick={close}>{t.ok}</button>
        </div>
      ) : (
        <div className="stack center-text">
          <div className="join-emoji" aria-hidden="true">{g.emoji}</div>
          <h3 className="join-name">{g.name}</h3>
          <div className="avatars" aria-label={`${t.members}: ${g.members.map((p) => g.names[p]).join("، ")}`}>
            {g.members.slice(0, 6).map((p) => <Avatar key={p} name={g.names[p] || "؟"} id={p} size={40} />)}
          </div>
          <p className="muted" style={{ margin: 0 }}>{g.members.map((p) => g.names[p]).filter(Boolean).join("، ")}</p>
          <button className="btn big block" disabled={busy} onClick={join}>{busy ? t.wait : t.join}</button>
          <button className="link-btn" onClick={close}>{t.notNow}</button>
        </div>
      )}
    </Sheet>
  );
}
