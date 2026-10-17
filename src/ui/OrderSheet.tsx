import { useEffect, useRef, useState } from "react";
import type { Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";
import { useT } from "./i18n";

/**
 * A group order: next to each member, what they want. Only the dish, no price;
 * prices come from the bill, which is uploaded from the bottom of this sheet.
 */
export function OrderSheet({ id, onClose, onBill }: { id: string; onClose: () => void; onBill: () => void }) {
  const { orders, groups, friends, me, myName } = useApp();
  const t = useT();
  const o = orders.find((x) => x.id === id);
  const g = groups.find((x) => x.id === o?.groupId);
  if (!o) return null;
  const nameOf = (p: Phone) => (p === me ? t.meNamed(myName) : friends.find((f) => f.phone === p)?.name ?? g?.names[p] ?? p);
  const filled = o.parties.filter((p) => o.lines[p]?.trim()).length;
  // Me first, then everyone else as they appear in the group
  const people = [me, ...o.parties.filter((p) => p !== me)].filter((p) => o.parties.includes(p));

  return (
    <Sheet title={o.title} lead={<span className="g-emoji" aria-hidden="true">🛒</span>} onClose={onClose} full>
      <p className="muted" style={{ margin: "-8px 0 0" }}>{t.orderHint}</p>
      <div className="list">
        {people.map((p) => <OrderLine key={p} orderId={o.id} phone={p} name={nameOf(p)} value={o.lines[p] ?? ""} />)}
      </div>
      <div className="sticky-foot">
        <button className="btn big warm" disabled={!filled} onClick={onBill}>🧾 {filled ? t.uploadBill : t.orderEmpty}</button>
      </div>
    </Sheet>
  );
}

/** One person's line. Saves when you leave the field, so a slow network doesn't eat letters. */
function OrderLine({ orderId, phone, name, value }: { orderId: string; phone: Phone; name: string; value: string }) {
  const { backend, toast } = useApp();
  const t = useT();
  const [text, setText] = useState(value);
  const editing = useRef(false);
  // Someone else filled it in: show their version unless I'm typing
  useEffect(() => { if (!editing.current) setText(value); }, [value]);

  async function save() {
    editing.current = false;
    const v = text.trim().slice(0, 200);
    if (v === value.trim()) return;
    try { await backend.setOrderLine(orderId, phone, v); }
    catch { toast(t.tryAgain); }
  }

  return (
    <div className="row static order-line">
      <Avatar name={name} id={phone} size={40} />
      <span className="who">
        <b>{name}</b>
        <input
          value={text} placeholder={t.orderPh} aria-label={t.orderOf(name)} maxLength={200}
          onFocus={() => { editing.current = true; }}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </span>
    </div>
  );
}
