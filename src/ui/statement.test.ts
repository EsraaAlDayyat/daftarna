import { describe, expect, it } from "vitest";
import { makeTxn, manualTxn, paymentFor } from "../core/ledger";
import { statementHtml } from "./statement";

const ME = "+962791111111", A = "+962782222222";

describe("statement", () => {
  it("lists entries with their paid state and the balance", () => {
    const taxi = makeTxn(manualTxn("iLentHim", ME, A, 3500, "تكسي", "سارة"), "a", 1);
    const lunch = makeTxn(manualTxn("iLentHim", ME, A, 5000, "<غدا>", "سارة"), "b", 2);
    const pay = makeTxn(paymentFor(taxi, 3500, ME, "سارة"), "c", 3);
    const html = statementHtml({ txns: [taxi, lunch, pay], me: ME, myName: "سارة", name: "أحمد", phone: A, balance: 5000 });
    expect(html).toContain("كشف حساب: أحمد");
    expect(html).toContain("✓ مدفوع");
    expect(html).toContain("لم يُدفع");
    expect(html).toContain("&lt;غدا&gt;");
    expect(html).toContain("لك عند أحمد");
  });
});
