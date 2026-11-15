import { z } from "zod";
import { HttpError, getJson } from "./http";
import { cleanImageUrl } from "./images";
import type { RawItemInput, SourceAdapter } from "./types";

/*
 * Wikipedia's most-read articles of the previous day (Wikimedia feed API, no key):
 *   GET https://api.wikimedia.org/feed/v1/wikipedia/<lang>/featured/YYYY/MM/DD
 * What the public is reading about: people, companies, products, films. Each comes with the
 * article's lead text and its lead image. Text is CC BY-SA (credit Wikipedia). Only images from
 * Wikimedia Commons (free licenses) are used: Wikipedia's own uploads (/wikipedia/en/…) are mostly
 * non-free posters and logos used under fair use, so they are dropped.
 * Only English has a most-read list in this feed.
 */
export const wikipediaConfig = z.object({
  lang: z.string().default("en"),
  limit: z.number().int().positive().max(50).default(25),
});

const article = z.object({
  views: z.number().default(0),
  rank: z.number().optional(),
  title: z.string(),
  normalizedtitle: z.string().optional(),
  titles: z.object({ normalized: z.string().optional() }).optional(),
  namespace: z.object({ id: z.number() }).optional(),
  description: z.string().optional(),
  extract: z.string().optional(),
  thumbnail: z.object({ source: z.string(), width: z.number().optional() }).optional(),
  originalimage: z.object({ source: z.string(), width: z.number().optional() }).optional(),
  content_urls: z.object({ desktop: z.object({ page: z.string() }) }).optional(),
});

const COMMONS = /\/wikipedia\/commons\//;
// Wikimedia's standard thumbnail widths; a listed width is served from cache.
const POST_WIDTH = 960;

/** A post-sized Commons image: the thumbnail URL re-sized to 960 px, or the original if smaller. */
export function commonsImage(a: z.infer<typeof article>): string | undefined {
  const thumb = a.thumbnail?.source;
  const orig = a.originalimage;
  if (!thumb || !COMMONS.test(thumb)) return undefined;
  if (orig && COMMONS.test(orig.source) && (orig.width ?? 0) <= POST_WIDTH) return cleanImageUrl(orig.source);
  return cleanImageUrl(thumb.replace(/\/\d+px-/, `/${POST_WIDTH}px-`));
}

export function parseWikipediaMostRead(json: unknown, lang: string, limit = 25): RawItemInput[] {
  const feed = z
    .object({ mostread: z.object({ date: z.string(), articles: z.array(z.unknown()) }).optional() })
    .parse(json);
  if (!feed.mostread) return [];
  const day = feed.mostread.date.slice(0, 10);
  return feed.mostread.articles.slice(0, limit).flatMap((raw): RawItemInput[] => {
    const parsed = article.safeParse(raw);
    if (!parsed.success) return [];
    const a = parsed.data;
    if (a.namespace && a.namespace.id !== 0) return [];
    const title = a.titles?.normalized ?? a.normalizedtitle ?? a.title.replace(/_/g, " ");
    return [
      {
        // The same article can be most-read again tomorrow: that is a new item.
        externalId: `${lang}:${a.title}:${day}`,
        url:
          a.content_urls?.desktop.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(a.title)}`,
        title,
        summary: a.extract?.trim() || undefined,
        author: "Wikipedia",
        publishedAt: new Date(`${day}T12:00:00Z`),
        lang,
        tags: [],
        metrics: { views: a.views },
        raw: { image: commonsImage(a), license: "CC BY-SA 4.0", description: a.description, rank: a.rank },
      },
    ];
  });
}

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;

export const wikipediaMostReadAdapter: SourceAdapter = {
  type: "wikipedia_mostread",
  primaryMetric: "views",
  async fetch(config, { signal }) {
    const cfg = wikipediaConfig.parse(config ?? {});
    // Today's feed holds yesterday's most-read list; early in the UTC day it may not exist yet.
    for (const offset of [0, 1]) {
      const date = new Date(Date.now() - offset * 86_400_000);
      try {
        const json = await getJson(
          `https://api.wikimedia.org/feed/v1/wikipedia/${cfg.lang}/featured/${ymd(date)}`,
          {
            signal,
          },
        );
        const items = parseWikipediaMostRead(json, cfg.lang, cfg.limit);
        if (items.length) return items;
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 404)) throw err;
      }
    }
    return [];
  },
};
