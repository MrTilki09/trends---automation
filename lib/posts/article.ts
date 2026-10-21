import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "../auth/local";

/*
 * Fetches the story's own page at generation time so posts and image prompts can use real facts
 * (Hacker News items, for example, carry only a title and points). Best effort: any failure just means
 * the model gets less context.
 *
 * The URLs come from third-party feeds, so the server must not be tricked into calling internal
 * services: only http(s), only hosts that resolve to public addresses (checked again on every redirect),
 * a short timeout and a size cap.
 */

export type Article = { description: string | null; text: string };

const MAX_BYTES = 1_500_000;
const MAX_TEXT = 3000;
const MAX_REDIRECTS = 3;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const clean = (s: string) =>
  decode(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`,
      "i",
    );
    const m = html.match(re);
    const value = m?.[1] ?? m?.[2];
    if (value) return clean(value);
  }
  return null;
}

/** Description + readable paragraphs from an HTML page (no DOM library: tags are stripped). */
export function extractArticle(html: string): Article {
  const description = meta(html, ["og:description", "description", "twitter:description"]);
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  // Prefer the <article>/<main> part when there is one.
  const main =
    body.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? body;
  const paragraphs = [...main.matchAll(/<(p|li|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => clean(m[2] ?? ""))
    .filter((p) => p.length >= 40);
  let text = "";
  for (const p of [...new Set(paragraphs)]) {
    if (text.length + p.length > MAX_TEXT) break;
    text += (text ? "\n" : "") + p;
  }
  return { description, text };
}

async function assertPublicHost(url: URL, resolve: typeof lookup): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("not http(s)");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("local host");
  }
  const addrs = await resolve(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address) || a.address.startsWith("0."))) {
    throw new Error("private address");
  }
}

export async function fetchArticle(
  rawUrl: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch; resolve?: typeof lookup } = {},
): Promise<Article | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const resolve = opts.resolve ?? lookup;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  try {
    let url = new URL(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url, resolve);
      const res = await doFetch(url, {
        redirect: "manual",
        signal,
        headers: { "User-Agent": "TrendPool/1.0 (+post generation)", Accept: "text/html" },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
      const reader = res.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      void reader.cancel().catch(() => {});
      const article = extractArticle(Buffer.concat(chunks).toString("utf8"));
      return article.description || article.text ? article : null;
    }
    return null;
  } catch {
    return null;
  }
}
