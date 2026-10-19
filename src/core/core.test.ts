import { describe, expect, it } from "vitest";
import { parseJod, formatJod, formatJodLatin } from "./money";
import { normalizePhone, displayPhone, waLink } from "./phone";
import {
  balancesFor, makeTxn, manualTxn, reversalOf, reversedIds, settlementFor, totalsFor, type Txn,
} from "./ledger";
import { commentText, notificationText, waStatement, waTxnMessage } from "./messages";
import { normalizeReceipt } from "./receipt";

const SARA = "+962791111111", AHMAD = "+962782222222", LINA = "+962773333333";

describe("money (fils)", () => {
  it("parses Latin, Arabic-Indic and comma formats", () => {
    expect(parseJod("4.25")).toBe(4250);
    expect(parseJod("4.250")).toBe(4250);
    expect(parseJod("٤٫٢٥٠")).toBe(4250);
    expect(parseJod("12")).toBe(12000);
    expect(parseJod("0.1")).toBe(100);
    expect(parseJod("0.0015")).toBe(2);
    expect(parseJod(0.1 + 0.2)).toBe(300);
    expect(parseJod("")).toBeNull();
    expect(parseJod("abc")).toBeNull();
  });
  it("formats with three decimals, or whole dinars", () => {
    expect(formatJod(12000)).toBe("١٢");
    expect(formatJod(3500)).toBe("٣٫٥٠٠");
    expect(formatJod(-4250)).toBe("٤٫٢٥٠");
    expect(formatJodLatin(4250)).toBe("4.250");
    expect(formatJodLatin(10000)).toBe("10");
  });
});

describe("phone numbers", () => {
  it("normalizes to E.164", () => {
    for (const s of ["0791234567", "079 123 4567", "791234567", "00962791234567", "+962 79 123 4567", "962791234567", "+9620791234567", "٠٧٩١٢٣٤٥٦٧"]) {
      expect(normalizePhone(s), s).toBe("+962791234567");
    }
    expect(normalizePhone("0761234567")).toBeNull(); // not a Jordanian mobile prefix
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+971501234567")).toBe("+971501234567");
  });
  it("display format and WhatsApp link", () => {
    expect(displayPhone("+962791234567")).toBe("079 123 4567");
    expect(waLink("+962791234567", "مرحبا")).toBe("https://wa.me/962791234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7");
  });
});

let n = 0;
const mk = (t: Parameters<typeof makeTxn>[0]) => makeTxn(t, `t${++n}`, 1_700_000_000_000 + n);

describe("ledger", () => {
  it("one entry shows on both sides with opposite signs", () => {
    const t = mk(manualTxn("iLentHim", SARA, AHMAD, 10000, "", "سارة"));
    expect(balancesFor([t], SARA).get(AHMAD)).toBe(10000);
    expect(balancesFor([t], AHMAD).get(SARA)).toBe(-10000);
    expect(balancesFor([t], LINA).size).toBe(0);
  });

  it("the three manual actions", () => {
    const a = mk(manualTxn("iPaidHim", SARA, AHMAD, 5000, "", "سارة"));
    const b = mk(manualTxn("hePaidMe", SARA, AHMAD, 2000, "", "سارة"));
    const c = mk(manualTxn("iLentHim", SARA, AHMAD, 1000, "", "سارة"));
    expect(balancesFor([a, b, c], SARA).get(AHMAD)).toBe(4000);
  });

  it("totals owed to me and owed by me", () => {
    const ts = [
      mk(manualTxn("iLentHim", SARA, AHMAD, 12000, "", "سارة")),
      mk(manualTxn("hePaidMe", SARA, LINA, 3500, "", "سارة")),
    ];
    expect(totalsFor(ts, SARA)).toEqual({ owedToMe: 12000, iOwe: 3500 });
  });

  it("settling zeroes the balance on both sides", () => {
    const t1 = mk(manualTxn("iLentHim", SARA, AHMAD, 7250, "", "سارة"));
    const s = mk(settlementFor(7250, SARA, AHMAD, "سارة")!);
    expect(balancesFor([t1, s], SARA).get(AHMAD)).toBe(0);
    const s2 = mk(settlementFor(-3000, SARA, LINA, "سارة")!);
    expect(balancesFor([s2], SARA).get(LINA)).toBe(3000);
    expect(settlementFor(0, SARA, AHMAD, "سارة")).toBeNull();
  });

  it("a reversal cancels an entry and keeps history", () => {
    const t1 = mk(manualTxn("iLentHim", SARA, AHMAD, 5000, "عشا", "سارة"));
    const r = mk(reversalOf(t1, AHMAD, "أحمد"));
    expect(balancesFor([t1, r], SARA).get(AHMAD)).toBe(0);
    expect(reversedIds([t1, r]).has(t1.id)).toBe(true);
    expect(() => reversalOf(r, SARA, "سارة")).toThrow();
  });

  it("rejects zero, fractional fils, and self-entries", () => {
    expect(() => mk(manualTxn("iLentHim", SARA, AHMAD, 0, "", ""))).toThrow();
    expect(() => mk(manualTxn("iLentHim", SARA, AHMAD, 1.5, "", ""))).toThrow();
    expect(() => mk(manualTxn("iLentHim", SARA, SARA, 100, "", ""))).toThrow();
  });
});

describe("message text", () => {
  it("bill share notification", () => {
    const t: Txn = mk({ creditor: SARA, debtor: AHMAD, amount: 4250, kind: "split", note: "غدا الريم", createdBy: SARA, createdByName: "سارة" });
    expect(notificationText(t, AHMAD, -4250, "غدا الريم")).toBe("أضاف سارة عليك 4.250 د.أ، غدا الريم. عليك له 4.250 د.أ");
  });
  it("payment notification that settles the balance", () => {
    // Ahmad records that Sara paid him
    const t = mk(manualTxn("hePaidMe", AHMAD, SARA, 10000, "", "أحمد"));
    expect(notificationText(t, SARA, 0)).toBe("سجّل أحمد أنك دفعت عنه 10 د.أ. لا يوجد رصيد بينكما ✓");
  });
  it("WhatsApp message and statement", () => {
    const t = mk(manualTxn("iLentHim", SARA, AHMAD, 2500, "تكسي", "سارة"));
    expect(waTxnMessage(t, SARA, "أحمد", 2500)).toBe(
      "مرحبًا أحمد 👋\nأقرضتك 2.500 د.أ مقابل: تكسي\n👈 إجمالي المستحق عليك: 2.500 د.أ\n\n📒 دفترنا: https://daftarna-99fad.web.app");
    const st = waStatement([t], SARA, "أحمد", "سارة");
    expect(st).toContain("+2.500 تكسي");
    expect(st).toContain("👈 إجمالي المستحق عليك: 2.500 د.أ");
    expect(st.endsWith("https://daftarna-99fad.web.app")).toBe(true);
  });
});

describe("receipt normalization", () => {
  it("converts the model output into items in fils", () => {
    let i = 0;
    const r = normalizeReceipt({
      readable: true, restaurant: "مطعم الريم", currency: "JOD",
      items: [
        { name: "شاورما عربي", qty: 2, unit_price: 3.5, line_total: 7 },
        { name: "Fattoush", qty: 1, unit_price: 2.25, line_total: 0 },
        { name: "خبز", qty: 1, unit_price: 0, line_total: 0 },
      ],
      subtotal: 9.25, tax: 1.628, service: 0.925, delivery: 0, discount: 0, total: 11.803,
    }, () => `x${i++}`);
    expect(r.items.map((x) => [x.name, x.qty, x.price])).toEqual([["شاورما عربي", 2, 7000], ["Fattoush", 1, 2250]]);
    expect(r.extras).toEqual({ tax: 1628, service: 925, delivery: 0, discount: 0 });
    expect(r.printedTotal).toBe(11803);
  });
});

describe("comment notifications", () => {
  it("names the author and the entry, and shortens long text", () => {
    expect(commentText("أحمد", "دفعتلك نصها", "تكسي")).toBe("💬 أحمد على «تكسي»: دفعتلك نصها");
    expect(commentText("أحمد", "تمام", "")).toBe("💬 أحمد: تمام");
    expect(commentText("أحمد", "x".repeat(200), "").length).toBeLessThan(140);
  });
});
