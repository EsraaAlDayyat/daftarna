import { describe, expect, it } from "vitest";
import { readReceiptWithClaude, ReceiptError, DEFAULT_MODEL } from "./receipt";
import { pushPayload, recipientsOf } from "./notify";
import { makeTxn } from "../../src/core/ledger";

const sample = {
  readable: true, restaurant: "الريم", currency: "JOD",
  items: [{ name: "شاورما", qty: 1, unit_price: 3.5, line_total: 3.5 }],
  subtotal: 3.5, tax: 0, service: 0, delivery: 0, discount: 0, total: 3.5,
};

function fakeFetch(status: number, body: unknown, seen: { req?: { url: string; init: RequestInit } } = {}) {
  return (async (url: string, init: RequestInit) => {
    seen.req = { url, init };
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe("readReceiptWithClaude", () => {
  it("sends the image with a JSON schema and returns the parsed result", async () => {
    const seen: { req?: { url: string; init: RequestInit } } = {};
    const r = await readReceiptWithClaude({
      image: "aGVsbG8=", mediaType: "image/png", apiKey: "k",
      fetchFn: fakeFetch(200, { content: [{ type: "text", text: JSON.stringify(sample) }] }, seen),
    });
    expect(r.restaurant).toBe("الريم");
    const body = JSON.parse(String(seen.req!.init.body));
    expect(seen.req!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.messages[0].content[0].source).toEqual({ type: "base64", media_type: "image/png", data: "aGVsbG8=" });
    expect((seen.req!.init.headers as Record<string, string>)["x-api-key"]).toBe("k");
  });

  it("rejects non-base64 or oversized images", async () => {
    await expect(readReceiptWithClaude({ image: "<script>", mediaType: "image/png", apiKey: "k", fetchFn: fakeFetch(200, {}) }))
      .rejects.toMatchObject({ code: "bad-image" });
    await expect(readReceiptWithClaude({ image: "A".repeat(7_000_000), mediaType: "image/png", apiKey: "k", fetchFn: fakeFetch(200, {}) }))
      .rejects.toMatchObject({ code: "too-big" });
  });

  it("reports unreadable when the photo is not a receipt", async () => {
    await expect(readReceiptWithClaude({
      image: "aGVsbG8=", mediaType: "image/jpeg", apiKey: "k",
      fetchFn: fakeFetch(200, { content: [{ type: "text", text: JSON.stringify({ ...sample, readable: false, items: [] }) }] }),
    })).rejects.toBeInstanceOf(ReceiptError);
  });

  it("handles API failures", async () => {
    await expect(readReceiptWithClaude({ image: "aGVsbG8=", mediaType: "image/jpeg", apiKey: "k", fetchFn: fakeFetch(529, "overloaded") }))
      .rejects.toMatchObject({ code: "ai-failed" });
  });
});

describe("notifications", () => {
  const S = "+962791111111", A = "+962782222222", L = "+962773333333";
  it("notifies the other party, not the author", () => {
    const t = makeTxn({ creditor: S, debtor: A, amount: 4250, kind: "split", note: "فاتورة الريم", createdBy: S, createdByName: "سارة", billId: "b" }, "t1");
    expect(recipientsOf(t)).toEqual([A]);
    const p = pushPayload(t, A, [t]);
    expect(p.body).toBe("ضاف سارة عليك 4.250 د.أ، فاتورة الريم. عليك إله 4.250 د.أ");
  });
  it("notifies both parties when a third person records the bill", () => {
    const t = makeTxn({ creditor: L, debtor: A, amount: 1000, kind: "split", note: "", createdBy: S, createdByName: "سارة", billId: "b" }, "t2");
    expect(recipientsOf(t).sort()).toEqual([L, A].sort());
  });
});
