/**
 * Default sources. EDIT THIS FILE to change what the pool watches, then run:
 *   npm run db:seed     -> adds sources that don't exist yet (by `key`)
 *   npm run db:reseed   -> also overwrites name/type/config/weight of existing ones
 *                          (the enabled/disabled toggle from the dashboard is kept)
 *
 * Each RSS publisher is its own source on purpose: "seen on N sources" is a strong
 * ranking signal, and it only works if different publishers count as different sources.
 */
export type SourceSeed = {
  key: string;
  name: string;
  type: string;
  enabled?: boolean;
  weight?: number;
  config: Record<string, unknown>;
};

// `tags` are added to every item of the source: they show up as filters in the dashboard and help
// the categorizer (e.g. "ai" on OpenAI News). Use lowercase; "turkey" marks Turkish/regional sources.
const rss = (
  key: string,
  name: string,
  url: string,
  lang: "en" | "tr",
  tags: string[],
  weight = 1,
): SourceSeed => ({
  key: `rss-${key}`,
  name,
  type: "rss",
  weight,
  config: { feeds: [{ url, lang }], maxItemsPerFeed: 30, tags },
});

export const sourceSeeds: SourceSeed[] = [
  {
    key: "hn-top",
    name: "Hacker News (top)",
    type: "hackernews",
    weight: 1,
    config: { list: "top", maxItems: 60, tags: ["tech"] },
  },
  {
    key: "google-trends",
    name: "Google Trends (TR, US)",
    type: "google_trends",
    weight: 1,
    config: { geos: ["TR", "US"], langs: { TR: "tr", US: "en" } },
  },

  // AI & tech (global)
  rss("techcrunch", "TechCrunch", "https://techcrunch.com/feed/", "en", ["tech", "startups"]),
  rss("theverge", "The Verge", "https://www.theverge.com/rss/index.xml", "en", ["tech"]),
  rss("arstechnica", "Ars Technica", "https://feeds.arstechnica.com/arstechnica/index", "en", ["tech"]),
  rss("openai", "OpenAI News", "https://openai.com/news/rss.xml", "en", ["ai"], 1.2),

  // Turkish tech, startups and general news
  rss("webrazzi", "Webrazzi", "https://webrazzi.com/feed/", "tr", ["tech", "turkey"]),
  rss("egirisim", "Egirişim", "https://egirisim.com/feed/", "tr", ["startups", "turkey"]),
  rss("shiftdelete", "ShiftDelete.Net", "https://shiftdelete.net/feed", "tr", ["tech", "turkey"]),
  rss("donanimhaber", "DonanımHaber", "https://www.donanimhaber.com/rss/tum/", "tr", ["tech", "turkey"]),
  rss("ntv-teknoloji", "NTV Teknoloji", "https://www.ntv.com.tr/teknoloji.rss", "tr", ["tech", "turkey"]),
  rss("bbc-turkce", "BBC Türkçe", "https://feeds.bbci.co.uk/turkce/rss.xml", "tr", ["turkey"]),

  // Optional: needs approved Reddit API credentials (see README). Disabled by default.
  {
    key: "reddit-tech",
    name: "Reddit (tech subs)",
    type: "reddit",
    enabled: false,
    weight: 1,
    config: {
      subreddits: ["technology", "artificial", "LocalLLaMA"],
      sort: "hot",
      limit: 25,
      tags: ["tech"],
    },
  },
];
