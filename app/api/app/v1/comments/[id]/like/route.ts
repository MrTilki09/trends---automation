import type { NextRequest } from "next/server";
import { bannedError, caller, json, jsonError, preflight } from "@/lib/app-api/http";
import { setCommentLike } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";

/** PUT / DELETE /api/app/v1/comments/:id/like → {liked, likes} */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

type Ctx = { params: Promise<{ id: string }> };

async function handle(req: NextRequest, ctx: Ctx, liked: boolean) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const banned = bannedError(c.user!);
  if (banned) return banned;
  const id = Number.parseInt((await ctx.params).id, 10);
  if (!Number.isSafeInteger(id)) return jsonError(400, "Invalid comment id");
  const res = await setCommentLike(getDb(), c.user!.id, id, liked);
  return res ? json(res) : jsonError(404, "Not found");
}

export const PUT = (req: NextRequest, ctx: Ctx) => handle(req, ctx, true);
export const DELETE = (req: NextRequest, ctx: Ctx) => handle(req, ctx, false);
