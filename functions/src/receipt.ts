// Receipt reading with Claude. Kept free of Firebase so it can be unit-tested.
import { RECEIPT_PROMPT, RECEIPT_SCHEMA, type RawReceipt } from "../../src/core/receipt";

export const DEFAULT_MODEL = "claude-haiku-5-5";
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BASE64 = 6_000_000; // ~4.5 MB image

export class ReceiptError extends Error {
  constructor(public code: "bad-image" | "too-big" | "ai-failed" | "unreadable", msg?: string) { super(msg ?? code); }
}

export async function readReceiptWithClaude(opts: {
  image: string; mediaType: string; apiKey: string; model?: string; fetchFn?: typeof fetch;
}): Promise<RawReceipt> {
  const { image, apiKey } = opts;
  const mediaType = ALLOWED.includes(opts.mediaType) ? opts.mediaType : "image/jpeg";
  if (!image || typeof image !== "string" || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) throw new ReceiptError("bad-image");
  if (image.length > MAX_BASE64) throw new ReceiptError("too-big");

  const res = await (opts.fetchFn ?? fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: RECEIPT_PROMPT },
        ],
      }],
      output_config: { format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ReceiptError("ai-failed", `anthropic ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new ReceiptError("ai-failed", "no text block");
  let parsed: RawReceipt;
  try { parsed = JSON.parse(text); } catch { throw new ReceiptError("ai-failed", "bad json"); }
  if (!parsed.readable || !Array.isArray(parsed.items) || !parsed.items.length) throw new ReceiptError("unreadable");
  return parsed;
}
