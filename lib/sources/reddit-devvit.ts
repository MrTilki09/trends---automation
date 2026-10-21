import { z } from "zod";
import { getConfig } from "../config";
import { httpGet } from "./http";
import type { RawItemInput, SourceAdapter } from "./types";

/**
 * Reddit via our own Devvit app (`reddit-bridge/`), as an alternative to the Data API.
 *
 * The Devvit app runs on Reddit's servers and exposes one "external endpoint". The worker POSTs
 * the subreddits it wants; the app reads them with Devvit's built-in Reddit client and returns the
 * posts. Auth is a Devvit *managed token* (`devvit_at_…`) sent as `Authorization: bearer …`.
 *
 * Env:
 *   REDDIT_DEVVIT_URL    full endpoint URL, e.g.
 *                        https://trends-automation-<subreddit_id>-external.devvit.net/external/hot-posts
 *   REDDIT_DEVVIT_TOKEN  the managed token secret from the app's Developer Settings
 *
 * The request/response shapes below are the contract with reddit-bridge/src/server — keep both in sync.
 */
export const redditDevvitConfig = z.object({
  subreddits: z.array(z.string()).min(1),
  sort: z.enum(["hot", "top", "new"]).default("hot"),
  /** Time range for `top`. */
  timeframe: z.enum(["hour", "day", "week"]).default("day"),
  limit: z.number().int().positive().max(100).default(25),
});

export type BridgeRequest = z.infer<typeof redditDevvitConfig>;

export const bridgeResponse = z.object({
  posts: z.array(
    z.object({
      id: z.string(),
      subreddit: z.string(),
      title: z.string(),
      url: z.string().nullish(),
      permalink: z.string(),
      author: z.string().nullish(),
      createdAt: z.string(), // ISO date
      score: z.number(),
      comments: z.number(),
      flair: z.string().nullish(),
      body: z.string().nullish(),
      stickied: z.boolean().optional(),
    }),
  ),
  /** Per-subreddit failures (e.g. banned/private sub) — the rest still come back. */
  errors: z.array(z.object({ subreddit: z.string(), message: z.string() })).default([]),
});

export function parseBridgeResponse(json: unknown): { items: RawItemInput[]; errors: string[] } {
  const res = bridgeResponse.parse(json);
  const items = res.posts.flatMap((p): RawItemInput[] => {
    if (p.stickied) return [];
    const permalink = p.permalink.startsWith("http") ? p.permalink : `https://www.reddit.com${p.permalink}`;
    const created = new Date(p.createdAt);
    return [
      {
        externalId: p.id,
        // Link posts point at the article (lets them cluster with RSS items); text posts at Reddit.
        url: p.url && !p.url.includes("reddit.com/") ? p.url : permalink,
        title: p.title,
        summary: p.body?.slice(0, 1000) || undefined,
        author: p.author ?? undefined,
        publishedAt: Number.isNaN(created.getTime()) ? undefined : created,
        lang: "en",
        tags: [`r/${p.subreddit}`, "reddit", ...(p.flair ? [p.flair] : [])],
        metrics: { score: p.score, comments: p.comments },
        raw: { subreddit: p.subreddit, permalink },
      },
    ];
  });
  return { items, errors: res.errors.map((e) => `r/${e.subreddit}: ${e.message}`) };
}

export const redditDevvitAdapter: SourceAdapter = {
  type: "reddit_devvit",
  primaryMetric: "score",
  async fetch(config, { signal, logger }) {
    const cfg = redditDevvitConfig.parse(config);
    const env = getConfig();
    if (!env.REDDIT_DEVVIT_URL || !env.REDDIT_DEVVIT_TOKEN) {
      throw new Error("REDDIT_DEVVIT_URL / REDDIT_DEVVIT_TOKEN are not set (see README: Reddit via Devvit).");
    }
    const res = await httpGet(env.REDDIT_DEVVIT_URL, {
      signal,
      retries: 1,
      headers: {
        Authorization: `bearer ${env.REDDIT_DEVVIT_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      init: { method: "POST", body: JSON.stringify(cfg satisfies BridgeRequest) },
    });
    const { items, errors } = parseBridgeResponse(await res.json());
    if (errors.length) logger.warn({ errors }, "some subreddits failed");
    if (items.length === 0 && errors.length) throw new Error(errors.join("; "));
    return items;
  },
};
