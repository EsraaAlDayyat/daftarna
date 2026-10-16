// Picking friends from the phone's contacts (Contact Picker API).
// Works in Chrome on Android. iPhone browsers don't offer it, so the button is hidden there.
import { normalizePhone, type Phone } from "../core/phone";

interface PickedContact { name?: string[]; tel?: string[] }
interface ContactsManager { select(props: string[], opts?: { multiple?: boolean }): Promise<PickedContact[]> }

export const canPickContacts = () =>
  typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

/** Opens the phone's contact list. Returns valid people only; skips numbers we can't read. */
export async function pickContacts(): Promise<{ picked: { phone: Phone; name: string }[]; skipped: number }> {
  const mgr = (navigator as unknown as { contacts: ContactsManager }).contacts;
  const raw = await mgr.select(["name", "tel"], { multiple: true });
  const picked: { phone: Phone; name: string }[] = [];
  let skipped = 0;
  for (const c of raw) {
    // A contact can have several numbers; take the first one that's a valid mobile
    const phone = (c.tel ?? []).map((x) => normalizePhone(x)).find((p): p is Phone => !!p);
    const name = (c.name?.[0] ?? "").trim().slice(0, 40);
    if (!phone) { skipped++; continue; }
    if (!picked.some((x) => x.phone === phone)) picked.push({ phone, name: name || phone });
  }
  return { picked, skipped };
}
