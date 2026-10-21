import type { PostPlatform } from "../db/schema";

export const POST_LANGS = { en: "English", tr: "Turkish" } as const;
export type PostLang = keyof typeof POST_LANGS;

const LOCALE: Record<PostLang, string> = { en: "en-US", tr: "tr-TR" };

/** Accent color for the highlighted headline words (neon lime, as on the reference news cards). */
export const ACCENT_COLOR = "#C6F432";
/** LinkedIn's muted corporate palette: navy, white, slate + one accent. */
const LINKEDIN_NAVY = "#1B2A41";
const LINKEDIN_ACCENT = "#0A66C2";

export type SlideTexts = { headline: string; accent: string; subhead: string };

type SlideCtx = { index: number; total: number; lang: PostLang; brand: string };

/**
 * Everything that makes a platform feel like itself, used for both the post text and the image prompt
 * pack: tone/length/hashtag/link rules, and the visual vibe (format, aspect ratio, how many images,
 * how the text sits on the image, the closing call to action).
 */
export type PlatformProfile = {
  label: string;
  /** Rules for the post text. */
  post: (lang: PostLang) => string;
  image: {
    /** What the image set is, with its article, e.g. "an Instagram carousel". */
    format: string;
    /** Shown on each slide: "Aspect Ratio: …". */
    aspectLabel: string;
    ar: "4:5" | "16:9";
    /** Allowed number of images, inclusive. */
    slides: [number, number];
    /** How the images should look and feel (told to the model). */
    vibe: string[];
    /** Headlines are set in capitals on this platform. */
    uppercase: boolean;
    /** Headline of the last image (and how many of its words to highlight); null = no fixed CTA. */
    cta: { text: Record<PostLang, string>; accentWords: number } | null;
    /** The text layer appended to each scene, ending with --ar. */
    layout: (t: SlideTexts, ctx: SlideCtx) => string;
  };
};

const TEXT_QUALITY = "crisp legible text, correct spelling, no other text, high resolution";

export const PLATFORMS: Record<PostPlatform, PlatformProfile> = {
  // First = default in the Generate dropdown.
  instagram: {
    label: "Instagram",
    post: (lang) =>
      [
        "An Instagram caption of 80-180 words.",
        "First line: a scroll-stopping hook (one emoji allowed).",
        "Then short, airy lines with line breaks, telling the story as if the reader is swiping through the images;",
        `mention the carousel ("${lang === "tr" ? "kaydır →" : "swipe →"}").`,
        "End with a call to action to save, share or follow.",
        `No clickable links: write "${lang === "tr" ? "Link bio'da" : "Link in bio"}" instead of the URL.`,
        "Finish with 5-10 relevant hashtags on the last line.",
      ].join(" "),
    image: {
      format: "an Instagram carousel",
      aspectLabel: "4:5 (Instagram portrait, 1080×1350)",
      ar: "4:5",
      slides: [3, 7],
      vibe: [
        "Bold, vivid, high-contrast, magazine / news-card look that stops the scroll.",
        "Each slide: a striking visual scene with a huge headline on it.",
        "Slide 1 is the hook with the most striking number or fact (it carries a small swipe cue);",
        "the middle slides explain the news, ONE concrete fact each; the last slide asks to follow and save.",
      ],
      uppercase: true,
      cta: { text: { en: "Save & follow for more", tr: "Kaydet ve takip et" }, accentWords: 2 },
      layout: (t, { index, total, lang, brand }) => {
        const accent = t.accent
          ? `the words "${t.accent}" in neon lime green (${ACCENT_COLOR}), white elsewhere`
          : "all in white";
        const swipe =
          index === 0 && total > 1
            ? `, small "${lang === "tr" ? "kaydır →" : "swipe →"}" swipe cue at the right edge`
            : "";
        return (
          "bottom 40% dark gradient overlay fading to black, large bold condensed sans-serif ALL CAPS headline " +
          `centered in the lower third reading "${t.headline}", ${accent}, smaller regular-weight white ` +
          `subheadline below reading "${t.subhead}", small "${brand}" watermark at bottom center${swipe}, ` +
          `clean editorial news-cover typography, ${TEXT_QUALITY} --ar 4:5`
        );
      },
    },
  },
  x: {
    label: "X / Twitter",
    post: (lang) =>
      [
        "Punchy, direct and a bit witty. Lead with the most surprising fact or number.",
        "Either one post of at most 280 characters, or, only if the story needs it, a mini-thread of 2-4 posts",
        'numbered "1/", "2/"... each under 280 characters.',
        `At most 1-2 hashtags. Put the link at the end${lang === "tr" ? " (Turkish text)" : ""}.`,
      ].join(" "),
    image: {
      format: "a set of X (Twitter) post images",
      aspectLabel: "16:9 (X landscape, 1600×900)",
      ar: "16:9",
      slides: [1, 4],
      vibe: [
        "1 to 4 standalone landscape images, not a long carousel: usually 1-2 is enough.",
        "Minimal text: ONE short bold headline (max 6 words) that is readable at timeline-thumbnail size.",
        "High contrast, very little clutter, meme-adjacent / data-callout energy: one big idea per image.",
      ],
      uppercase: true,
      cta: null,
      layout: (t, { brand }) => {
        const accent = t.accent ? `, the words "${t.accent}" in neon lime green (${ACCENT_COLOR})` : "";
        return (
          `one short bold sans-serif headline reading "${t.headline}"${accent}, white elsewhere, ` +
          "large enough to read at timeline-thumbnail size, placed on a clean high-contrast area of the image, " +
          `minimal clutter, small "${brand}" watermark in the bottom right corner, ${TEXT_QUALITY} --ar 16:9`
        );
      },
    },
  },
  linkedin: {
    label: "LinkedIn",
    post: () =>
      [
        "A LinkedIn post of 80-150 words, professional and insight-driven.",
        "A strong first line, then 2-3 short paragraphs on the business / industry impact and what it means",
        "for professionals. End with a question that invites comments, then the link and up to 3 hashtags.",
        "Minimal emoji (at most one).",
      ].join(" "),
    image: {
      format: "a LinkedIn document carousel",
      aspectLabel: "4:5 (LinkedIn document carousel, 1080×1350)",
      ar: "4:5",
      slides: [5, 10],
      vibe: [
        "Clean editorial / corporate design, less hype than Instagram.",
        `Muted palette (navy ${LINKEDIN_NAVY}, white, slate gray) plus one accent color (${LINKEDIN_ACCENT}).`,
        "Infographic style: a clear title per slide, a big data callout (number or key words), plenty of white space.",
        "Slide 1 states the news and why it matters; the middle slides each cover one fact, number or",
        "implication for the industry; the last slide asks for the reader's opinion.",
      ],
      uppercase: false,
      cta: { text: { en: "What do you think?", tr: "Siz ne düşünüyorsunuz?" }, accentWords: 0 },
      layout: (t, { index, total, brand }) => {
        const callout = t.accent
          ? `, large data callout reading "${t.accent}" in the accent color (${LINKEDIN_ACCENT})`
          : "";
        return (
          `clean corporate document-style slide, muted navy (${LINKEDIN_NAVY}), white and slate palette, ` +
          `the visual in the upper half, clear bold navy title reading "${t.headline}"${callout}, ` +
          `short regular-weight body text reading "${t.subhead}", slide number "${index + 1}/${total}" in the ` +
          `top right corner, small "${brand}" footer at bottom left, plenty of white space, ` +
          `infographic style, ${TEXT_QUALITY} --ar 4:5`
        );
      },
    },
  },
  blog: {
    label: "Blog intro",
    post: () =>
      "A blog post draft: a title line, then 3-4 short paragraphs (200-300 words) explaining the news and its impact, with the link.",
    image: {
      format: "a set of blog header / inline images",
      aspectLabel: "16:9 (blog header, 1600×900)",
      ar: "16:9",
      slides: [1, 3],
      vibe: [
        "Wide editorial hero images: the first one is the article's header, others illustrate key points.",
        "Calm, premium magazine look; text only as a short title.",
      ],
      uppercase: false,
      cta: null,
      layout: (t, { brand }) =>
        `subtle dark gradient on the left third, bold white serif title reading "${t.headline}" on the left, ` +
        `small "${brand}" credit at the bottom right, editorial magazine style, ${TEXT_QUALITY} --ar 16:9`,
    },
  },
};

export type PostSourceItem = {
  source: string;
  title: string;
  summary: string | null;
  url: string | null;
  author: string | null;
  publishedAt: Date | null;
  metrics: Record<string, number>;
};

export type PostSource = {
  title: string;
  url: string | null;
  summary: string | null;
  category: string | null;
  tags: string[];
  /** Titles of the individual articles in the topic, for extra context. */
  itemTitles: string[];
  /** Every collected item of the story: which source, its summary, engagement numbers. */
  items?: PostSourceItem[];
  publishedAt?: Date | null;
  /** Text from the story's own web page, fetched at generation time (lib/posts/article.ts). */
  article?: { description: string | null; text: string } | null;
};

export const POST_SYSTEM_PROMPT =
  "You are a sharp tech journalist writing social media posts about tech news, in the native style of each " +
  "platform. Be accurate: only use facts given to you, never invent numbers, quotes or details. " +
  'Answer with the post text only: no preamble such as "Here is the post", no quotes around it, ' +
  "no placeholders like [link]; when the platform rules allow a link, use the real one given.";

const METRIC_LABELS: Record<string, string> = {
  points: "points",
  comments: "comments",
  score: "score",
  upvotes: "upvotes",
  traffic: "searches",
};

const formatMetrics = (m: Record<string, number>) =>
  Object.entries(m)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .map(([k, v]) => `${v.toLocaleString("en-US")} ${METRIC_LABELS[k] ?? k}`)
    .join(", ");

/** Everything we know about the story, as a fact sheet the model must stick to. */
export function buildStoryContext(src: PostSource): string {
  const lines = [
    `Headline: ${src.title}`,
    src.url ? `Link: ${src.url}` : "Link: (none)",
    src.publishedAt ? `Published: ${src.publishedAt.toISOString().slice(0, 10)}` : "",
    src.category ? `Category: ${src.category}` : "",
    src.tags.length ? `Tags: ${src.tags.slice(0, 8).join(", ")}` : "",
    src.summary ? `Summary: ${src.summary}` : "",
  ];
  const items = src.items ?? [];
  if (items.length) {
    lines.push(`Seen on ${items.length} source(s):`);
    for (const i of items.slice(0, 8)) {
      const metrics = formatMetrics(i.metrics);
      lines.push(
        `- ${i.source}: "${i.title}"${metrics ? ` (${metrics})` : ""}${i.author ? `, by ${i.author}` : ""}`,
      );
      if (i.summary && i.summary !== src.summary) lines.push(`  ${i.summary.slice(0, 400)}`);
    }
  } else {
    const related = [...new Set(src.itemTitles.filter((t) => t !== src.title))].slice(0, 6);
    if (related.length) lines.push("Related headlines from other sources:", ...related.map((t) => `- ${t}`));
  }
  if (src.article?.description) lines.push(`From the page itself: ${src.article.description}`);
  if (src.article?.text) lines.push("Page text (excerpt):", src.article.text);
  return lines.filter((l) => l !== "").join("\n");
}

export function buildPostPrompt(src: PostSource, platform: PostPlatform, lang: PostLang): string {
  return [
    `Write a ${PLATFORMS[platform].label} post in ${POST_LANGS[lang]} about this news.`,
    PLATFORMS[platform].post(lang),
    "Use concrete facts from the fact sheet (what it is, what it does, numbers), not just the headline.",
    "",
    "FACT SHEET",
    buildStoryContext(src),
  ].join("\n");
}

export const IMAGE_SYSTEM_PROMPT =
  "You are an art director who designs social media visuals about tech news, in the native look of each " +
  "platform, and writes prompts for image-generation models (Midjourney, DALL-E, Flux, Imagen). Only use " +
  "facts from the fact sheet; never invent numbers, quotes or features. Answer with the slides only, no " +
  "introduction and no closing remarks.";

/**
 * Asks the model for the creative part of the platform's image set: per image a name, goal, visual
 * concept, the texts (in normal case, where small models keep Turkish letters right) and the visual
 * scene. finalizeImagePack() then builds the final prompts with the platform's text layer, aspect ratio,
 * call to action and the brand. Prompts are in English (what image models understand best); the texts
 * on the images are in the post's language.
 */
export function buildImagePromptsPrompt(src: PostSource, platform: PostPlatform, lang: PostLang): string {
  const { image } = PLATFORMS[platform];
  const [min, max] = image.slides;
  const language = POST_LANGS[lang];
  return [
    `Design ${image.format} (${min} to ${max} images; more when there is more to explain) about this news.`,
    ...image.vibe,
    image.cta ? `The last image is the call to action (its headline will be "${image.cta.text[lang]}").` : "",
    "",
    "Use exactly this format for every image:",
    "",
    "Slide 1: <a short name, e.g. The Hook>",
    "Goal: <what this image must achieve>",
    "* Concept: <one sentence describing the visual scene>",
    `* On-image text: HEADLINE: "<max ${platform === "x" ? 6 : 8} words>" | ACCENT: "<1-4 words copied from the headline: the key number or words>" | SUBHEAD: "<one short factual sentence>"`,
    "* Scene: <one detailed image-model description of the visual only: subject, composition, art style,",
    "  colors, lighting, mood, matching the look described above. No text in the scene.>",
    "",
    "Example of the text line (Turkish news):",
    '* On-image text: HEADLINE: "Ankara\'ya 4,1 milyar dolarlık dev veri merkezi yatırımı" | ACCENT: "4,1 milyar dolarlık" | SUBHEAD: "Tesis, ilk etapta 450 milyon dolar yatırımla 22 megavat enerji kapasitesine sahip olacak."',
    "",
    "Rules:",
    `- Concept and Scene are in English. HEADLINE, ACCENT and SUBHEAD are in ${language}, written in normal` +
      " sentence case" +
      (lang === "tr" ? " with correct Turkish letters (İ, ı, ş, ğ, ç, ö, ü)." : "."),
    "- ACCENT must be words copied exactly from the HEADLINE.",
    "- Keep texts short: image models misspell long text.",
    "- Use only facts and numbers from the fact sheet.",
    "",
    "FACT SHEET",
    buildStoryContext(src),
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

type ParsedSlide = { name: string; goal: string; concept: string; texts: SlideTexts | null; scene: string };

const field = (block: string, name: string) =>
  block.match(new RegExp(`^[\\s*-]*\\**${name}\\**\\s*:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";

function parseTexts(line: string): SlideTexts | null {
  const get = (k: string) => line.match(new RegExp(`${k}\\s*:\\s*"([^"]*)"`, "i"))?.[1]?.trim() ?? "";
  const headline = get("HEADLINE");
  return headline ? { headline, accent: get("ACCENT"), subhead: get("SUBHEAD") } : null;
}

function parseSlides(raw: string): ParsedSlide[] {
  const parts = raw.split(/^\s*\**\s*(?=Slide \d+\s*:)/gim).filter((p) => /^Slide \d+\s*:/i.test(p));
  return parts.map((block) => {
    const name =
      block
        .match(/^Slide \d+\s*:\s*(.+)$/im)?.[1]
        ?.replace(/\*+/g, "")
        .trim() ?? "";
    // Looser answers may put the scene under "Prompt:".
    const scene = (field(block, "Scene") || field(block, "Prompt")).replace(/--ar\s*\S+/g, "").trim();
    return {
      name,
      goal: field(block, "Goal"),
      concept: field(block, "Concept"),
      texts: parseTexts(field(block, "On-image text")),
      scene: scene.replace(/[,.\s]+$/, ""),
    };
  });
}

/** `accent` as it appears in the headline (case-insensitive), else the headline's first number group, else "". */
function matchAccent(headline: string, accent: string, locale: string): string {
  const a = accent.trim();
  if (a) {
    const at = headline.toLocaleUpperCase(locale).indexOf(a.toLocaleUpperCase(locale));
    if (at >= 0) return headline.slice(at, at + a.length);
  }
  return headline.match(/\d[\d.,]*(\s+\p{L}+)?/u)?.[0] ?? "";
}

/**
 * Turns the model's answer into the final pack for the platform: at most the platform's number of
 * images (the last one kept), per image the name, goal, concept, aspect ratio, the texts (headline in
 * capitals where the platform uses them, with the language's rules, e.g. Turkish i → İ) and one complete
 * prompt (scene + the platform's text layer + brand + --ar). A fixed call to action replaces the last
 * headline where the platform has one. Returns the raw answer unchanged when it can't be parsed.
 */
export function finalizeImagePack(
  raw: string,
  platform: PostPlatform,
  lang: PostLang,
  brand: string,
): string {
  const { image } = PLATFORMS[platform];
  let slides = parseSlides(raw);
  if (!slides.length || slides.some((s) => !s.scene || !s.texts)) return raw;
  const max = image.slides[1];
  if (slides.length > max) slides = [...slides.slice(0, max - 1), slides[slides.length - 1]!];
  const locale = LOCALE[lang];
  const caps = (s: string) => (image.uppercase ? s.toLocaleUpperCase(locale) : s);
  return slides
    .map((s, i) => {
      const ctaSlide = image.cta && i === slides.length - 1 && slides.length > 1;
      const headline = caps(ctaSlide ? image.cta!.text[lang] : s.texts!.headline);
      const accent = ctaSlide
        ? image.cta!.accentWords
          ? headline.split(" ").slice(-image.cta!.accentWords).join(" ")
          : ""
        : matchAccent(headline, s.texts!.accent, locale);
      const texts = { headline, accent, subhead: s.texts!.subhead };
      const ctx = { index: i, total: slides.length, lang, brand };
      return [
        `Slide ${i + 1}: ${s.name || (ctaSlide ? "Call to Action" : `Image ${i + 1}`)}`,
        s.goal ? `Goal: ${s.goal}` : "",
        s.concept ? `* Concept: ${s.concept}` : "",
        `* Aspect Ratio: ${image.aspectLabel}`,
        `* On-image text: HEADLINE: "${headline}" | ACCENT: "${accent}" | SUBHEAD: "${texts.subhead}"`,
        `* Prompt: ${s.scene}, ${image.layout(texts, ctx)}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/** Number of slides in a generated pack (0 when the format wasn't followed). */
export const countSlides = (pack: string) => (pack.match(/^\s*\**\s*Slide \d+\s*:/gim) ?? []).length;

/**
 * Just the texts to put on each slide ("Slide N" + HEADLINE / ACCENT / SUBHEAD), for adding them by hand
 * in Canva or similar when an image model misspells the lettering. Empty when the pack has none.
 */
export function onImageTexts(pack: string): string {
  const blocks: string[] = [];
  let slide = "";
  for (const line of pack.split("\n")) {
    const heading = line.match(/^\s*\**\s*(Slide \d+)\s*:/i);
    if (heading) slide = heading[1]!;
    const text = line.match(/On-image text:\s*(.+)$/i)?.[1];
    if (!text) continue;
    const parts = [...text.matchAll(/(HEADLINE|ACCENT|SUBHEAD):\s*"([^"]*)"/gi)].map(
      (m) => `${m[1]!.toUpperCase()}: ${m[2]}`,
    );
    if (parts.length) blocks.push([slide || `Slide ${blocks.length + 1}`, ...parts].join("\n"));
  }
  return blocks.join("\n\n");
}
