import { devtoAdapter } from "./devto";
import { githubReposAdapter } from "./github";
import { googleTrendsAdapter } from "./google-trends";
import { hackerNewsAdapter } from "./hackernews";
import { hfPapersAdapter } from "./huggingface";
import { lemmyAdapter } from "./lemmy";
import { mastodonTrendsAdapter } from "./mastodon";
import { redditAdapter } from "./reddit";
import { redditDevvitAdapter } from "./reddit-devvit";
import { rssAdapter } from "./rss";
import type { SourceAdapter } from "./types";
import { wikipediaMostReadAdapter } from "./wikipedia";

/** Maps sources.type -> adapter. To add a source type: write an adapter, then register it here. */
const adapters: Record<string, SourceAdapter> = Object.fromEntries(
  [
    hackerNewsAdapter,
    googleTrendsAdapter,
    rssAdapter,
    redditAdapter,
    redditDevvitAdapter,
    mastodonTrendsAdapter,
    lemmyAdapter,
    devtoAdapter,
    hfPapersAdapter,
    githubReposAdapter,
    wikipediaMostReadAdapter,
  ].map((a) => [a.type, a]),
);

export function getAdapter(type: string): SourceAdapter | undefined {
  return adapters[type];
}

export const sourceTypes = Object.keys(adapters);
