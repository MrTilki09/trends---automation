import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import {
  blocks,
  commentLikes,
  comments,
  reactions,
  savedTopics,
  topicCounters,
  topics,
  type ReactionType,
} from "../db/schema";
import { checkText } from "../app-api/moderation";
import { publicName } from "./app-users";

/*
 * Social layer of the app: reactions, saves (the same Saved list as the website), comments with one
 * reply level, comment likes. Every change updates topic_counters in the same transaction.
 */

export const REACTION_TYPES = ["hot", "useful", "skeptical", "wow"] as const satisfies ReactionType[];
export const COMMENT_MAX = 1000;
/** Comments a user may write: one per 10 s, 100 per day. */
export const COMMENT_LIMITS = { minIntervalSec: 10, perDay: 100 } as const;
/** Open reports that hide a comment until the owner reviews it. */
export const AUTO_HIDE_REPORTS = 3;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Counter = "reactions" | "comments" | "saves";

async function bump(tx: Tx | DB, topicId: number, counter: Counter, delta: number) {
  if (delta === 0) return;
  const col = sql.identifier(counter);
  await tx.execute(sql`
    INSERT INTO topic_counters (topic_id, ${col}) VALUES (${topicId}, ${Math.max(0, delta)})
    ON CONFLICT (topic_id) DO UPDATE
      SET ${col} = greatest(0, topic_counters.${col} + ${delta}), updated_at = now()`);
}

/** The topic exists and is visible in the app (not ignored by the owner). */
export async function topicIsVisible(db: DB, topicId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.id, topicId), sql`${topics.status} <> 'ignored'`));
  return !!row;
}

async function counters(db: DB | Tx, topicId: number) {
  const [row] = await db
    .select({ reactions: topicCounters.reactions, comments: topicCounters.comments, saves: topicCounters.saves })
    .from(topicCounters)
    .where(eq(topicCounters.topicId, topicId));
  return row ?? { reactions: 0, comments: 0, saves: 0 };
}

export async function setReaction(db: DB, userId: number, topicId: number, type: ReactionType | null) {
  return db.transaction(async (tx) => {
    const [prev] = await tx
      .select({ type: reactions.type })
      .from(reactions)
      .where(and(eq(reactions.userId, userId), eq(reactions.topicId, topicId)))
      .for("update");
    if (type) {
      await tx
        .insert(reactions)
        .values({ userId, topicId, type })
        .onConflictDoUpdate({ target: [reactions.userId, reactions.topicId], set: { type } });
      if (!prev) await bump(tx, topicId, "reactions", 1);
    } else if (prev) {
      await tx.delete(reactions).where(and(eq(reactions.userId, userId), eq(reactions.topicId, topicId)));
      await bump(tx, topicId, "reactions", -1);
    }
    return { reaction: type, counters: await counters(tx, topicId) };
  });
}

export async function setSaved(db: DB, userId: number, topicId: number, saved: boolean) {
  return db.transaction(async (tx) => {
    if (saved) {
      const rows = await tx.insert(savedTopics).values({ userId, topicId }).onConflictDoNothing().returning();
      if (rows.length) await bump(tx, topicId, "saves", 1);
    } else {
      const rows = await tx
        .delete(savedTopics)
        .where(and(eq(savedTopics.userId, userId), eq(savedTopics.topicId, topicId)))
        .returning();
      if (rows.length) await bump(tx, topicId, "saves", -1);
    }
    return { saved, counters: await counters(tx, topicId) };
  });
}

export type CommentView = {
  id: number;
  parentId: number | null;
  body: string;
  author: { id: number; name: string };
  createdAt: string;
  edited: boolean;
  likes: number;
  liked: boolean;
  mine: boolean;
  /** Deleted or hidden comments that still have replies keep their place, without text. */
  removed: boolean;
  replies: CommentView[];
};

/**
 * A page of top-level comments with their replies. "top" = most liked first, "new" = newest first.
 * Hidden/deleted comments are left out (kept as an empty placeholder when they have visible replies),
 * and so is everything by users the viewer blocked.
 */
export async function listComments(
  db: DB,
  topicId: number,
  opts: { sort: "top" | "new"; viewerId?: number | null; offset?: number; limit?: number },
): Promise<{ items: CommentView[]; nextOffset: number | null; total: number }> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);
  const viewer = opts.viewerId ?? -1;
  const res = await db.execute(sql`
    WITH visible AS (
      SELECT c.*, u.display_name, u.handle, u.username,
             (SELECT count(*)::int FROM comment_likes l WHERE l.comment_id = c.id) AS likes,
             EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = ${viewer}) AS liked
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.topic_id = ${topicId}
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = ${viewer} AND b.blocked_user_id = c.user_id)
    )
    SELECT * FROM visible v
    WHERE v.parent_id IS NULL
      AND (v.status = 'visible' OR EXISTS (
            SELECT 1 FROM visible r WHERE r.parent_id = v.id AND r.status = 'visible'))
    ORDER BY ${opts.sort === "top" ? sql`v.likes DESC, v.created_at DESC` : sql`v.created_at DESC`}, v.id DESC
    LIMIT ${limit + 1} OFFSET ${offset}`);
  const tops = res.rows as Record<string, unknown>[];
  const page = tops.slice(0, limit);
  const ids = page.map((r) => Number(r.id));
  const replies = ids.length
    ? ((
        await db.execute(sql`
          SELECT c.*, u.display_name, u.handle, u.username,
                 (SELECT count(*)::int FROM comment_likes l WHERE l.comment_id = c.id) AS likes,
                 EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.user_id = ${viewer}) AS liked
          FROM comments c JOIN users u ON u.id = c.user_id
          WHERE c.parent_id IN (${sql.join(
            ids.map((i) => sql`${i}`),
            sql`, `,
          )}) AND c.status = 'visible'
            AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = ${viewer} AND b.blocked_user_id = c.user_id)
          ORDER BY c.created_at, c.id`)
      ).rows as Record<string, unknown>[])
    : [];
  const view = (r: Record<string, unknown>): CommentView => {
    const removed = r.status !== "visible";
    return {
      id: Number(r.id),
      parentId: r.parent_id == null ? null : Number(r.parent_id),
      body: removed ? "" : String(r.body),
      author: removed
        ? { id: 0, name: "removed" }
        : {
            id: Number(r.user_id),
            name: publicName({
              displayName: (r.display_name as string | null) ?? null,
              handle: (r.handle as string | null) ?? null,
              username: String(r.username),
            }),
          },
      createdAt: new Date(r.created_at as string).toISOString(),
      edited: r.edited_at != null,
      likes: Number(r.likes ?? 0),
      liked: Boolean(r.liked),
      mine: Number(r.user_id) === viewer && !removed,
      removed,
      replies: [],
    };
  };
  const items = page.map(view);
  const byId = new Map(items.map((c) => [c.id, c]));
  for (const r of replies) byId.get(Number(r.parent_id))?.replies.push(view(r));
  const total = (
    await db.execute(sql`SELECT coalesce((SELECT comments FROM topic_counters WHERE topic_id = ${topicId}), 0) AS total`)
  ).rows[0] as { total: number } | undefined;
  return { items, nextOffset: tops.length > limit ? offset + limit : null, total: Number(total?.total ?? 0) };
}

export type AddCommentResult =
  | { ok: true; comment: CommentView }
  | { ok: false; status: number; error: string };

export async function addComment(
  db: DB,
  user: { id: number; displayName: string | null; handle: string | null; username: string },
  topicId: number,
  input: { body: string; parentId?: number | null },
  now = new Date(),
): Promise<AddCommentResult> {
  const body = input.body.replace(/\s+\n/g, "\n").trim();
  if (!body) return { ok: false, status: 400, error: "Write something first." };
  if (body.length > COMMENT_MAX) return { ok: false, status: 400, error: `Keep it under ${COMMENT_MAX} characters.` };
  const filtered = checkText(body);
  if (!filtered.ok) return { ok: false, status: 422, error: filtered.error };

  const recent = await db.execute(sql`
    SELECT count(*) FILTER (WHERE created_at > ${new Date(now.getTime() - COMMENT_LIMITS.minIntervalSec * 1000)})::int AS burst,
           count(*) FILTER (WHERE created_at > ${new Date(now.getTime() - 86_400_000)})::int AS day
    FROM comments WHERE user_id = ${user.id}`);
  const { burst, day } = recent.rows[0] as { burst: number; day: number };
  if (burst > 0) return { ok: false, status: 429, error: "Wait a few seconds between comments." };
  if (day >= COMMENT_LIMITS.perDay) return { ok: false, status: 429, error: "Daily comment limit reached." };

  let parentId: number | null = null;
  if (input.parentId != null) {
    const [parent] = await db
      .select({ id: comments.id, topicId: comments.topicId, parentId: comments.parentId, status: comments.status })
      .from(comments)
      .where(eq(comments.id, input.parentId));
    if (!parent || parent.topicId !== topicId || parent.status !== "visible") {
      return { ok: false, status: 404, error: "That comment is gone." };
    }
    // One reply level: replying to a reply attaches to its top-level comment.
    parentId = parent.parentId ?? parent.id;
  }

  const row = await db.transaction(async (tx) => {
    const [c] = await tx.insert(comments).values({ topicId, userId: user.id, parentId, body }).returning();
    await bump(tx, topicId, "comments", 1);
    return c!;
  });
  return {
    ok: true,
    comment: {
      id: row.id,
      parentId: row.parentId,
      body: row.body,
      author: { id: user.id, name: publicName(user) },
      createdAt: row.createdAt.toISOString(),
      edited: false,
      likes: 0,
      liked: false,
      mine: true,
      removed: false,
      replies: [],
    },
  };
}

/** Deletes the user's own comment (its replies stay; the slot shows as removed). */
export async function deleteOwnComment(db: DB, userId: number, commentId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [c] = await tx
      .update(comments)
      .set({ status: "deleted", body: "" })
      .where(and(eq(comments.id, commentId), eq(comments.userId, userId), eq(comments.status, "visible")))
      .returning({ topicId: comments.topicId });
    if (c) await bump(tx, c.topicId, "comments", -1);
    return !!c;
  });
}

/** Owner moderation: hide or restore any comment (keeps counters right). */
export async function setCommentHidden(db: DB, commentId: number, hidden: boolean): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [c] = await tx
      .update(comments)
      .set({ status: hidden ? "hidden" : "visible" })
      .where(and(eq(comments.id, commentId), eq(comments.status, hidden ? "visible" : "hidden")))
      .returning({ topicId: comments.topicId });
    if (c) await bump(tx, c.topicId, "comments", hidden ? -1 : 1);
    return !!c;
  });
}

export async function setCommentLike(db: DB, userId: number, commentId: number, liked: boolean) {
  const [c] = await db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.status, "visible")));
  if (!c) return null;
  if (liked) await db.insert(commentLikes).values({ userId, commentId }).onConflictDoNothing();
  else await db.delete(commentLikes).where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));
  const row = (await db.execute(sql`SELECT count(*)::int AS n FROM comment_likes WHERE comment_id = ${commentId}`))
    .rows[0] as { n: number } | undefined;
  return { liked, likes: Number(row?.n ?? 0) };
}

export async function setBlocked(db: DB, userId: number, blockedUserId: number, blocked: boolean) {
  if (userId === blockedUserId) return false;
  if (blocked) await db.insert(blocks).values({ userId, blockedUserId }).onConflictDoNothing();
  else await db.delete(blocks).where(and(eq(blocks.userId, userId), eq(blocks.blockedUserId, blockedUserId)));
  return true;
}
