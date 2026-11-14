import type { NextRequest } from "next/server";
import { caller, json, preflight } from "@/lib/app-api/http";
import { getSaved } from "@/lib/data/feed";
import { getDb } from "@/lib/db/client";

/** GET /api/app/v1/me/saved → {items} (the same Saved list as the website, newest first). */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  return json({ items: await getSaved(getDb(), c.user!.id) });
}
