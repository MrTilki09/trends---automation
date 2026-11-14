import type { NextRequest } from "next/server";
import { z } from "zod";
import { caller, json, jsonError, preflight, readJson } from "@/lib/app-api/http";
import { createReport, REPORT_REASONS } from "@/lib/data/moderation";
import { getDb } from "@/lib/db/client";
import { logger } from "@/lib/logger";

/**
 * POST /api/app/v1/reports {targetType: comment|user|topic, targetId, reason} → 201 {ok, hidden}
 * A comment with 3 open reports is hidden until the owner reviews it on the dashboard's Moderation page.
 */
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const Body = z.object({
  targetType: z.enum(["comment", "user", "topic"]),
  targetId: z.number().int().positive(),
  reason: z.enum(REPORT_REASONS),
});

export async function POST(req: NextRequest) {
  const c = await caller(req, true);
  if (c.error) return c.error;
  const body = await readJson(req, Body);
  if (body.error) return body.error;
  const res = await createReport(getDb(), c.user!.id, body.data);
  if (!res.ok) return jsonError(res.status, res.error);
  logger.info({ ...body.data, reporter: c.user!.id, hidden: res.hidden }, "app report");
  return json(res, 201);
}
