import type { NextRequest } from "next/server";
import { z } from "zod";
import { caller, json, jsonError, preflight, readJson } from "@/lib/app-api/http";
import { getMe, ProfileInput, updateProfile } from "@/lib/data/app-users";
import { deleteMemberAccount } from "@/lib/data/users";
import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/logger";

/**
 * GET    /api/app/v1/me                       → profile, follows, notification settings
 * PATCH  /api/app/v1/me {displayName?, handle?}
 * DELETE /api/app/v1/me {password}            → deletes the account and everything it wrote (store requirement)
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  return json(await getMe(getDb(), c.user!));
}

export async function PATCH(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const body = await readJson(req, ProfileInput);
  if (body.error) return body.error;
  const res = await updateProfile(getDb(), c.user!.id, body.data);
  if (!res.ok) return jsonError(409, res.error);
  return json(await getMe(getDb(), { ...c.user!, ...body.data }));
}

export async function DELETE(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const body = await readJson(req, z.object({ password: z.string().max(200) }));
  if (body.error) return body.error;
  const res = await deleteMemberAccount(getDb(), c.user!, body.data.password);
  if (!res.ok) return jsonError(res.error === "Wrong password." ? 403 : 400, res.error);
  logger.info({ userId: c.user!.id }, "app account deleted");
  return json({ ok: true });
}
