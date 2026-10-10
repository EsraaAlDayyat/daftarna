// Receipt-reading schema, prompt, and conversion of the result into items in fils.
import { parseJod, type Fils } from "./money";
import type { BillExtras, BillItem } from "./split";

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
        },
        required: ["name", "qty", "unit_price", "line_total"],
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
  items: { name: string; qty: number; unit_price: number; line_total: number }[];
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
}

const f = (n: unknown): Fils => {
  const v = typeof n === "number" ? parseJod(n) : parseJod(String(n ?? ""));
  return v && v > 0 ? v : 0;
};

export function normalizeReceipt(r: RawReceipt, newId: () => string): ParsedReceipt {
  const items: BillItem[] = (r.items ?? [])
    .map((it) => {
      const qty = Number.isFinite(it.qty) && it.qty > 0 ? Math.round(it.qty * 100) / 100 : 1;
      let price = f(it.line_total);
      if (!price && it.unit_price) price = Math.round(f(it.unit_price) * qty);
      return { id: newId(), name: String(it.name ?? "").trim() || "صنف", qty, price };
    })
    .filter((it) => it.price > 0);
  return {
    restaurant: String(r.restaurant ?? "").trim(),
    items,
    extras: { tax: f(r.tax), service: f(r.service), delivery: f(r.delivery), discount: f(r.discount) },
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
