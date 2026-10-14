import { avatarColors } from "./model";

/** Round initial with a soft colour that stays the same for each person. */
export function Avatar({ name, id, size = 44 }: { name: string; id: string; size?: number }) {
  const { bg, fg } = avatarColors(id);
  return (
    <span className="av" aria-hidden="true" style={{ background: bg, color: fg, width: size, height: size, fontSize: size * 0.45 }}>
      {name.trim()[0] ?? "؟"}
    </span>
  );
}
