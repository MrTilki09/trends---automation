import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Statuses are plain text columns with TypeScript unions (not Postgres enums),
// so later phases can add values (e.g. 'drafted', 'published') without a type migration.
export type RunTrigger = "schedule" | "manual";
export type RunStatus = "running" | "succeeded" | "partial" | "failed" | "interrupted";
export type RunSourceStatus = "succeeded" | "failed";
export type TopicStatus = "new" | "shortlisted" | "ignored";
export type JobType = "collect" | "cleanup";
export type JobStatus = "pending" | "running" | "done" | "failed" | "interrupted";

const tz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tz("created_at").notNull().defaultNow();
const updatedAt = () =>
  tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const sources = pgTable("sources", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").notNull().default({}),
  weight: doublePrecision("weight").notNull().default(1),
  lastSuccessAt: tz("last_success_at"),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type RunStats = {
  sourcesTotal?: number;
  sourcesFailed?: number;
  itemsFetched?: number;
  itemsNew?: number;
  topicsCreated?: number;
  topicsUpdated?: number;
  topicsScored?: number;
  stepsMs?: Record<string, number>;
  llm?: { status: "disabled" | "skipped" | "ok" | "error"; enriched?: number; error?: string };
};

export const fetchRuns = pgTable(
  "fetch_runs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    trigger: text("trigger").$type<RunTrigger>().notNull(),
    status: text("status").$type<RunStatus>().notNull().default("running"),
    startedAt: tz("started_at").notNull().defaultNow(),
    finishedAt: tz("finished_at"),
    stats: jsonb("stats").$type<RunStats>().notNull().default({}),
    error: text("error"),
  },
  (t) => [index("fetch_runs_started_at_idx").on(t.startedAt)],
);

export const fetchRunSources = pgTable(
  "fetch_run_sources",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    runId: integer("run_id")
      .notNull()
      .references(() => fetchRuns.id, { onDelete: "cascade" }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    status: text("status").$type<RunSourceStatus>().notNull(),
    itemsFetched: integer("items_fetched").notNull().default(0),
    itemsNew: integer("items_new").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("fetch_run_sources_run_idx").on(t.runId)],
);

export type ScoreBreakdown = {
  engagement: number;
  crossSourceBonus: number;
  keywordBoost: number;
  launchBoost?: number;
  llmBoost: number;
  recencyDecay: number;
  /** Hours since the topic was published (earliest article), used for recency decay. */
  ageHours: number;
  matchedKeywords: string[];
};

export const topics = pgTable(
  "topics",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    canonicalUrl: text("canonical_url"),
    keywords: text("keywords")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Main category from the rule-based classifier (lib/pipeline/classify.ts). */
    category: text("category"),
    /** Most common tags of the topic's items (feed categories + source tags). */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Most common language of the topic's items ('tr', 'en', ...). */
    lang: text("lang"),
    /** Earliest publish date among the topic's items (falls back to when we first saw it). */
    publishedAt: tz("published_at"),
    score: doublePrecision("score").notNull().default(0),
    scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdown>(),
    sourceCount: integer("source_count").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    status: text("status").$type<TopicStatus>().notNull().default("new"),
    llmSummary: text("llm_summary"),
    llmRelevance: doublePrecision("llm_relevance"),
    llmCategory: text("llm_category"),
    llmEnrichedAt: tz("llm_enriched_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("topics_last_seen_idx").on(t.lastSeenAt),
    index("topics_status_score_idx").on(t.status, t.score),
    index("topics_canonical_url_idx").on(t.canonicalUrl),
    index("topics_published_at_idx").on(t.publishedAt),
    index("topics_category_idx").on(t.category),
    index("topics_tags_idx").using("gin", t.tags),
  ],
);

export const rawItems = pgTable(
  "raw_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    runId: integer("run_id").references(() => fetchRuns.id, { onDelete: "set null" }),
    externalId: text("external_id").notNull(),
    url: text("url"),
    canonicalUrl: text("canonical_url"),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    summary: text("summary"),
    author: text("author"),
    publishedAt: tz("published_at"),
    lang: text("lang"),
    /** Normalized tags: the feed's own categories + tags configured on the source. */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull().default({}),
    raw: jsonb("raw"),
    // fetched_at = first time we saw the item; last_seen_at = most recent run that returned it.
    fetchedAt: tz("fetched_at").notNull().defaultNow(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("raw_items_source_external_uq").on(t.sourceId, t.externalId),
    index("raw_items_canonical_url_idx").on(t.canonicalUrl),
    index("raw_items_topic_idx").on(t.topicId),
    index("raw_items_fetched_at_idx").on(t.fetchedAt),
    index("raw_items_last_seen_idx").on(t.lastSeenAt),
    // Trigram index (pg_trgm) for fuzzy title search in the dashboard.
    index("raw_items_normalized_title_trgm_idx").using("gin", sql`${t.normalizedTitle} gin_trgm_ops`),
  ],
);

export const jobRequests = pgTable(
  "job_requests",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    type: text("type").$type<JobType>().notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    requestedAt: tz("requested_at").notNull().defaultNow(),
    startedAt: tz("started_at"),
    finishedAt: tz("finished_at"),
    error: text("error"),
  },
  (t) => [index("job_requests_status_idx").on(t.status, t.requestedAt)],
);

/** Small key/value store, e.g. the worker heartbeat. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

/** Keys for /api/topics, created on the Keys page. Only a SHA-256 of the key is stored. */
export const apiKeys = pgTable("api_keys", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  // First characters of the key, shown in the list so keys can be told apart.
  prefix: text("prefix").notNull(),
  lastUsedAt: tz("last_used_at"),
  revokedAt: tz("revoked_at"),
  createdAt: createdAt(),
});

/**
 * Dashboard users. Created on first login (the account itself lives in .env: DASHBOARD_USER).
 * The NVIDIA API key is encrypted with SECRETS_KEY (lib/auth/secrets.ts), never stored in plain text.
 */
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  // The owner's DASHBOARD_USER, or the (lowercased) email of an account created on /signup.
  username: text("username").notNull().unique(),
  // Signup accounts only (the owner's password lives in .env). scrypt hash, see lib/auth/password.ts.
  passwordHash: text("password_hash"),
  // Signup accounts can't sign in until this is set (by the emailed link).
  emailVerifiedAt: tz("email_verified_at"),
  nvidiaApiKeyEnc: text("nvidia_api_key_enc"),
  nvidiaModel: text("nvidia_model"),
  /** Watermark text on generated carousel slides (e.g. the user's handle); null = app name. */
  brandName: text("brand_name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** One-time email links (confirm email, reset password). Only a SHA-256 of the token is stored. */
export const emailTokens = pgTable(
  "email_tokens",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<"verify_email" | "reset_password">().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: tz("expires_at").notNull(),
    usedAt: tz("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("email_tokens_user_idx").on(t.userId, t.purpose)],
);

/** A user's own pool ("Saved"). Saved topics are never removed by retention. */
export const savedTopics = pgTable(
  "saved_topics",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] })],
);

export type PostPlatform = "instagram" | "x" | "linkedin" | "blog";

/** Posts generated by an LLM for a user's saved topic. */
export const posts = pgTable(
  "posts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: integer("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    platform: text("platform").$type<PostPlatform>().notNull(),
    lang: text("lang").notNull(),
    model: text("model").notNull(),
    content: text("content").notNull(),
    /** Image-model prompts for a multi-slide carousel, one block per slide (null if that step failed). */
    imagePrompts: text("image_prompts"),
    createdAt: createdAt(),
  },
  (t) => [index("posts_user_topic_idx").on(t.userId, t.topicId)],
);

export type Source = typeof sources.$inferSelect;
export type FetchRun = typeof fetchRuns.$inferSelect;
export type FetchRunSource = typeof fetchRunSources.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type RawItem = typeof rawItems.$inferSelect;
export type JobRequest = typeof jobRequests.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
