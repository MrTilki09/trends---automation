import { z } from "zod";
import { getConfig } from "../config";
import { getJson } from "./http";
import { linkCardImage } from "./images";
import type { RawItemInput, SourceAdapter } from "./types";

/*
 * New GitHub repositories gaining stars fastest (official search API):
 *   GET https://api.github.com/search/repositories?q=created:>DATE stars:>N&sort=stars&order=desc
 * Each repo comes with its description, topics and star count; the image is the 1200×600 card
 * GitHub generates for every repository. Without GITHUB_TOKEN the search API allows 10 requests
 * a minute, plenty for one request per run.
 */
export const githubReposConfig = z.object({
  /** Repos created in the last N days. */
  days: z.number().int().positive().max(90).default(7),
  minStars: z.number().int().min(0).default(50),
  perPage: z.number().int().positive().max(100).default(30),
});

const repo = z.object({
  id: z.number(),
  full_name: z.string(),
  html_url: z.string(),
  description: z.string().optional().nullable(),
  fork: z.boolean().default(false),
  created_at: z.string().optional().nullable(),
  homepage: z.string().optional().nullable(),
  stargazers_count: z.number().default(0),
  forks_count: z.number().default(0),
  language: z.string().optional().nullable(),
  topics: z.array(z.string()).default([]),
  owner: z.object({ login: z.string() }).optional(),
});

export function parseGithubSearch(json: unknown): RawItemInput[] {
  const items = z.object({ items: z.array(z.unknown()) }).parse(json).items;
  return items.flatMap((raw): RawItemInput[] => {
    const parsed = repo.safeParse(raw);
    if (!parsed.success || parsed.data.fork) return [];
    const r = parsed.data;
    const created = r.created_at ? new Date(r.created_at) : undefined;
    return [
      {
        externalId: String(r.id),
        url: r.html_url,
        title: r.full_name,
        summary: r.description?.trim() || undefined,
        author: r.owner?.login,
        publishedAt: created && !Number.isNaN(created.getTime()) ? created : undefined,
        tags: [...r.topics, ...(r.language ? [r.language] : [])],
        metrics: { stars: r.stargazers_count, forks: r.forks_count },
        raw: { image: linkCardImage(r.html_url), homepage: r.homepage || undefined, language: r.language },
      },
    ];
  });
}

export const githubReposAdapter: SourceAdapter = {
  type: "github_repos",
  primaryMetric: "stars",
  async fetch(config, { signal }) {
    const cfg = githubReposConfig.parse(config ?? {});
    const since = new Date(Date.now() - cfg.days * 86_400_000).toISOString().slice(0, 10);
    const q = encodeURIComponent(`created:>${since} stars:>${cfg.minStars}`);
    const token = getConfig().GITHUB_TOKEN;
    return parseGithubSearch(
      await getJson(
        `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${cfg.perPage}`,
        {
          signal,
          headers: {
            Accept: "application/vnd.github+json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      ),
    );
  },
};
