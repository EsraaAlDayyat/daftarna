// CliQ (Jordan's instant payments): each person picks an alias, or uses their mobile number.
/** Cleans an alias for saving: no spaces, capital letters. Returns null if it can't be a CliQ alias. */
export function normalizeCliq(input: string): string | null {
  const v = String(input ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, "")
    .toUpperCase();
  if (!v) return null;
  return /^[A-Z0-9]{1,20}$/.test(v) || /^\+?\d{9,15}$/.test(v) ? v : null;
}
