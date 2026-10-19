/**
 * Normalization: makes URLs and titles comparable across sources so duplicates can be found.
 * Pure functions — no DB, easy to unit test.
 */

// Query parameters that only track where a click came from; they never change the page.
const TRACKING_PARAMS = new Set([
  "ref",
  "ref_src",
  "ref_url",
  "referrer",
  "source",
  "fbclid",
  "gclid",
  "dclid",
  "yclid",
  "msclkid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "ocid",
  "cmpid",
  "spm",
  "share",
  "smid",
  "taid",
  "guccounter",
  "__twitter_impression",
]);

/**
 * Canonical form of a URL: https, lowercase host without `www.`, no tracking params,
 * no fragment, no trailing slash, remaining params sorted. Returns null for non-http(s) / invalid URLs.
 */
export function canonicalizeUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...url.searchParams.entries()]
    .filter(([k]) => {
      const key = k.toLowerCase();
      return !key.startsWith("utm_") && !TRACKING_PARAMS.has(key);
    })
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const port = url.port && url.port !== "80" && url.port !== "443" ? `:${url.port}` : "";
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${host}${port}${path}${query}`;
}

/** Lowercases with Turkish rules when lang is 'tr' (I -> ı, İ -> i), default rules otherwise. */
export function lowercase(s: string, lang?: string): string {
  return lang?.toLowerCase().startsWith("tr") ? s.toLocaleLowerCase("tr-TR") : s.toLocaleLowerCase("en-US");
}

/**
 * Title normalization for matching (display always uses the original title):
 * 1. language-aware lowercasing,
 * 2. fold diacritics (ş->s, ç->c, ğ->g, ö->o, ü->u, ı->i) so "Işık" and "isik" match and
 *    Turkish and English spellings of names converge,
 * 3. punctuation -> spaces, collapse whitespace.
 */
export function normalizeTitle(title: string, lang?: string): string {
  return lowercase(title, lang)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // combining marks (accents, the dot of "i̇")
    .replace(/ı/g, "i")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Very small language guess for sources that don't declare one. */
export function guessLang(text: string): string | undefined {
  return /[çğışöüÇĞİŞÖÜ]/.test(text) ? "tr" : undefined;
}

// Stopword lists are in *normalized* form (lowercase, no diacritics).
const EN_STOPWORDS =
  "a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its just more most my new no not now of on one or our out over says so than that the their them then there these they this to up us was we were what when where which who why will with would you your about after all also any back because before being both down even first get got just like make many may much off only other own same see should since some still such take too two under very via way well while year years vs".split(
    " ",
  );
const TR_STOPWORDS =
  "acaba ama ancak aslinda az bazi belki ben beni benim beri bile bir birkac birsey biz bizi bizim bu buna bunda bundan bunu bunun burada da daha de defa diye dogru en gibi hem hep hepsi her hic icin ile ise kadar ki kim kimi mi mu mi nasil ne neden nerde nerede nereye nicin niye o olan olarak oldu oldugu olmak olsa olur on ona ondan onlar onlari onu onun orada sanki sey siz sizi sizin su tum uzere ve veya ya yani yeni yine yok zaten ilk son gore sonra once kez yil yili yilinda icinde uzerinde arasinda tarafindan iste".split(
    " ",
  );
export const STOPWORDS = new Set([...EN_STOPWORDS, ...TR_STOPWORDS]);

/** Top non-stopword tokens across a topic's (normalized) titles, most frequent first. */
export function extractKeywords(normalizedTitles: string[], max = 8): string[] {
  const counts = new Map<string, number>();
  for (const title of normalizedTitles) {
    // Count each token once per title so one long title doesn't dominate.
    for (const tok of new Set(title.split(" "))) {
      if (tok.length < 2 || STOPWORDS.has(tok) || /^\d+$/.test(tok)) continue;
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  // Map keeps insertion order, and sort is stable, so ties keep first-appearance order.
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([tok]) => tok);
}
