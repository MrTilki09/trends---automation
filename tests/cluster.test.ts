import { describe, expect, it } from "vitest";
import { assignClusters, similarity, trigrams } from "../lib/pipeline/cluster";
import { canonicalizeUrl, normalizeTitle } from "../lib/pipeline/normalize";

const sim = (a: string, b: string) => similarity(trigrams(normalizeTitle(a)), trigrams(normalizeTitle(b)));

describe("trigram similarity (pg_trgm compatible)", () => {
  it("builds pg_trgm-style padded trigrams", () => {
    // pg_trgm: show_trgm('cat') = {"  c"," ca","at ","cat"}
    expect([...trigrams("cat")].sort()).toEqual(["  c", " ca", "at ", "cat"]);
  });

  it("is 1 for identical and 0 for unrelated titles", () => {
    expect(sim("Linux 7.3 released", "Linux 7.3 Released!")).toBe(1);
    expect(sim("Linux 7.3 released", "Bananas are yellow")).toBe(0);
  });

  it("scores re-worded headlines of the same story above the 0.55 threshold", () => {
    expect(
      sim(
        "Mistral releases Timestral time-series models",
        "Timestral: Mistral release time-series foundation models",
      ),
    ).toBeGreaterThan(0.55);
  });

  it("keeps different stories below the threshold even when they share words", () => {
    expect(sim("OpenAI releases GPT-6", "OpenAI hires new CFO")).toBeLessThan(0.55);
  });
});

describe("assignClusters", () => {
  const item = (id: number, title: string, url?: string) => ({
    id,
    canonicalUrl: canonicalizeUrl(url),
    normalizedTitle: normalizeTitle(title),
  });

  it("attaches by canonical URL even when titles differ", () => {
    const res = assignClusters(
      [item(10, "Completely different words", "https://www.example.com/story?utm_source=hn")],
      [{ topicId: 1, canonicalUrl: "https://example.com/story", normalizedTitle: "something else" }],
      0.55,
    );
    expect(res.get(10)).toBe("existing:1");
  });

  it("attaches by title similarity to the best matching topic", () => {
    const res = assignClusters(
      [item(10, "Timestral: Mistral release time-series foundation models")],
      [
        {
          topicId: 1,
          canonicalUrl: null,
          normalizedTitle: normalizeTitle("Mistral releases Timestral time-series models"),
        },
        {
          topicId: 2,
          canonicalUrl: null,
          normalizedTitle: normalizeTitle("Mistral raises new funding round"),
        },
      ],
      0.55,
    );
    expect(res.get(10)).toBe("existing:1");
  });

  it("creates a new topic below the threshold", () => {
    const res = assignClusters(
      [item(10, "Linux 7.3 released")],
      [{ topicId: 1, canonicalUrl: null, normalizedTitle: normalizeTitle("Linux Foundation annual report") }],
      0.55,
    );
    expect(res.get(10)).toBe("new:10");
  });

  it("respects the configured threshold", () => {
    const a = "OpenAI announces GPT-6 with longer context";
    const b = "OpenAI GPT-6 announced";
    const s = sim(a, b);
    const candidates = [{ topicId: 1, canonicalUrl: null, normalizedTitle: normalizeTitle(a) }];
    expect(assignClusters([item(10, b)], candidates, s - 0.01).get(10)).toBe("existing:1");
    expect(assignClusters([item(10, b)], candidates, s + 0.01).get(10)).toBe("new:10");
  });

  it("merges new items from the same batch (two sources, one story -> one topic)", () => {
    const res = assignClusters(
      [
        item(1, "Linux 7.3 Released", "https://lwn.net/Articles/1101143/"),
        item(2, "Unrelated story about bananas"),
        item(3, "Linux 7.3 released", "https://www.lwn.net/Articles/1101143?utm_campaign=rss"),
        item(4, "Linux 7.3 is released"),
      ],
      [],
      0.55,
    );
    expect(res.get(1)).toBe("new:1");
    expect(res.get(2)).toBe("new:2");
    expect(res.get(3)).toBe("new:1");
    expect(res.get(4)).toBe("new:1");
  });
});
