import type { NewTxn, Txn } from "../core/ledger";
import type { Phone } from "../core/phone";
import type { RawReceipt } from "../core/receipt";
import type { BillExtras, BillItem } from "../core/split";
import type { Fils } from "../core/money";

export type Unsub = () => void;

export interface Contact {
  phone: Phone;
  name: string;
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

export interface PhoneSignIn {
  confirm(code: string): Promise<void>;
}

export type PushState = "granted" | "denied" | "default" | "unsupported" | "needsInstall";

export interface Backend {
  mode: "demo" | "firebase";
  /** null = signed out; name === null = signed in but hasn't set a name yet. */
  onAuth(cb: (u: { phone: Phone; name: string | null } | null) => void): Unsub;
  startPhoneSignIn(phone: Phone, recaptchaEl: HTMLElement): Promise<PhoneSignIn>;
  saveName(name: string): Promise<void>;
  signOut(): Promise<void>;

  watchContacts(cb: (c: Contact[]) => void): Unsub;
  saveContact(c: Contact): Promise<void>;
  /** Returns the user's display name if this number has an account. */
  lookupUser(phone: Phone): Promise<{ name: string } | null>;

  watchTxns(cb: (t: Txn[]) => void): Unsub;
  /** Writes entries (and optionally their bill) in one atomic batch. */
  addTxns(txns: NewTxn[], bill?: NewBill): Promise<Txn[]>;

  readReceipt(image: Blob): Promise<RawReceipt>;

  pushState(): Promise<PushState>;
  enablePush(): Promise<PushState>;
}
