import type { NewTxn, Txn } from "../core/ledger";
import type { Phone } from "../core/phone";
import type { RawReceipt } from "../core/receipt";
import type { BillExtras, BillItem } from "../core/split";
import type { Fils } from "../core/money";

export type Unsub = () => void;

export interface Contact {
  phone: Phone;
  name: string;
  /** Their CliQ alias, so I can send them money. */
  cliq?: string;
}

export interface Bill {
  id: string;
  restaurant: string;
  payer: Phone;
  items: BillItem[];
  eaters: Record<string, Phone[]>;
  extras: BillExtras;
  shares: Record<Phone, Fils>;
  total: Fils;
  createdBy: Phone;
  parties: Phone[];
  createdAt: number;
}

export type NewBill = Omit<Bill, "id" | "createdAt" | "parties" | "createdBy">;

export interface Group {
  id: string;
  name: string;
  emoji: string;
  members: Phone[];
  /** Display name of each member, as they or the person who added them wrote it. */
  names: Record<Phone, string>;
  createdBy: Phone;
  createdAt: number;
}

/** A note under a transaction, visible to both of its parties. */
export interface TxnComment {
  id: string;
  txnId: string;
  by: Phone;
  byName: string;
  text: string;
  parties: Phone[];
  createdAt: number;
}

/** A group order: who wants what, before the bill arrives. Prices come from the bill later. */
export interface Order {
  id: string;
  groupId: string;
  title: string;
  /** What each person ordered, by phone. */
  lines: Record<Phone, string>;
  parties: Phone[];
  createdBy: Phone;
  createdAt: number;
  status: "open" | "done";
  /** "outing": each line is what that person paid, split equally among those who came. */
  kind?: "outing";
}

export interface PhoneSignIn {
  confirm(code: string): Promise<void>;
}

export type PushState = "granted" | "denied" | "default" | "unsupported" | "needsInstall";

export interface Backend {
  mode: "demo" | "firebase";
  /** null = signed out; name === null = signed in but hasn't set a name yet. */
  onAuth(cb: (u: { phone: Phone; name: string | null; cliq?: string } | null) => void): Unsub;
  startPhoneSignIn(phone: Phone, recaptchaEl: HTMLElement): Promise<PhoneSignIn>;
  saveName(name: string): Promise<void>;
  /** My own CliQ alias ("" removes it); added to reminders so friends can pay me. */
  saveMyCliq(alias: string): Promise<void>;
  signOut(): Promise<void>;

  watchContacts(cb: (c: Contact[]) => void): Unsub;
  saveContact(c: Contact): Promise<void>;
  /** Returns the user's display name if this number has an account. */
  lookupUser(phone: Phone): Promise<{ name: string } | null>;

  watchGroups(cb: (g: Group[]) => void): Unsub;
  createGroup(name: string, emoji: string): Promise<Group>;
  /** Adds someone (by phone) to a group I'm in. */
  addGroupMember(groupId: string, c: Contact): Promise<void>;
  /** Group details from an invite link, before joining. null = link is wrong. */
  getGroup(groupId: string): Promise<Group | null>;
  /** Adds me to a group from its invite link. */
  joinGroup(groupId: string): Promise<void>;

  /** Every comment on entries I'm a party to. */
  watchComments(cb: (c: TxnComment[]) => void): Unsub;
  addComment(txn: Txn, text: string): Promise<void>;

  watchOrders(cb: (o: Order[]) => void): Unsub;
  createOrder(group: Group, title: string, kind?: "outing"): Promise<Order>;
  setOrderLine(orderId: string, phone: Phone, text: string): Promise<void>;
  closeOrder(orderId: string): Promise<void>;
  renameOrder(orderId: string, title: string): Promise<void>;

  watchTxns(cb: (t: Txn[]) => void): Unsub;
  /** Writes entries (and optionally their bill) in one atomic batch. */
  addTxns(txns: NewTxn[], bill?: NewBill): Promise<Txn[]>;

  /** `orders`: what each person ordered (short ids), so the reader can say who had each item. */
  readReceipt(image: Blob, orders?: { id: string; text: string }[]): Promise<RawReceipt>;

  pushState(): Promise<PushState>;
  enablePush(): Promise<PushState>;
}
