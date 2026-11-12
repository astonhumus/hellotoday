/** "1 place" / "2 places". Pass the plural when adding an "s" is not enough. */
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** What a country calls its subdivisions. The data sometimes lists two names ("District|Regencies"): the first is used. */
export const kindName = (kind?: string) => (kind ?? "State").split("|")[0].trim() || "State";

/** "State" -> "States", "County" -> "Counties", "Parish" -> "Parishes". */
export function kindPlural(kind?: string): string {
  const k = kindName(kind);
  if (/[^aeiou]y$/i.test(k)) return k.slice(0, -1) + "ies";
  if (/(s|x|ch|sh)$/i.test(k)) return k + "es";
  return k + "s";
}

/** "2026-11-12" -> "12 Nov 2026" (in the reader's own language and format). Anything else is returned unchanged. */
export function formatDate(iso?: string): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso ?? "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? iso! : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Only plain web addresses become links or images. */
export const safeHttps = (u?: string) => (u && /^https:\/\//i.test(u.trim()) ? u.trim() : "");
