// The "my friends" and "settle my accounts" tabs.
import { useMemo, useState } from "react";
import { settlementFor, signedFor } from "../core/ledger";
import { waReminder } from "../core/messages";
import { formatJod, jod } from "../core/money";
import { waLink, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";
import { Arrow, Chat, Contacts, Dialpad, Handshake, Plus, Search, Share, Trend, Wallet } from "./icons";
import type { Friend } from "./model";
import { canPickContacts, pickContacts } from "./contacts";
import { useDialect } from "./i18n";
import { dateLabel } from "./util";

// ───────────────────────── My friends ─────────────────────────

export function FriendsTab({ friends, onFriend, onAdd }: { friends: Friend[]; onFriend: (p: Phone) => void; onAdd: () => void }) {
  const { t } = useDialect();
  const { backend, me, toast, comments } = useApp();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState(false);
  const query = q.trim();
  const digits = query.replace(/\D/g, "");
  const shown = friends
    .filter((f) => !query || f.name.includes(query) || (digits && f.phone.includes(digits)))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const owedToMe = friends.reduce((s, f) => s + Math.max(0, f.balance), 0);
  const iOwe = friends.reduce((s, f) => s + Math.max(0, -f.balance), 0);

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
      <label className="searchbar">
        <Search />
        <input type="search" placeholder={t.searchFriends} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.searchFriends} />
        <span className="count num" aria-hidden="true">{friends.length.toLocaleString("ar-JO")}</span>
      </label>

      <div className="add-cards">
        {canPickContacts() && (
          <button className="add-card" disabled={busy} onClick={fromContacts}>
            <span className="ic"><Contacts /></span>
            <span className="tag">{t.androidOnly}</span>
            <b>{t.fromContacts}</b>
            <span className="muted">{t.fromContactsHint}</span>
          </button>
        )}
        <button className="add-card" onClick={onAdd}>
          <span className="ic green"><Dialpad /></span>
          <span className="tag green" dir="ltr">+962</span>
          <b>{t.addByNumberTitle}</b>
          <span className="muted">{t.addByNumberHint}</span>
        </button>
      </div>

      {friends.length > 0 && (
        <div className="summary-bar">
          <b><Handshake />{t.friendsSummary}</b>
          <span className="pos num"><Arrow dir="down" />{jod(owedToMe)} {t.owedShortMe}</span>
          <span className="dot" aria-hidden="true">·</span>
          <span className="neg num"><Arrow dir="up" />{jod(iOwe)} {t.oweShortMe}</span>
        </div>
      )}

      <div className="list">
        {!friends.length ? (
          <div className="empty">
            <div className="empty-emoji" aria-hidden="true">🤝</div>
            <h3>{t.noOneYet}</h3>
            <div>{t.noFriendsHint}</div>
          </div>
        ) : !shown.length ? (
          <div className="empty">{t.noMatch(q)}</div>
        ) : shown.map((f) => {
          const n = comments.filter((c) => f.txns.some((x) => x.id === c.txnId)).length;
          const cls = f.balance > 0 ? "pos" : f.balance < 0 ? "neg" : "zero";
          return (
            <button key={f.phone} className="frow" onClick={() => onFriend(f.phone)}>
              <Avatar name={f.name} id={f.phone} size={56} />
              <span className="who">
                <span className="name-line">
                  <b>{f.name}</b>
                  {n > 0 && <span className="cchip num"><Chat />{n.toLocaleString("ar-JO")}</span>}
                </span>
                <span>{f.txns[0] ? `${f.txns[0].note || t.entry} · ${dateLabel(f.txns[0].createdAt, t)}` : t.nothingYet}</span>
              </span>
              <span className="side">
                <small>{cls === "pos" ? t.theyOweMeTab : cls === "neg" ? t.iOweThemTab : t.currentBalance}</small>
                <span className={`pill num ${cls}`}>
                  {jod(Math.abs(f.balance))}
                  {cls === "zero" ? <Wallet /> : <Trend dir={cls === "pos" ? "up" : "down"} />}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {friends.some((f) => f.balance > 0) && (
        <div className="tip-card">
          <span className="ic"><Chat /></span>
          <span className="who"><b>{t.remindTitle}</b><span className="muted">{t.remindHint}</span></span>
          <button className="btn small soft" onClick={() => setRemind(true)}>{t.share}</button>
        </div>
      )}
      {remind && <RemindSheet friends={friends.filter((f) => f.balance > 0)} onClose={() => setRemind(false)} />}
    </section>
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
  const theyOwe = friends.filter((f) => f.balance > 0).sort((a, b) => b.balance - a.balance);
  const iOwe = friends.filter((f) => f.balance < 0).sort((a, b) => a.balance - b.balance);
  const sum = (l: Friend[]) => l.reduce((s, f) => s + Math.abs(f.balance), 0);
  const inSum = sum(theyOwe), outSum = sum(iOwe), net = inSum - outSum;

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

  const part = (key: "in" | "out", list: Friend[], total: number) => {
    const isOpen = openPart === key;
    const isIn = key === "in";
    return (
      <div className={`acc ${key}`}>
        <div className="acc-top">
          <span className="ic"><Arrow dir={isIn ? "down-left" : "up-right"} /></span>
          <span className="who">
            <b>{isIn ? t.owedToMe : t.iOwe}</b>
            <span>{list.length ? (isIn ? t.waitingFrom(list.length) : t.toPay(list.length)) : t.nobodyHere}</span>
          </span>
          <span className="acc-sum num">{formatJod(total)} <small>{t.jod}</small></span>
        </div>
        {list.length > 0 && (
          <button className="acc-more" aria-expanded={isOpen} onClick={() => setOpenPart(isOpen ? null : key)}>
            <span className="avatars">
              {list.slice(0, 3).map((f) => <Avatar key={f.phone} name={f.name} id={f.phone} size={34} />)}
            </span>
            <span>{isOpen ? t.hideDetails : isIn ? t.detailsPerPerson : t.detailsAndPay}</span>
            <span aria-hidden="true">{isOpen ? "˄" : "‹"}</span>
          </button>
        )}
        {isOpen && list.length > 0 && (
          <div className="list">
            {list.map((f) => (
              <button key={f.phone} className="row" onClick={() => onFriend(f.phone)}>
                <Avatar name={f.name} id={f.phone} />
                <span className="who"><b>{f.name}</b><span>{f.txns[0]?.note || t.entry}</span></span>
                <span className={`bal num ${isIn ? "pos" : "neg"}`}>{jod(Math.abs(f.balance))}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <LatestBill />

      <div className="net-card">
        <div className="net-head">
          <span className="muted">{t.netTitle}</span>
          {friends.length > 0 && (
            <span className={`status ${net >= 0 ? "pos" : "neg"}`}>● {net >= 0 ? t.statusGood : t.statusOwe}</span>
          )}
        </div>
        <div className={`net-big num ${net > 0 ? "" : net < 0 ? "neg" : ""}`}>{net > 0 ? "+" : net < 0 ? "−" : ""}{formatJod(Math.abs(net))} <small>{t.jod}</small></div>
        <p>{net > 0 ? t.netMore(jod(net)) : net < 0 ? t.netLess(jod(-net)) : t.netZero}</p>
        {rate !== null && (
          <div className="rate"><Trend dir="up" /><span>{t.collectRate(rate)}</span></div>
        )}
      </div>

      {part("in", theyOwe, inSum)}
      {part("out", iOwe, outSum)}

      <button className="btn big block new-debt" onClick={() => setNewDebt(true)}><Plus />{t.newDebtWith}</button>

      {(theyOwe.length > 0 || iOwe.length > 0) && (
        <div className="pay-row">
          <button className="btn big paid" onClick={() => setPick(true)}><Wallet />{t.recordPayment}</button>
          <ShareSummary theyOwe={theyOwe} iOwe={iOwe} />
        </div>
      )}

      {(theyOwe.length > 0 || iOwe.length > 0) && <QuickSettle theyOwe={theyOwe} iOwe={iOwe} />}

      <div className="tip-card soft">
        <span className="ic"><Handshake /></span>
        <span className="who"><b>{t.friendshipTitle}</b><span className="muted">{t.friendshipText}</span></span>
      </div>

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
    <section className="qs-card">
      <div className="section-h">
        <h3>{t.qsTitle}</h3>
        <span className="status">{t.qsCount(theyOwe.length + iOwe.length)}</span>
      </div>
      <p className="muted" style={{ margin: 0 }}>{t.qsHint}</p>
      {theyOwe.map(row)}
      {iOwe.map(row)}
    </section>
  );
}
