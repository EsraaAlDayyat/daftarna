// Who gets notified about a transaction, and what the notification says.
import { notificationText } from "../../src/core/messages";
import { signedFor, type Txn } from "../../src/core/ledger";

/** Every party to the transaction except its author. */
export function recipientsOf(t: Txn): string[] {
  return t.parties.filter((p) => p !== t.createdBy);
}

/** Balance between `recipient` and `other` after the transaction. */
function balanceBetween(all: Txn[], recipient: string, other: string): number {
  return all
    .filter((x) => x.parties.includes(recipient) && x.parties.includes(other))
    .reduce((s, x) => s + signedFor(x, recipient), 0);
}

export function pushPayload(t: Txn, recipient: string, all: Txn[]) {
  const other = t.creditor === recipient ? t.debtor : t.creditor;
  const body = notificationText(t, recipient, balanceBetween(all, recipient, other));
  return { title: "دفترنا", body, url: "/", tag: `txn-${t.id}` };
}
