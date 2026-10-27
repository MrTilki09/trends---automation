import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { z } from "zod";
import { mapLimit } from "../util/concurrency";
import { getText } from "./http";
import type { RawItemInput, SourceAdapter } from "./types";

export const rssConfig = z.object({
  feeds: z
    .array(
      z.object({
        url: z.url(),
        /** Optional extra weight for this feed (multiplied with the source weight). */
        weight: z.number().positive().default(1),
        lang: z.string().optional(),
      }),
    )
    .min(1),
  maxItemsPerFeed: z.number().int().positive().default(30),
  lang: z.string().optional(),
});

// <source> is the original publisher on aggregator feeds (Google News).
const parser = new Parser({ customFields: { item: ["source"] } });

/**
 * Google News titles end with " - Publisher" and links are news.google.com redirects. Strip the
 * suffix so the title clusters with the publisher's own feed, and keep the publisher as author.
 */
function splitGoogleNewsTitle(title: string, link: string | undefined, source: unknown) {
  if (!link || !/^https:\/\/news\.google\.com\//.test(link)) return { title };
  const publisher = textOf(source);
  const suffix = publisher ? ` - ${publisher}` : undefined;
  if (suffix && title.endsWith(suffix)) return { title: title.slice(0, -suffix.length).trim(), publisher };
  const m = title.match(/^(.+) - ([^-]{2,60})$/);
  return m ? { title: m[1]!.trim(), publisher: publisher ?? m[2]!.trim() } : { title, publisher };
}

export function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function stripHtml(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const text = s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 1000) : undefined;
}

/**
 * Feeds sometimes send structured values where a string is expected, e.g. Google's blog sends
 * <author><name>…</name><title>…</title></author>. Pull out the readable text.
 */
function textOf(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (Array.isArray(v)) return textOf(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return textOf(o.name) ?? textOf(o._);
  }
  return undefined;
}

/** <category> values; rss-parser gives strings, or objects like { _: "AI" } for attributes. */
function feedCategories(cats: unknown): string[] {
  if (!Array.isArray(cats)) return [];
  return cats
    .map((c) => (typeof c === "string" ? c : typeof c === "object" && c && "_" in c ? String(c._) : ""))
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Parses an RSS 2.0 or Atom document into RawItemInputs. */
export async function parseFeed(
  xml: string,
  opts: { weight?: number; lang?: string; maxItems?: number } = {},
): Promise<RawItemInput[]> {
  const feed = await parser.parseString(xml);
  const out: RawItemInput[] = [];
  for (const item of feed.items.slice(0, opts.maxItems ?? 30)) {
    const rawTitle = item.title?.trim();
    if (!rawTitle) continue;
    const url = item.link?.trim() || undefined;
    const { title, publisher } = splitGoogleNewsTitle(rawTitle, url, (item as { source?: unknown }).source);
    if (!title) continue;
    const idSource = item.guid || (item as { id?: string }).id || url || title;
    const published = item.isoDate ?? item.pubDate;
    const date = published ? new Date(published) : undefined;
    out.push({
      externalId: idSource.length > 200 ? sha1(idSource) : idSource,
      url,
      title,
      summary: stripHtml(item.contentSnippet ?? item.summary ?? item.content),
      author: textOf(item.creator) ?? textOf((item as { author?: unknown }).author) ?? publisher,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date : undefined,
      lang: opts.lang,
      tags: feedCategories(item.categories),
      // RSS has no engagement numbers. `weight` is the per-feed multiplier used in scoring.
      metrics: opts.weight && opts.weight !== 1 ? { weight: opts.weight } : {},
      raw: { feedTitle: feed.title, guid: item.guid, link: item.link, categories: item.categories },
    });
  }
  return out;
}

export const rssAdapter: SourceAdapter = {
  type: "rss",
  async fetch(config, { signal, logger }) {
    const cfg = rssConfig.parse(config);
    const errors: string[] = [];
    const perFeed = await mapLimit(cfg.feeds, 3, async (feed) => {
      try {
        const xml = await getText(feed.url, { signal });
        return await parseFeed(xml, {
          weight: feed.weight,
          lang: feed.lang ?? cfg.lang,
          maxItems: cfg.maxItemsPerFeed,
        });
      } catch (err) {
        const msg = `${feed.url}: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn({ feed: feed.url, err: msg }, "feed failed");
        errors.push(msg);
        return [];
      }
    });
    // If every feed of this source failed, the source as a whole failed.
    if (errors.length === cfg.feeds.length) throw new Error(errors.join("; "));
    return perFeed.flat();
  },
};
