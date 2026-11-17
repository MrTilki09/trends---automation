import { decodeEntities } from "./text";

/*
 * Post images. Every image here is one the publisher or platform itself published for the item:
 * a feed's media/enclosure/inline image, an API's cover image, or the link-preview card that
 * GitHub and YouTube generate for every repo/video. Nothing is scraped from article pages.
 */

// Tracking pixels, avatars, emoji, icons, logos and share buttons are not post images. Words only
// count as a whole part of the path ("twitter_icon.png" yes, "siliconangle.com" or "pixel-10.jpg" no).
const JUNK = [
  /\b(pixel|spacer|blank|1x1|transparent)\.(gif|png)\b/i,
  /feedburner\.com\/~|\/~r\/|feedblitz|stats\.wp\.com|doubleclick|\/b\.gif/i,
  /gravatar\.com|\/avatars?\//i,
  /\/emoji\/|s\.w\.org\/images\/core|\/wp-includes\//i,
  /(^|[/_-])(icon|icons|logo|badge|button|share|sprite)([/_.-]|$)/i,
  /\.svg(\?|$)/i,
];
/**
 * Whether we may keep and republish images from a source. Publisher photos are often agency photos
 * (AP, Reuters, Getty) licensed to that publisher only, so by default only a company's own newsroom
 * (tag "official", published for the press) and GitHub's generated repo cards qualify.
 * `config.imagesAllowed` (true/false) overrides it per source, e.g. after getting permission.
 * Keep in sync with `imageAllowedSql` in lib/data/feed.ts.
 */
export function sourceImagesAllowed(source: { type: string; config?: unknown }): boolean {
  const cfg = (source.config ?? {}) as { imagesAllowed?: unknown; tags?: unknown };
  if (typeof cfg.imagesAllowed === "boolean") return cfg.imagesAllowed;
  const tags = Array.isArray(cfg.tags) ? cfg.tags : [];
  return tags.includes("official") || source.type === "github_repos";
}

/** `raw` without its stored image URL (for sources whose images we don't keep). */
export function withoutRawImage(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("image" in raw)) return raw;
  const rest: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  delete rest.image;
  return rest;
}

// Smaller than this (when the size is stated) = a thumbnail or decoration, not a post image.
const MIN_SIDE = 200;

/** Decodes entities, resolves relative URLs against `base`, keeps http(s) only, drops junk images. */
export function cleanImageUrl(url: string | undefined | null, base?: string): string | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(decodeEntities(url.trim()), base);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
  const s = u.toString();
  return s.length <= 2000 && !JUNK.some((re) => re.test(s)) ? s : undefined;
}

/** Widest candidate of a srcset ("a.jpg 300w, b.jpg 1200w" -> "b.jpg"). */
function widestFromSrcset(srcset: string): string | undefined {
  let best: { url: string; w: number } | undefined;
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    const w = Number.parseInt(size ?? "", 10) || 0;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url;
}

/**
 * The first real image inside an item's HTML (WordPress feeds put the featured image in
 * <content:encoded> or <description> instead of a media element). Skips icons and small images.
 */
export function firstHtmlImage(html: string | undefined, base?: string): string | undefined {
  if (!html) return undefined;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];
    const w = Number.parseInt(attr("width") ?? "", 10);
    const h = Number.parseInt(attr("height") ?? "", 10);
    if ((w && w < MIN_SIDE) || (h && h < MIN_SIDE / 2)) continue;
    const srcset = attr("srcset") ?? attr("data-srcset");
    const src = (srcset && widestFromSrcset(decodeEntities(srcset))) || attr("src") || attr("data-src");
    const url = cleanImageUrl(src, base);
    if (url) return url;
  }
  return undefined;
}

/** From several { url, width } candidates, the widest (the first when no widths are given). */
export function widest(
  candidates: { url?: string; width?: number | string }[],
  base?: string,
): string | undefined {
  let best: { url: string; w: number } | undefined;
  for (const c of candidates) {
    const url = cleanImageUrl(c.url, base);
    const w = Number(c.width) || 0;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url;
}

// github.com/<these>/… are site pages, not repositories.
const GITHUB_RESERVED = new Set([
  "about",
  "features",
  "pricing",
  "topics",
  "trending",
  "collections",
  "sponsors",
  "orgs",
  "marketplace",
  "settings",
  "login",
  "join",
  "explore",
  "enterprise",
  "security",
  "site",
  "apps",
  "readme",
  "events",
  "customer-stories",
  "resources",
  "solutions",
  "team",
  "notifications",
  "new",
  "search",
]);

/**
 * The preview card GitHub or YouTube publish for a link: GitHub's 1200×600 repository card, or a
 * YouTube video thumbnail. Lets Hacker News, Lobsters or Lemmy posts linking there carry an image.
 */
export function linkCardImage(link: string | undefined | null): string | undefined {
  if (!link) return undefined;
  let u: URL;
  try {
    u = new URL(link);
  } catch {
    return undefined;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean);
  if (host === "github.com" && segs.length >= 2) {
    const [owner, repo] = segs as [string, string];
    if (!GITHUB_RESERVED.has(owner.toLowerCase()) && /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(repo)) {
      return `https://opengraph.githubassets.com/1/${owner}/${repo.replace(/\.git$/, "")}`;
    }
  }
  const yt =
    host === "youtu.be"
      ? segs[0]
      : host === "youtube.com" || host === "m.youtube.com"
        ? (u.searchParams.get("v") ?? (segs[0] === "shorts" || segs[0] === "live" ? segs[1] : undefined))
        : undefined;
  if (yt && /^[\w-]{11}$/.test(yt)) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
  return undefined;
}
