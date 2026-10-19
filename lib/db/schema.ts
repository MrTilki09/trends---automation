import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
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
  llmBoost: number;
  recencyDecay: number;
  hoursSinceFirstSeen: number;
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
    category: text("category"),
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

export type Source = typeof sources.$inferSelect;
export type FetchRun = typeof fetchRuns.$inferSelect;
export type FetchRunSource = typeof fetchRunSources.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type RawItem = typeof rawItems.$inferSelect;
export type JobRequest = typeof jobRequests.$inferSelect;
