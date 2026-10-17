import { describe, expect, it } from "vitest";
import { matchOrders, normalizeWord } from "./match";

const items = [
  { id: "1", name: "شاورما عربي دبل" },
  { id: "2", name: "Fattoush سلطة فتوش" },
  { id: "3", name: "حمص بيروتي" },
  { id: "4", name: "Mixed Grill مشاوي مشكلة" },
  { id: "5", name: "ليمون ونعنع" },
  { id: "6", name: "Pepsi" },
];

describe("matching orders to receipt lines", () => {
  it("normalizes Arabic spelling", () => {
    expect(normalizeWord("الشاورمة")).toBe("شاورمه");
    expect(normalizeWord("وإسراء")).toBe("اسراء");
  });

  it("finds who ordered each item, including shared ones", () => {
    const m = matchOrders(items, {
      sara: "شاورما",
      ahmad: "شاورمة وليمون",
      lina: "فتوش، حمص",
      omar: "مشاوي",
    });
    expect(m["1"].sort()).toEqual(["ahmad", "sara"]);
    expect(m["2"]).toEqual(["lina"]);
    expect(m["3"]).toEqual(["lina"]);
    expect(m["4"]).toEqual(["omar"]);
    expect(m["5"]).toEqual(["ahmad"]);
    expect(m["6"]).toEqual([]);
  });

  it("matches English item names too, and ignores empty orders", () => {
    const m = matchOrders(items, { a: "pepsi", b: "" });
    expect(m["6"]).toEqual(["a"]);
    expect(m["1"]).toEqual([]);
  });
});
