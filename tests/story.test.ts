import { describe, expect, it } from "vitest";
import { extractArticle, fetchArticle } from "../lib/posts/article";
import {
  buildImagePromptsPrompt,
  buildPostPrompt,
  buildStoryContext,
  countSlides,
  PLATFORMS,
  finalizeImagePack,
  onImageTexts,
  type PostSource,
} from "../lib/posts/prompt";

const story: PostSource = {
  title: "Show HN: SimCity, but with Permits",
  url: "https://permit.petercai.com",
  summary: null,
  category: "Software",
  tags: ["show hn"],
  itemTitles: [],
  publishedAt: new Date("2026-10-20T10:00:00Z"),
  items: [
    {
      source: "Hacker News (top)",
      title: "Show HN: SimCity, but with Permits",
      summary: null,
      url: "https://permit.petercai.com",
      author: "pcai",
      publishedAt: null,
      metrics: { points: 824, comments: 384 },
    },
  ],
  article: {
    description: "A city builder where every building needs a permit.",
    text: "You wait in queues for zoning approval.",
  },
};

describe("story fact sheet", () => {
  it("carries real details, not just the headline", () => {
    const ctx = buildStoryContext(story);
    expect(ctx).toContain("Hacker News (top)");
    expect(ctx).toContain("824 points, 384 comments");
    expect(ctx).toContain("by pcai");
    expect(ctx).toContain("A city builder where every building needs a permit.");
    expect(ctx).toContain("You wait in queues for zoning approval.");
    expect(ctx).toContain("Published: 2026-10-20");
    expect(buildPostPrompt(story, "x", "en")).toContain("FACT SHEET");
  });

  it("asks for the platform's image set, texts in the post language", () => {
    const p = buildImagePromptsPrompt(story, "instagram", "tr");
    expect(p).toContain("Design an Instagram carousel (3 to 7 images");
    expect(p).toContain('* On-image text: HEADLINE: "');
    expect(p).toContain("* Scene:");
    expect(p).toContain("are in Turkish, written in normal sentence case with correct Turkish letters");
    expect(p).toContain('(its headline will be "Kaydet ve takip et")');
    expect(p).toContain("824 points");
  });

  // Shaped like a real answer from the fast model: lowercase/sloppy texts, an accent that isn't in the
  // headline, a last slide with its own headline, a stray "--ar" in the scene.
  const slide = (n: number, headline: string, accent: string, scene: string) =>
    [
      `Slide ${n}: Part ${n}`,
      "Goal: Explain one fact",
      "* Concept: A scene",
      `* On-image text: HEADLINE: "${headline}" | ACCENT: "${accent}" | SUBHEAD: "NVIDIA DSX POD sahada hızlı kuruluyor."`,
      `* Scene: ${scene}`,
    ].join("\n");
  const raw = [
    slide(
      1,
      "Kurulum 14 güne iniyor",
      "14 güne",
      "A massive modular AI rack in a factory, cool blue tones --ar 4:5",
    ),
    "**" +
      slide(2, "Fabrikada birleştirilen altyapı", "modüler yapı", "Cross-section of a container.").slice(0),
    slide(3, "Teknoloji güncellemesi", "güncelleme", "A smartphone surrounded by glowing circuit lines"),
  ].join("\n\n");
  const many = Array.from({ length: 12 }, (_, i) =>
    slide(i + 1, `Fact number ${i + 1}`, `${i + 1}`, `Scene ${i + 1}`),
  ).join("\n\n");
  const promptOf = (pack: string, scene: string) =>
    pack.split("\n").find((l) => l.startsWith(`* Prompt: ${scene}`))!;

  describe("Instagram (default)", () => {
    it("is the first platform in the dropdown", () => {
      expect(Object.keys(PLATFORMS)[0]).toBe("instagram");
    });

    it("post: hook, airy lines, swipe, save/share CTA, 5-10 hashtags, link in bio", () => {
      const p = buildPostPrompt(story, "instagram", "tr");
      expect(p).toContain("80-180 words");
      expect(p).toContain("scroll-stopping hook");
      expect(p).toContain("kaydır →");
      expect(p).toContain("save, share or follow");
      expect(p).toContain("5-10 relevant hashtags");
      expect(p).toContain("Link bio'da");
    });

    it("images: 4:5 news cards, swipe cue on slide 1, save & follow CTA last", () => {
      const pack = finalizeImagePack(raw, "instagram", "tr", "@kombobit");
      expect(countSlides(pack)).toBe(3);
      expect(pack).toContain("* Aspect Ratio: 4:5 (Instagram portrait, 1080×1350)");
      // Headlines uppercased with Turkish rules (i → İ), the accent taken from the headline.
      expect(pack).toContain('HEADLINE: "KURULUM 14 GÜNE İNİYOR" | ACCENT: "14 GÜNE"');
      // An accent that isn't in the headline is dropped (no number to fall back to).
      expect(pack).toContain('HEADLINE: "FABRİKADA BİRLEŞTİRİLEN ALTYAPI" | ACCENT: ""');
      expect(pack).toContain('HEADLINE: "KAYDET VE TAKİP ET" | ACCENT: "TAKİP ET"');
      const first = promptOf(pack, "A massive");
      expect(first).toContain("cool blue tones, bottom 40% dark gradient overlay");
      expect(first).toContain('the words "14 GÜNE" in neon lime green (#C6F432)');
      expect(first).toContain('subheadline below reading "NVIDIA DSX POD sahada hızlı kuruluyor."');
      expect(first).toContain('small "@kombobit" watermark at bottom center');
      expect(first).toContain('"kaydır →" swipe cue');
      expect(promptOf(pack, "Cross-section")).not.toContain("swipe cue");
      expect(first.match(/--ar/g)).toHaveLength(1);
      expect(first.endsWith("--ar 4:5")).toBe(true);
      expect(countSlides(finalizeImagePack(many, "instagram", "en", "b"))).toBe(7);
    });
  });

  describe("X / Twitter", () => {
    it("post: punchy, ≤280 chars or a short thread, 1-2 hashtags, link at the end", () => {
      const p = buildPostPrompt(story, "x", "en");
      expect(p).toContain("Punchy, direct and a bit witty");
      expect(p).toContain("at most 280 characters");
      expect(p).toContain("mini-thread of 2-4 posts");
      expect(p).toContain("At most 1-2 hashtags");
      expect(p).toContain("link at the end");
    });

    it("images: 1-4 landscape 16:9, one short bold headline, no forced CTA", () => {
      expect(buildImagePromptsPrompt(story, "x", "en")).toContain("(1 to 4 images");
      expect(buildImagePromptsPrompt(story, "x", "en")).toContain("readable at timeline-thumbnail size");
      const pack = finalizeImagePack(raw, "x", "en", "@kombobit");
      expect(pack).toContain("* Aspect Ratio: 16:9 (X landscape, 1600×900)");
      const first = promptOf(pack, "A massive");
      expect(first).toContain('one short bold sans-serif headline reading "KURULUM 14 GÜNE INIYOR"');
      expect(first).not.toContain("subheadline");
      expect(first.endsWith("--ar 16:9")).toBe(true);
      expect(pack).toContain('HEADLINE: "TEKNOLOJI GÜNCELLEMESI"');
      expect(countSlides(finalizeImagePack(many, "x", "en", "b"))).toBe(4);
    });
  });

  describe("LinkedIn", () => {
    it("post: professional, industry impact, question, ≤3 hashtags, minimal emoji", () => {
      const p = buildPostPrompt(story, "linkedin", "en");
      expect(p).toContain("professional and insight-driven");
      expect(p).toContain("business / industry impact");
      expect(p).toContain("question that invites comments");
      expect(p).toContain("up to 3 hashtags");
      expect(p).toContain("Minimal emoji");
    });

    it("images: 5-10 document slides, 4:5, navy palette, title + data callout + slide numbers", () => {
      const prompt = buildImagePromptsPrompt(story, "linkedin", "tr");
      expect(prompt).toContain("(5 to 10 images");
      expect(prompt).toContain("less hype than Instagram");
      const pack = finalizeImagePack(raw, "linkedin", "tr", "@kombobit");
      expect(pack).toContain("* Aspect Ratio: 4:5 (LinkedIn document carousel, 1080×1350)");
      const first = promptOf(pack, "A massive");
      // Titles keep normal case on LinkedIn.
      expect(first).toContain('clear bold navy title reading "Kurulum 14 güne iniyor"');
      expect(first).toContain('large data callout reading "14 güne" in the accent color (#0A66C2)');
      expect(first).toContain('slide number "1/3" in the top right corner');
      expect(first.endsWith("--ar 4:5")).toBe(true);
      expect(pack).toContain('HEADLINE: "Siz ne düşünüyorsunuz?" | ACCENT: ""');
      expect(countSlides(finalizeImagePack(many, "linkedin", "en", "b"))).toBe(10);
    });
  });

  it("keeps an answer it can't parse as it is", () => {
    expect(finalizeImagePack("Sorry, I can't help with that.", "x", "en", "x")).toBe(
      "Sorry, I can't help with that.",
    );
  });

  it("pulls out just the on-image texts (for adding text by hand)", () => {
    const pack = [
      "Slide 1: The Hook",
      "Goal: x",
      '* On-image text: HEADLINE: "824 PUAN ALDI" | ACCENT: "824 PUAN" | SUBHEAD: "Hacker News\'te ilk sırada."',
      "* Prompt: …",
      "Slide 2: Call to Action",
      '* On-image text: HEADLINE: "DETAYLAR İÇİN TAKİP ET" | ACCENT: "TAKİP ET" | SUBHEAD: "Linki profilde."',
    ].join("\n");
    expect(onImageTexts(pack)).toBe(
      "Slide 1\nHEADLINE: 824 PUAN ALDI\nACCENT: 824 PUAN\nSUBHEAD: Hacker News'te ilk sırada.\n\n" +
        "Slide 2\nHEADLINE: DETAYLAR İÇİN TAKİP ET\nACCENT: TAKİP ET\nSUBHEAD: Linki profilde.",
    );
    expect(onImageTexts("Slide 1: no text lines")).toBe("");
  });

  it("counts slides in a generated pack", () => {
    const pack =
      "Slide 1: The Hook\nGoal: x\n\n**Slide 2: The Core Idea**\nGoal: y\nSlide 3: Call to Action\n";
    expect(countSlides(pack)).toBe(3);
    expect(countSlides("Sorry, I can't")).toBe(0);
  });
});

describe("article page extraction", () => {
  it("takes the description and the readable paragraphs, skipping scripts and navigation", () => {
    const html = `<html><head><meta property="og:description" content="Linkit &amp; friends: an AI bookmark manager">
      <script>var x = "<p>not this</p>";</script></head><body><nav><p>Menu item that is long enough to count here</p></nav>
      <article><h2>What it does</h2><p>Linkit saves your links and tags them automatically with a local AI model.</p>
      <p>short</p><li>Runs fully offline and stores everything in a single SQLite file on disk.</li></article></body></html>`;
    const a = extractArticle(html);
    expect(a.description).toBe("Linkit & friends: an AI bookmark manager");
    expect(a.text).toContain("tags them automatically");
    expect(a.text).toContain("single SQLite file");
    expect(a.text).not.toContain("not this");
    expect(a.text).not.toContain("Menu item");
    expect(a.text).not.toContain("short");
  });

  it("refuses to fetch private or local addresses (feed URLs are untrusted)", async () => {
    let fetched = false;
    const fetchImpl = (async () => {
      fetched = true;
      return new Response("<p>secret</p>");
    }) as unknown as typeof fetch;
    const resolvePrivate = (async () => [{ address: "172.18.0.2", family: 4 }]) as never;
    expect(await fetchArticle("http://db:5432/", { fetchImpl, resolve: resolvePrivate })).toBeNull();
    expect(await fetchArticle("http://localhost:3000/", { fetchImpl })).toBeNull();
    expect(await fetchArticle("file:///etc/passwd", { fetchImpl })).toBeNull();
    expect(fetched).toBe(false);
  });

  it("follows redirects only to public hosts", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: URL) => {
      calls.push(url.hostname);
      return new Response(null, { status: 302, headers: { location: "http://internal.example/" } });
    }) as unknown as typeof fetch;
    const resolve = (async (host: string) => [
      { address: host === "internal.example" ? "10.0.0.5" : "93.184.216.34", family: 4 },
    ]) as never;
    expect(await fetchArticle("https://news.example/", { fetchImpl, resolve })).toBeNull();
    expect(calls).toEqual(["news.example"]);
  });

  it("returns the extracted article for a public HTML page", async () => {
    const fetchImpl = (async () =>
      new Response('<meta name="description" content="Big news today">', {
        headers: { "content-type": "text/html; charset=utf-8" },
      })) as unknown as typeof fetch;
    const resolve = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;
    expect(await fetchArticle("https://news.example/a", { fetchImpl, resolve })).toEqual({
      description: "Big news today",
      text: "",
    });
  });
});
