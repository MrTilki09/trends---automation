import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { comments, reports, users, type ReportStatus, type ReportTarget } from "../db/schema";
import { AUTO_HIDE_REPORTS, setCommentHidden } from "./social";

/* Reports from app users and the owner's moderation queue (dashboard /moderation). */

export const REPORT_REASONS = ["spam", "harassment", "hate", "sexual", "violence", "misinformation", "other"] as const;

export async function createReport(
  db: DB,
  reporterId: number,
  input: { targetType: ReportTarget; targetId: number; reason: string },
): Promise<{ ok: true; hidden: boolean } | { ok: false; status: number; error: string }> {
  if (input.targetType === "comment") {
    const [c] = await db.select({ id: comments.id }).from(comments).where(eq(comments.id, input.targetId));
    if (!c) return { ok: false, status: 404, error: "That comment is gone." };
  } else if (input.targetType === "user") {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.targetId));
    if (!u) return { ok: false, status: 404, error: "No such user." };
  }
  // One report per person per target; reporting again is a no-op.
  await db
    .insert(reports)
    .values({ reporterId, ...input })
    .onConflictDoNothing({ target: [reports.reporterId, reports.targetType, reports.targetId] });

  let hidden = false;
  if (input.targetType === "comment") {
    const row = (
      await db.execute(sql`
        SELECT count(*)::int AS n FROM reports
        WHERE target_type = 'comment' AND target_id = ${input.targetId} AND status = 'open'`)
    ).rows[0] as { n: number } | undefined;
    if (Number(row?.n ?? 0) >= AUTO_HIDE_REPORTS) hidden = await setCommentHidden(db, input.targetId, true);
  }
  return { ok: true, hidden };
}

export type ReportRow = {
  id: number;
  targetType: ReportTarget;
  targetId: number;
  reason: string;
  status: ReportStatus;
  createdAt: Date;
  reporter: string;
  /** Comment text / user name, for the queue. */
  preview: string | null;
  commentStatus: string | null;
  authorId: number | null;
  authorName: string | null;
  authorBanned: boolean;
};

export async function listReports(db: DB, status: ReportStatus | "all" = "open"): Promise<ReportRow[]> {
  const res = await db.execute(sql`
    SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at, ru.username AS reporter,
           c.body AS comment_body, c.status AS comment_status,
           coalesce(c.user_id, CASE WHEN r.target_type = 'user' THEN r.target_id END) AS author_id,
           au.username AS author_name, au.banned_at IS NOT NULL AS author_banned,
           t.title AS topic_title
    FROM reports r
    JOIN users ru ON ru.id = r.reporter_id
    LEFT JOIN comments c ON r.target_type = 'comment' AND c.id = r.target_id
    LEFT JOIN users au ON au.id = coalesce(c.user_id, CASE WHEN r.target_type = 'user' THEN r.target_id END)
    LEFT JOIN topics t ON r.target_type = 'topic' AND t.id = r.target_id
    ${status === "all" ? sql`` : sql`WHERE r.status = ${status}`}
    ORDER BY r.created_at DESC
    LIMIT 200`);
  return (res.rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    targetType: r.target_type as ReportTarget,
    targetId: Number(r.target_id),
    reason: String(r.reason),
    status: r.status as ReportStatus,
    createdAt: new Date(r.created_at as string),
    reporter: String(r.reporter),
    preview: (r.comment_body as string | null) ?? (r.topic_title as string | null) ?? (r.author_name as string | null) ?? null,
    commentStatus: (r.comment_status as string | null) ?? null,
    authorId: r.author_id == null ? null : Number(r.author_id),
    authorName: (r.author_name as string | null) ?? null,
    authorBanned: Boolean(r.author_banned),
  }));
}

/** Closes every open report on the same target. */
export async function resolveReports(db: DB, reportId: number, status: "actioned" | "dismissed") {
  const [r] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!r) return;
  await db
    .update(reports)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, "open")));
}

export async function setUserBanned(db: DB, userId: number, banned: boolean) {
  await db
    .update(users)
    .set({ bannedAt: banned ? new Date() : null })
    .where(and(eq(users.id, userId), sql`${users.passwordHash} IS NOT NULL`));
}

export async function openReportCount(db: DB): Promise<number> {
  const row = (await db.execute(sql`SELECT count(*)::int AS n FROM reports WHERE status = 'open'`)).rows[0] as
    | { n: number }
    | undefined;
  return Number(row?.n ?? 0);
}

