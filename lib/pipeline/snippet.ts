import { normalizeTitle } from "./normalize";

/*
 * Display text for the app, made only from what publishers put in their feeds. No AI, no scraping:
 * every function here is plain, deterministic text cleanup, so it is unit-tested and cheap.
 */

export const SNIPPET_MAX = 300;
/** Shorter than this after cleanup = not worth showing. */
export const SNIPPET_MIN = 40;

const BOILERPLATE: RegExp[] = [
  // WordPress: "The post <title> appeared first on <site>."
  /\s*The post .{1,300}? appeared first on .{1,120}?\.?\s*$/i,
  // "Continue reading…", "Read more", "[…]", "[...]" at the end.
  /\s*(continue reading|read more|devamını oku|haberin devamı)\s*(\.{3}|…|»|→)?\s*$/i,
  /\s*\[(…|\.{3})\]\s*$/,
  // Hacker News RSS bodies: "Article URL: … Comments URL: … Points: … # Comments: …"
  /\s*Article URL:.*$/i,
  /\s*Comments URL:.*$/i,
];

/** Techmeme: "Author / Publication: text" or "Publication: text" with a known shape. */
const TECHMEME_PREFIX = /^(?:[\p{L}.' -]{2,60} \/ )?([\p{L}\p{N}.&' -]{2,60}):\s+(?=\S)/u;

/**
 * Cleans a feed summary into a snippet: boilerplate removed, whitespace collapsed, cut at a sentence
 * boundary at ≤ 300 chars. Returns null when nothing useful is left or it only repeats the title
 * (Google News "snippets" are "<headline> <Publisher>").
 */
export function cleanSnippet(
  summary: string | null | undefined,
  title: string,
  opts: { stripCreditPrefix?: boolean } = {},
): string | null {
  if (!summary) return null;
  let s = summary.replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 2; pass++) for (const re of BOILERPLATE) s = s.replace(re, "").trim();
  if (opts.stripCreditPrefix) s = s.replace(TECHMEME_PREFIX, "").trim();
  // Text that is mostly links (e.g. a Hacker News post that only lists URLs) isn't a snippet.
  const withoutLinks = s.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  if (withoutLinks.length < SNIPPET_MIN) return null;
  if (!s) return null;

  // Only repeats the headline (optionally followed by a short publisher name)?
  const nt = normalizeTitle(title);
  const ns = normalizeTitle(s);
  if (nt && (ns === nt || (ns.startsWith(nt) && ns.length - nt.length <= 40))) return null;

  if (s.length > SNIPPET_MAX) s = cutAtSentence(s, SNIPPET_MAX);
  return s.length >= SNIPPET_MIN ? s : null;
}

/** Cuts at the last sentence end before `max` (if it keeps at least 40%), else at a word, adding "…". */
export function cutAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentenceEnd >= max * 0.4) return head.slice(0, sentenceEnd + 1);
  const space = head.lastIndexOf(" ");
  return `${(space > 0 ? head.slice(0, space) : head).replace(/[\s,;:–—-]+$/, "")}…`;
}

/**
 * Who published an item. Google News items: the real publisher (kept as `author` by the RSS adapter).
 * Every Hacker News feed is "Hacker News". Otherwise the source name without its "(section)" suffix.
 */
export function publisherOf(item: {
  sourceName: string;
  sourceType: string;
  url?: string | null;
  author?: string | null;
}): string {
  const name = item.sourceName.trim();
  if (/^google news/i.test(name) || /^https:\/\/news\.google\.com\//.test(item.url ?? "")) {
    return item.author?.trim() || "Google News";
  }
  if (item.sourceType === "hackernews" || /^hacker news/i.test(name)) return "Hacker News";
  const base = name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
  // "CNBC Technology", "Reuters Technology", "Bloomberg Technology" = the same publisher as "CNBC"...
  return base.replace(/^(\S.*?)\s+(technology|tech|teknoloji|business|science|ai)$/i, "$1");
}

/** Techmeme puts "Author / Publication:" in front of every summary. */
export function hasCreditPrefix(sourceName: string): boolean {
  return /techmeme/i.test(sourceName);
}

/** The feed image from an item's stored `raw` (rss adapter), if it is a usable http(s) URL. */
export function imageUrlOf(raw: unknown): string | null {
  const img = (raw as { image?: unknown } | null)?.image;
  if (typeof img !== "string") return null;
  const url = img.trim();
  return /^https?:\/\/\S+$/i.test(url) && url.length <= 2000 ? url.replace(/^http:/i, "https:") : null;
}

/** Everything the app needs from one item, computed once at ingest (and by the backfill). */
export function displayFields(item: {
  title: string;
  summary?: string | null;
  url?: string | null;
  author?: string | null;
  raw?: unknown;
  sourceName: string;
  sourceType: string;
}): { snippet: string | null; imageUrl: string | null; publisher: string } {
  return {
    // Google Trends "summaries" are lists of other outlets' headlines, not a publisher's text.
    snippet:
      item.sourceType === "google_trends"
        ? null
        : cleanSnippet(item.summary, item.title, { stripCreditPrefix: hasCreditPrefix(item.sourceName) }),
    imageUrl: imageUrlOf(item.raw),
    publisher: publisherOf(item),
  };
}

export type ItemForPick = {
  snippet: string | null;
  imageUrl: string | null;
  publisher: string | null;
  sourceWeight: number;
  publishedAt: Date | null;
  fetchedAt: Date;
};

/**
 * The topic's display item: highest source weight, then earliest. Snippet and image may come from
 * different items (the best item with a snippet, the best with an image).
 */
export function pickDisplay(items: ItemForPick[]): {
  snippet: string | null;
  snippetPublisher: string | null;
  imageUrl: string | null;
  publisherCount: number;
} {
  const ranked = [...items].sort(
    (a, b) =>
      b.sourceWeight - a.sourceWeight ||
      (a.publishedAt ?? a.fetchedAt).getTime() - (b.publishedAt ?? b.fetchedAt).getTime(),
  );
  const withSnippet = ranked.find((i) => i.snippet);
  const withImage = ranked.find((i) => i.imageUrl);
  const publishers = new Set(items.map((i) => (i.publisher ?? "").toLowerCase()).filter(Boolean));
  return {
    snippet: withSnippet?.snippet ?? null,
    snippetPublisher: withSnippet?.publisher ?? null,
    imageUrl: withImage?.imageUrl ?? null,
    publisherCount: Math.max(publishers.size, items.length ? 1 : 0),
  };
}
