import { eq, gt, inArray } from "drizzle-orm";
import { getConfig } from "../config";
import type { DB } from "../db/client";
import { rawItems, sources, topics, type ScoreBreakdown } from "../db/schema";
import { getAdapter } from "../sources/registry";
import { normalizeTitle } from "./normalize";

/*
 * score = (engagement + cross_source_bonus + keyword_boost + llm_boost) × recency_decay
 *
 * All tunable numbers live in ScoreWeights so they are easy to find and change.
 */
export type ScoreWeights = {
  /** Per extra source a topic appears on. */
  crossSourcePerSource: number;
  crossSourceCap: number;
  keywordBoost: number;
  llmBoostFactor: number;
  halfLifeHours: number;
  /** Engagement given to items from sources without an engagement metric (e.g. RSS). */
  noMetricEngagement: number;
};

export const DEFAULT_WEIGHTS: ScoreWeights = {
  crossSourcePerSource: 0.3,
  crossSourceCap: 0.9,
  keywordBoost: 0.2,
  llmBoostFactor: 0.5,
  halfLifeHours: 24,
  noMetricEngagement: 0.3,
};

export function weightsFromEnv(): ScoreWeights {
  return { ...DEFAULT_WEIGHTS, halfLifeHours: getConfig().SCORE_HALF_LIFE_HOURS };
}

/**
 * Percentile rank of each value within its batch, 0 (lowest) .. 1 (highest). Ties share the
 * average rank. Makes HN points and Google traffic comparable. A batch of one gets 1.
 */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    let less = 0;
    let equal = 0;
    for (const s of sorted) {
      if (s < v) less++;
      else if (s === v) equal++;
    }
    return (less + (equal - 1) / 2) / (n - 1);
  });
}

export function crossSourceBonus(sourceCount: number, w: ScoreWeights = DEFAULT_WEIGHTS): number {
  return Math.min(w.crossSourceCap, w.crossSourcePerSource * Math.max(0, sourceCount - 1));
}

/** Niche keywords matched as whole words/phrases against the normalized title and topic keywords. */
export function matchKeywords(
  normalizedTitle: string,
  topicKeywords: string[],
  nicheKeywords: string[],
): string[] {
  const hay = ` ${normalizedTitle} ${topicKeywords.join(" ")} `;
  return nicheKeywords.filter((kw) => {
    const n = normalizeTitle(kw);
    return n.length > 0 && hay.includes(` ${n} `);
  });
}

export function recencyDecay(hoursSinceFirstSeen: number, halfLifeHours: number): number {
  return Math.pow(0.5, Math.max(0, hoursSinceFirstSeen) / halfLifeHours);
}

export type ScoreInput = {
  /** Engagement of each item, already percentile-ranked and multiplied by weights. */
  itemEngagements: number[];
  sourceCount: number;
  normalizedTitle: string;
  keywords: string[];
  llmRelevance: number | null;
  firstSeenAt: Date;
};

export function scoreTopic(
  input: ScoreInput,
  opts: { now: Date; nicheKeywords: string[]; weights?: ScoreWeights },
): { score: number; breakdown: ScoreBreakdown } {
  const w = opts.weights ?? DEFAULT_WEIGHTS;
  const engagement = input.itemEngagements.length ? Math.max(...input.itemEngagements) : 0;
  const cross = crossSourceBonus(input.sourceCount, w);
  const matched = matchKeywords(input.normalizedTitle, input.keywords, opts.nicheKeywords);
  const keywordBoost = matched.length > 0 ? w.keywordBoost : 0;
  const llmBoost = input.llmRelevance != null ? w.llmBoostFactor * input.llmRelevance : 0;
  const hours = (opts.now.getTime() - input.firstSeenAt.getTime()) / 3600_000;
  const decay = recencyDecay(hours, w.halfLifeHours);
  const round = (x: number) => Math.round(x * 10_000) / 10_000;
  return {
    score: round((engagement + cross + keywordBoost + llmBoost) * decay),
    breakdown: {
      engagement: round(engagement),
      crossSourceBonus: round(cross),
      keywordBoost,
      llmBoost: round(llmBoost),
      recencyDecay: round(decay),
      hoursSinceFirstSeen: Math.round(hours * 10) / 10,
      matchedKeywords: matched,
    },
  };
}

/** Recomputes scores for every topic seen within the window. Returns the number of topics scored. */
export async function scoreRecentTopics(db: DB, opts: { windowHours: number; now?: Date }): Promise<number> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - opts.windowHours * 3600_000);
  const cfg = getConfig();
  const weights = weightsFromEnv();

  const recent = await db
    .select({
      id: topics.id,
      title: topics.title,
      keywords: topics.keywords,
      sourceCount: topics.sourceCount,
      llmRelevance: topics.llmRelevance,
      firstSeenAt: topics.firstSeenAt,
    })
    .from(topics)
    .where(gt(topics.lastSeenAt, cutoff));
  if (recent.length === 0) return 0;

  const items = await db
    .select({
      topicId: rawItems.topicId,
      sourceId: rawItems.sourceId,
      metrics: rawItems.metrics,
      normalizedTitle: rawItems.normalizedTitle,
      sourceType: sources.type,
      sourceWeight: sources.weight,
    })
    .from(rawItems)
    .innerJoin(sources, eq(sources.id, rawItems.sourceId))
    .where(
      inArray(
        rawItems.topicId,
        recent.map((t) => t.id),
      ),
    );

  // Percentile-rank the primary metric within each source's batch (all its items in the window).
  const bySource = new Map<number, number[]>();
  items.forEach((it, idx) => bySource.set(it.sourceId, [...(bySource.get(it.sourceId) ?? []), idx]));
  const engagementOf = new Array<number>(items.length).fill(0);
  for (const idxs of bySource.values()) {
    const first = items[idxs[0]!]!;
    const metric = getAdapter(first.sourceType)?.primaryMetric;
    const ranks = metric
      ? percentileRanks(idxs.map((i) => Number(items[i]!.metrics[metric] ?? 0)))
      : idxs.map(() => weights.noMetricEngagement);
    idxs.forEach((itemIdx, k) => {
      const it = items[itemIdx]!;
      const itemWeight = Number(it.metrics.weight ?? 1); // per-feed weight for RSS
      engagementOf[itemIdx] = (ranks[k] ?? 0) * it.sourceWeight * itemWeight;
    });
  }

  const perTopic = new Map<number, { engagements: number[]; titles: string[] }>();
  items.forEach((it, idx) => {
    if (it.topicId == null) return;
    const entry = perTopic.get(it.topicId) ?? { engagements: [], titles: [] };
    entry.engagements.push(engagementOf[idx]!);
    entry.titles.push(it.normalizedTitle);
    perTopic.set(it.topicId, entry);
  });

  await db.transaction(async (tx) => {
    for (const t of recent) {
      const entry = perTopic.get(t.id);
      const { score, breakdown } = scoreTopic(
        {
          itemEngagements: entry?.engagements ?? [],
          sourceCount: t.sourceCount,
          normalizedTitle: entry?.titles.join(" ") ?? normalizeTitle(t.title),
          keywords: t.keywords,
          llmRelevance: t.llmRelevance,
          firstSeenAt: t.firstSeenAt,
        },
        { now, nicheKeywords: cfg.NICHE_KEYWORDS, weights },
      );
      await tx.update(topics).set({ score, scoreBreakdown: breakdown }).where(eq(topics.id, t.id));
    }
  });
  return recent.length;
}
