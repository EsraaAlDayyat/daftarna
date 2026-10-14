import { useState } from "react";
import { normalizePhone, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";
import { useT } from "./i18n";

export function AddFriendSheet({ onClose, onAdded, groupId }: { onClose: () => void; onAdded: (p: Phone) => void; groupId?: string }) {
  const { backend, me, contacts, toast, groups } = useApp();
  const group = groups.find((g) => g.id === groupId);
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePhone(phone);
    if (!name.trim()) { setErr(t.nameMissing); return; }
    if (!p) { setErr(t.badPhone); return; }
    if (p === me) { setErr(t.thatsYou); return; }
    setBusy(true);
    try {
      await backend.saveContact({ phone: p, name: name.trim() });
      if (group) await backend.addGroupMember(group.id, { phone: p, name: name.trim() });
      const u = await backend.lookupUser(p).catch(() => null);
      const existed = contacts.some((c) => c.phone === p);
      toast(group ? t.addedToGroup(name.trim()) : existed ? t.nameUpdated : u ? t.addedHasApp(name.trim()) : t.added(name.trim()));
      onAdded(p);
    } catch {
      setErr(t.tryAgain);
      setBusy(false);
    }
  }

  return (
    <Sheet title={group ? t.addToGroupTitle(group.name) : t.newFriend} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="full">
          <label className="l" htmlFor="fname">{t.name}</label>
          <input id="fname" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePhFriend} maxLength={40} />
        </div>
        <div className="full">
          <label className="l" htmlFor="fphone">{t.phone}</label>
          <input id="fphone" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="079 123 4567" />
        </div>
        {err && <p className="err full">{err}</p>}
        <button className="btn big full" disabled={busy}>{t.save}</button>
        <p className="note full">{t.addFriendNote}</p>
      </form>
    </Sheet>
  );
}
