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
// the categorizer (e.g. "ai" on OpenAI News). Use lowercase. Conventions:
//   "tech" / "ai"    -> counts as tech for the Pool's "Tech only" view
//   "official"       -> a company's own newsroom/blog (first-hand announcements)
//   company names    -> "google", "apple", ... so you can filter by company
//   "turkey"         -> Turkish/regional sources
// One source may have several feed URLs (same publisher) so they count as ONE source in
// the "seen on N sources" bonus.
const rss = (
  key: string,
  name: string,
  url: string | string[],
  lang: "en" | "tr",
  tags: string[],
  weight = 1,
): SourceSeed => ({
  key: `rss-${key}`,
  name,
  type: "rss",
  weight,
  config: {
    feeds: (Array.isArray(url) ? url : [url]).map((u) => ({ url: u, lang })),
    maxItemsPerFeed: 30,
    tags,
  },
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
    key: "hn-show",
    name: "Hacker News (Show HN)",
    type: "hackernews",
    weight: 0.8,
    config: { list: "show", maxItems: 30, tags: ["tech", "launch"] },
  },
  {
    key: "google-trends",
    name: "Google Trends (TR, US)",
    type: "google_trends",
    weight: 1,
    config: { geos: ["TR", "US"], langs: { TR: "tr", US: "en" } },
  },

  // Official company newsrooms & blogs: first-hand launches and announcements
  rss("openai", "OpenAI News", "https://openai.com/news/rss.xml", "en", ["ai", "official", "openai"], 1.2),
  rss("google", "Google Blog", "https://blog.google/rss/", "en", ["tech", "official", "google"], 1.2),
  rss(
    "deepmind",
    "Google DeepMind",
    "https://deepmind.google/blog/rss.xml",
    "en",
    ["ai", "official", "google"],
    1.2,
  ),
  rss(
    "microsoft",
    "Microsoft",
    "https://blogs.microsoft.com/feed/",
    "en",
    ["tech", "official", "microsoft"],
    1.2,
  ),
  rss("meta", "Meta Newsroom", "https://about.fb.com/feed/", "en", ["tech", "official", "meta"], 1.2),
  rss(
    "apple",
    "Apple Newsroom",
    "https://www.apple.com/newsroom/rss-feed.rss",
    "en",
    ["tech", "official", "apple"],
    1.2,
  ),
  rss(
    "nvidia",
    "NVIDIA",
    ["https://nvidianews.nvidia.com/releases.xml", "https://blogs.nvidia.com/feed/"],
    "en",
    ["tech", "official", "nvidia"],
    1.2,
  ),
  rss("aws", "AWS News", "https://aws.amazon.com/blogs/aws/feed/", "en", ["tech", "official", "amazon"]),
  rss("github", "GitHub Blog", "https://github.blog/feed/", "en", ["tech", "official", "github"]),
  rss("huggingface", "Hugging Face", "https://huggingface.co/blog/feed.xml", "en", [
    "ai",
    "official",
    "hugging face",
  ]),
  rss("mistral", "Mistral AI", "https://mistral.ai/rss.xml", "en", ["ai", "official", "mistral"], 1.2),
  rss("samsung", "Samsung Newsroom", "https://news.samsung.com/global/feed", "en", [
    "tech",
    "official",
    "samsung",
  ]),

  // Tech news (global)
  rss("techmeme", "Techmeme", "https://www.techmeme.com/feed.xml", "en", ["tech"], 1.3),
  rss("techcrunch", "TechCrunch", "https://techcrunch.com/feed/", "en", ["tech", "startups"]),
  rss("theverge", "The Verge", "https://www.theverge.com/rss/index.xml", "en", ["tech"]),
  rss("arstechnica", "Ars Technica", "https://feeds.arstechnica.com/arstechnica/index", "en", ["tech"]),
  rss("wired", "Wired", "https://www.wired.com/feed/rss", "en", ["tech"]),
  rss("engadget", "Engadget", "https://www.engadget.com/rss.xml", "en", ["tech"]),
  rss("mittr", "MIT Technology Review", "https://www.technologyreview.com/feed/", "en", ["tech", "ai"]),
  rss("theregister", "The Register", "https://www.theregister.com/headlines.atom", "en", ["tech"]),
  rss("zdnet", "ZDNet", "https://www.zdnet.com/news/rss.xml", "en", ["tech"]),
  rss("9to5mac", "9to5Mac", "https://9to5mac.com/feed/", "en", ["tech", "apple"]),
  rss("9to5google", "9to5Google", "https://9to5google.com/feed/", "en", ["tech", "google"]),
  rss("androidauthority", "Android Authority", "https://www.androidauthority.com/feed/", "en", [
    "tech",
    "mobile",
  ]),
  rss("tomshardware", "Tom's Hardware", "https://www.tomshardware.com/feeds/all", "en", ["tech", "hardware"]),
  rss("bleepingcomputer", "BleepingComputer", "https://www.bleepingcomputer.com/feed/", "en", [
    "tech",
    "security",
  ]),

  // AI-focused news
  rss("thedecoder", "The Decoder", "https://the-decoder.com/feed/", "en", ["ai"]),
  rss("marktechpost", "MarkTechPost", "https://www.marktechpost.com/feed/", "en", ["ai"]),
  rss("simonwillison", "Simon Willison", "https://simonwillison.net/atom/everything/", "en", ["ai", "dev"]),

  // New products & developer community
  rss("producthunt", "Product Hunt", "https://www.producthunt.com/feed", "en", [
    "tech",
    "launch",
    "product hunt",
  ]),
  rss("lobsters", "Lobsters", "https://lobste.rs/rss", "en", ["tech", "dev"]),

  // Turkish tech, startups and general news
  rss("webrazzi", "Webrazzi", "https://webrazzi.com/feed/", "tr", ["tech", "turkey"]),
  rss("egirisim", "Egirişim", "https://egirisim.com/feed/", "tr", ["tech", "startups", "turkey"]),
  rss("shiftdelete", "ShiftDelete.Net", "https://shiftdelete.net/feed", "tr", ["tech", "turkey"]),
  rss("donanimhaber", "DonanımHaber", "https://www.donanimhaber.com/rss/tum/", "tr", ["tech", "turkey"]),
  rss("ntv-teknoloji", "NTV Teknoloji", "https://www.ntv.com.tr/teknoloji.rss", "tr", ["tech", "turkey"]),
  rss("webtekno", "Webtekno", "https://www.webtekno.com/rss.xml", "tr", ["tech", "turkey"]),
  rss("teknoblog", "Teknoblog", "https://www.teknoblog.com/feed/", "tr", ["tech", "turkey"]),
  rss("log", "LOG", "https://www.log.com.tr/feed/", "tr", ["tech", "turkey"]),
  rss("chip", "CHIP Online", "https://www.chip.com.tr/rss", "tr", ["tech", "turkey"]),
  rss("bbc-turkce", "BBC Türkçe", "https://feeds.bbci.co.uk/turkce/rss.xml", "tr", ["turkey"]),

  // Optional: needs approved Reddit API credentials (see README). Disabled by default.
  {
    key: "reddit-tech",
    name: "Reddit (tech subs)",
    type: "reddit",
    enabled: false,
    weight: 1,
    config: {
      subreddits: [
        "technology",
        "artificial",
        "LocalLLaMA",
        "OpenAI",
        "singularity",
        "gadgets",
        "programming",
      ],
      sort: "hot",
      limit: 25,
      tags: ["tech"],
    },
  },
];
