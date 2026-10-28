import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseApproxTraffic, parseGoogleTrends } from "../lib/sources/google-trends";
import { parseHnItem } from "../lib/sources/hackernews";
import { parseRedditListing } from "../lib/sources/reddit";
import { parseBridgeResponse } from "../lib/sources/reddit-devvit";
import { dedupeBatch } from "../lib/pipeline/dedupe";
import { parseFeed, repairXml, urlSections } from "../lib/sources/rss";

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

  it("strips the publisher suffix from Google News titles and keeps it as author", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>"OpenAI" - Google News</title>
      <item><title>OpenAI launches GPT-6 - Reuters</title><link>https://news.google.com/rss/articles/abc?oc=5</link>
      <pubDate>Mon, 26 Oct 2026 08:00:00 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item>
      <item><title>Nvidia earnings - what to expect - The Verge</title><link>https://news.google.com/rss/articles/def</link></item>
      <item><title>Plain title - Reuters</title><link>https://www.reuters.com/x</link></item></channel></rss>`;
    const items = await parseFeed(xml);
    expect(items.map((i) => i.title)).toEqual([
      "OpenAI launches GPT-6",
      "Nvidia earnings - what to expect",
      "Plain title - Reuters",
    ]);
    expect(items[0]!.author).toBe("Reuters");
    expect(items[1]!.author).toBe("The Verge");
  });

  it("respects maxItems", async () => {
    expect(await parseFeed(fixture("rss-webrazzi.xml"), { maxItems: 5 })).toHaveLength(5);
  });

  it("reads Atom <category term> tags (The Verge, ZDNet, CNET, Business Insider format)", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>t</title>
      <entry><title>iPhone hinge</title><link rel="alternate" href="https://www.theverge.com/tech/1/iphone-hinge"/>
      <id>1</id><published>2026-10-27T18:55:05-04:00</published>
      <category scheme="https://www.theverge.com" term="Apple"/><category term="Foldable Phones" label="Foldables"/>
      </entry></feed>`;
    const [item] = await parseFeed(xml, { feedUrl: "https://www.theverge.com/rss/index.xml" });
    expect(item!.tags).toEqual(["Apple", "Foldables", "tech"]);
  });

  it("collects keywords, hashtags, subcategories, flags, comment counts and the image", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"
      xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:slash="http://purl.org/rss/1.0/modules/slash/"
      xmlns:cf="https://example.com/cf" xmlns:neowin="https://neowin.net"><channel><title>t</title>
      <item><title>One</title><link>https://example.com/a</link><category>Security</category>
        <media:keywords>privacy, free speech</media:keywords><dc:subject>Repeat History</dc:subject>
        <neowin:tags>#Microsoft #SharePoint</neowin:tags><subcategory>Yapay Zeka</subcategory>
        <cf:isSponsored>true</cf:isSponsored><cf:hasAffiliateLinks>false</cf:hasAffiliateLinks>
        <slash:comments>42</slash:comments><media:content url="https://img.example.com/a.jpg" medium="image"/>
      </item></channel></rss>`;
    const [item] = await parseFeed(xml);
    expect(item!.tags).toEqual([
      "Security",
      "Yapay Zeka",
      "Repeat History",
      "privacy",
      "free speech",
      "Microsoft",
      "SharePoint",
      "sponsored",
    ]);
    expect(item!.metrics).toEqual({ comments: 42 });
    expect((item!.raw as { image?: string }).image).toBe("https://img.example.com/a.jpg");
  });

  it("reads YouTube views/likes and Hacker News points from feeds", async () => {
    const yt = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
      <title>MKBHD</title><entry><id>yt:video:x</id><title>This can SEE Sound!</title>
      <link rel="alternate" href="https://www.youtube.com/shorts/x"/><published>2026-10-27T20:14:55+00:00</published>
      <media:group><media:title>t</media:title><media:thumbnail url="https://i.ytimg.com/x.jpg"/>
      <media:community><media:starRating count="31909" average="5.00"/><media:statistics views="984788"/></media:community>
      </media:group></entry></feed>`;
    const [video] = await parseFeed(yt);
    expect(video!.metrics).toEqual({ views: 984788, likes: 31909 });
    expect(video!.tags).toEqual(["shorts"]);
    expect((video!.raw as { image?: string }).image).toBe("https://i.ytimg.com/x.jpg");

    const hn = `<?xml version="1.0"?><rss version="2.0"><channel><title>HN</title><item><title>Ghostty 1.4</title>
      <link>https://ghostty.org/</link><description><![CDATA[<p>Article URL: x</p><p>Points: 996</p><p># Comments: 315</p>]]></description>
      </item></channel></rss>`;
    expect((await parseFeed(hn))[0]!.metrics).toEqual({ points: 996, comments: 315 });
  });

  it("adds feed-level tags and skips arXiv re-announcements of old papers", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:arxiv="http://arxiv.org/schemas/atom"><channel><title>arXiv</title>
      <item><title>New paper</title><link>https://arxiv.org/abs/1</link><category>cs.AI</category><arxiv:announce_type>new</arxiv:announce_type></item>
      <item><title>Old paper v3</title><link>https://arxiv.org/abs/2</link><arxiv:announce_type>replace</arxiv:announce_type></item>
      </channel></rss>`;
    const items = await parseFeed(xml, { tags: ["research"] });
    expect(items.map((i) => i.title)).toEqual(["New paper"]);
    expect(items[0]!.tags).toEqual(["research", "cs.AI"]);
  });

  it("recovers feeds that are almost XML (raw HTML, bare &, HTML entities)", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Rest of World</title>
      <item><title>AI &amp; you&nbsp;&mdash; why</title><link>https://restofworld.org/2026/x/?a=1&b=2</link>
      <description><p>Broken <img src=x async> html</p></description></item></channel></rss>`;
    expect(repairXml(xml)).toContain("<![CDATA[<p>Broken");
    const [item] = await parseFeed(xml);
    expect(item!.title).toBe("AI & you — why");
    expect(item!.url).toBe("https://restofworld.org/2026/x/?a=1&b=2");
    expect(item!.summary).toBe("Broken html");
  });
});

describe("urlSections (section labels from article paths)", () => {
  const feed = "https://feeds.example.com/rss";
  it("takes section words before the slug and skips dates, ids and structure words", () => {
    expect(
      urlSections("https://www.example.com/tech-industry/artificial-intelligence/some-slug", feed),
    ).toEqual(["tech industry", "artificial intelligence"]);
    expect(urlSections("https://example.com/technology/2026/oct/27/slug", feed)).toEqual(["technology"]);
    expect(urlSections("https://example.com/news/articles/c123abc", feed)).toEqual([]);
    expect(urlSections("https://example.com/sites/janedoe/2026/10/27/slug", feed)).toEqual([]);
    expect(urlSections("https://example.com/p/a-substack-post", feed)).toEqual([]);
  });
  it("ignores links to other sites (aggregators like Hacker News or Google News)", () => {
    expect(urlSections("https://other.com/security/slug", feed)).toEqual([]);
    expect(
      urlSections("https://news.google.com/rss/articles/abc", "https://news.google.com/rss/search?q=x"),
    ).toEqual([]);
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

describe("dedupeBatch", () => {
  it("merges copies of one article from a publisher's main and section feeds", () => {
    const base = { externalId: "a", title: "T", raw: null };
    const merged = dedupeBatch([
      { ...base, tags: ["Apple"], metrics: { comments: 3 } },
      { ...base, externalId: "b", tags: [], metrics: {} },
      { ...base, tags: ["ai", "Apple"], metrics: { comments: 5, weight: 1.2 } },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.tags).toEqual(["Apple", "ai"]);
    expect(merged[0]!.metrics).toEqual({ comments: 5, weight: 1.2 });
  });
});

describe("rss tags vs author", () => {
  it("drops a category that is only the author's name", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>t</title>
      <item><title>X</title><link>https://example.com/x</link><dc:creator>Levent Pekcan</dc:creator>
      <category>Levent Pekcan</category><category>Yapay Zeka</category></item></channel></rss>`;
    const [item] = await parseFeed(xml);
    expect(item!.tags).toEqual(["Yapay Zeka"]);
    expect(item!.author).toBe("Levent Pekcan");
  });
});

describe("rss ids", () => {
  it("falls back to the link when <guid> is empty (attributes only)", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>NASA</title>
      <item><title>Curiosity</title><link>https://science.nasa.gov/blog/x/</link><guid isPermaLink="false"/></item>
      </channel></rss>`;
    expect((await parseFeed(xml))[0]!.externalId).toBe("https://science.nasa.gov/blog/x/");
  });
});
