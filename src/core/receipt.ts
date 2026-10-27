// Receipt-reading schema, prompt, and conversion of the result into items in fils.
import { parseJod, type Fils } from "./money";
import { extraKindOf, type BillExtras, type BillItem } from "./split";

/** JSON Schema for the model's structured output (amounts in JOD as numbers). */
export const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean", description: "false إذا الصورة مش فاتورة أو مش مقروءة" },
    restaurant: { type: "string" },
    currency: { type: "string", description: "JOD عادةً" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "اسم الصنف كما هو مكتوب" },
          qty: { type: "number" },
          unit_price: { type: "number", description: "سعر الحبة بالدينار، أو 0 إذا مش مكتوب" },
          line_total: { type: "number", description: "سعر السطر كامل بالدينار" },
          who: { type: "array", items: { type: "string" }, description: "أرقام الأشخاص (id) اللي طلبوا هاد الصنف، من قائمة الطلبات. فاضية إذا ما في قائمة أو ما حدا طلبه" },
        },
        required: ["name", "qty", "unit_price", "line_total", "who"],
        additionalProperties: false,
      },
    },
    subtotal: { type: "number" },
    tax: { type: "number", description: "ضريبة المبيعات، 0 إذا مش موجودة" },
    service: { type: "number", description: "رسوم الخدمة، 0 إذا مش موجودة" },
    delivery: { type: "number" },
    discount: { type: "number", description: "خصم كقيمة موجبة، 0 إذا ما في" },
    total: { type: "number" },
  },
  required: ["readable", "restaurant", "currency", "items", "subtotal", "tax", "service", "delivery", "discount", "total"],
  additionalProperties: false,
} as const;

export interface RawReceipt {
  readable: boolean;
  restaurant: string;
  currency: string;
  items: { name: string; qty: number; unit_price: number; line_total: number; who?: string[] }[];
  subtotal: number;
  tax: number;
  service: number;
  delivery: number;
  discount: number;
  total: number;
}

export interface ParsedReceipt {
  restaurant: string;
  items: BillItem[];
  extras: BillExtras;
  /** Total printed on the receipt, to cross-check the computed total. */
  printedTotal: Fils;
  /** Who ordered each item (item id → person ids), when the reader was given the orders. */
  who: Record<string, string[]>;
}

const f = (n: unknown): Fils => {
  const v = typeof n === "number" ? parseJod(n) : parseJod(String(n ?? ""));
  return v && v > 0 ? v : 0;
};

export function normalizeReceipt(r: RawReceipt, newId: () => string, people: string[] = []): ParsedReceipt {
  const who: Record<string, string[]> = {};
  const items: BillItem[] = (r.items ?? [])
    .map((it) => {
      const qty = Number.isFinite(it.qty) && it.qty > 0 ? Math.round(it.qty * 100) / 100 : 1;
      let price = f(it.line_total);
      if (!price && it.unit_price) price = Math.round(f(it.unit_price) * qty);
      const id = newId();
      // Keep only ids we actually sent, once each
      const w = Array.isArray(it.who) ? [...new Set(it.who.map(String))].filter((p) => people.includes(p)) : [];
      if (w.length) who[id] = w;
      return { id, name: String(it.name ?? "").trim() || "صنف", qty, price };
    })
    .filter((it) => it.price > 0);
  const read: BillExtras = { tax: f(r.tax), service: f(r.service), delivery: f(r.delivery), discount: f(r.discount) };
  // If the reader listed tax or service as an item anyway, count it once, as an extra
  const kept = items.filter((it) => {
    const k = extraKindOf(it.name);
    if (!k) return true;
    if (!read[k]) read[k] = it.price;
    delete who[it.id];
    return false;
  });
  return {
    who,
    restaurant: String(r.restaurant ?? "").trim(),
    items: kept,
    extras: read,
    printedTotal: f(r.total),
  };
}

/** Prompt sent with the image (Arabic, tuned for Jordanian receipts). */
export const RECEIPT_PROMPT = `هاي صورة فاتورة مطعم، غالباً من الأردن. استخرج منها:
- اسم المطعم.
- كل صنف بسطر: الاسم كما هو مكتوب (عربي أو إنجليزي أو مخلوط)، الكمية، سعر الحبة، وسعر السطر كامل.
- المجموع قبل الإضافات، ضريبة المبيعات (غالباً 16%)، رسوم الخدمة (غالباً 10%)، التوصيل، الخصم، والمجموع النهائي.
قواعد:
- كل المبالغ بالدينار الأردني كأرقام عشرية (الفلس = 0.001). إذا السعر مكتوب بالفلس (مثلاً 2500 لصنف عادي) حوّله لدينار (2.5).
- لا تحط الضريبة أو الخدمة أو التوصيل كأصناف.
- إذا صنف إله كمية أكبر من 1، خليه سطر واحد بكميته.
- أي قيمة مش موجودة حطها 0.
- إذا الصورة مش فاتورة أو مش مقروءة، خلي readable = false.`;

/** The prompt, plus who ordered what when there is a list (ids are opaque short strings). */
export function receiptPrompt(orders: { id: string; text: string }[] = []): string {
  const list = orders.filter((o) => o.text.trim());
  if (!list.length) return RECEIPT_PROMPT + "\n- خلي who فاضية لكل صنف.";
  return `${RECEIPT_PROMPT}
- هاي قائمة الطلبات، كل شخص ورقمه (id) وشو طلب. لكل صنف بالفاتورة، حط بـ who أرقام الأشخاص اللي طلبوه.
  الصنف المشترك (مثلاً شخصين طلبوا شاورما والفاتورة فيها شاورما ×2) بتحط فيه الاثنين. انتبه إنه الاسم ممكن يكون بالإنجليزي أو مختلف شوي (Mixed Grill = مشاوي مشكلة).
  إذا مش متأكد، خلي who فاضية.
${list.map((o) => `  ${o.id}: ${o.text.trim().slice(0, 200)}`).join("\n")}`;
}
