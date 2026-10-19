-- pg_trgm provides trigram similarity (fuzzy title matching/search).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "fetch_run_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fetch_run_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"source_id" integer NOT NULL,
	"status" text NOT NULL,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "fetch_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fetch_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "job_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "raw_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "raw_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_id" integer NOT NULL,
	"run_id" integer,
	"external_id" text NOT NULL,
	"url" text,
	"canonical_url" text,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"summary" text,
	"author" text,
	"published_at" timestamp with time zone,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"topic_id" integer
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "topics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"canonical_url" text,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" text,
	"score" double precision DEFAULT 0 NOT NULL,
	"score_breakdown" jsonb,
	"source_count" integer DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"llm_summary" text,
	"llm_relevance" double precision,
	"llm_category" text,
	"llm_enriched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fetch_run_sources" ADD CONSTRAINT "fetch_run_sources_run_id_fetch_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_run_sources" ADD CONSTRAINT "fetch_run_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_items" ADD CONSTRAINT "raw_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_items" ADD CONSTRAINT "raw_items_run_id_fetch_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_items" ADD CONSTRAINT "raw_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fetch_run_sources_run_idx" ON "fetch_run_sources" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "fetch_runs_started_at_idx" ON "fetch_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "job_requests_status_idx" ON "job_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_items_source_external_uq" ON "raw_items" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "raw_items_canonical_url_idx" ON "raw_items" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "raw_items_topic_idx" ON "raw_items" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "raw_items_fetched_at_idx" ON "raw_items" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "raw_items_last_seen_idx" ON "raw_items" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "raw_items_normalized_title_trgm_idx" ON "raw_items" USING gin ("normalized_title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "topics_last_seen_idx" ON "topics" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "topics_status_score_idx" ON "topics" USING btree ("status","score");--> statement-breakpoint
CREATE INDEX "topics_canonical_url_idx" ON "topics" USING btree ("canonical_url");