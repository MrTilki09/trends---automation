import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";
import { topics } from "../db/schema";
import { LLMError, type LLMProvider } from "../llm/types";

/*
 * Optional enrichment (LLM_ENRICH_ENABLED=true): ONE LLM call per run for the top-N
 * not-yet-enriched topics. Adds category, relevance (0–1) and a one-line summary.
 * Any failure is reported back to the run; it never fails the run.
 */

export const enrichmentSchema = z.array(
  z.object({
    id: z.coerce.number().int(),
    category: z.string().min(1).max(60),
    relevance: z.coerce.number().min(0).max(1),
    oneLineSummary: z.string().max(400),
  }),
);
export type Enrichment = z.infer<typeof enrichmentSchema>;

export const ENRICH_SYSTEM =
  "You classify trending topics for a social media content creator. " +
  "Reply with ONLY a JSON array, no prose, no markdown code fences.";

export function buildEnrichPrompt(
  niche: string,
  items: { id: number; title: string; keywords: string[] }[],
): string {
  return [
    `Creator's niche: ${niche || "(not specified)"}`,
    "",
    "For each topic below return an object:",
    '{ "id": <same id>, "category": <short category, e.g. "AI", "Startups", "Politics", "Sports">,',
    '  "relevance": <0..1, how relevant to the niche>, "oneLineSummary": <max 25 words, same language as the title> }',
    "",
    "Topics (JSON):",
    JSON.stringify(items.map((i) => ({ id: i.id, title: i.title, keywords: i.keywords }))),
  ].join("\n");
}

/** Pulls the JSON array out of the model's reply (tolerates code fences or stray text). */
export function parseEnrichment(text: string): Enrichment {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) throw new LLMError("bad_output", "LLM reply contained no JSON array");
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new LLMError("bad_output", "LLM reply was not valid JSON");
  }
  const parsed = enrichmentSchema.safeParse(json);
  if (!parsed.success)
    throw new LLMError("bad_output", `LLM reply failed validation: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

export async function enrichTopTopics(
  db: DB,
  provider: LLMProvider,
  opts: { topN: number; windowHours: number; niche: string; timeoutMs: number },
): Promise<{ enriched: number }> {
  const cutoff = new Date(Date.now() - opts.windowHours * 3600_000);
  const candidates = await db
    .select({ id: topics.id, title: topics.title, keywords: topics.keywords })
    .from(topics)
    .where(and(isNull(topics.llmEnrichedAt), gt(topics.lastSeenAt, cutoff), eq(topics.status, "new")))
    .orderBy(desc(topics.score))
    .limit(opts.topN);
  if (candidates.length === 0) return { enriched: 0 };

  const { text } = await provider.complete({
    system: ENRICH_SYSTEM,
    prompt: buildEnrichPrompt(opts.niche, candidates),
    timeoutMs: opts.timeoutMs,
  });
  const results = parseEnrichment(text);
  const allowed = new Set(candidates.map((c) => c.id));
  const now = new Date();
  let enriched = 0;
  for (const r of results) {
    if (!allowed.has(r.id)) continue; // ignore ids the model invented
    await db
      .update(topics)
      .set({
        llmCategory: r.category,
        llmRelevance: r.relevance,
        llmSummary: r.oneLineSummary,
        llmEnrichedAt: now,
      })
      .where(eq(topics.id, r.id));
    enriched++;
  }
  return { enriched };
}
