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

// Google News search: any query becomes a feed of the last day's articles from many outlets.
// Titles end in " - Publisher"; the RSS adapter strips that so they cluster with direct feeds.
const googleNewsUrl = (query: string, lang: "en" | "tr") => {
  const region = lang === "tr" ? "hl=tr&gl=TR&ceid=TR:tr" : "hl=en-US&gl=US&ceid=US:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&${region}`;
};
const gnews = (
  key: string,
  name: string,
  queries: string[],
  lang: "en" | "tr",
  tags: string[],
  weight = 1,
  maxItemsPerFeed = 30,
): SourceSeed => ({
  key: `gnews-${key}`,
  name,
  type: "rss",
  weight,
  config: {
    feeds: queries.map((q) => ({ url: googleNewsUrl(q, lang), lang })),
    maxItemsPerFeed,
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
  // Anthropic has no official feed; this is a community mirror of anthropic.com/news on GitHub.
  rss(
    "anthropic",
    "Anthropic News",
    "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
    "en",
    ["ai", "official", "anthropic"],
    1.2,
  ),
  rss("google-research", "Google Research", "https://research.google/blog/rss/", "en", [
    "ai",
    "official",
    "google",
  ]),
  rss("aws-ml", "AWS Machine Learning", "https://aws.amazon.com/blogs/machine-learning/feed/", "en", [
    "ai",
    "official",
    "amazon",
  ]),
  rss("nvidia-dev", "NVIDIA Technical Blog", "https://developer.nvidia.com/blog/feed", "en", [
    "ai",
    "official",
    "nvidia",
    "dev",
  ]),
  rss("netflix-tech", "Netflix Tech Blog", "https://netflixtechblog.com/feed", "en", [
    "tech",
    "official",
    "netflix",
    "dev",
  ]),

  // Big newsrooms' tech desks (Reuters has no public feed, so it comes via Google News; AP tech
  // stories arrive through the big-tech queries below, a site search for AP is mostly sports)
  gnews("reuters", "Reuters Technology", ["site:reuters.com technology"], "en", ["tech"], 1.1, 40),
  rss("bloomberg", "Bloomberg Technology", "https://feeds.bloomberg.com/technology/news.rss", "en", ["tech"]),
  rss("ft", "Financial Times Technology", "https://www.ft.com/technology?format=rss", "en", ["tech"]),
  rss("cnbc", "CNBC Technology", "https://www.cnbc.com/id/19854910/device/rss/rss.html", "en", ["tech"]),
  rss("guardian", "The Guardian Technology", "https://www.theguardian.com/uk/technology/rss", "en", ["tech"]),
  rss("nyt", "NYT Technology", "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", "en", ["tech"]),
  rss("forbes", "Forbes Innovation", "https://www.forbes.com/innovation/feed/", "en", ["tech"], 0.9),

  // Big companies across all outlets: catches launches the moment anyone reports them.
  // One source on purpose, so a story found by several queries doesn't count as several sources.
  gnews(
    "bigtech",
    "Google News (big tech companies)",
    [
      "OpenAI",
      "Anthropic",
      '"Google Gemini" OR "Google AI" OR DeepMind',
      "Microsoft",
      'Apple iPhone OR Apple Mac OR "Apple Intelligence"',
      '"Meta AI" OR "Meta Platforms" OR Zuckerberg',
      "Nvidia",
      'Amazon AWS OR "Amazon Alexa"',
      "Tesla OR xAI OR Grok",
      'Samsung Galaxy OR "Samsung Electronics"',
      'DeepSeek OR Qwen OR "Mistral AI"',
      "Intel OR AMD OR Qualcomm OR TSMC",
    ],
    "en",
    ["tech"],
    0.8,
    20,
  ),

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
  rss("techradar", "TechRadar", "https://www.techradar.com/rss", "en", ["tech"]),
  rss("tomsguide", "Tom's Guide", "https://www.tomsguide.com/feeds/all", "en", ["tech"]),
  rss("mashable", "Mashable Tech", "https://mashable.com/feeds/rss/tech", "en", ["tech"]),
  rss("gizmodo", "Gizmodo", "https://gizmodo.com/rss", "en", ["tech"]),
  rss("digitaltrends", "Digital Trends", "https://www.digitaltrends.com/feed/", "en", ["tech"]),
  rss("thenextweb", "The Next Web", "https://thenextweb.com/feed", "en", ["tech"]),
  rss("slashdot", "Slashdot", "https://rss.slashdot.org/Slashdot/slashdotMain", "en", ["tech"]),
  rss("howtogeek", "How-To Geek", "https://www.howtogeek.com/feed/", "en", ["tech"]),
  rss("neowin", "Neowin", "https://www.neowin.net/news/rss/", "en", ["tech", "microsoft"]),
  rss("macrumors", "MacRumors", "https://feeds.macrumors.com/MacRumors-All", "en", ["tech", "apple"]),
  rss("appleinsider", "AppleInsider", "https://appleinsider.com/rss/news/", "en", ["tech", "apple"]),
  rss("androidpolice", "Android Police", "https://www.androidpolice.com/feed/", "en", ["tech", "mobile"]),
  rss("xda", "XDA Developers", "https://www.xda-developers.com/feed/", "en", ["tech", "mobile"]),
  rss("wccftech", "Wccftech", "https://wccftech.com/feed/", "en", ["tech", "hardware"]),
  rss("techspot", "TechSpot", "https://www.techspot.com/backend.xml", "en", ["tech", "hardware"]),
  rss("phoronix", "Phoronix", "https://www.phoronix.com/rss.php", "en", ["tech", "hardware", "dev"]),
  rss("electrek", "Electrek", "https://electrek.co/feed/", "en", ["tech", "auto"]),
  rss("sifted", "Sifted", "https://sifted.eu/feed", "en", ["tech", "startups"]),
  rss("inc42", "Inc42", "https://inc42.com/feed/", "en", ["tech", "startups"], 0.8),
  rss("thehackernews", "The Hacker News", "https://feeds.feedburner.com/TheHackersNews", "en", [
    "tech",
    "security",
  ]),
  rss("securityweek", "SecurityWeek", "https://www.securityweek.com/feed/", "en", ["tech", "security"]),

  // AI-focused news
  rss("thedecoder", "The Decoder", "https://the-decoder.com/feed/", "en", ["ai"]),
  rss("marktechpost", "MarkTechPost", "https://www.marktechpost.com/feed/", "en", ["ai"]),
  rss("simonwillison", "Simon Willison", "https://simonwillison.net/atom/everything/", "en", ["ai", "dev"]),
  rss("uniteai", "Unite.AI", "https://www.unite.ai/feed/", "en", ["ai"]),
  rss("arstechnica-ai", "Ars Technica AI", "https://arstechnica.com/ai/feed/", "en", ["ai"]),
  rss(
    "theverge-ai",
    "The Verge AI",
    "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    "en",
    ["ai"],
  ),
  rss("aim", "Analytics India Magazine", "https://analyticsindiamag.com/feed/", "en", ["ai"], 0.8),

  // New products & developer community
  rss("producthunt", "Product Hunt", "https://www.producthunt.com/feed", "en", [
    "tech",
    "launch",
    "product hunt",
  ]),
  rss("lobsters", "Lobsters", "https://lobste.rs/rss", "en", ["tech", "dev"]),
  rss("hn-best", "Hacker News Best (hnrss)", "https://hnrss.org/best", "en", ["tech"], 0.9),
  rss("lemmy-tech", "Lemmy technology", "https://lemmy.world/feeds/c/technology.xml?sort=Active", "en", [
    "tech",
  ]),

  // Turkish tech, startups and general news
  rss(
    "webrazzi",
    "Webrazzi",
    ["https://webrazzi.com/feed/", "https://webrazzi.com/kategori/yapay-zeka/feed/"],
    "tr",
    ["tech", "turkey"],
  ),
  rss("technopat", "Technopat", "https://www.technopat.net/feed/", "tr", ["tech", "turkey"]),
  rss("tamindir", "Tamindir Haber", "https://www.tamindir.com/rss/haber/", "tr", ["tech", "turkey"]),
  rss("donanimarsivi", "Donanım Arşivi", "https://donanimarsivi.com/feed/", "tr", ["tech", "turkey"]),
  rss(
    "aa-teknoloji",
    "Anadolu Ajansı Bilim-Teknoloji",
    "https://www.aa.com.tr/tr/rss/default?cat=bilim-teknoloji",
    "tr",
    ["tech", "turkey"],
  ),
  rss("dunya-teknoloji", "Dünya Teknoloji", "https://www.dunya.com/rss?dunya=teknoloji", "tr", [
    "tech",
    "turkey",
  ]),
  gnews(
    "tr-tech",
    "Google News TR (yapay zeka, big tech)",
    ["yapay zeka", "Apple OR Samsung OR Google OR Microsoft OR OpenAI OR Nvidia OR akıllı telefon"],
    "tr",
    ["tech", "turkey"],
    0.8,
  ),
  rss("egirisim", "Egirişim", "https://egirisim.com/feed/", "tr", ["tech", "startups", "turkey"]),
  rss("shiftdelete", "ShiftDelete.Net", "https://shiftdelete.net/feed", "tr", ["tech", "turkey"]),
  rss("donanimhaber", "DonanımHaber", "https://www.donanimhaber.com/rss/tum/", "tr", ["tech", "turkey"]),
  rss("ntv-teknoloji", "NTV Teknoloji", "https://www.ntv.com.tr/teknoloji.rss", "tr", ["tech", "turkey"]),
  rss("webtekno", "Webtekno", "https://www.webtekno.com/rss.xml", "tr", ["tech", "turkey"]),
  rss("teknoblog", "Teknoblog", "https://www.teknoblog.com/feed/", "tr", ["tech", "turkey"]),
  rss("log", "LOG", "https://www.log.com.tr/feed/", "tr", ["tech", "turkey"]),
  rss("chip", "CHIP Online", "https://www.chip.com.tr/rss", "tr", ["tech", "turkey"]),
  rss("bbc-turkce", "BBC Türkçe", "https://feeds.bbci.co.uk/turkce/rss.xml", "tr", ["turkey"]),

  // Reddit through our own Devvit app (reddit-bridge/). Disabled until REDDIT_DEVVIT_URL/TOKEN are set.
  {
    key: "reddit-devvit",
    name: "Reddit (via Devvit app)",
    type: "reddit_devvit",
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

  // Optional: needs approved Reddit Data API credentials (see README). Disabled by default.
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
