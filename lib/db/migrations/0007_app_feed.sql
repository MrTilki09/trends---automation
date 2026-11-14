CREATE TABLE "topic_score_history" (
	"topic_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"score" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_score_history_topic_id_run_id_pk" PRIMARY KEY("topic_id","run_id")
);
--> statement-breakpoint
ALTER TABLE "raw_items" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "raw_items" ADD COLUMN "snippet" text;--> statement-breakpoint
ALTER TABLE "raw_items" ADD COLUMN "publisher" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "snippet" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "snippet_publisher" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "publisher_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_score_history" ADD CONSTRAINT "topic_score_history_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_score_history_created_idx" ON "topic_score_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "topics_feed_score_idx" ON "topics" USING btree ("score" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "topics"."status" <> 'ignored';--> statement-breakpoint
CREATE INDEX "topics_feed_published_idx" ON "topics" USING btree (coalesce("published_at", "first_seen_at") DESC,"id" DESC NULLS LAST) WHERE "topics"."status" <> 'ignored';