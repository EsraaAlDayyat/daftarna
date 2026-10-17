// Matching receipt lines to what each person said they ordered ("شاورما وعصير").
// Used when the receipt reader didn't already say who had each item, and in the demo.

/** Lower-case, drop Arabic diacritics/tatweel, unify letter variants, drop "ال". */
export function normalizeWord(w: string): string {
  let s = w.toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}]/gu, "");
  if (s.startsWith("وال") && s.length > 4) s = s.slice(3);
  else if (s.startsWith("ال") && s.length > 3) s = s.slice(2);
  else if (s.startsWith("و") && s.length > 3) s = s.slice(1);
  return s;
}

const STOP = new Set(["و", "مع", "بدون", "زياده", "كبير", "صغير", "وسط", "واحد", "حبه", "and", "with", "the", "x"]);

export function words(text: string): string[] {
  return text.split(/[\s,،+/\-()×*]+/).map(normalizeWord).filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** Two words match when equal, or one starts with the other (شاورما / شاورمه, عصير / عصيرات). */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 3 && l.startsWith(s.slice(0, Math.max(3, s.length - 1)));
}

/**
 * For each item, the ids of the people whose order mentions it.
 * `orders` maps a person's id to what they wrote. Items nobody mentions get [].
 */
export function matchOrders(items: { id: string; name: string }[], orders: Record<string, string>): Record<string, string[]> {
  const people = Object.entries(orders).map(([id, text]) => ({ id, w: words(text) })).filter((p) => p.w.length);
  const out: Record<string, string[]> = {};
  for (const it of items) {
    const iw = words(it.name);
    out[it.id] = people.filter((p) => p.w.some((a) => iw.some((b) => close(a, b)))).map((p) => p.id);
  }
  return out;
}
