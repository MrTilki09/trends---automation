import type { NextRequest } from "next/server";
import { z } from "zod";
import { caller, json, preflight, readJson } from "@/lib/app-api/http";
import { removePushToken, savePushToken } from "@/lib/notify";
import { getDb } from "@/lib/db/client";

/**
 * POST   /api/app/v1/me/push-token {token, platform} → {ok}  (Expo push token: ExponentPushToken[...])
 * DELETE /api/app/v1/me/push-token {token}           → {ok}  (on sign-out)
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const Token = z.string().regex(/^Expo(nent)?PushToken\[[\w-]+\]$/, "not an Expo push token");

export async function POST(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const body = await readJson(req, z.object({ token: Token, platform: z.enum(["ios", "android", "web"]) }));
  if (body.error) return body.error;
  await savePushToken(getDb(), c.user!.id, body.data.token, body.data.platform);
  return json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const body = await readJson(req, z.object({ token: Token }));
  if (body.error) return body.error;
  await removePushToken(getDb(), c.user!.id, body.data.token);
  return json({ ok: true });
}
