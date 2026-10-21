ALTER TABLE "raw_items" ADD COLUMN "lang" text;--> statement-breakpoint
ALTER TABLE "raw_items" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "lang" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "topics_published_at_idx" ON "topics" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "topics_category_idx" ON "topics" USING btree ("category");--> statement-breakpoint
CREATE INDEX "topics_tags_idx" ON "topics" USING gin ("tags");