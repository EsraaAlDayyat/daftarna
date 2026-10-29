// Who gets notified about a transaction, and what the notification says.
import { commentText, notificationText } from "../../src/core/messages";
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

export function pushPayload(t: Txn, recipient: string, all: Txn[], otherName?: string) {
  const other = t.creditor === recipient ? t.debtor : t.creditor;
  const body = notificationText(t, recipient, balanceBetween(all, recipient, other), undefined, "jo", otherName);
  return { title: "دفترنا", body, url: "/", tag: `txn-${t.id}` };
}

export function commentPayload(c: { by: string; byName: string; text: string; parties: string[] }, note: string, txnId: string) {
  return { title: "دفترنا", body: commentText(c.byName, c.text, note), url: "/", tag: `comment-${txnId}` };
}
