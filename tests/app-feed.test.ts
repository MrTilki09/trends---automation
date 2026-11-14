import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, momentumOf } from "../lib/data/feed";
import {
  cleanSnippet,
  cutAtSentence,
  displayFields,
  imageUrlOf,
  pickDisplay,
  publisherOf,
  type ItemForPick,
} from "../lib/pipeline/snippet";

describe("cleanSnippet", () => {
  it("drops WordPress 'appeared first on' boilerplate", () => {
    expect(
      cleanSnippet(
        '"Some things are wrong, you know?" The post Tenant Uses AI to Beat Down His Landlord in Court appeared first on Futurism.',
        "Tenant Uses AI to Beat Down His Landlord in Court",
      ),
    ).toBeNull(); // what is left is shorter than the minimum
    expect(
      cleanSnippet(
        "A long enough first sentence about a new chip that ships next month to everyone. The post New chip appeared first on Example News.",
        "New chip",
      ),
    ).toBe("A long enough first sentence about a new chip that ships next month to everyone.");
  });

  it("returns null when the snippet only repeats the headline (Google News)", () => {
    const title = "Microsoft Winds Down Oracle AI Cloud Deal As Older NVIDIA GPUs No Longer Meet Its Needs";
    expect(cleanSnippet(`${title} Wccftech`, title)).toBeNull();
    expect(cleanSnippet(title, title)).toBeNull();
  });

  it("strips Techmeme's 'Author / Publication:' prefix when asked", () => {
    const s =
      "George Hammond / Financial Times: Analysis: Sam Bankman-Fried's $500M Anthropic investment in 2021 would be worth ~$37B";
    expect(cleanSnippet(s, "x", { stripCreditPrefix: true })).toBe(
      "Analysis: Sam Bankman-Fried's $500M Anthropic investment in 2021 would be worth ~$37B",
    );
  });

  it("drops Hacker News RSS bodies and 'Read more' tails", () => {
    expect(cleanSnippet("Article URL: https://x.dev Comments URL: https://news.ycombinator.com/item?id=1", "t")).toBeNull();
    expect(cleanSnippet("A useful sentence that is long enough to keep around here. Read more…", "t")).toBe(
      "A useful sentence that is long enough to keep around here.",
    );
  });

  it("cuts long text at a sentence boundary, else at a word with an ellipsis", () => {
    const sentence = "This is a sentence that goes on for a while. ";
    expect(cutAtSentence(sentence.repeat(10), 300).endsWith(".")).toBe(true);
    expect(cutAtSentence(sentence.repeat(10), 300).length).toBeLessThanOrEqual(300);
    const words = "word ".repeat(100);
    const cut = cutAtSentence(words, 50);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(51);
  });
});

describe("publisherOf / imageUrlOf / displayFields", () => {
  it("counts every Hacker News feed as one publisher", () => {
    expect(publisherOf({ sourceName: "Hacker News (top)", sourceType: "hackernews" })).toBe("Hacker News");
    expect(publisherOf({ sourceName: "Hacker News Best (hnrss)", sourceType: "rss" })).toBe("Hacker News");
  });

  it("credits the real publisher of Google News items", () => {
    expect(
      publisherOf({
        sourceName: "Google News (big tech companies)",
        sourceType: "rss",
        url: "https://news.google.com/rss/articles/abc",
        author: "Tom's Hardware",
      }),
    ).toBe("Tom's Hardware");
    expect(publisherOf({ sourceName: "Google News (tech topics)", sourceType: "rss" })).toBe("Google News");
  });

  it("drops the section suffix of other sources", () => {
    expect(publisherOf({ sourceName: "The Verge (AI)", sourceType: "rss" })).toBe("The Verge");
    expect(publisherOf({ sourceName: "TechCrunch", sourceType: "rss" })).toBe("TechCrunch");
    expect(publisherOf({ sourceName: "CNBC Technology", sourceType: "rss" })).toBe("CNBC");
    expect(publisherOf({ sourceName: "Bloomberg Technology", sourceType: "rss" })).toBe("Bloomberg");
    expect(publisherOf({ sourceName: "Ars Technica", sourceType: "rss" })).toBe("Ars Technica");
  });

  it("accepts only http(s) image URLs and upgrades http", () => {
    expect(imageUrlOf({ image: "http://cdn.example.com/a.jpg" })).toBe("https://cdn.example.com/a.jpg");
    expect(imageUrlOf({ image: "javascript:alert(1)" })).toBeNull();
    expect(imageUrlOf({ image: 42 })).toBeNull();
    expect(imageUrlOf(null)).toBeNull();
  });

  it("never uses Google Trends' related-headline lists as a snippet", () => {
    const f = displayFields({
      title: "wake forest vs smu",
      summary: "How to Watch Wake Forest vs. SMU: TV Channel, Live Stream, Time · SMU vs. Wake Forest: How To Watch",
      sourceName: "Google Trends (US)",
      sourceType: "google_trends",
    });
    expect(f.snippet).toBeNull();
  });
});

describe("pickDisplay", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 14, h));
  const item = (o: Partial<ItemForPick>): ItemForPick => ({
    snippet: null,
    imageUrl: null,
    publisher: "X",
    sourceWeight: 1,
    publishedAt: at(10),
    fetchedAt: at(10),
    ...o,
  });

  it("takes the snippet and image of the best items, and counts distinct publishers", () => {
    const res = pickDisplay([
      item({ publisher: "Hacker News", sourceWeight: 1.2, publishedAt: at(9) }),
      item({ publisher: "TechPowerUp", snippet: "From TPU", imageUrl: "https://i/1.jpg", publishedAt: at(8) }),
      item({ publisher: "Hacker News", sourceWeight: 1.2 }),
      item({ publisher: "Wired", snippet: "From Wired", sourceWeight: 1.5, publishedAt: at(11) }),
    ]);
    expect(res).toEqual({
      snippet: "From Wired",
      snippetPublisher: "Wired",
      imageUrl: "https://i/1.jpg",
      publisherCount: 3,
    });
  });

  it("prefers the earliest item among equal weights", () => {
    const res = pickDisplay([
      item({ publisher: "B", snippet: "later", publishedAt: at(12) }),
      item({ publisher: "A", snippet: "earlier", publishedAt: at(7) }),
    ]);
    expect(res.snippet).toBe("earlier");
  });
});

describe("momentum", () => {
  it("is 'new' for young topics without history and 'steady' for old ones", () => {
    expect(momentumOf(1, null, 2).momentum).toBe("new");
    expect(momentumOf(1, null, 30).momentum).toBe("steady");
  });

  it("labels rising, steady and fading from the 6-hour change", () => {
    expect(momentumOf(1.24, 0.9, 10)).toEqual({ momentum: "rising", change: 0.38 });
    // Plain recency decay over 6 h (~16%) is still "steady".
    expect(momentumOf(0.84, 1, 10).momentum).toBe("steady");
    expect(momentumOf(0.5, 1, 10).momentum).toBe("fading");
  });

  it("does not explode on tiny past scores", () => {
    expect(momentumOf(0.1, 0.001, 10).change).toBe(1.98);
  });
});

describe("feed cursors", () => {
  it("round-trips and rejects garbage", () => {
    const c = { tab: "trending" as const, v: 31, k: 1.2345, id: 12818 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor(Buffer.from('["x",1,2,3]').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('["latest",1,"2",3]').toString("base64url"))).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });

  it("keyset paging over a fixed snapshot never repeats or skips, even when live scores change", () => {
    // Snapshot scores of one run: what every page of one scroll session is ranked by.
    // Deterministic scores with plenty of ties, so the id tie-break is exercised too.
    const snapshot = Array.from({ length: 53 }, (_, i) => ({ id: i + 1, score: ((i * 37) % 11) / 10 }));
    const order = (a: { id: number; score: number }, b: { id: number; score: number }) =>
      b.score - a.score || b.id - a.id;
    const page = (after: { k: number; id: number } | null) =>
      [...snapshot]
        .sort(order)
        .filter((t) => !after || t.score < after.k || (t.score === after.k && t.id < after.id))
        .slice(0, 20);
    const seen: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const c = decodeCursor(cursor);
      const rows = page(c ? { k: c.k, id: c.id } : null);
      seen.push(...rows.map((r) => r.id));
      // A new hourly run changes the live scores meanwhile; the snapshot (run 31) is untouched.
      const last = rows[rows.length - 1];
      cursor = rows.length === 20 && last ? encodeCursor({ tab: "trending", v: 31, k: last.score, id: last.id }) : null;
      if (!cursor) break;
    }
    expect(seen.length).toBe(53);
    expect(new Set(seen).size).toBe(53);
  });
});
