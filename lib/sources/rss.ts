import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { z } from "zod";
import { mapLimit } from "../util/concurrency";
import { getText } from "./http";
import type { RawItemInput, SourceAdapter } from "./types";

export const rssConfig = z.object({
  feeds: z
    .array(
      z.object({
        url: z.url(),
        /** Optional extra weight for this feed (multiplied with the source weight). */
        weight: z.number().positive().default(1),
        lang: z.string().optional(),
        /** Tags for every item of this feed only, e.g. "ai" on a publisher's AI-section feed. */
        tags: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  maxItemsPerFeed: z.number().int().positive().default(30),
  /** Feeds fetched at once. Sources with many quick feeds (Google News searches) raise it. */
  concurrency: z.number().int().positive().max(10).default(3),
  lang: z.string().optional(),
});

/*
 * Everything a feed says about an item that can be used for filtering. Feeds differ a lot:
 * RSS <category>, Atom <category term>, Wired's media:keywords, Neowin's hashtags, Hürriyet's
 * <subcategory>, Future plc's sponsored/affiliate flags, comment counts, YouTube view counts...
 * (Inventory of ~520 feeds, Oct 2026.) keepArray keeps every occurrence, not just the first.
 */
const parser = new Parser({
  customFields: {
    item: [
      // <source> is the original publisher on aggregator feeds (Google News).
      "source",
      ["category", "allCategories", { keepArray: true }],
      ["categories", "categoryGroups", { keepArray: true }],
      ["subcategory", "subcategories", { keepArray: true }],
      ["dc:subject", "dcSubjects", { keepArray: true }],
      ["media:category", "mediaCategories", { keepArray: true }],
      ["media:keywords", "mediaKeywords", { keepArray: true }],
      ["news:keywords", "newsKeywords", { keepArray: true }],
      ["itunes:keywords", "itunesKeywords", { keepArray: true }],
      ["neowin:tags", "neowinTags", { keepArray: true }],
      ["lab:kicker", "kicker"],
      ["slash:comments", "slashComments"],
      ["thr:total", "thrTotal"],
      ["cf:isSponsored", "cfSponsored"],
      ["cf:hasAffiliateLinks", "cfAffiliate"],
      ["cf:isPaid", "cfPaid"],
      ["metadata:sponsored", "metaSponsored"],
      ["arxiv:announce_type", "arxivAnnounce"],
      ["media:group", "mediaGroup"],
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
    ],
  },
});

type FeedItem = Parser.Item & {
  source?: unknown;
  allCategories?: unknown[];
  categoryGroups?: unknown[];
  subcategories?: unknown[];
  dcSubjects?: unknown[];
  mediaCategories?: unknown[];
  mediaKeywords?: unknown[];
  newsKeywords?: unknown[];
  itunesKeywords?: unknown[];
  neowinTags?: unknown[];
  kicker?: unknown;
  slashComments?: unknown;
  thrTotal?: unknown;
  cfSponsored?: unknown;
  cfAffiliate?: unknown;
  cfPaid?: unknown;
  metaSponsored?: unknown;
  arxivAnnounce?: unknown;
  mediaGroup?: Record<string, unknown>;
  mediaContent?: unknown[];
  mediaThumbnail?: unknown[];
  id?: string;
  author?: unknown;
};

/**
 * Google News titles end with " - Publisher" and links are news.google.com redirects. Strip the
 * suffix so the title clusters with the publisher's own feed, and keep the publisher as author.
 */
function splitGoogleNewsTitle(title: string, link: string | undefined, source: unknown) {
  if (!link || !/^https:\/\/news\.google\.com\//.test(link)) return { title };
  const publisher = textOf(source);
  const suffix = publisher ? ` - ${publisher}` : undefined;
  if (suffix && title.endsWith(suffix)) return { title: title.slice(0, -suffix.length).trim(), publisher };
  const m = title.match(/^(.+) - ([^-]{2,60})$/);
  return m ? { title: m[1]!.trim(), publisher: publisher ?? m[2]!.trim() } : { title, publisher };
}

export function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

/** Some feeds escape twice ("CISOs &amp;amp; Orgs"); decode what is left after XML parsing. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(quot|apos|#39|lt|gt|amp);/g, (_, e: string) =>
      e === "quot" ? '"' : e === "apos" || e === "#39" ? "'" : e === "lt" ? "<" : e === "gt" ? ">" : "&",
    );
}

function stripHtml(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const text = s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 1000) : undefined;
}

/**
 * Feeds sometimes send structured values where a string is expected, e.g. Google's blog sends
 * <author><name>…</name><title>…</title></author>. Pull out the readable text.
 */
function textOf(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (Array.isArray(v)) return textOf(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return textOf(o.name) ?? textOf(o._);
  }
  return undefined;
}

/**
 * Every label inside a tag-like element: "AI" (RSS), { _: "AI", $: { domain } } (RSS with
 * attributes), { $: { term, label } } (Atom), or nested <categories><category>… (NVIDIA).
 */
function labels(v: unknown): string[] {
  if (typeof v === "string") return [v.trim()];
  if (Array.isArray(v)) return v.flatMap(labels);
  if (!v || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  const attrs = (o.$ ?? {}) as Record<string, unknown>;
  const own = typeof o._ === "string" ? o._ : (attrs.label ?? attrs.term);
  const nested = Object.entries(o)
    .filter(([k]) => k !== "$" && k !== "_")
    .flatMap(([, val]) => labels(val));
  return [...(typeof own === "string" ? [own.trim()] : []), ...nested];
}

const isTrue = (v: unknown) => /^\s*(true|yes|1)\s*$/i.test(textOf(v) ?? "");
const toCount = (v: unknown) => {
  const n = Number(textOf(v) ?? (typeof v === "number" ? v : NaN));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const attr = (v: unknown, name: string): string | undefined => {
  const first = Array.isArray(v) ? v[0] : v;
  const a = first && typeof first === "object" ? (first as { $?: Record<string, string> }).$ : undefined;
  return a?.[name];
};

/** Registrable-ish domain: "feeds.arstechnica.com" -> "arstechnica.com", "x.hurriyet.com.tr" -> "hurriyet.com.tr". */
function baseDomain(host: string): string {
  const parts = host.toLowerCase().split(".");
  const n =
    parts.length >= 3 && parts.at(-1)!.length === 2 && /^(co|com|org|net|gov|ac|edu)$/.test(parts.at(-2)!)
      ? 3
      : 2;
  return parts.slice(-n).join(".");
}

// URL path words that are structure, not sections.
const PATH_STOP = new Set([
  "news",
  "article",
  "articles",
  "story",
  "stories",
  "blog",
  "blogs",
  "post",
  "posts",
  "index",
  "content",
  "en",
  "en-us",
  "en-gb",
  "en-in",
  "us",
  "uk",
  "tr",
  "amp",
  "item",
  "items",
  "abs",
  "html",
  "www",
  "feeds",
  "rss",
  "page",
  "pages",
  "read",
  "view",
  "watch",
  "video",
  "videos",
  "shorts",
  "galeri",
  "gallery",
  "photos",
  "foto",
  "tag",
  "tags",
  "category",
  "categories",
  "topic",
  "topics",
  "section",
  "entry",
  "link",
  "latest",
  "haber",
  "haberler",
  "products",
  "product",
  "inside",
  "newsroom",
  "media",
  "press",
  "releases",
  "archives",
  "archive",
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "sites",
  "author",
  "authors",
  "people",
  "profile",
  "user",
  "users",
  "by",
  "global",
]);
// Words followed by a person's handle (forbes.com/sites/<author>/...): skip both.
const PATH_SKIP_NEXT = new Set(["sites", "author", "authors", "people", "profile", "user", "users", "by"]);

/**
 * Section labels from the article URL ("/tech-industry/artificial-intelligence/<slug>" ->
 * ["tech industry", "artificial intelligence"]). Many publishers (WSJ, CNET, Dark Reading, Ars,
 * The Register...) put no tags in their feed but do put the section in the path. Only for links on
 * the feed's own site, never the last segment (the slug), never dates/ids.
 */
export function urlSections(link: string | undefined, feedUrl: string | undefined): string[] {
  if (!link || !feedUrl) return [];
  let u: URL;
  try {
    u = new URL(link);
    if (baseDomain(u.hostname) !== baseDomain(new URL(feedUrl).hostname)) return [];
  } catch {
    return [];
  }
  const segs = u.pathname.split("/").filter(Boolean).slice(0, -1).slice(0, 4);
  const out: string[] = [];
  for (let i = 0; i < segs.length && out.length < 2; i++) {
    let s: string;
    try {
      s = decodeURIComponent(segs[i]!).toLowerCase();
    } catch {
      continue;
    }
    if (PATH_SKIP_NEXT.has(s)) {
      i++;
      continue;
    }
    if (PATH_STOP.has(s) || !/^\p{L}[\p{L}-]{1,29}$/u.test(s) || s.split("-").length > 4) continue;
    out.push(s.replace(/-/g, " "));
  }
  return out;
}

/** First image URL of an item (media:content / media:thumbnail / enclosure / YouTube group). */
function imageOf(item: FeedItem): string | undefined {
  for (const m of item.mediaContent ?? []) {
    const a = (m as { $?: Record<string, string> }).$;
    if (
      a?.url &&
      (a.medium === "image" || a.type?.startsWith("image") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(a.url))
    )
      return a.url;
  }
  const thumb = attr(item.mediaThumbnail, "url") ?? attr(item.mediaGroup?.["media:thumbnail"], "url");
  if (thumb) return thumb;
  if (item.enclosure?.url && (item.enclosure.type ?? "").startsWith("image")) return item.enclosure.url;
  return undefined;
}

/** All tag-like labels of an item, as the feed wrote them (normalized later, in the pipeline). */
function itemTags(item: FeedItem, url: string | undefined, feedUrl: string | undefined): string[] {
  const split = (vals: unknown[] | undefined, sep: RegExp) =>
    labels(vals ?? [])
      .flatMap((s) => s.split(sep))
      .map((s) => s.replace(/^#/, "").trim());
  const tags = [
    ...labels(item.allCategories ?? []),
    ...labels(item.categoryGroups ?? []),
    ...labels(item.subcategories ?? []),
    ...labels(item.dcSubjects ?? []),
    ...labels(item.mediaCategories ?? []),
    ...split(item.mediaKeywords, /,/),
    ...split(item.newsKeywords, /,/),
    ...split(item.itunesKeywords, /,/),
    ...split(item.neowinTags, /\s+/),
  ];
  const kicker = stripHtml(textOf(item.kicker));
  if (kicker && kicker.length <= 30) tags.push(kicker);
  if (isTrue(item.cfSponsored) || isTrue(item.metaSponsored)) tags.push("sponsored");
  if (isTrue(item.cfPaid)) tags.push("paid");
  if (isTrue(item.cfAffiliate)) tags.push("affiliate links");
  if (item.mediaGroup) tags.push(url?.includes("/shorts/") ? "shorts" : "video");
  tags.push(...urlSections(url, feedUrl));
  return tags.filter(Boolean);
}

/** Engagement numbers some feeds carry: comment counts, YouTube views/likes, hnrss points. */
function itemMetrics(item: FeedItem): Record<string, number> {
  const m: Record<string, number> = {};
  const comments = toCount(item.slashComments) ?? toCount(item.thrTotal);
  if (comments !== undefined) m.comments = comments;
  const community = (item.mediaGroup?.["media:community"] as unknown[] | undefined)?.[0] as
    Record<string, unknown> | undefined;
  if (community) {
    const views = toCount(attr(community["media:statistics"], "views"));
    const likes = toCount(attr(community["media:starRating"], "count"));
    if (views !== undefined) m.views = views;
    if (likes !== undefined) m.likes = likes;
  }
  // hnrss.org puts "Points: 123" and "# Comments: 45" in the description.
  const text = item.content ?? item.contentSnippet ?? "";
  const points = text.match(/Points: (\d+)/)?.[1];
  const hnComments = text.match(/# Comments: (\d+)/)?.[1];
  if (points && hnComments) {
    m.points = Number(points);
    m.comments = Number(hnComments);
  }
  return m;
}

const XML_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);
const HTML_ENTITIES: Record<string, string> = {
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  copy: "©",
  reg: "®",
  trade: "™",
  bull: "•",
  middot: "·",
  deg: "°",
  euro: "€",
  pound: "£",
  times: "×",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  agrave: "à",
  oacute: "ó",
  iacute: "í",
  uacute: "ú",
  ntilde: "ñ",
  ccedil: "ç",
  ouml: "ö",
  uuml: "ü",
  auml: "ä",
  Ouml: "Ö",
  Uuml: "Ü",
  Ccedil: "Ç",
  szlig: "ß",
};

/**
 * Best-effort fix for feeds that are almost XML (seen on Rest of World, Intel, Hashnode, SC Media,
 * LinkedIn Engineering...): raw HTML inside text elements, bare "&", HTML-only entities like
 * &nbsp;, control characters. Only used after the strict parse failed.
 */
export function repairXml(xml: string): string {
  const wrapped = xml.replace(
    /<(description|content:encoded|summary|content)((?:\s[^>]*)?)(?<!\/)>(?!\s*<!\[CDATA\[)([\s\S]*?)<\/\1>/g,
    (m, tag: string, attrs: string, inner: string) =>
      /<[a-zA-Z!/]/.test(inner)
        ? `<${tag}${attrs}><![CDATA[${inner.replaceAll("]]>", "]]&gt;")}]]></${tag}>`
        : m,
  );
  return wrapped
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
            .replace(/&(?!#\d+;|#x[0-9a-fA-F]+;)([a-zA-Z][a-zA-Z0-9]*;)?/g, (m, ent?: string) => {
              if (!ent) return "&amp;";
              const name = ent.slice(0, -1);
              if (XML_ENTITIES.has(name)) return m;
              return HTML_ENTITIES[name] ?? `&amp;${ent}`;
            }),
    )
    .join("");
}

async function parseXml(xml: string) {
  try {
    return await parser.parseString(xml);
  } catch (err) {
    const fixed = repairXml(xml);
    if (fixed === xml) throw err;
    try {
      return await parser.parseString(fixed);
    } catch {
      throw err;
    }
  }
}

/** Parses an RSS 2.0 or Atom document into RawItemInputs. */
export async function parseFeed(
  xml: string,
  opts: { weight?: number; lang?: string; maxItems?: number; feedUrl?: string; tags?: string[] } = {},
): Promise<RawItemInput[]> {
  const feed = await parseXml(xml);
  const out: RawItemInput[] = [];
  for (const item of (feed.items as FeedItem[]).slice(0, opts.maxItems ?? 30)) {
    // arXiv re-announces revised old papers ("replace"); only new ones are news.
    if (/^replace/.test(textOf(item.arxivAnnounce) ?? "")) continue;
    const rawTitle = item.title ? decodeEntities(item.title).trim() : undefined;
    if (!rawTitle) continue;
    const url = item.link?.trim() || undefined;
    const { title, publisher } = splitGoogleNewsTitle(rawTitle, url, item.source);
    if (!title) continue;
    // An empty <guid isPermaLink="false"/> parses as an object (seen on NASA's feed).
    const idSource = textOf(item.guid) || textOf(item.id) || url || title;
    const published = item.isoDate ?? item.pubDate;
    const date = published ? new Date(published) : undefined;
    const author = textOf(item.creator) ?? textOf(item.author) ?? publisher;
    // Some feeds list the author's name as a category; that's not a topic.
    const authorKey = author?.toLowerCase();
    const tags = [...(opts.tags ?? []), ...itemTags(item, url, opts.feedUrl)].filter(
      (t) => t.toLowerCase() !== authorKey,
    );
    const metrics = itemMetrics(item);
    // `weight` is the per-feed multiplier used in scoring.
    if (opts.weight && opts.weight !== 1) metrics.weight = opts.weight;
    out.push({
      externalId: idSource.length > 200 ? sha1(idSource) : idSource,
      url,
      title,
      summary: stripHtml(item.contentSnippet ?? item.summary ?? item.content),
      author,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date : undefined,
      lang: opts.lang,
      tags,
      metrics,
      // `tags` is kept raw so `npm run db:reindex` can re-normalize it later.
      raw: { feedTitle: feed.title, guid: item.guid, link: item.link, tags, image: imageOf(item) },
    });
  }
  return out;
}

export const rssAdapter: SourceAdapter = {
  type: "rss",
  async fetch(config, { signal, logger }) {
    const cfg = rssConfig.parse(config);
    const errors: string[] = [];
    const perFeed = await mapLimit(cfg.feeds, cfg.concurrency, async (feed) => {
      try {
        const xml = await getText(feed.url, { signal });
        return await parseFeed(xml, {
          weight: feed.weight,
          lang: feed.lang ?? cfg.lang,
          maxItems: cfg.maxItemsPerFeed,
          feedUrl: feed.url,
          tags: feed.tags,
        });
      } catch (err) {
        const msg = `${feed.url}: ${err instanceof Error ? err.message : String(err)}`;
        logger.warn({ feed: feed.url, err: msg }, "feed failed");
        errors.push(msg);
        return [];
      }
    });
    // If every feed of this source failed, the source as a whole failed.
    if (errors.length === cfg.feeds.length) throw new Error(errors.join("; "));
    return perFeed.flat();
  },
};
