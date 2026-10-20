// The "my friends" and "settle my accounts" tabs.
import { useMemo, useState } from "react";
import { settlementFor, signedFor } from "../core/ledger";
import { waReminder } from "../core/messages";
import { jod } from "../core/money";
import { displayPhone, waLink, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";
import { Arrow, Contacts, Dialpad, Handshake, Plus, Search, Share, Trend, Wallet, WhatsApp } from "./icons";
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
      <button className="btn add-small add-friend" onClick={onAdd}><Plus />{t.addFriendBtn}</button>


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
                  <button className="phone-line num" dir="ltr" onClick={() => setReach(f)} aria-label={t.reachOut(f.name)}>{displayPhone(f.phone)}</button>
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

const MONTH = 30 * 86_400_000;

export function AccountsTab({ friends, onFriend, onAdd, part: openPart, setPart: setOpenPart }: {
  friends: Friend[]; onFriend: (p: Phone) => void; onAdd: () => void;
  part: "in" | "out" | null; setPart: (p: "in" | "out" | null) => void;
}) {
  const { t } = useDialect();
  const { txns, me } = useApp();
  const [pick, setPick] = useState(false);
  const [newDebt, setNewDebt] = useState(false);
  const [remind, setRemind] = useState(false);
  const theyOwe = friends.filter((f) => f.balance > 0).sort((a, b) => b.balance - a.balance);
  const iOwe = friends.filter((f) => f.balance < 0).sort((a, b) => a.balance - b.balance);
  const sum = (l: Friend[]) => l.reduce((s, f) => s + Math.abs(f.balance), 0);
  const inSum = sum(theyOwe), outSum = sum(iOwe);

  // Of what people came to owe me in the last 30 days, how much they've paid back
  const rate = useMemo(() => {
    const since = Date.now() - MONTH;
    let lent = 0, back = 0;
    for (const x of txns) {
      if (x.createdAt < since || !x.parties.includes(me)) continue;
      const v = signedFor(x, me);
      if (v > 0 && x.kind !== "reversal" && x.kind !== "settle" && x.kind !== "repay") lent += v;
      if (v < 0 && (x.kind === "settle" || x.kind === "repay")) back += -v;
    }
    return lent ? Math.min(100, Math.round((back / lent) * 100)) : null;
  }, [txns, me]);

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

      {rate !== null && rate > 0 && (
        <div className="ocard line-card">
          <span className="sq"><Trend dir="up" /></span>
          <span className="who">{t.collectRate(rate)}</span>
          <span className="pill-o num">{rate.toLocaleString("ar-JO")}٪</span>
        </div>
      )}

      <button className="btn add-small new-debt" onClick={() => setNewDebt(true)}><Plus />{t.newDebtWith}</button>
      {(theyOwe.length > 0 || iOwe.length > 0) && (
        <div className="pay-row">
          <button className="btn big outline" onClick={() => setPick(true)}><Wallet />{t.recordPayment}</button>
          <ShareSummary theyOwe={theyOwe} iOwe={iOwe} />
        </div>
      )}

      {part("in", theyOwe, inSum)}
      {theyOwe.length > 0 && <button className="link-btn remind-link" onClick={() => setRemind(true)}>📣 {t.remindAll}</button>}
      {part("out", iOwe, outSum)}

      {(theyOwe.length > 0 || iOwe.length > 0) && <QuickSettle theyOwe={theyOwe} iOwe={iOwe} />}

      {newDebt && (
        <NewDebtSheet friends={friends} onClose={() => setNewDebt(false)}
          onPick={(p) => { setNewDebt(false); onFriend(p); }}
          onAdd={() => { setNewDebt(false); onAdd(); }} />
      )}
      {remind && <RemindSheet friends={theyOwe} onClose={() => setRemind(false)} />}
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
        <div className="bill-head"><b>{t.billReady(latest.note.replace(/^فاتورة\s*/, "") || t.theBill)}</b><span className="status">{t.readyToSettle}</span></div>
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

function ShareSummary({ theyOwe, iOwe }: { theyOwe: Friend[]; iOwe: Friend[] }) {
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
  return <button className="icon-btn big" onClick={share} aria-label={t.shareSummary}><Share /></button>;
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
