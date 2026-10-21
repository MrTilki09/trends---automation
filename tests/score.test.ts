import { describe, expect, it } from "vitest";
import {
  crossSourceBonus,
  DEFAULT_WEIGHTS,
  matchKeywords,
  percentileRanks,
  recencyDecay,
  scoreTopic,
  type ScoreInput,
} from "../lib/pipeline/score";

const now = new Date("2026-10-19T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);
const base: ScoreInput = {
  itemEngagements: [0.5],
  sourceCount: 1,
  normalizedTitle: "some story",
  keywords: ["story"],
  llmRelevance: null,
  publishedAt: now,
};
const score = (over: Partial<ScoreInput>, niche: string[] = []) =>
  scoreTopic({ ...base, ...over }, { now, nicheKeywords: niche });

describe("percentileRanks", () => {
  it("maps min to 0 and max to 1", () => {
    expect(percentileRanks([10, 50, 30])).toEqual([0, 1, 0.5]);
  });
  it("gives ties the same rank", () => {
    const r = percentileRanks([5, 5, 10]);
    expect(r[0]).toBe(r[1]);
    expect(r[2]).toBe(1);
  });
  it("handles batches of 0 and 1", () => {
    expect(percentileRanks([])).toEqual([]);
    expect(percentileRanks([42])).toEqual([1]);
  });
});

describe("components", () => {
  it("cross-source bonus is +0.3 per extra source, capped at 0.9", () => {
    expect(crossSourceBonus(1)).toBe(0);
    expect(crossSourceBonus(2)).toBeCloseTo(0.3);
    expect(crossSourceBonus(3)).toBeCloseTo(0.6);
    expect(crossSourceBonus(10)).toBeCloseTo(0.9);
  });

  it("keyword boost matches whole words and Turkish phrases", () => {
    expect(matchKeywords("new ai model", [], ["ai"])).toEqual(["ai"]);
    expect(matchKeywords("said the chairman", [], ["ai"])).toEqual([]); // no substring match
    expect(matchKeywords("turk yapay zeka girisimi", [], ["yapay zeka", "girişim"])).toEqual(["yapay zeka"]);
    expect(matchKeywords("headline", ["claude"], ["Claude"])).toEqual(["Claude"]);
    expect(score({ normalizedTitle: "new ai model" }, ["ai"]).breakdown.keywordBoost).toBe(
      DEFAULT_WEIGHTS.keywordBoost,
    );
  });

  it("llm boost is 0.5 × relevance, 0 when not enriched", () => {
    expect(score({ llmRelevance: 0.8 }).breakdown.llmBoost).toBeCloseTo(0.4);
    expect(score({ llmRelevance: null }).breakdown.llmBoost).toBe(0);
  });

  it("recency decay halves every half-life", () => {
    expect(recencyDecay(0, 24)).toBe(1);
    expect(recencyDecay(24, 24)).toBeCloseTo(0.5);
    expect(recencyDecay(48, 24)).toBeCloseTo(0.25);
    expect(recencyDecay(-5, 24)).toBe(1); // clock skew never boosts
  });

  it("engagement is the max across the topic's items", () => {
    expect(score({ itemEngagements: [0.2, 0.9, 0.4] }).breakdown.engagement).toBeCloseTo(0.9);
    expect(score({ itemEngagements: [] }).breakdown.engagement).toBe(0);
  });

  it("combines as (engagement + bonuses) × decay and explains itself", () => {
    const r = score({ itemEngagements: [0.6], sourceCount: 2, llmRelevance: 0.4, publishedAt: hoursAgo(24) });
    expect(r.score).toBeCloseTo((0.6 + 0.3 + 0 + 0.2) * 0.5, 4);
    expect(r.breakdown).toMatchObject({
      engagement: 0.6,
      crossSourceBonus: 0.3,
      llmBoost: 0.2,
      recencyDecay: 0.5,
    });
  });
});

describe("ranking", () => {
  it("recent multi-source topics outrank old single-source ones", () => {
    const recentMulti = score({ itemEngagements: [0.5], sourceCount: 3, publishedAt: hoursAgo(2) });
    const oldSingleViral = score({ itemEngagements: [1], sourceCount: 1, publishedAt: hoursAgo(36) });
    expect(recentMulti.score).toBeGreaterThan(oldSingleViral.score);
  });
});
