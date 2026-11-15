import { z } from "zod";
import { mapLimit } from "../util/concurrency";
import { getJson } from "./http";
import { cleanImageUrl } from "./images";
import { sha1 } from "./rss";
import { decodeEntities } from "./text";
import type { RawItemInput, SourceAdapter } from "./types";

/*
 * Links trending on Mastodon servers right now (public API, no key):
 *   GET https://<instance>/api/v1/trends/links?limit=20
 * Each link comes as a preview card: title, description, image, publisher name, language, and how
 * many people shared it today. Tech-leaning servers (fosstodon, hachyderm, infosec.exchange…)
 * surface tech stories; the categorizer decides what counts as tech.
 */
export const mastodonConfig = z.object({
  instances: z.array(z.string().min(3)).min(1),
  limit: z.number().int().positive().max(20).default(20),
});

const card = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  author_name: z.string().optional().nullable(),
  provider_name: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  image_description: z.string().optional().nullable(),
  published_at: z.string().optional().nullable(),
  history: z
    .array(z.object({ day: z.string(), uses: z.coerce.number(), accounts: z.coerce.number() }))
    .default([]),
});

/** One instance's trending links -> items. Today's share counts are the engagement metric. */
export function parseMastodonTrends(json: unknown, instance: string): RawItemInput[] {
  return z
    .array(z.unknown())
    .parse(json)
    .flatMap((raw): RawItemInput[] => {
      const parsed = card.safeParse(raw);
      if (!parsed.success || !parsed.data.title.trim()) return [];
      const c = parsed.data;
      const today = c.history[0];
      const published = c.published_at ? new Date(c.published_at) : undefined;
      const publisher = c.provider_name?.trim() || undefined;
      return [
        {
          // The same link trends on several servers: one id, so the copies merge (highest counts kept).
          externalId: c.url.length > 200 ? sha1(c.url) : c.url,
          url: c.url,
          title: decodeEntities(c.title.trim()),
          summary: c.description ? decodeEntities(c.description).trim() || undefined : undefined,
          author: publisher,
          publishedAt: published && !Number.isNaN(published.getTime()) ? published : undefined,
          lang: c.language || undefined,
          tags: [],
          metrics: { shares: today?.accounts ?? 0, posts: today?.uses ?? 0 },
          raw: {
            instance,
            publisher,
            byline: c.author_name || undefined,
            image: cleanImageUrl(c.image),
            imageAlt: c.image_description || undefined,
            history: c.history,
          },
        },
      ];
    });
}

export const mastodonTrendsAdapter: SourceAdapter = {
  type: "mastodon_trends",
  primaryMetric: "shares",
  async fetch(config, { signal, logger }) {
    const cfg = mastodonConfig.parse(config);
    const errors: string[] = [];
    const perInstance = await mapLimit(cfg.instances, 3, async (host) => {
      try {
        const json = await getJson(`https://${host}/api/v1/trends/links?limit=${cfg.limit}`, { signal });
        return parseMastodonTrends(json, host);
      } catch (err) {
        const msg = `${host}: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn({ instance: host, err: msg }, "mastodon instance failed");
        errors.push(msg);
        return [];
      }
    });
    if (errors.length === cfg.instances.length) throw new Error(errors.join("; "));
    return perInstance.flat();
  },
};
