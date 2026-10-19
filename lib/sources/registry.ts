import { googleTrendsAdapter } from "./google-trends";
import { hackerNewsAdapter } from "./hackernews";
import { redditAdapter } from "./reddit";
import { rssAdapter } from "./rss";
import type { SourceAdapter } from "./types";

/** Maps sources.type -> adapter. To add a source type: write an adapter, then register it here. */
const adapters: Record<string, SourceAdapter> = Object.fromEntries(
  [hackerNewsAdapter, googleTrendsAdapter, rssAdapter, redditAdapter].map((a) => [a.type, a]),
);

export function getAdapter(type: string): SourceAdapter | undefined {
  return adapters[type];
}

export const sourceTypes = Object.keys(adapters);
