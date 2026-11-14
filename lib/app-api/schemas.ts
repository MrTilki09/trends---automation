import { z } from "zod";

/*
 * Response shapes of the app API (/api/app/v1). This file depends on zod only, so the mobile app
 * (separate repo: trend-feed) keeps an identical copy at src/api/schemas.ts. Change both together
 * and bump API_VERSION when a change is not backwards compatible.
 */
export const API_VERSION = 1;

export const Momentum = z.enum(["new", "rising", "steady", "fading"]);
export type Momentum = z.infer<typeof Momentum>;

export const FeedTab = z.enum(["for-you", "trending", "latest"]);
export type FeedTab = z.infer<typeof FeedTab>;

export const Counters = z.object({
  reactions: z.number().int(),
  comments: z.number().int(),
  saves: z.number().int(),
});

export const Viewer = z.object({
  reaction: z.string().nullable(),
  saved: z.boolean(),
});

export const FeedTopic = z.object({
  id: z.number().int(),
  title: z.string(),
  /** Link to the original article (the topic's canonical URL). */
  url: z.string().nullable(),
  /** Publisher's own feed text, cleaned; null when the feed had none. Never generated. */
  snippet: z.string().nullable(),
  /** Who wrote `snippet` (credit line). */
  snippetPublisher: z.string().nullable(),
  /** Publisher's feed image; show with credit, null for about half of stories. */
  imageUrl: z.string().nullable(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  lang: z.string().nullable(),
  publishedAt: z.string(),
  /** Distinct publishers. Show "on N sources" only when ≥ 2. */
  publisherCount: z.number().int(),
  /** Up to 4 publisher names, best first. */
  publishers: z.array(z.string()),
  momentum: Momentum,
  /** Score change over the last 6 h, e.g. 0.38 = +38%; null when there's no history yet. */
  momentumChange: z.number().nullable(),
  hnPoints: z.number().int().nullable(),
  hnComments: z.number().int().nullable(),
  counters: Counters,
  /** Only when signed in. */
  viewer: Viewer.optional(),
});
export type FeedTopic = z.infer<typeof FeedTopic>;

export const FeedPage = z.object({
  items: z.array(FeedTopic),
  nextCursor: z.string().nullable(),
  /** Id of the collection run the ranking comes from; a higher value on refresh = new stories. */
  feedVersion: z.number().int().nullable(),
});
export type FeedPage = z.infer<typeof FeedPage>;

export const NewCount = z.object({ feedVersion: z.number().int().nullable(), newStories: z.number().int() });
export type NewCount = z.infer<typeof NewCount>;

export const StoryItem = z.object({
  id: z.number().int(),
  title: z.string(),
  url: z.string().nullable(),
  publisher: z.string(),
  snippet: z.string().nullable(),
  imageUrl: z.string().nullable(),
  publishedAt: z.string(),
});

export const ScorePoint = z.object({ at: z.string(), score: z.number() });

export const TopicDetail = z.object({
  topic: FeedTopic,
  items: z.array(StoryItem),
  /** Score after each hourly run, oldest first (last 24 h). */
  scoreHistory: z.array(ScorePoint),
});
export type TopicDetail = z.infer<typeof TopicDetail>;

export const Facet = z.object({ value: z.string(), count: z.number().int() });

export const Discover = z.object({
  categories: z.array(Facet),
  companies: z.array(Facet),
  tags: z.array(Facet),
  editorPicks: z.array(FeedTopic),
});
export type Discover = z.infer<typeof Discover>;

export const ApiError = z.object({ error: z.string() });
