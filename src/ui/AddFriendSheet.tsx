import { useState } from "react";
import { normalizePhone, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Sheet } from "./Sheet";

export function AddFriendSheet({ onClose, onAdded, groupId }: { onClose: () => void; onAdded: (p: Phone) => void; groupId?: string }) {
  const { backend, me, contacts, toast, groups } = useApp();
  const group = groups.find((g) => g.id === groupId);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePhone(phone);
    if (!name.trim()) { setErr("اكتب الاسم"); return; }
    if (!p) { setErr("الرقم مش مزبوط. اكتبه زي هيك: 079 123 4567"); return; }
    if (p === me) { setErr("هاد رقمك 🙂"); return; }
    setBusy(true);
    try {
      await backend.saveContact({ phone: p, name: name.trim() });
      if (group) await backend.addGroupMember(group.id, { phone: p, name: name.trim() });
      const u = await backend.lookupUser(p).catch(() => null);
      const existed = contacts.some((c) => c.phone === p);
      toast(group ? `انضاف ${name.trim()} للجروب ✓` : existed ? "انحدّث الاسم" : u ? `انضاف ${name.trim()}، وعنده التطبيق ✓` : `انضاف ${name.trim()}`);
      onAdded(p);
    } catch {
      setErr("ما انحفظ، جرّب كمان مرة.");
      setBusy(false);
    }
  }

  return (
    <Sheet title={group ? `ضيف شخص على ${group.name}` : "صاحب جديد"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="full">
          <label className="l" htmlFor="fname">الاسم</label>
          <input id="fname" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: أحمد" maxLength={40} />
        </div>
        <div className="full">
          <label className="l" htmlFor="fphone">رقم التلفون</label>
          <input id="fphone" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="079 123 4567" />
        </div>
        {err && <p className="err full">{err}</p>}
        <button className="btn big full" disabled={busy}>احفظ</button>
        <p className="note full">إذا عنده التطبيق رح يشوف الحركات عنده. وإذا لا، بتقدر تبعتله واتساب، ولما يسجّل بنفس الرقم بيلاقي كل إشي.</p>
      </form>
    </Sheet>
  );
}
