import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { posts, rawItems, savedTopics, sources, topics, type Post, type PostPlatform } from "../db/schema";

/*
 * A user's own pool ("Saved") and the posts generated for it. Every query is scoped by userId:
 * one user never sees or changes another user's saved topics or posts.
 */

export async function saveTopic(db: DB, userId: number, topicId: number): Promise<void> {
  await db.insert(savedTopics).values({ userId, topicId }).onConflictDoNothing();
}

export async function unsaveTopic(db: DB, userId: number, topicId: number): Promise<void> {
  await db.delete(savedTopics).where(and(eq(savedTopics.userId, userId), eq(savedTopics.topicId, topicId)));
}

export async function savedTopicIds(db: DB, userId: number): Promise<Set<number>> {
  const rows = await db
    .select({ id: savedTopics.topicId })
    .from(savedTopics)
    .where(eq(savedTopics.userId, userId));
  return new Set(rows.map((r) => r.id));
}

export type SavedTopic = {
  topic: typeof topics.$inferSelect;
  savedAt: Date;
  posts: Post[];
};

/** Saved topics, newest saved first, each with its generated posts (newest first). */
export async function listSaved(db: DB, userId: number): Promise<SavedTopic[]> {
  const rows = await db
    .select({ topic: topics, savedAt: savedTopics.createdAt })
    .from(savedTopics)
    .innerJoin(topics, eq(topics.id, savedTopics.topicId))
    .where(eq(savedTopics.userId, userId))
    .orderBy(desc(savedTopics.createdAt));
  if (!rows.length) return [];
  const all = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.userId, userId),
        inArray(
          posts.topicId,
          rows.map((r) => r.topic.id),
        ),
      ),
    )
    .orderBy(desc(posts.createdAt));
  return rows.map((r) => ({ ...r, posts: all.filter((p) => p.topicId === r.topic.id) }));
}

/** Topics the user has saved among `ids` (anything not saved is dropped). */
export async function savedTopicsForGeneration(db: DB, userId: number, ids: number[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ topic: topics })
    .from(savedTopics)
    .innerJoin(topics, eq(topics.id, savedTopics.topicId))
    .where(and(eq(savedTopics.userId, userId), inArray(savedTopics.topicId, ids)));
  const items = await db
    .select({
      topicId: rawItems.topicId,
      title: rawItems.title,
      summary: rawItems.summary,
      url: rawItems.url,
      author: rawItems.author,
      publishedAt: rawItems.publishedAt,
      metrics: rawItems.metrics,
      sourceName: sources.name,
    })
    .from(rawItems)
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(
      inArray(
        rawItems.topicId,
        rows.map((r) => r.topic.id),
      ),
    );
  return rows.map(({ topic }) => {
    const own = items.filter((i) => i.topicId === topic.id);
    return {
      topic,
      source: {
        title: topic.title,
        url: topic.canonicalUrl,
        summary: topic.llmSummary ?? own.find((i) => i.summary)?.summary ?? null,
        category: topic.category,
        tags: topic.tags,
        itemTitles: own.map((i) => i.title),
        items: own.map((i) => ({
          source: i.sourceName,
          title: i.title,
          summary: i.summary,
          url: i.url,
          author: i.author,
          publishedAt: i.publishedAt,
          metrics: i.metrics,
        })),
        publishedAt: topic.publishedAt,
      },
    };
  });
}

export async function addPost(
  db: DB,
  p: {
    userId: number;
    topicId: number;
    platform: PostPlatform;
    lang: string;
    model: string;
    content: string;
    imagePrompts: string | null;
  },
): Promise<void> {
  await db.insert(posts).values(p);
}

export async function deletePost(db: DB, userId: number, postId: number): Promise<void> {
  await db.delete(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId)));
}
