import { useState } from "react";
import { paymentFor, type Txn } from "../core/ledger";
import { waTxnMessage } from "../core/messages";
import { smsLink, waLink, type Phone } from "../core/phone";
import { useApp } from "./AppContext";
import { balanceAfter } from "./model";
import { getNotifyVia } from "./notifyPref";
import { useDialect } from "./i18n";

/** Tells a friend without the app about a new entry: the SMS or WhatsApp app opens with the words ready. */
export function tellFriend(t: Txn, phone: Phone, name: string, history: Txn[], me: Phone, reg: boolean | null, dialect: "jo" | "eg") {
  if (reg === true) return; // they get a notification in the app
  const via = getNotifyVia();
  if (via === "ask") return;
  const msg = waTxnMessage(t, me, name, balanceAfter([...history, t], me), dialect);
  if (via === "sms") {
    // A hook for the tutorial recorder, which can't open the SMS app
    const hook = (window as unknown as { __daftarnaOpenSms?: (url: string, msg: string) => void }).__daftarnaOpenSms;
    if (hook) hook(smsLink(phone, msg), msg);
    else location.href = smsLink(phone, msg);
  } else window.open(waLink(phone, msg), "_blank", "noopener");
}

/**
 * A small status icon next to a debt: "لم يُدفع" (empty circle). One tap records
 * the payment and it turns into a green "تم الدفع" check.
 */
export function PayToggle({ txn, left, done, phone, name, history, onPaid }: {
  txn: Txn; left: number; done: boolean; phone: Phone; name: string; history: Txn[]; onPaid?: (id: string) => void;
}) {
  const { backend, me, myName, toast, registered } = useApp();
  const { t, dialect } = useDialect();
  const [busy, setBusy] = useState(false);
  const [justPaid, setJustPaid] = useState(false);
  const paid = done || justPaid;

  async function pay() {
    if (paid || busy) return;
    setBusy(true);
    try {
      const [p] = await backend.addTxns([paymentFor(txn, left, me, myName)]);
      setJustPaid(true);
      onPaid?.(txn.id);
      toast(t.markedPaid);
      tellFriend(p, phone, name, history, me, registered(phone), dialect);
    } catch { toast(t.tryAgain); }
    finally { setBusy(false); }
  }

  return (
    <button type="button" className={`pay-toggle${paid ? " paid" : ""}`} onClick={pay} disabled={busy || paid}
      aria-label={paid ? `${t.paidTag}: ${txn.note || t.debtWord}` : `${t.notPaid}: ${txn.note || t.debtWord}. ${t.tapToMarkPaid}`}>
      <span className="pt-ic" aria-hidden="true">
        {paid
          ? <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="m7.5 12.5 3 3 6-6.5" /></svg>
          : <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" /></svg>}
      </span>
      <span className="pt-lbl">{paid ? t.paidTag : t.notPaid}</span>
    </button>
  );
}
