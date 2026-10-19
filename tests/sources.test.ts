import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApproxTraffic, parseGoogleTrends } from "../lib/sources/google-trends";
import { parseHnItem } from "../lib/sources/hackernews";
import { parseRedditListing } from "../lib/sources/reddit";
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
  });

  it("parses an Atom feed (The Verge) and applies per-feed weight", async () => {
    const items = await parseFeed(fixture("atom-verge.xml"), { weight: 1.5 });
    expect(items.length).toBe(10);
    expect(items[0]!.publishedAt).toBeInstanceOf(Date);
    expect(items[0]!.metrics).toEqual({ weight: 1.5 });
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
