/** Small text helpers shared by the source adapters (feeds and APIs send HTML and entities). */

/** Some feeds escape twice ("CISOs &amp;amp; Orgs"); decode what is left after XML/JSON parsing. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&(quot|apos|#39|lt|gt|amp);/g, (_, e: string) =>
      e === "quot" ? '"' : e === "apos" || e === "#39" ? "'" : e === "lt" ? "<" : e === "gt" ? ">" : "&",
    );
}

/** Tags removed, whitespace collapsed, at most 1000 chars; undefined when nothing is left. */
export function stripHtml(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const text = s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 1000) : undefined;
}

/** HTML from an API (Hacker News `text`, Lemmy bodies) as plain text. */
export function htmlToText(s: string | undefined | null): string | undefined {
  if (!s) return undefined;
  return stripHtml(decodeEntities(s.replace(/<\/?(p|br|li)\b[^>]*>/gi, " ")));
}
