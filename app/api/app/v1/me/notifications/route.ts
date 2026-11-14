import type { NextRequest } from "next/server";
import { caller, json, preflight, readJson } from "@/lib/app-api/http";
import { getNotificationPrefs, NotificationPrefsInput, setNotificationPrefs } from "@/lib/data/app-users";
import { getDb } from "@/lib/db/client";

/**
 * GET /api/app/v1/me/notifications → {breaking, digest, replies, timeZone}
 * PUT /api/app/v1/me/notifications {breaking?, digest?, replies?, timeZone?}
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  return json(await getNotificationPrefs(getDb(), c.user!.id));
}

export async function PUT(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const body = await readJson(req, NotificationPrefsInput);
  if (body.error) return body.error;
  return json(await setNotificationPrefs(getDb(), c.user!.id, body.data));
}
