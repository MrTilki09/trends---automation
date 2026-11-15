import { z } from "zod";
import { getJson } from "./http";
import { cleanImageUrl } from "./images";
import type { RawItemInput, SourceAdapter } from "./types";

/*
 * DEV Community's public API (no key): GET https://dev.to/api/articles?top=1&per_page=30
 * = the most-reacted articles of the last day. Unlike dev.to's RSS feed, the API gives each
 * article's cover image, description, tags and reaction/comment counts.
 */
export const devtoConfig = z.object({
  /** Top articles of the last N days. */
  top: z.number().int().positive().max(30).default(1),
  perPage: z.number().int().positive().max(100).default(30),
});

const article = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().optional().nullable(),
  url: z.string(),
  canonical_url: z.string().optional().nullable(),
  comments_count: z.number().default(0),
  public_reactions_count: z.number().default(0),
  published_timestamp: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  cover_image: z.string().optional().nullable(),
  social_image: z.string().optional().nullable(),
  tag_list: z.union([z.array(z.string()), z.string()]).default([]),
  user: z.object({ name: z.string().optional(), username: z.string().optional() }).optional(),
});

export function parseDevtoArticles(json: unknown): RawItemInput[] {
  return z
    .array(z.unknown())
    .parse(json)
    .flatMap((raw): RawItemInput[] => {
      const parsed = article.safeParse(raw);
      if (!parsed.success) return [];
      const a = parsed.data;
      const published = a.published_timestamp ? new Date(a.published_timestamp) : undefined;
      const tags = Array.isArray(a.tag_list) ? a.tag_list : a.tag_list.split(",").map((t) => t.trim());
      return [
        {
          externalId: String(a.id),
          url: a.url,
          title: a.title.trim(),
          summary: a.description?.trim() || undefined,
          author: a.user?.name ?? a.user?.username,
          publishedAt: published && !Number.isNaN(published.getTime()) ? published : undefined,
          lang: a.language || undefined,
          tags: tags.filter(Boolean),
          metrics: { reactions: a.public_reactions_count, comments: a.comments_count },
          // cover_image is what the author chose; social_image is dev.to's generated card when there is none.
          raw: {
            image: cleanImageUrl(a.cover_image) ?? cleanImageUrl(a.social_image),
            canonicalUrl: a.canonical_url ?? undefined,
          },
        },
      ];
    });
}

export const devtoAdapter: SourceAdapter = {
  type: "devto",
  primaryMetric: "reactions",
  async fetch(config, { signal }) {
    const cfg = devtoConfig.parse(config ?? {});
    return parseDevtoArticles(
      await getJson(`https://dev.to/api/articles?top=${cfg.top}&per_page=${cfg.perPage}`, { signal }),
    );
  },
};
