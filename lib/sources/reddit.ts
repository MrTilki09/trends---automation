import { z } from "zod";
import { getConfig } from "../config";
import { getJson, httpGet } from "./http";
import type { RawItemInput, SourceAdapter } from "./types";

/**
 * Reddit (OPTIONAL, disabled by default).
 *
 * As of 2026 Reddit's public `.json` endpoints return 403, and new Data API access needs approval
 * under Reddit's Responsible Builder Policy. This adapter uses a "script" app with the password
 * grant; it only works once you have approved credentials in the REDDIT_* env vars. See README.
 */
export const redditConfig = z.object({
  subreddits: z.array(z.string()).min(1),
  sort: z.enum(["hot", "top"]).default("hot"),
  /** Time range for `top`. */
  t: z.enum(["hour", "day", "week"]).default("day"),
  limit: z.number().int().positive().max(100).default(25),
});

const listing = z.object({
  data: z.object({
    children: z.array(
      z.object({
        data: z.object({
          id: z.string(),
          title: z.string(),
          url: z.string().optional(),
          permalink: z.string(),
          author: z.string().optional(),
          created_utc: z.number(),
          score: z.number(),
          num_comments: z.number(),
          upvote_ratio: z.number().optional(),
          selftext: z.string().optional(),
          stickied: z.boolean().optional(),
          subreddit: z.string(),
          link_flair_text: z.string().nullable().optional(),
        }),
      }),
    ),
  }),
});

export function parseRedditListing(json: unknown): RawItemInput[] {
  return listing.parse(json).data.children.flatMap(({ data: p }): RawItemInput[] =>
    p.stickied
      ? []
      : [
          {
            externalId: p.id,
            url: p.url ?? `https://www.reddit.com${p.permalink}`,
            title: p.title,
            summary: p.selftext?.slice(0, 1000) || undefined,
            author: p.author,
            publishedAt: new Date(p.created_utc * 1000),
            tags: [`r/${p.subreddit}`, ...(p.link_flair_text ? [p.link_flair_text] : [])],
            metrics: { score: p.score, comments: p.num_comments, upvoteRatio: p.upvote_ratio ?? 0 },
            raw: { subreddit: p.subreddit, permalink: `https://www.reddit.com${p.permalink}` },
          },
        ],
  );
}

async function getToken(signal: AbortSignal): Promise<string> {
  const env = getConfig();
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET || !env.REDDIT_USERNAME || !env.REDDIT_PASSWORD) {
    throw new Error(
      "Reddit credentials missing (REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD). Reddit API access needs approval.",
    );
  }
  const basic = Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString("base64");
  const res = await httpGet("https://www.reddit.com/api/v1/access_token", {
    signal,
    retries: 0,
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    init: {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        username: env.REDDIT_USERNAME,
        password: env.REDDIT_PASSWORD,
      }),
    },
  });
  return z.object({ access_token: z.string() }).parse(await res.json()).access_token;
}

export const redditAdapter: SourceAdapter = {
  type: "reddit",
  primaryMetric: "score",
  async fetch(config, { signal }) {
    const cfg = redditConfig.parse(config);
    const token = await getToken(signal);
    const items: RawItemInput[] = [];
    for (const sub of cfg.subreddits) {
      const qs = new URLSearchParams({
        limit: String(cfg.limit),
        ...(cfg.sort === "top" ? { t: cfg.t } : {}),
      });
      const json = await getJson(`https://oauth.reddit.com/r/${encodeURIComponent(sub)}/${cfg.sort}?${qs}`, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      items.push(...parseRedditListing(json));
    }
    return items;
  },
};
