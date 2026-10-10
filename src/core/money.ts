// All amounts are integer fils: 1 JOD = 1000 fils.
export type Fils = number;

const FILS_PER_JOD = 1000;

/** Parses "4.25", "٤٫٢٥" or "4,250" into fils. Returns null if it isn't a number. */
export function parseJod(input: string | number): Fils | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * FILS_PER_JOD);
  }
  let s = String(input).trim();
  if (!s) return null;
  // Arabic-Indic and Persian digits → Latin
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
       .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
       .replace(/[٫,]/g, ".")
       .replace(/[^\d.-]/g, "");
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === "" || s === "." || s === "-") return null;
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [whole = "0", frac = ""] = s.split(".");
  // Round to the nearest fils without floating-point error
  const f3 = (frac + "000").slice(0, 3);
  let fils = Number(whole || "0") * FILS_PER_JOD + Number(f3);
  if (frac.length > 3 && Number(frac[3]) >= 5) fils += 1;
  return neg ? -fils : fils;
}

const nf3 = new Intl.NumberFormat("ar-JO", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const nf0 = new Intl.NumberFormat("ar-JO", { maximumFractionDigits: 0 });

/** Arabic display: "١٢" for whole dinars, otherwise "٤٫٢٥٠". Always unsigned. */
export function formatJod(fils: Fils): string {
  const a = Math.abs(Math.trunc(fils));
  if (a % FILS_PER_JOD === 0) return nf0.format(a / FILS_PER_JOD);
  return nf3.format(a / FILS_PER_JOD);
}

/** "٤٫٢٥٠ د.أ" (amount with the JOD symbol) */
export const jod = (fils: Fils) => `${formatJod(fils)} د.أ`;

/** Latin digits for messages (WhatsApp, push), which copy more reliably: "4.250" */
export function formatJodLatin(fils: Fils): string {
  const a = Math.abs(Math.trunc(fils));
  if (a % FILS_PER_JOD === 0) return String(a / FILS_PER_JOD);
  return (a / FILS_PER_JOD).toFixed(3);
}

/** Value for editable inputs: "4.250" */
export function filsToInput(fils: Fils): string {
  return (fils / FILS_PER_JOD).toFixed(3);
}
