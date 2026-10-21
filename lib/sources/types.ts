import type { Logger } from "../logger";

/** One item exactly as a source returned it (before normalization/clustering). */
export interface RawItemInput {
  externalId: string; // stable id from the source (or a hash of the URL)
  url?: string;
  title: string;
  summary?: string;
  author?: string;
  publishedAt?: Date;
  /** Language hint for normalization ('tr' enables Turkish-aware lowercasing). */
  lang?: string;
  /** The source's own labels for the item (feed <category> tags, "show hn", subreddit...). */
  tags?: string[];
  metrics: Record<string, number>; // e.g. { points, comments } or { approxTraffic }
  raw: unknown; // original payload, kept for debugging
}

export interface SourceContext {
  signal: AbortSignal;
  logger: Logger;
}

/**
 * Every source type implements this. Adapters only fetch + parse: they never touch the DB,
 * which keeps them easy to test with saved fixtures.
 */
export interface SourceAdapter {
  type: string; // 'hackernews' | 'google_trends' | 'rss' | 'reddit' ...
  /** Name of the metric used for engagement scoring (undefined = source has no engagement metric). */
  primaryMetric?: string;
  fetch(config: unknown, ctx: SourceContext): Promise<RawItemInput[]>;
}
