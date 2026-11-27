// The "my friends" and "settle my accounts" tabs.
import { useMemo, useState } from "react";
import { paidStates, settlementFor, signedFor, type Txn } from "../core/ledger";
import { waReminder } from "../core/messages";
import { jod } from "../core/money";
import { displayPhone, isLocalId, smsLink, waLink, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";
import { Arrow, Bell, Contacts, Dialpad, Handshake, Plus, Search, Share, UserPlus, Wallet, WhatsApp } from "./icons";
import { IconTile } from "./IconTile";
import { PayToggle } from "./PayToggle";
import type { Friend } from "./model";
import { canPickContacts, pickContacts } from "./contacts";
import { useDialect } from "./i18n";

// ───────────────────────── My friends ─────────────────────────

export function FriendsTab({ friends, onFriend, onAdd }: { friends: Friend[]; onFriend: (p: Phone) => void; onAdd: () => void }) {
  const { t } = useDialect();
  const { backend, me, toast, contacts } = useApp();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [reach, setReach] = useState<Friend | null>(null);
  const [remind, setRemind] = useState(false);
  // Reminders need a number to go to
  const theyOwe = friends.filter((f) => f.balance > 0 && !isLocalId(f.phone)).sort((a, b) => b.balance - a.balance);
  const query = q.trim();
  const digits = query.replace(/\D/g, "");
  const shown = friends
    .filter((f) => !query || f.name.includes(query) || (digits && f.phone.includes(digits)))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  async function fromContacts() {
    setBusy(true);
    try {
      const { picked, skipped } = await pickContacts();
      const fresh = picked.filter((c) => c.phone !== me);
      for (const c of fresh) await backend.saveContact(c);
      if (fresh.length === 1 && !skipped) onFriend(fresh[0].phone);
      else if (fresh.length) toast(t.contactsAdded(fresh.length) + (skipped ? `، ${t.contactsSkipped(skipped)}` : " ✓"));
      else if (skipped) toast(t.contactsSkipped(skipped).replace(/^و/, ""));
    } catch { /* closed the picker */ } finally { setBusy(false); }
  }

  return (
    <section aria-label={t.tabFriends} className="stack">
      <div className="tiles">
        <IconTile primary icon={<UserPlus />} label={t.addFriendBtn} onClick={onAdd} />
        {theyOwe.length > 0 && <IconTile icon={<Bell />} label={t.remindAll} onClick={() => setRemind(true)} />}
      </div>


      {friends.length > 5 && (
        <label className="searchbar">
          <Search />
          <input type="search" placeholder={t.searchFriends} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.searchFriends} />
        </label>
      )}

      <div className="list">
        {!friends.length ? (
          <div className="empty">
            <div className="empty-emoji" aria-hidden="true">🤝</div>
            <h3>{t.noOneYet}</h3>
            <div>{t.noFriendsHint}</div>
            {canPickContacts() && <button className="btn soft" disabled={busy} onClick={fromContacts}><Contacts />{t.fromContacts}</button>}
          </div>
        ) : !shown.length ? (
          <div className="empty">{t.noMatch(q)}</div>
        ) : shown.map((f) => {
          const cliq = contacts.find((c) => c.phone === f.phone)?.cliq;
          return (
            <div key={f.phone} className="frow soft contact">
              {/* The whole card opens the person; the number and CliQ have their own small actions on top */}
              <button className="frow-hit" aria-label={f.name} onClick={() => onFriend(f.phone)} />
              <Avatar name={f.name} id={f.phone} size={50} />
              <span className="who">
                <b className="cname">{f.name}</b>
                <span className="cmeta">
                  {isLocalId(f.phone)
                    ? <span className="muted" style={{ fontSize: 13 }}>{t.nameOnly}</span>
                    : <button className="phone-line num" dir="ltr" onClick={() => setReach(f)} aria-label={t.reachOut(f.name)}>{displayPhone(f.phone)}</button>}
                  {cliq && (
                    <button className="cliq-mini" dir="ltr" aria-label={t.copyCliqOf(f.name)}
                      onClick={async () => { try { await navigator.clipboard.writeText(cliq); toast(t.cliqCopied); } catch { /* */ } }}>
                      <i>CliQ</i>{cliq}
                    </button>
                  )}
                </span>
              </span>
              <span className="chev" aria-hidden="true">‹</span>
            </div>
          );
        })}
      </div>

      {reach && <ReachSheet friend={reach} onClose={() => setReach(null)} />}
      {remind && <RemindSheet friends={theyOwe} onClose={() => setRemind(false)} />}
    </section>
  );
}

/** Call, WhatsApp or text someone straight from the contacts list. */
function ReachSheet({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const { t } = useDialect();
  const tel = friend.phone;
  return (
    <Sheet title={friend.name} lead={<Avatar name={friend.name} id={friend.phone} size={44} />} onClose={onClose}>
      <p className="muted num" dir="ltr" style={{ margin: "-8px 0 0", textAlign: "end" }}>{displayPhone(friend.phone)}</p>
      <div className="reach">
        <a className="btn big outline" href={`tel:${tel}`}>📞 {t.call}</a>
        <a className="btn big outline" href={waLink(tel, "")} target="_blank" rel="noopener"><WhatsApp />{t.whatsapp}</a>
        <a className="btn big outline" href={`sms:${tel}`}>💬 {t.viaSms}</a>
      </div>
    </Sheet>
  );
}

/** Everyone who owes me, each with a ready WhatsApp reminder. */
function RemindSheet({ friends, onClose }: { friends: Friend[]; onClose: () => void }) {
  const { t, dialect } = useDialect();
  const { myCliq } = useApp();
  return (
    <Sheet title={t.remindTitle} onClose={onClose}>
      <p className="muted" style={{ margin: "-8px 0 0" }}>{t.remindHint}</p>
      <div className="list">
        {friends.map((f) => (
          <div key={f.phone} className="row static">
            <Avatar name={f.name} id={f.phone} />
            <span className="who"><b>{f.name}</b><span className="num">{jod(f.balance)}</span></span>
            <a className="btn small wa" href={waLink(f.phone, waReminder(f.name, f.balance, dialect, myCliq))} target="_blank" rel="noopener">{t.whatsapp}</a>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ───────────────────────── Settle my accounts ─────────────────────────


export function AccountsTab({ friends, onFriend, onAdd, part: openPart, setPart: setOpenPart }: {
  friends: Friend[]; onFriend: (p: Phone) => void; onAdd: () => void;
  part: "in" | "out" | null; setPart: (p: "in" | "out" | null) => void;
}) {
  const { t } = useDialect();
  const { me } = useApp();
  const [pick, setPick] = useState(false);
  const [newDebt, setNewDebt] = useState(false);
  const theyOwe = friends.filter((f) => f.balance > 0).sort((a, b) => b.balance - a.balance);
  const iOwe = friends.filter((f) => f.balance < 0).sort((a, b) => a.balance - b.balance);
  const sum = (l: Friend[]) => l.reduce((s, f) => s + Math.abs(f.balance), 0);
  const inSum = sum(theyOwe), outSum = sum(iOwe);

  // How much of what each friend came to owe has been paid back (0..1)
  const progress = (f: Friend) => {
    let grew = 0, back = 0;
    const sign = f.balance > 0 ? 1 : -1;
    for (const x of f.txns) {
      if (x.kind === "reversal") continue;
      const v = signedFor(x, me) * sign;
      if (v > 0) grew += v; else back += -v;
    }
    return grew ? Math.min(1, back / grew) : 0;
  };
  const both = inSum + outSum;

  const part = (key: "in" | "out", list: Friend[], total: number) => {
    const isOpen = openPart === key;
    const isIn = key === "in";
    if (!list.length) return null;
    return (
      <section className={`acc ocard ${key}`}>
        <button className="acc-more" aria-expanded={isOpen} onClick={() => setOpenPart(isOpen ? null : key)}>
          <span className="sq"><Arrow dir={isIn ? "down-left" : "up-right"} /></span>
          <span className="who">
            <b>{isIn ? t.owedToMe : t.iOwe}</b>
            <span>{isIn ? t.waitingFrom(list.length) : t.toPay(list.length)}</span>
          </span>
          <span className="acc-sum num">{jod(total)}</span>
          <span className="chev" aria-hidden="true">{isOpen ? "˄" : "˅"}</span>
        </button>
        {isOpen && (
          <div className="olist">
            {list.map((f) => {
              const pr = progress(f);
              return (
                <button key={f.phone} className="row orow" onClick={() => onFriend(f.phone)}>
                  <Avatar name={f.name} id={f.phone} size={40} />
                  <span className="who">
                    <b>{f.name}</b>
                    {pr > 0 && <span className="bar" aria-hidden="true"><i style={{ width: `${Math.round(pr * 100)}%` }} /></span>}
                    <span className="sub">{pr > 0 ? t.paidPct(Math.round(pr * 100)) : f.txns[0]?.note || t.entry}</span>
                  </span>
                  <span className={`bal num ${isIn ? "pos" : "neg"}`}>{jod(Math.abs(f.balance))}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <LatestBill />

      <section className="ocard hero">
        <div className="split2">
          <div className="cell">
            <span className="sq pos"><Arrow dir="down-left" /></span>
            <span className="lbl">{t.owedToMe}</span>
            <b className="num pos">{jod(inSum)}</b>
            <span className="bar" aria-hidden="true"><i className="pos" style={{ width: both ? `${(inSum / both) * 100}%` : "0%" }} /></span>
          </div>
          <div className="cell">
            <span className="sq neg"><Arrow dir="up-right" /></span>
            <span className="lbl">{t.iOwe}</span>
            <b className="num neg">{jod(outSum)}</b>
            <span className="bar" aria-hidden="true"><i className="neg" style={{ width: both ? `${(outSum / both) * 100}%` : "0%" }} /></span>
          </div>
        </div>
      </section>

      <OpenItems friends={friends} onFriend={onFriend} />

      {/* Always three side by side; the last two wait until there's something to pay or share */}
      <div className="tiles three">
        <IconTile primary icon={<Plus />} label={t.newDebtBtn} onClick={() => setNewDebt(true)} />
        <IconTile icon={<Wallet />} label={t.recordPayment} onClick={() => setPick(true)} disabled={!theyOwe.length && !iOwe.length} />
        <ShareSummary theyOwe={theyOwe} iOwe={iOwe} disabled={!theyOwe.length && !iOwe.length} />
      </div>

      {part("in", theyOwe, inSum)}
      {part("out", iOwe, outSum)}

      {(theyOwe.length > 0 || iOwe.length > 0) && <QuickSettle theyOwe={theyOwe} iOwe={iOwe} />}

      {newDebt && (
        <NewDebtSheet friends={friends} onClose={() => setNewDebt(false)}
          onPick={(p) => { setNewDebt(false); onFriend(p); }}
          onAdd={() => { setNewDebt(false); onAdd(); }} />
      )}
      {pick && <PickFriendSheet friends={[...theyOwe, ...iOwe]} onClose={() => setPick(false)} onPick={(p) => { setPick(false); onFriend(p); }} />}
    </>
  );
}

/** The most recent bill split I'm in, shown once until dismissed. */
function LatestBill() {
  const { t } = useDialect();
  const { txns, me } = useApp();
  const [hidden, setHidden] = useState<string | null>(() => { try { return localStorage.getItem("daftarna-seen-bill"); } catch { return null; } });
  const latest = txns
    .filter((x) => x.kind === "split" && x.billId && x.parties.includes(me) && Date.now() - x.createdAt < 2 * 86_400_000)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest || hidden === latest.billId) return null;
  const hide = () => { setHidden(latest.billId!); try { localStorage.setItem("daftarna-seen-bill", latest.billId!); } catch { /* */ } };
  return (
    <div className="bill-card">
      <span className="ic">✨</span>
      <div className="who">
        <div className="bill-head"><b>{!latest.note || latest.note.startsWith("فاتورة") ? t.billReady(latest.note.replace(/^فاتورة\s*/, "") || t.theBill) : t.opReady(latest.note)}</b><span className="status">{t.readyToSettle}</span></div>
        <span className="muted">{t.billReadyText}</span>
        <div className="actions">
          <button className="btn small" onClick={hide}>{t.gotIt}</button>
        </div>
      </div>
    </div>
  );
}

/** New debt: pick one of my friends, or add someone new by contacts or number. */
function NewDebtSheet({ friends, onClose, onPick, onAdd }: { friends: Friend[]; onClose: () => void; onPick: (p: Phone) => void; onAdd: () => void }) {
  const { t } = useDialect();
  const { backend, me, toast } = useApp();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const query = q.trim();
  const digits = query.replace(/\D/g, "");
  const shown = friends
    .filter((f) => !query || f.name.includes(query) || (digits && f.phone.includes(digits)))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  async function fromContacts() {
    setBusy(true);
    try {
      const { picked } = await pickContacts();
      const fresh = picked.filter((c) => c.phone !== me);
      for (const c of fresh) await backend.saveContact(c);
      if (fresh.length) onPick(fresh[0].phone);
    } catch { toast(t.tryAgain); } finally { setBusy(false); }
  }

  return (
    <Sheet title={t.newDebtWith} onClose={onClose}>
      <div className="add-cards">
        {canPickContacts() && (
          <button className="add-card" disabled={busy} onClick={fromContacts}>
            <span className="ic"><Contacts /></span>
            <b>{t.fromContacts}</b>
          </button>
        )}
        <button className="add-card" onClick={onAdd}>
          <span className="ic green"><Dialpad /></span>
          <b>{t.addByNumberTitle}</b>
        </button>
      </div>
      {friends.length > 0 && (
        <>
          <div className="section-h"><b>{t.orFromFriends}</b></div>
          {friends.length > 5 && (
            <label className="searchbar">
              <Search />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.searchFriends} aria-label={t.searchFriends} />
            </label>
          )}
          <div className="list">
            {shown.map((f) => (
              <button key={f.phone} className="row" onClick={() => onPick(f.phone)}>
                <Avatar name={f.name} id={f.phone} />
                <span className="who"><b>{f.name}</b></span>
                {f.balance !== 0 && <span className={`bal num ${f.balance > 0 ? "pos" : "neg"}`}>{jod(Math.abs(f.balance))}<small>{f.balance > 0 ? t.theyOweMeTab : t.iOweThemTab}</small></span>}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Pick who the payment was with, then their page opens. */
function PickFriendSheet({ friends, onClose, onPick }: { friends: Friend[]; onClose: () => void; onPick: (p: Phone) => void }) {
  const { t } = useDialect();
  return (
    <Sheet title={t.recordPayment} onClose={onClose}>
      <p className="muted" style={{ margin: "-8px 0 0" }}>{t.pickWho}</p>
      <div className="list">
        {friends.map((f) => (
          <button key={f.phone} className="row" onClick={() => onPick(f.phone)}>
            <Avatar name={f.name} id={f.phone} />
            <span className="who"><b>{f.name}</b></span>
            <span className={`bal num ${f.balance > 0 ? "pos" : "neg"}`}>{jod(Math.abs(f.balance))}<small>{f.balance > 0 ? t.theyOweMeTab : t.iOweThemTab}</small></span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function ShareSummary({ theyOwe, iOwe, disabled }: { theyOwe: Friend[]; iOwe: Friend[]; disabled?: boolean }) {
  const { t } = useDialect();
  const { toast } = useApp();
  const text = [
    t.shareHeader,
    ...theyOwe.map((f) => `• ${f.name}: ${t.theyOweMeTab} ${jod(f.balance)}`),
    ...iOwe.map((f) => `• ${f.name}: ${t.iOweThemTab} ${jod(-f.balance)}`),
  ].join("\n");
  async function share() {
    if (typeof navigator.share === "function") { try { await navigator.share({ text }); } catch { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(text); toast(t.copiedSummary); } catch { toast(t.tryAgain); }
  }
  return <IconTile icon={<Share />} label={t.shareShort} onClick={share} disabled={disabled} />;
}

/** One tap per person to record that the whole balance was paid. Asks once more before saving. */
function QuickSettle({ theyOwe, iOwe }: { theyOwe: Friend[]; iOwe: Friend[] }) {
  const { t } = useDialect();
  const { backend, me, myName, toast } = useApp();
  const [armed, setArmed] = useState<Phone | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function settle(f: Friend) {
    if (armed !== f.phone) { setArmed(f.phone); return; }
    const st = settlementFor(f.balance, me, f.phone, myName);
    if (!st) return;
    setBusy(true);
    try { await backend.addTxns([st]); toast(t.nowSettled); setArmed(null); }
    catch { toast(t.tryAgain); }
    finally { setBusy(false); }
  }

  const row = (f: Friend) => {
    const isIn = f.balance > 0;
    return (
      <div key={f.phone} className={`qs ${isIn ? "in" : "out"}`}>
        <span className="ic">{isIn ? <Handshake /> : <Wallet />}</span>
        <span className="who">
          <b>{isIn ? t.qsTheyPay(f.name) : t.qsIPay(f.name)} <span className="num">{jod(Math.abs(f.balance))}</span></b>
          <span>{f.txns[0]?.note || t.entry}</span>
        </span>
        <button className={`btn small ${isIn ? "paid" : "owe"}`} disabled={busy} onClick={() => settle(f)}>
          {armed === f.phone ? t.sure : isIn ? t.confirmReceived : t.payNow}
        </button>
      </div>
    );
  };

  return (
    <section className="ocard qs-card">
      <button className="acc-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sq"><Handshake /></span>
        <span className="who"><b>{t.qsTitle}</b><span>{t.qsCount(theyOwe.length + iOwe.length)}</span></span>
        <span className="chev" aria-hidden="true">{open ? "˄" : "˅"}</span>
      </button>
      {open && (
        <>
          <p className="muted" style={{ margin: 0 }}>{t.qsHint}</p>
          {theyOwe.map(row)}
          {iOwe.map(row)}
        </>
      )}
    </section>
  );
}

const DAY = 24 * 60 * 60 * 1000;
const OLD_AFTER_DAYS = 14;

/**
 * Debts not paid yet, across everyone: how many, the oldest few, and a nudge to
 * remind people whose debt to me is more than two weeks old.
 */
function OpenItems({ friends, onFriend }: { friends: Friend[]; onFriend: (p: Phone) => void }) {
  const { t, dialect } = useDialect();
  const { me, myCliq } = useApp();
  const [all, setAll] = useState(false);
  // Items paid from this card stay in view (as "تم الدفع") until the next visit
  const [paidNow, setPaidNow] = useState<Set<string>>(() => new Set());
  const items = useMemo(() => {
    const out: { f: Friend; t: Txn; left: number; mine: boolean; done: boolean }[] = [];
    for (const f of friends) {
      const st = paidStates(f.txns);
      for (const x of f.txns) {
        const p = st.get(x.id);
        if (p && (!p.done || paidNow.has(x.id))) out.push({ f, t: x, left: p.left, mine: signedFor(x, me) > 0, done: p.done });
      }
    }
    return out.sort((a, b) => a.t.createdAt - b.t.createdAt);
  }, [friends, me, paidNow]);
  const openCount = items.filter((i) => !i.done).length;
  if (!items.length) return null;
  const now = Date.now();
  const days = (x: Txn) => Math.floor((now - x.createdAt) / DAY);
  // People who've owed me for a while (and still owe overall)
  const late = [...new Map(items.filter((i) => !i.done && i.mine && !isLocalId(i.f.phone) && days(i.t) >= OLD_AFTER_DAYS && i.f.balance > 0).map((i) => [i.f.phone, i.f])).values()];
  const shown = all ? items : items.slice(0, 3);
  return (
    <section className="ocard open-items" aria-label={t.openTitle}>
      <div className="oi-head">
        <b>📌 {t.openTitle}</b>
        <span className="muted">{openCount ? t.openCount(openCount) : t.allPaid}</span>
      </div>
      {late.length > 0 && (
        <div className="oi-late">
          <span>⏰ {t.lateNudge(late.map((f) => f.name).join("، "), OLD_AFTER_DAYS)}</span>
          <div className="oi-late-btns">
            {late.slice(0, 3).map((f) => {
              const msg = waReminder(f.name, f.balance, dialect, myCliq);
              return (
                <span key={f.phone} className="send-pair">
                  <a className="btn small" href={smsLink(f.phone, msg)} aria-label={t.smsTo(f.name)}>💬 {f.name}</a>
                  <a className="btn small ghost" href={waLink(f.phone, msg)} target="_blank" rel="noopener" aria-label={t.waTo(f.name)}><WhatsApp /></a>
                </span>
              );
            })}
          </div>
        </div>
      )}
      <div className="olist">
        {shown.map(({ f, t: x, left, mine, done }) => (
          <div key={x.id} className="oi-row">
            <button className="row orow" onClick={() => onFriend(f.phone)}>
              <Avatar name={f.name} id={f.phone} size={34} />
              <span className="who">
                <b>{f.name}</b>
                <span className="muted">{x.note || t.debtWord} · {days(x) === 0 ? t.today : t.daysAgo(days(x))}</span>
              </span>
              <span className={`num ${mine ? "pos" : "neg"}${done ? " struck" : ""}`}>{jod(done ? x.amount : left)}</span>
            </button>
            <PayToggle txn={x} left={left} done={done} phone={f.phone} name={f.name} history={f.txns}
              onPaid={(id) => setPaidNow((s) => new Set(s).add(id))} />
          </div>
        ))}
      </div>
      {items.length > 3 && (
        <button className="link-btn acc-more" onClick={() => setAll(!all)}>{all ? t.showLess : t.showAllOpen(items.length)}</button>
      )}
    </section>
  );
}
