// Security rules tests. They need the Firestore emulator:
//   npm run test:rules
// (Runs automatically on GitHub Actions.)
import { readFileSync } from "fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, query, where, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";

const S = "+962791111111", A = "+962782222222", L = "+962773333333";
let env: RulesTestEnvironment;

const as = (uid: string, phone: string) => env.authenticatedContext(uid, { phone_number: phone }).firestore();
const txn = (o: Record<string, unknown> = {}) => ({
  creditor: S, debtor: A, parties: [S, A], amount: 4250, kind: "lend", note: "",
  createdBy: S, createdByName: "سارة", createdAt: serverTimestamp(), ...o,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-daftarna",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("transactions", () => {
  it("a party can create an entry, an outsider cannot", async () => {
    await assertSucceeds(setDoc(doc(as("s", S), "txns/t1"), txn()));
    await assertFails(setDoc(doc(as("l", L), "txns/t2"), txn({ createdBy: L })));
  });

  it("cannot create an entry in someone else's name", async () => {
    await assertFails(setDoc(doc(as("s", S), "txns/t1"), txn({ createdBy: A })));
  });

  it("amount must be a positive integer in fils", async () => {
    await assertFails(setDoc(doc(as("s", S), "txns/t1"), txn({ amount: 4.25 })));
    await assertFails(setDoc(doc(as("s", S), "txns/t1"), txn({ amount: 0 })));
    await assertFails(setDoc(doc(as("s", S), "txns/t1"), txn({ amount: -5 })));
  });

  it("parties must match both sides, and the timestamp comes from the server", async () => {
    await assertFails(setDoc(doc(as("s", S), "txns/t1"), txn({ parties: [S, L] })));
    await assertFails(setDoc(doc(as("s", S), "txns/t1"), txn({ createdAt: new Date(2020, 1, 1) })));
    await assertFails(setDoc(doc(as("s", S), "txns/t1"), txn({ extra: true })));
  });

  it("users can only read entries they are a party to", async () => {
    await setDoc(doc(as("s", S), "txns/t1"), txn());
    await assertSucceeds(getDoc(doc(as("a", A), "txns/t1")));
    await assertFails(getDoc(doc(as("l", L), "txns/t1")));
    await assertSucceeds(getDocs(query(collection(as("a", A), "txns"), where("parties", "array-contains", A))));
    await assertFails(getDocs(collection(as("l", L), "txns")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "txns/t1")));
  });

  it("entries can't be updated or deleted", async () => {
    await setDoc(doc(as("s", S), "txns/t1"), txn());
    await assertFails(updateDoc(doc(as("s", S), "txns/t1"), { amount: 1 }));
    await assertFails(deleteDoc(doc(as("s", S), "txns/t1")));
  });

  it("a reversal is allowed only for the author, and only once", async () => {
    await setDoc(doc(as("s", S), "txns/t1"), txn());
    const rev = txn({ creditor: A, debtor: S, parties: [A, S], kind: "reversal", reverses: "t1" });
    // Ahmad didn't create it
    const dbA = as("a", A);
    const ba = writeBatch(dbA);
    ba.set(doc(dbA, "txns/r0"), { ...rev, createdBy: A, createdByName: "أحمد" });
    ba.set(doc(dbA, "reversals/t1"), { by: A });
    await assertFails(ba.commit());
    // Missing the reversal marker
    await assertFails(setDoc(doc(as("s", S), "txns/r1"), rev));
    // Valid
    const dbS = as("s", S);
    const b = writeBatch(dbS);
    b.set(doc(dbS, "txns/r2"), rev);
    b.set(doc(dbS, "reversals/t1"), { by: S });
    await assertSucceeds(b.commit());
    // A second reversal is rejected
    const b2 = writeBatch(dbS);
    b2.set(doc(dbS, "txns/r3"), rev);
    b2.set(doc(dbS, "reversals/t1"), { by: S });
    await assertFails(b2.commit());
  });
});

describe("bills", () => {
  const bill = (o: Record<string, unknown> = {}) => ({
    restaurant: "الريم", payer: S, items: [], eaters: {}, extras: {}, total: 10000,
    shares: { [S]: 4000, [A]: 3500, [L]: 2500 }, createdBy: S, parties: [S, A, L], createdAt: serverTimestamp(), ...o,
  });
  const split = (debtor: string, amount: number, o: Record<string, unknown> = {}) =>
    txn({ creditor: S, debtor, parties: [S, debtor], amount, kind: "split", billId: "b1", ...o });

  it("a valid bill can be created on its own", async () => {
    await assertSucceeds(setDoc(doc(as("s", S), "bills/b0"), bill()));
    await assertFails(setDoc(doc(as("s", S), "bills/b1"), bill({ createdBy: A })));
  });

  it("shares must match the bill", async () => {
    const db = as("s", S);
    const ok = writeBatch(db);
    ok.set(doc(db, "bills/b1"), bill());
    ok.set(doc(db, "txns/x1"), split(A, 3500));
    ok.set(doc(db, "txns/x2"), split(L, 2500));
    await assertSucceeds(ok.commit());

    const bad = writeBatch(db);
    bad.set(doc(db, "bills/b2"), bill());
    bad.set(doc(db, "txns/x3"), split(A, 9999, { billId: "b2" }));
    await assertFails(bad.commit());
  });

  it("anyone can record a bill someone else paid; shares are owed to the payer", async () => {
    const db = as("l", L);
    const b = writeBatch(db);
    b.set(doc(db, "bills/b1"), bill({ payer: A, createdBy: L, shares: { [A]: 5000, [S]: 3000, [L]: 2000 } }));
    b.set(doc(db, "txns/y1"), txn({ creditor: A, debtor: S, parties: [A, S], amount: 3000, kind: "split", billId: "b1", createdBy: L, createdByName: "لينا" }));
    b.set(doc(db, "txns/y2"), txn({ creditor: A, debtor: L, parties: [A, L], amount: 2000, kind: "split", billId: "b1", createdBy: L, createdByName: "لينا" }));
    await assertSucceeds(b.commit());
    // Sara sees her own share, not Lina's
    await assertSucceeds(getDoc(doc(as("s", S), "txns/y1")));
    await assertFails(getDoc(doc(as("s", S), "txns/y2")));
  });

  it("cannot reuse another user's bill as cover", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "bills/b9"), { ...bill(), createdAt: new Date() });
    });
    await assertFails(setDoc(doc(as("l", L), "txns/z"), txn({ creditor: S, debtor: A, parties: [S, A], amount: 3500, kind: "split", billId: "b9", createdBy: L })));
  });
});

describe("groups", () => {
  const group = (o: Record<string, unknown> = {}) => ({
    name: "الشلة", emoji: "🍕", members: [S], names: { [S]: "سارة" }, createdBy: S, createdAt: serverTimestamp(), ...o,
  });
  const seed = async () => {
    await setDoc(doc(as("s", S), "groups/g1"), group());
  };

  it("anyone can create a group with only themselves in it", async () => {
    await assertSucceeds(setDoc(doc(as("s", S), "groups/g1"), group()));
    await assertFails(setDoc(doc(as("s", S), "groups/g2"), group({ members: [S, A], names: { [S]: "سارة", [A]: "أحمد" } })));
    await assertFails(setDoc(doc(as("s", S), "groups/g3"), group({ createdBy: A })));
  });

  it("a member can add people; groups can't be listed by outsiders", async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(as("s", S), "groups/g1"), { members: [S, A], names: { [S]: "سارة", [A]: "أحمد" } }));
    await assertSucceeds(getDocs(query(collection(as("a", A), "groups"), where("members", "array-contains", A))));
    await assertFails(getDocs(query(collection(as("l", L), "groups"), where("members", "array-contains", S))));
  });

  it("someone with the link can join, but only as themselves", async () => {
    await seed();
    const dbL = as("l", L);
    await assertSucceeds(getDoc(doc(dbL, "groups/g1")));
    await assertFails(updateDoc(doc(dbL, "groups/g1"), { members: [S, A], names: { [S]: "سارة", [A]: "أحمد" } }));
    await assertFails(updateDoc(doc(dbL, "groups/g1"), { members: [S, L], names: { [S]: "x", [L]: "لينا" } }));
    await assertFails(updateDoc(doc(dbL, "groups/g1"), { members: [S, L], names: { [S]: "سارة", [L]: "لينا" }, name: "غير" }));
    await assertSucceeds(updateDoc(doc(dbL, "groups/g1"), { members: [S, L], names: { [S]: "سارة", [L]: "لينا" } }));
  });

  it("nobody can be removed, and names must match members", async () => {
    await seed();
    await updateDoc(doc(as("s", S), "groups/g1"), { members: [S, A], names: { [S]: "سارة", [A]: "أحمد" } });
    await assertFails(updateDoc(doc(as("s", S), "groups/g1"), { members: [S], names: { [S]: "سارة" } }));
    await assertFails(updateDoc(doc(as("s", S), "groups/g1"), { members: [S, A, L], names: { [S]: "سارة", [A]: "أحمد" } }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "groups/g1")));
  });
});

describe("group orders", () => {
  const order = (o: Record<string, unknown> = {}) => ({
    groupId: "g1", title: "غدا", lines: {}, parties: [S, A], createdBy: S, createdAt: serverTimestamp(), status: "open", ...o,
  });
  const seedGroup = () => env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "groups/g1"), { name: "الشلة", emoji: "🍕", members: [S, A], names: { [S]: "سارة", [A]: "أحمد" }, createdBy: S, createdAt: new Date() });
  });

  it("a group member can start an order for the group", async () => {
    await seedGroup();
    await assertSucceeds(setDoc(doc(as("s", S), "orders/o1"), order()));
    await assertFails(setDoc(doc(as("s", S), "orders/o2"), order({ parties: [S, A, L] })));
    await assertFails(setDoc(doc(as("l", L), "orders/o3"), order({ parties: [L], createdBy: L })));
  });

  it("an outing is an order of kind 'outing'; no other kinds, and the kind can't change", async () => {
    await seedGroup();
    await assertSucceeds(setDoc(doc(as("s", S), "orders/t1"), order({ kind: "outing", title: "طلعة مزرعة" })));
    await assertFails(setDoc(doc(as("s", S), "orders/t2"), order({ kind: "party" })));
    await assertSucceeds(updateDoc(doc(as("a", A), "orders/t1"), { lines: { [A]: "25" } }));
    await assertFails(updateDoc(doc(as("a", A), "orders/t1"), { kind: "party" }));
  });

  it("members fill in lines and close it; outsiders can't see it", async () => {
    await seedGroup();
    await setDoc(doc(as("s", S), "orders/o1"), order());
    await assertSucceeds(updateDoc(doc(as("a", A), "orders/o1"), { lines: { [S]: "شاورما", [A]: "فتوش" } }));
    await assertFails(updateDoc(doc(as("a", A), "orders/o1"), { lines: { [L]: "حمص" } }));
    await assertFails(updateDoc(doc(as("a", A), "orders/o1"), { parties: [S, A, L] }));
    await assertSucceeds(updateDoc(doc(as("s", S), "orders/o1"), { status: "done" }));
    await assertFails(getDoc(doc(as("l", L), "orders/o1")));
    await assertFails(deleteDoc(doc(as("s", S), "orders/o1")));
  });
});

describe("comments", () => {
  const c = (o: Record<string, unknown> = {}) => ({
    txnId: "t1", by: A, byName: "أحمد", text: "دفعتلك نصها كاش", parties: [S, A], createdAt: serverTimestamp(), ...o,
  });
  const seed = () => setDoc(doc(as("s", S), "txns/t1"), txn());

  it("both parties can comment on an entry and read the comments", async () => {
    await seed();
    await assertSucceeds(setDoc(doc(as("a", A), "comments/c1"), c()));
    await assertSucceeds(setDoc(doc(as("s", S), "comments/c2"), c({ by: S, byName: "سارة" })));
    await assertSucceeds(getDocs(query(collection(as("s", S), "comments"), where("parties", "array-contains", S))));
  });

  it("an outsider can't comment or read", async () => {
    await seed();
    await setDoc(doc(as("a", A), "comments/c1"), c());
    await assertFails(setDoc(doc(as("l", L), "comments/c2"), c({ by: L, byName: "لينا" })));
    await assertFails(setDoc(doc(as("l", L), "comments/c3"), c({ by: L, byName: "لينا", parties: [S, A, L] })));
    await assertFails(getDoc(doc(as("l", L), "comments/c1")));
  });

  it("must match the entry, be in my name, and can't be changed", async () => {
    await seed();
    await assertFails(setDoc(doc(as("a", A), "comments/c1"), c({ by: S })));
    await assertFails(setDoc(doc(as("a", A), "comments/c1"), c({ txnId: "nope" })));
    await assertFails(setDoc(doc(as("a", A), "comments/c1"), c({ text: "" })));
    await assertFails(setDoc(doc(as("a", A), "comments/c1"), c({ text: "x".repeat(301) })));
    await setDoc(doc(as("a", A), "comments/c1"), c());
    await assertFails(updateDoc(doc(as("a", A), "comments/c1"), { text: "غير" }));
    await assertFails(deleteDoc(doc(as("a", A), "comments/c1")));
  });
});

describe("profile and phone directory", () => {
  it("can only claim my own verified number", async () => {
    await assertSucceeds(setDoc(doc(as("s", S), "phones", S), { uid: "s", name: "سارة" }));
    await assertFails(setDoc(doc(as("s", S), "phones", A), { uid: "s", name: "سارة" }));
    await assertFails(setDoc(doc(as("s", S), "users/s"), { phone: A, name: "سارة" }));
    await assertSucceeds(setDoc(doc(as("s", S), "users/s"), { phone: S, name: "سارة" }));
  });
  it("can look up one number but not list them all", async () => {
    await setDoc(doc(as("s", S), "phones", S), { uid: "s", name: "سارة" });
    await assertSucceeds(getDoc(doc(as("a", A), "phones", S)));
    await assertFails(getDocs(collection(as("a", A), "phones")));
  });
  it("contacts and tokens are private", async () => {
    await assertSucceeds(setDoc(doc(as("s", S), `users/s/contacts/${A}`), { phone: A, name: "أحمد" }));
    await assertFails(getDoc(doc(as("a", A), `users/s/contacts/${A}`)));
    await assertFails(setDoc(doc(as("a", A), `users/s/contacts/${L}`), { phone: L, name: "x" }));
  });
  it("a contact and my profile can carry a short CliQ alias", async () => {
    await assertSucceeds(setDoc(doc(as("s", S), `users/s/contacts/${A}`), { phone: A, name: "أحمد", cliq: "AHMAD22" }));
    await assertFails(setDoc(doc(as("s", S), `users/s/contacts/${A}`), { phone: A, name: "أحمد", cliq: "X".repeat(21) }));
    await assertFails(setDoc(doc(as("s", S), `users/s/contacts/${A}`), { phone: A, name: "أحمد", cliq: 5 }));
    await assertSucceeds(setDoc(doc(as("s", S), "users/s"), { phone: S, name: "سارة", cliq: "SARA" }));
    await assertFails(setDoc(doc(as("s", S), "users/s"), { phone: S, name: "سارة", iban: "JO00" }));
  });
});
