import Parser from "rss-parser";
import { z } from "zod";
import { getText } from "./http";
import type { RawItemInput, SourceAdapter } from "./types";

// "Trending now" RSS feed (verified Oct 2026): https://trends.google.com/trending/rss?geo=TR
// Items carry custom <ht:*> fields: approx_traffic ("20K+") and related <ht:news_item>s.
export const GOOGLE_TRENDS_URL = "https://trends.google.com/trending/rss";

export const googleTrendsConfig = z.object({
  geos: z.array(z.string().length(2)).min(1).default(["TR", "US"]),
  /** Language per geo for normalization, e.g. { TR: "tr" }. */
  langs: z.record(z.string(), z.string()).default({ TR: "tr" }),
});

type NewsItem = { title?: string; url?: string; source?: string };
type TrendItem = {
  title?: string;
  pubDate?: string;
  approxTraffic?: string;
  newsItems?: Record<string, string[]>[];
};

const parser = new Parser<Record<string, never>, TrendItem>({
  customFields: {
    item: [
      ["ht:approx_traffic", "approxTraffic"],
      ["ht:news_item", "newsItems", { keepArray: true }],
    ],
  },
});

/** "20K+" -> 20000, "2M+" -> 2000000, "500+" -> 500, "1,000+" -> 1000. */
export function parseApproxTraffic(value: string | undefined): number {
  if (!value) return 0;
  const m = value.replace(/[,\s]/g, "").match(/^([\d.]+)([KMB])?/i);
  if (!m) return 0;
  const n = Number.parseFloat(m[1] ?? "0");
  const suffix = (m[2] ?? "").toUpperCase();
  const mult = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
  return Math.round(n * mult);
}

function first(v: string[] | undefined): string | undefined {
  const s = v?.[0];
  return typeof s === "string" && s.trim() ? s.trim() : undefined;
}

export async function parseGoogleTrends(xml: string, geo: string, lang?: string): Promise<RawItemInput[]> {
  const feed = await parser.parseString(xml);
  return feed.items.flatMap((item): RawItemInput[] => {
    const title = item.title?.trim();
    if (!title) return [];
    const news: NewsItem[] = (item.newsItems ?? []).map((n) => ({
      title: first(n["ht:news_item_title"]),
      url: first(n["ht:news_item_url"]),
      source: first(n["ht:news_item_source"]),
    }));
    const published = item.pubDate ? new Date(item.pubDate) : undefined;
    const valid = published && !Number.isNaN(published.getTime());
    const day = valid ? published.toISOString().slice(0, 10) : "";
    const summary = news
      .map((n) => n.title)
      .filter(Boolean)
      .join(" · ")
      .slice(0, 1000);
    return [
      {
        // A trend can come back on another day; include the day so that counts as a new item.
        externalId: `${geo}:${title.toLowerCase()}:${day}`,
        // The trend itself has no article; use the first related news URL so it can cluster with RSS items.
        url: news.find((n) => n.url)?.url,
        title,
        summary: summary || undefined,
        publishedAt: valid ? published : undefined,
        lang,
        metrics: { approxTraffic: parseApproxTraffic(item.approxTraffic) },
        raw: { geo, approxTraffic: item.approxTraffic, news },
      },
    ];
  });
}

export const googleTrendsAdapter: SourceAdapter = {
  type: "google_trends",
  primaryMetric: "approxTraffic",
  async fetch(config, { signal, logger }) {
    const cfg = googleTrendsConfig.parse(config ?? {});
    const results: RawItemInput[] = [];
    const errors: string[] = [];
    for (const geo of cfg.geos) {
      try {
        const xml = await getText(`${GOOGLE_TRENDS_URL}?geo=${encodeURIComponent(geo)}`, { signal });
        results.push(...(await parseGoogleTrends(xml, geo, cfg.langs[geo])));
      } catch (err) {
        const msg = `${geo}: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn({ geo, err: msg }, "google trends geo failed");
        errors.push(msg);
      }
    }
    if (errors.length === cfg.geos.length) throw new Error(errors.join("; "));
    return results;
  },
};
