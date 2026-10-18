// Phone number normalization to E.164. Jordanian mobiles: +9627XXXXXXXX
export type Phone = string;

function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Returns the number in E.164, or null if invalid.
 * Accepted Jordanian forms: 0791234567, 791234567, 00962791234567, +962 79 123 4567, 962791234567.
 * Other countries are accepted when prefixed with + or 00.
 */
export function normalizePhone(input: string): Phone | null {
  const raw = toLatinDigits(String(input ?? "")).trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  let d = raw.replace(/\D/g, "");
  let international = hasPlus;
  if (!hasPlus && d.startsWith("00")) { d = d.slice(2); international = true; }

  // Local (Jordanian) format
  if (!international) {
    if (d.startsWith("962")) d = d.slice(3);
    else if (d.startsWith("0")) d = d.slice(1);
    return /^7[789]\d{7}$/.test(d) ? `+962${d}` : null;
  }
  if (d.startsWith("962")) {
    let rest = d.slice(3);
    if (rest.startsWith("0")) rest = rest.slice(1); // "+962 079…" is a common typo
    return /^7[789]\d{7}$/.test(rest) ? `+962${rest}` : null;
  }
  return /^[1-9]\d{7,14}$/.test(d) ? `+${d}` : null;
}

/** Display format: +962791234567 → 079 123 4567 */
export function displayPhone(p: Phone): string {
  const m = /^\+962(7\d)(\d{3})(\d{4})$/.exec(p);
  if (m) return `0${m[1]} ${m[2]} ${m[3]}`;
  return p;
}

/** wa.me link with a prefilled message. */
export function waLink(p: Phone, message: string): string {
  return `https://wa.me/${p.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

/** Opens a normal text message with the words filled in (Android and iPhone both read "?&body="). */
export function smsLink(p: Phone, message: string): string {
  return `sms:${p}?&body=${encodeURIComponent(message)}`;
}
