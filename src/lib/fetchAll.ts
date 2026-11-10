// Supabase (PostgREST) returns at most 1000 rows per request, whatever .limit() says. This reads page by page until a short page.
const PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** `build(from, to)` must return the query for that row range, with a stable order so pages don't overlap. */
export async function fetchAll<T>(build: (from: number, to: number) => Page<T>, maxRows = 100000): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}

/** Decodes a piece of the address; a malformed one (like "%E0%A4%A") gives the raw text instead of throwing. */
export function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
