import { z } from "zod";
import { getJson } from "./http";
import { cleanImageUrl } from "./images";
import type { RawItemInput, SourceAdapter } from "./types";

/*
 * Hugging Face Daily Papers (public API, no key): GET https://huggingface.co/api/daily_papers?limit=50
 * The AI papers the community is upvoting today, each with its abstract and a 1200×630 social
 * thumbnail. The item links to the arXiv page, so it lands in the same topic as our arXiv feed's
 * copy of the paper (same canonical URL) and adds the image and the upvote count to it.
 * The `ai_summary` / `ai_keywords` fields are machine-written and not used.
 */
export const hfPapersConfig = z.object({
  limit: z.number().int().positive().max(100).default(50),
});

const entry = z.object({
  thumbnail: z.string().optional().nullable(),
  numComments: z.number().default(0),
  publishedAt: z.string().optional().nullable(),
  paper: z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string().optional().nullable(),
    upvotes: z.number().default(0),
    publishedAt: z.string().optional().nullable(),
    submittedOnDailyAt: z.string().optional().nullable(),
    projectPage: z.string().optional().nullable(),
    authors: z.array(z.object({ name: z.string().optional() })).default([]),
  }),
});

export function parseHfDailyPapers(json: unknown): RawItemInput[] {
  return z
    .array(z.unknown())
    .parse(json)
    .flatMap((raw): RawItemInput[] => {
      const parsed = entry.safeParse(raw);
      if (!parsed.success) return [];
      const { paper, thumbnail, numComments } = parsed.data;
      const when = paper.submittedOnDailyAt ?? paper.publishedAt ?? parsed.data.publishedAt;
      const published = when ? new Date(when) : undefined;
      const authors = paper.authors.map((a) => a.name).filter(Boolean) as string[];
      return [
        {
          externalId: paper.id,
          url: `https://arxiv.org/abs/${paper.id}`,
          title: paper.title.replace(/\s+/g, " ").trim(),
          summary: paper.summary?.replace(/\s+/g, " ").trim() || undefined,
          author: authors.length > 2 ? `${authors[0]} et al.` : authors.join(", ") || undefined,
          publishedAt: published && !Number.isNaN(published.getTime()) ? published : undefined,
          lang: "en",
          tags: [],
          metrics: { upvotes: paper.upvotes, comments: numComments },
          raw: {
            image:
              cleanImageUrl(thumbnail) ??
              `https://cdn-thumbnails.huggingface.co/social-thumbnails/papers/${paper.id}.png`,
            hfUrl: `https://huggingface.co/papers/${paper.id}`,
            projectPage: paper.projectPage ?? undefined,
          },
        },
      ];
    });
}

export const hfPapersAdapter: SourceAdapter = {
  type: "hf_papers",
  primaryMetric: "upvotes",
  async fetch(config, { signal }) {
    const cfg = hfPapersConfig.parse(config ?? {});
    return parseHfDailyPapers(
      await getJson(`https://huggingface.co/api/daily_papers?limit=${cfg.limit}`, { signal }),
    );
  },
};
