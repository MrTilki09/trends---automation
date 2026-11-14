import type { NextRequest } from "next/server";
import { z } from "zod";
import { bannedError, caller, json, jsonError, param, preflight, readJson } from "@/lib/app-api/http";
import { addComment, COMMENT_MAX, listComments, topicIsVisible } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";

/**
 * GET  /api/app/v1/topics/:id/comments?sort=top|new&offset= → {items, nextOffset, total}
 * POST /api/app/v1/topics/:id/comments {body, parentId?}    → 201 {comment}
 * Replies are one level deep. Word filter, 1 comment per 10 s and 100 per day per user.
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

async function topicId(ctx: Ctx) {
  const id = Number.parseInt((await ctx.params).id, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const c = await caller(req, false);
  if (c.error) return c.error;
  const id = await topicId(ctx);
  if (!id) return jsonError(400, "Invalid topic id");
  const sort = param(req, "sort") === "new" ? "new" : "top";
  const offset = Number.parseInt(param(req, "offset", 6) ?? "0", 10) || 0;
  return json(await listComments(getDb(), id, { sort, offset, viewerId: c.user?.id }));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const banned = bannedError(c.user!);
  if (banned) return banned;
  const id = await topicId(ctx);
  const db = getDb();
  if (!id || !(await topicIsVisible(db, id))) return jsonError(404, "Not found");
  const body = await readJson(
    req,
    z.object({ body: z.string().max(COMMENT_MAX * 2), parentId: z.number().int().positive().nullable().optional() }),
  );
  if (body.error) return body.error;
  const res = await addComment(db, c.user!, id, body.data);
  return res.ok ? json({ comment: res.comment }, 201) : jsonError(res.status, res.error);
}
