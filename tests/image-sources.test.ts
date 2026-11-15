import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDevtoArticles } from "../lib/sources/devto";
import { parseGithubSearch } from "../lib/sources/github";
import { parseGoogleTrends } from "../lib/sources/google-trends";
import { parseHnItem } from "../lib/sources/hackernews";
import { parseHfDailyPapers } from "../lib/sources/huggingface";
import { cleanImageUrl, firstHtmlImage, linkCardImage, widest } from "../lib/sources/images";
import { parseLemmyPosts } from "../lib/sources/lemmy";
import { parseMastodonTrends } from "../lib/sources/mastodon";
import { parseFeed } from "../lib/sources/rss";
import { htmlToText } from "../lib/sources/text";
import { parseWikipediaMostRead } from "../lib/sources/wikipedia";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const json = (name: string) => JSON.parse(fixture(name));
const image = (raw: unknown) => (raw as { image?: string }).image;

describe("image helpers", () => {
  it("cleans image URLs: entities, relative paths, junk", () => {
    expect(cleanImageUrl("https://9to5mac.com/a.jpg?quality=82&#038;w=1600")).toBe(
      "https://9to5mac.com/a.jpg?quality=82&w=1600",
    );
    expect(cleanImageUrl("/images/fuzzing.png", "https://security.googleblog.com/2026/10/post.html")).toBe(
      "https://security.googleblog.com/images/fuzzing.png",
    );
    expect(cleanImageUrl("https://a.fsdn.com/sd/twitter_icon_large.png")).toBeUndefined();
    expect(cleanImageUrl("https://feeds.feedburner.com/~r/x/~4/abc")).toBeUndefined();
    expect(cleanImageUrl("data:image/gif;base64,R0lGOD")).toBeUndefined();
    // Words inside other words are fine: a Pixel phone photo, a SiliconANGLE image.
    expect(cleanImageUrl("https://siliconangle.com/files/pixel-10-pro.jpg")).toBe(
      "https://siliconangle.com/files/pixel-10-pro.jpg",
    );
  });

  it("finds the first real image in feed HTML, preferring the widest srcset entry", () => {
    const html = `<p><img src="https://x.com/emoji/1f600.png" width="16"><img
      src="https://x.com/photo-300.jpg" srcset="https://x.com/photo-300.jpg 300w, https://x.com/photo-1600.jpg 1600w"
      width="1600"></p>`;
    expect(firstHtmlImage(html)).toBe("https://x.com/photo-1600.jpg");
    expect(firstHtmlImage(`<img src="/a.jpg">`, "https://site.com/post/")).toBe("https://site.com/a.jpg");
    expect(firstHtmlImage("<p>no image</p>")).toBeUndefined();
  });

  it("picks the widest media variant", () => {
    expect(
      widest([
        { url: "https://z.com/full.jpeg", width: "6192" },
        { url: "https://z.com/crop.jpeg?w=300", width: "300" },
      ]),
    ).toBe("https://z.com/full.jpeg");
  });

  it("builds GitHub and YouTube preview cards for links", () => {
    expect(linkCardImage("https://github.com/huamidev/GestaltX")).toBe(
      "https://opengraph.githubassets.com/1/huamidev/GestaltX",
    );
    expect(linkCardImage("https://github.com/owner/repo.git/tree/main/src")).toBe(
      "https://opengraph.githubassets.com/1/owner/repo",
    );
    expect(linkCardImage("https://github.com/features/copilot")).toBeUndefined();
    expect(linkCardImage("https://www.youtube.com/watch?v=hdMszZ2ah5Q&t=3")).toBe(
      "https://i.ytimg.com/vi/hdMszZ2ah5Q/hqdefault.jpg",
    );
    expect(linkCardImage("https://youtu.be/hdMszZ2ah5Q")).toBe(
      "https://i.ytimg.com/vi/hdMszZ2ah5Q/hqdefault.jpg",
    );
    expect(linkCardImage("https://example.com/post")).toBeUndefined();
  });

  it("turns API HTML into text", () => {
    expect(htmlToText("Hey HN readers! I&#x27;m here<p>see https:&#x2F;&#x2F;x.com")).toBe(
      "Hey HN readers! I'm here see https://x.com",
    );
  });
});

describe("feed images and descriptions", () => {
  it("uses the image inside <content:encoded> when the feed has no media element", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel><title>9to5Mac</title><item><title>Beats 360 vs Studio Pro</title><link>https://9to5mac.com/2026/11/14/beats/</link>
      <content:encoded><![CDATA[<figure><img width="1600" height="800" src="https://9to5mac.com/wp-content/uploads/beats.jpg?quality=82&#038;w=1600"></figure><p>Text</p>]]></content:encoded>
      </item></channel></rss>`;
    const [item] = await parseFeed(xml);
    expect(image(item!.raw)).toBe("https://9to5mac.com/wp-content/uploads/beats.jpg?quality=82&w=1600");
  });

  it("gives aggregator items linking to GitHub the repo card", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Lobsters</title>
      <item><title>Ghostty 1.4</title><link>https://github.com/ghostty-org/ghostty</link><description>x</description></item>
      </channel></rss>`;
    expect(image((await parseFeed(xml))[0]!.raw)).toBe(
      "https://opengraph.githubassets.com/1/ghostty-org/ghostty",
    );
  });

  it("reads YouTube's video description", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
      <title>MKBHD</title><entry><id>yt:video:x</id><title>Macbook PROLED Review</title>
      <link rel="alternate" href="https://www.youtube.com/watch?v=hdMszZ2ah5Q"/><published>2026-11-14T20:14:55+00:00</published>
      <media:group><media:title>t</media:title><media:thumbnail url="https://i1.ytimg.com/vi/hdMszZ2ah5Q/hqdefault.jpg" width="480" height="360"/>
      <media:description>Incredible laptop. But don't get distracted.</media:description></media:group></entry></feed>`;
    const [video] = await parseFeed(xml);
    expect(video!.summary).toBe("Incredible laptop. But don't get distracted.");
    expect(image(video!.raw)).toBe("https://i1.ytimg.com/vi/hdMszZ2ah5Q/hqdefault.jpg");
  });

  it("gives Hacker News posts the poster's text and a card for GitHub links", () => {
    const item = parseHnItem({
      id: 1,
      type: "story",
      title: "Show HN: DeepSeek V3 in ~200 lines of pure Jax",
      url: "https://github.com/Vaibhaav-Tiwari/deepseek-v3-jax",
      text: "Hey HN readers! I&#x27;m sharing <i>this</i>.<p>Feedback welcome.",
      score: 10,
    });
    expect(item!.summary).toBe("Hey HN readers! I'm sharing this . Feedback welcome.");
    expect(image(item!.raw)).toBe("https://opengraph.githubassets.com/1/Vaibhaav-Tiwari/deepseek-v3-jax");
  });

  it("keeps Google Trends' small picture as a credited thumbnail, not a post image", async () => {
    const [trend] = await parseGoogleTrends(fixture("google-trends-tr.xml"), "TR", "tr");
    const raw = trend!.raw as { image?: string; thumbnail?: string; thumbnailSource?: string };
    expect(raw.image).toBeUndefined();
    expect(raw.thumbnail).toMatch(/^https:\/\/encrypted-tbn\d\.gstatic\.com\//);
    expect(raw.thumbnailSource).toBeTruthy();
  });
});

describe("image-first source adapters (saved real responses, Nov 2026)", () => {
  it("Mastodon trending links: preview card, publisher, today's shares", () => {
    const [first] = parseMastodonTrends(json("mastodon-trends-links.json"), "fosstodon.org");
    expect(first).toMatchObject({
      url: "https://www.cnn.com/2026/11/13/health/us-measles-elimination-status",
      author: "CNN",
      lang: "en",
      metrics: { shares: 344, posts: 352 },
    });
    expect(first!.summary).toMatch(/^Thanks to widespread vaccination/);
    expect(image(first!.raw)).toMatch(/^https:\/\/cdn\.fosstodon\.org\/cache\/preview_cards\//);
  });

  it("Dev.to: cover image, description, tags, reactions", () => {
    const items = parseDevtoArticles(json("devto-articles.json"));
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      externalId: "5032399",
      title: "Benchmarking the Gemini Decisions API",
      tags: ["gemini", "adk", "gemma", "ai"],
      metrics: { reactions: 14, comments: 4 },
    });
    expect(image(items[0]!.raw)).toMatch(/^https:\/\/media2\.dev\.to\//);
  });

  it("Hugging Face papers link to arXiv (to join our arXiv items) with the paper's thumbnail", () => {
    const [paper] = parseHfDailyPapers(json("hf-daily-papers.json"));
    expect(paper).toMatchObject({
      externalId: "2611.10439",
      url: "https://arxiv.org/abs/2611.10439",
      author: "A. Author, B. Author",
      metrics: { upvotes: 7, comments: 3 },
    });
    expect(paper!.summary).toMatch(/^Self-evolving agents/);
    expect(image(paper!.raw)).toBe(
      "https://cdn-thumbnails.huggingface.co/social-thumbnails/papers/2611.10439.png",
    );
  });

  it("GitHub new repos: description, stars and GitHub's repo card", () => {
    const [repo] = parseGithubSearch(json("github-search.json"));
    expect(repo).toMatchObject({
      title: "huamidev/GestaltX",
      url: "https://github.com/huamidev/GestaltX",
      tags: ["Swift"],
      metrics: { stars: 7554, forks: 2636 },
    });
    expect(image(repo!.raw)).toBe("https://opengraph.githubassets.com/1/huamidev/GestaltX");
  });

  it("Wikipedia most-read: lead text and only free (Commons) images, at post size", () => {
    const items = parseWikipediaMostRead(json("wikipedia-featured.json"), "en");
    const byTitle = Object.fromEntries(items.map((i) => [i.title, i]));
    expect(byTitle["Jensen Huang"]!.metrics).toEqual({ views: 727529 });
    expect(image(byTitle["Jensen Huang"]!.raw)).toMatch(/\/wikipedia\/commons\/thumb\/.*\/960px-/);
    // A film poster uploaded to English Wikipedia under fair use: no image.
    expect(image(byTitle["Ramayana: Part 1"]!.raw)).toBeUndefined();
    expect(byTitle["Ramayana: Part 1"]!.summary).toMatch(/^Ramayana: Part 1 is a 2026/);
  });

  it("Lemmy: link preview image and description, score and comments", () => {
    const items = parseLemmyPosts(json("lemmy-posts.json"), {
      host: "lemmy.world",
      name: "technology",
      tags: ["tech"],
    });
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({
      url: expect.stringMatching(/^https:\/\/laist\.com\//),
      tags: ["tech", "technology"],
      metrics: { score: 95, comments: 33 },
    });
    expect(items[1]!.summary).toMatch(/^The nationwide ground stop/);
    expect(items.every((i) => image(i.raw))).toBe(true);
    expect(items[0]!.publishedAt!.toISOString()).toBe("2026-11-14T18:26:59.142Z");
  });
});
