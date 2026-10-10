import { createContext, useContext } from "react";
import type { Txn } from "../core/ledger";
import type { Phone } from "../core/phone";
import type { Backend, Contact } from "../data/backend";
import type { Friend } from "./model";

export interface AppCtx {
  backend: Backend;
  me: Phone;
  myName: string;
  contacts: Contact[];
  txns: Txn[];
  friends: Friend[];
  toast: (text: string) => void;
  /** Whether this number has the app (null = not known yet). */
  registered: (p: Phone) => boolean | null;
}

export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("no app ctx");
  return c;
};
