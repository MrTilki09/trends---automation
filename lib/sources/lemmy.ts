import { z } from "zod";
import { mapLimit } from "../util/concurrency";
import { getJson } from "./http";
import { cleanImageUrl, linkCardImage } from "./images";
import { htmlToText } from "./text";
import type { RawItemInput, SourceAdapter } from "./types";

/*
 * Lemmy (federated Reddit alternative), public API, no key:
 *   GET https://<host>/api/v3/post/list?community_name=<name>&sort=Hot&limit=20
 * Compared with Lemmy's RSS feeds the API adds the link's preview (thumbnail + description, which
 * Lemmy fetched when the post was made) and the score and comment counts.
 */
export const lemmyConfig = z.object({
  communities: z
    .array(z.object({ host: z.string(), name: z.string(), tags: z.array(z.string()).default([]) }))
    .min(1),
  sort: z.enum(["Hot", "Active", "TopDay", "New"]).default("Hot"),
  limit: z.number().int().positive().max(50).default(20),
});

const postView = z.object({
  post: z.object({
    id: z.number(),
    name: z.string(),
    url: z.string().optional().nullable(),
    body: z.string().optional().nullable(),
    published: z.string().optional().nullable(),
    deleted: z.boolean().default(false),
    removed: z.boolean().default(false),
    nsfw: z.boolean().default(false),
    embed_description: z.string().optional().nullable(),
    thumbnail_url: z.string().optional().nullable(),
    ap_id: z.string(),
  }),
  counts: z.object({ comments: z.number().default(0), score: z.number().default(0) }),
  community: z.object({ name: z.string() }).optional(),
  creator: z.object({ name: z.string().optional() }).optional(),
});

export function parseLemmyPosts(json: unknown, community: { host: string; name: string; tags?: string[] }) {
  const posts = z.object({ posts: z.array(z.unknown()) }).parse(json).posts;
  return posts.flatMap((raw): RawItemInput[] => {
    const parsed = postView.safeParse(raw);
    if (!parsed.success) return [];
    const { post, counts } = parsed.data;
    if (post.deleted || post.removed || post.nsfw) return [];
    // Lemmy omits the zone: "2026-11-14T09:12:00.123456" is UTC.
    const published = post.published
      ? new Date(/Z|[+-]\d\d:?\d\d$/.test(post.published) ? post.published : `${post.published}Z`)
      : undefined;
    const link = post.url ?? post.ap_id;
    return [
      {
        externalId: post.ap_id,
        url: link,
        title: post.name.trim(),
        summary: post.embed_description?.trim() || htmlToText(post.body),
        author: parsed.data.creator?.name,
        publishedAt: published && !Number.isNaN(published.getTime()) ? published : undefined,
        tags: [...(community.tags ?? []), community.name],
        metrics: { score: counts.score, comments: counts.comments },
        raw: {
          image: cleanImageUrl(post.thumbnail_url) ?? linkCardImage(post.url),
          community: `${community.name}@${community.host}`,
          lemmyUrl: post.ap_id,
        },
      },
    ];
  });
}

export const lemmyAdapter: SourceAdapter = {
  type: "lemmy",
  primaryMetric: "score",
  async fetch(config, { signal, logger }) {
    const cfg = lemmyConfig.parse(config);
    const errors: string[] = [];
    const perCommunity = await mapLimit(cfg.communities, 3, async (c) => {
      const url = `https://${c.host}/api/v3/post/list?community_name=${encodeURIComponent(c.name)}&sort=${cfg.sort}&limit=${cfg.limit}`;
      try {
        return parseLemmyPosts(await getJson(url, { signal }), c);
      } catch (err) {
        const msg = `${c.name}@${c.host}: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn({ community: c.name, host: c.host, err: msg }, "lemmy community failed");
        errors.push(msg);
        return [];
      }
    });
    if (errors.length === cfg.communities.length) throw new Error(errors.join("; "));
    return perCommunity.flat();
  },
};
