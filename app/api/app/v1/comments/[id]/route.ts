import type { NextRequest } from "next/server";
import { caller, json, jsonError, preflight } from "@/lib/app-api/http";
import { deleteOwnComment } from "@/lib/data/social";
import { getDb } from "@/lib/db/client";

/** DELETE /api/app/v1/comments/:id → {ok} (your own comments only). */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id)) return jsonError(400, "Invalid comment id");
  return (await deleteOwnComment(getDb(), c.user!.id, id)) ? json({ ok: true }) : jsonError(404, "Not found");
}
