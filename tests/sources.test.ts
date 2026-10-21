import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApproxTraffic, parseGoogleTrends } from "../lib/sources/google-trends";
import { parseHnItem } from "../lib/sources/hackernews";
import { parseRedditListing } from "../lib/sources/reddit";
import { parseBridgeResponse } from "../lib/sources/reddit-devvit";
import { parseFeed } from "../lib/sources/rss";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("hackernews adapter", () => {
  const lines = fixture("hn-items.jsonl")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  it("parses saved story items", () => {
    const item = parseHnItem(lines[1])!;
    expect(item).toMatchObject({
      externalId: "50149392",
      title: "Linux 7.3 Released",
      url: "https://lwn.net/Articles/1101143/",
      author: "cjd8",
      metrics: { points: 350, comments: 158 },
    });
    expect(item.publishedAt).toBeInstanceOf(Date);
    expect(item.tags).toEqual([]);
  });

  it("tags Show HN / Ask HN posts", () => {
    expect(parseHnItem({ ...lines[3], title: "Show HN: My tool" })!.tags).toEqual(["show hn"]);
    expect(parseHnItem({ ...lines[3], title: "Ask HN: Anyone?" })!.tags).toEqual(["ask hn"]);
  });

  it("falls back to the HN discussion URL for text posts", () => {
    const item = parseHnItem({ ...lines[0], url: undefined })!;
    expect(item.url).toBe(`https://news.ycombinator.com/item?id=${lines[0].id}`);
  });

  it("skips dead, deleted and non-story items", () => {
    expect(parseHnItem({ ...lines[0], dead: true })).toBeNull();
    expect(parseHnItem({ ...lines[0], type: "comment" })).toBeNull();
    expect(parseHnItem({ id: 1, deleted: true })).toBeNull();
    expect(parseHnItem("garbage")).toBeNull();
  });
});

describe("google trends adapter", () => {
  it("parses approximate traffic strings", () => {
    expect(parseApproxTraffic("200+")).toBe(200);
    expect(parseApproxTraffic("20K+")).toBe(20_000);
    expect(parseApproxTraffic("2M+")).toBe(2_000_000);
    expect(parseApproxTraffic("1,000+")).toBe(1000);
    expect(parseApproxTraffic(undefined)).toBe(0);
    expect(parseApproxTraffic("n/a")).toBe(0);
  });

  it("parses the saved TR feed including related news", async () => {
    const items = await parseGoogleTrends(fixture("google-trends-tr.xml"), "TR", "tr");
    expect(items).toHaveLength(10);
    const first = items[0]!;
    expect(first.title).toBe("yeni şafak");
    expect(first.metrics.approxTraffic).toBe(200);
    expect(first.lang).toBe("tr");
    expect(first.externalId).toMatch(/^TR:yeni şafak:\d{4}-\d{2}-\d{2}$/);
    expect(first.url).toMatch(/^https:\/\/www\.cumhuriyet\.com\.tr\//);
    const raw = first.raw as { news: { title: string }[] };
    expect(raw.news.length).toBe(3);
    expect(first.summary).toContain("yalanlama");
    expect(first.publishedAt).toBeInstanceOf(Date);
    expect(first.tags).toEqual(["search trend", "turkey"]);
  });
});

describe("rss adapter", () => {
  it("parses an RSS 2.0 feed (Webrazzi)", async () => {
    const items = await parseFeed(fixture("rss-webrazzi.xml"), { lang: "tr", maxItems: 50 });
    expect(items.length).toBe(20);
    for (const it of items) {
      expect(it.title.length).toBeGreaterThan(0);
      expect(it.url).toMatch(/^https?:\/\//);
      expect(it.externalId.length).toBeGreaterThan(0);
      expect(it.lang).toBe("tr");
    }
    expect(items.some((i) => i.title.includes("Character.AI"))).toBe(true);
    // Webrazzi sends <category> tags (e.g. "Yapay Zeka") and dates on every item.
    expect(items.every((i) => i.publishedAt instanceof Date)).toBe(true);
    expect(items.every((i) => (i.tags ?? []).length > 0)).toBe(true);
    expect(items.flatMap((i) => i.tags ?? [])).toContain("Yapay Zeka");
  });

  it("parses an Atom feed (The Verge) and applies per-feed weight", async () => {
    const items = await parseFeed(fixture("atom-verge.xml"), { weight: 1.5 });
    expect(items.length).toBe(10);
    expect(items[0]!.publishedAt).toBeInstanceOf(Date);
    expect(items[0]!.metrics).toEqual({ weight: 1.5 });
  });

  it("turns structured <author> elements into plain text (Google blog format)", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:author="http://www.w3.org/2005/Atom"><channel><title>t</title>
      <item><title>Hello</title><link>https://blog.google/x/</link><pubDate>Wed, 21 Oct 2026 04:00:00 +0000</pubDate>
      <author xmlns:author="http://www.w3.org/2005/Atom"><name>Jane Doe</name><title>Director</title></author>
      <category>AI</category></item></channel></rss>`;
    const [item] = await parseFeed(xml);
    expect(item!.author).toBe("Jane Doe");
    expect(item!.tags).toEqual(["AI"]);
  });

  it("respects maxItems", async () => {
    expect(await parseFeed(fixture("rss-webrazzi.xml"), { maxItems: 5 })).toHaveLength(5);
  });
});

describe("reddit adapter (parser only)", () => {
  it("parses a listing and skips stickied posts", () => {
    const listing = {
      data: {
        children: [
          {
            data: {
              id: "abc",
              title: "A post",
              permalink: "/r/technology/comments/abc/a_post/",
              url: "https://example.com/a",
              created_utc: 1_790_000_000,
              score: 120,
              num_comments: 30,
              upvote_ratio: 0.95,
              subreddit: "technology",
            },
          },
          {
            data: {
              id: "pin",
              title: "Rules",
              permalink: "/r/technology/comments/pin/",
              created_utc: 1_790_000_000,
              score: 1,
              num_comments: 0,
              stickied: true,
              subreddit: "technology",
            },
          },
        ],
      },
    };
    const items = parseRedditListing(listing);
    expect(items).toHaveLength(1);
    expect(items[0]!.metrics).toEqual({ score: 120, comments: 30, upvoteRatio: 0.95 });
  });
});

describe("reddit via Devvit bridge (parser only)", () => {
  const post = {
    id: "t3_abc",
    subreddit: "technology",
    title: "Nvidia unveils new GPU",
    url: "https://www.theverge.com/nvidia-gpu",
    permalink: "/r/technology/comments/abc/nvidia_unveils_new_gpu/",
    author: "someone",
    createdAt: "2026-10-21T08:00:00.000Z",
    score: 1234,
    comments: 210,
    flair: "Hardware",
  };

  it("maps posts to items with article URL, metrics, tags and date", () => {
    const { items, errors } = parseBridgeResponse({ posts: [post] });
    expect(errors).toEqual([]);
    expect(items[0]).toMatchObject({
      externalId: "t3_abc",
      url: "https://www.theverge.com/nvidia-gpu",
      metrics: { score: 1234, comments: 210 },
      tags: ["r/technology", "reddit", "Hardware"],
    });
    expect(items[0]!.publishedAt?.toISOString()).toBe("2026-10-21T08:00:00.000Z");
  });

  it("uses the Reddit permalink for text posts and skips stickied posts", () => {
    const { items } = parseBridgeResponse({
      posts: [
        {
          ...post,
          id: "t3_self",
          url: "https://www.reddit.com/r/technology/comments/self/",
          body: "Discussion",
        },
        { ...post, id: "t3_pin", stickied: true },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe("https://www.reddit.com/r/technology/comments/abc/nvidia_unveils_new_gpu/");
    expect(items[0]!.summary).toBe("Discussion");
  });

  it("reports per-subreddit errors without failing the rest", () => {
    const { items, errors } = parseBridgeResponse({
      posts: [post],
      errors: [{ subreddit: "private_sub", message: "forbidden" }],
    });
    expect(items).toHaveLength(1);
    expect(errors).toEqual(["r/private_sub: forbidden"]);
  });
});
