// Place search in the style of map apps: forgiving, ranked by relevance, and silent about things that are truly unrelated.
//  - ignores case, accents and punctuation ("Loktak, Lake" = "loktak lake")
//  - a word being typed still matches ("khong" finds "Khongjom")
//  - small typos still match ("loktek", "imphl")
//  - spaces don't matter ("khong jom" finds "Khongjom")
//  - every word you type must match something; if no place satisfies all of them, the best partial matches are shown
//  - typos are forgiven in names only, so a misspelt "imphl" finds places named Imphal, not everything in the Imphal district
//  - at most 8 results, fewer when fewer are probable
//  - best matches first: name beats category and district, which beat the description

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const words = (s: string) => normalize(s).split(" ").filter(Boolean);

/** Edit distance (insert, delete, replace, swap of neighbours), giving up early above `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * A rough "how it sounds" key, for names that are spelt several ways (Khongjom / Khongjam, Meitei / Meetei, Lairembi / Lairenbi):
 * aspirated pairs collapse (kh>k, th>t, bh>b…), every vowel group becomes one "a", n before b or p becomes m, doubled letters become one.
 */
export function soundKey(w: string): string {
  return w
    .replace(/(k|g|t|d|p|b|c|s)h/g, "$1").replace(/ph/g, "p").replace(/[wv]/g, "w").replace(/[yj]/g, "j")
    .replace(/n(?=[bp])/g, "m").replace(/[aeiou]+/g, "a").replace(/(.)+/g, "$1");
}

/** How many typos a word of this length may contain: none for short words, one for medium, two for long. */
const allowedTypos = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/** How well one typed word matches a list of words: 0 = not at all. */
function wordScore(t: string, ws: string[], fuzzy = true): number {
  let best = 0;
  for (const w of ws) {
    if (w === t) return 10;
    if (w.startsWith(t)) best = Math.max(best, 8);
    else if (fuzzy && t.length >= 3 && w.includes(t)) best = Math.max(best, 5);
    else if (fuzzy && best < 4) {
      const k = allowedTypos(t.length);
      // a typo anywhere in the word, or in the part of it typed so far
      if (k && (editDistance(t, w, k) <= k || (w.length > t.length && editDistance(t, w.slice(0, t.length), k) <= k))) best = 4;
    }
  }
  return best;
}

export interface SearchFields { name: string; category?: string; district?: string; desc?: string; notes?: string }

interface Prepared { name: string[]; nameCompact: string; extra: string[]; text: string }

/** Relevance of one place to one typed word. */
function tokenScore(t: string, f: Prepared): number {
  let s = wordScore(t, f.name);
  if (s >= 4 && f.name[0] && wordScore(t, [f.name[0]]) === s) s += 1; // a name that starts with it ("Imphal College") beats one that only contains it
  if (t.length >= 3 && f.nameCompact.includes(t)) s = Math.max(s, 6);
  s = Math.max(s, wordScore(t, f.extra, false) * 0.6); // category and district: exact or start of a word only, never a typo
  if (!s && t.length >= 3 && f.text.includes(t)) s = 1.5; // only mentioned in the description or notes
  return s;
}

/**
 * The best (at most SEARCH_MAX) places that match the text, most relevant first. Returns `null` for an empty query (no filtering).
 * Every typed word must match; when nothing satisfies them all, places matching the most words are returned instead.
 */
export const SEARCH_MAX = 8; // like a map app's suggestions: the best few, never a long tail

export interface SearchResult<T> { hits: { item: T; score: number }[]; total: number } // total = matches before the cap

export function searchPlaces<T>(items: T[], query: string, fields: (item: T) => SearchFields, max = SEARCH_MAX): SearchResult<T> | null {
  const tokens = words(query);
  if (!tokens.length) return null;
  const compactQuery = tokens.join("");
  const scored = items.map(item => {
    const x = fields(item);
    const f: Prepared = {
      name: words(x.name),
      nameCompact: normalize(x.name).replace(/ /g, ""),
      extra: words([x.category, x.district].filter(Boolean).join(" ")),
      text: normalize([x.desc, x.notes].filter(Boolean).join(" "))
    };
    const per = tokens.map(t => tokenScore(t, f));
    // The whole query, spaces removed, may be one name written differently ("khong jom" = "khongjom").
    const whole = compactQuery.length >= 4 && tokens.length > 1 && f.nameCompact.includes(compactQuery) ? 9 * tokens.length : 0;
    const matched = per.filter(Boolean).length;
    return { item, matched, score: Math.max(per.reduce((a, b) => a + b, 0), whole) - f.nameCompact.length / 1000, all: matched === tokens.length || whole > 0 };
  });
  const full = scored.filter(r => r.all);
  let pool = full;
  if (!full.length) {
    const most = Math.max(0, ...scored.map(r => r.matched));
    pool = most ? scored.filter(r => r.matched === most) : [];
  }
  const cap = (r: { item: T; score: number }[]): SearchResult<T> => ({ hits: r.slice(0, max), total: r.length });
  if (!pool.length) return cap(soundAlike(items, tokens, fields));
  const ranked = pool.sort((a, b) => b.score - a.score).map(({ item, score }) => ({ item, score }));
  // No exact or start-of-word match (the best is only a typo fix or a mention): keep just the results close to the best one.
  return cap(ranked.length && ranked[0].score < 8 ? ranked.filter(r => r.score >= ranked[0].score * 0.75) : ranked);
}

/** Last resort when nothing matched: places whose name has words that sound like every typed word. */
function soundAlike<T>(items: T[], tokens: string[], fields: (item: T) => SearchFields) {
  const keys = tokens.map(soundKey);
  const hits: { item: T; score: number }[] = [];
  for (const item of items) {
    const nameKeys = words(fields(item).name).map(soundKey);
    let score = 0;
    const every = keys.every(k => {
      if (k.length < 3) return false;
      const best = nameKeys.reduce((b, n) => Math.max(b, n === k ? 3 : n.startsWith(k) ? 2 : k.length >= 5 && editDistance(k, n, 1) <= 1 ? 1 : 0), 0);
      score += best;
      return best > 0;
    });
    if (every) hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.filter(h => h.score === hits[0].score); // only the closest-sounding tier
}
