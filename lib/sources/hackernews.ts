import { z } from "zod";
import { mapLimit } from "../util/concurrency";
import { getJson } from "./http";
import type { RawItemInput, SourceAdapter } from "./types";

// Official Firebase API: https://github.com/HackerNews/API
const BASE = "https://hacker-news.firebaseio.com/v0";

export const hackerNewsConfig = z.object({
  list: z.enum(["top", "best", "new"]).default("top"),
  maxItems: z.number().int().positive().max(500).default(50),
});

const hnItem = z.object({
  id: z.number(),
  type: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  by: z.string().optional(),
  time: z.number().optional(),
  score: z.number().optional(),
  descendants: z.number().optional(),
  dead: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

/** Converts one HN API item into a RawItemInput (null for non-stories / dead items). */
export function parseHnItem(json: unknown): RawItemInput | null {
  const parsed = hnItem.safeParse(json);
  if (!parsed.success) return null;
  const it = parsed.data;
  if (it.dead || it.deleted || !it.title || (it.type && it.type !== "story")) return null;
  return {
    externalId: String(it.id),
    url: it.url ?? `https://news.ycombinator.com/item?id=${it.id}`,
    title: it.title,
    author: it.by,
    publishedAt: it.time ? new Date(it.time * 1000) : undefined,
    lang: "en",
    metrics: { points: it.score ?? 0, comments: it.descendants ?? 0 },
    raw: { ...it, hnUrl: `https://news.ycombinator.com/item?id=${it.id}` },
  };
}

export const hackerNewsAdapter: SourceAdapter = {
  type: "hackernews",
  primaryMetric: "points",
  async fetch(config, { signal }) {
    const cfg = hackerNewsConfig.parse(config ?? {});
    const ids = z.array(z.number()).parse(await getJson(`${BASE}/${cfg.list}stories.json`, { signal }));
    const items = await mapLimit(ids.slice(0, cfg.maxItems), 5, async (id) =>
      parseHnItem(await getJson(`${BASE}/item/${id}.json`, { signal })),
    );
    return items.filter((i): i is RawItemInput => i !== null);
  },
};
