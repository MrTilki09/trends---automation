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
  /**
   * Feed image, only from sources we may republish (company newsrooms, GitHub; see
   * `imageAllowedSql`). Null for most stories: show the text-only card. Always show with credit.
   */
  imageUrl: z.string().nullable(),
  /** Who published the image (credit line under it). */
  imagePublisher: z.string().nullable(),
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

// ---------------------------------------------------------------- signed-in (A3–A6)

export const TokenPair = z.object({ accessToken: z.string(), refreshToken: z.string(), expiresIn: z.number() });
export type TokenPair = z.infer<typeof TokenPair>;

export const FollowKind = z.enum(["category", "company", "tag", "lang"]);
export const Follow = z.object({ kind: FollowKind, value: z.string() });
export type Follow = z.infer<typeof Follow>;

export const NotificationPrefs = z.object({
  breaking: z.boolean(),
  digest: z.boolean(),
  replies: z.boolean(),
  timeZone: z.string(),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export const Me = z.object({
  id: z.number().int(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  handle: z.string().nullable(),
  name: z.string(),
  onboarded: z.boolean(),
  follows: z.array(Follow),
  notifications: NotificationPrefs,
});
export type Me = z.infer<typeof Me>;

export const ReactionType = z.enum(["hot", "useful", "skeptical", "wow"]);
export type ReactionType = z.infer<typeof ReactionType>;

export const ReactionResult = z.object({ reaction: ReactionType.nullable(), counters: Counters });
export const SaveResult = z.object({ saved: z.boolean(), counters: Counters });

export type Comment = {
  id: number;
  parentId: number | null;
  body: string;
  author: { id: number; name: string };
  createdAt: string;
  edited: boolean;
  likes: number;
  liked: boolean;
  mine: boolean;
  removed: boolean;
  replies: Comment[];
};
export const Comment: z.ZodType<Comment> = z.lazy(() =>
  z.object({
    id: z.number().int(),
    parentId: z.number().int().nullable(),
    body: z.string(),
    author: z.object({ id: z.number().int(), name: z.string() }),
    createdAt: z.string(),
    edited: z.boolean(),
    likes: z.number().int(),
    liked: z.boolean(),
    mine: z.boolean(),
    removed: z.boolean(),
    replies: z.array(Comment),
  }),
);

export const CommentPage = z.object({
  items: z.array(Comment),
  nextOffset: z.number().int().nullable(),
  total: z.number().int(),
});
export type CommentPage = z.infer<typeof CommentPage>;

export const ReportReason = z.enum(["spam", "harassment", "hate", "sexual", "violence", "misinformation", "other"]);
export type ReportReason = z.infer<typeof ReportReason>;

export const SavedList = z.object({ items: z.array(FeedTopic) });
