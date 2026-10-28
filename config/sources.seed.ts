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
// One source may have several feed URLs (same publisher, e.g. its main feed + section feeds) so
// they count as ONE source in the "seen on N sources" bonus. Never split a publisher into sources.
// A feed is a URL, or { url, tags } for a section feed whose items get extra tags (e.g. a
// publisher's AI-section feed tagged "ai"). An article in both feeds is merged into one item.
type FeedSpec = string | { url: string; tags?: string[]; lang?: "en" | "tr" };
const rss = (
  key: string,
  name: string,
  url: FeedSpec | FeedSpec[],
  lang: "en" | "tr",
  tags: string[],
  weight = 1,
  maxItemsPerFeed = 30,
): SourceSeed => ({
  key: `rss-${key}`,
  name,
  type: "rss",
  weight,
  config: {
    feeds: (Array.isArray(url) ? url : [url]).map((f) =>
      typeof f === "string" ? { url: f, lang } : { lang, ...f },
    ),
    maxItemsPerFeed,
    tags,
  },
});

// Google News search: any query becomes a feed of the last day's articles from many outlets.
// Titles end in " - Publisher"; the RSS adapter strips that so they cluster with direct feeds.
// `edition` is the Google News country edition (language + region of the results).
const EDITIONS = {
  US: { hl: "en-US", gl: "US", ceid: "US:en", lang: "en" },
  GB: { hl: "en-GB", gl: "GB", ceid: "GB:en", lang: "en" },
  IN: { hl: "en-IN", gl: "IN", ceid: "IN:en", lang: "en" },
  AU: { hl: "en-AU", gl: "AU", ceid: "AU:en", lang: "en" },
  CA: { hl: "en-CA", gl: "CA", ceid: "CA:en", lang: "en" },
  SG: { hl: "en-SG", gl: "SG", ceid: "SG:en", lang: "en" },
  TR: { hl: "tr", gl: "TR", ceid: "TR:tr", lang: "tr" },
} as const;
type Edition = keyof typeof EDITIONS;
const googleNewsUrl = (query: string, edition: Edition) => {
  const { hl, gl, ceid } = EDITIONS[edition];
  const params = new URLSearchParams({ q: `${query} when:1d`, hl, gl, ceid });
  return `https://news.google.com/rss/search?${params}`;
};
const gnews = (
  key: string,
  name: string,
  queries: string[],
  edition: Edition | Edition[],
  tags: string[],
  weight = 1,
  maxItemsPerFeed = 30,
): SourceSeed => ({
  key: `gnews-${key}`,
  name,
  type: "rss",
  weight,
  config: {
    feeds: [edition]
      .flat()
      .flatMap((e) => queries.map((q) => ({ url: googleNewsUrl(q, e), lang: EDITIONS[e].lang }))),
    maxItemsPerFeed,
    // Google News answers fast; many queries in one source must still fit the per-source timeout.
    concurrency: 8,
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
  rss(
    "google",
    "Google (official blogs)",
    [
      "https://blog.google/rss/",
      { url: "https://blog.google/technology/ai/rss/", tags: ["ai"] },
      { url: "https://deepmind.google/blog/rss.xml", tags: ["ai", "deepmind"] },
      { url: "https://research.google/blog/rss/", tags: ["ai", "research"] },
      { url: "https://cloudblog.withgoogle.com/rss/", tags: ["cloud"] },
      { url: "https://android-developers.googleblog.com/feeds/posts/default", tags: ["android", "dev"] },
      { url: "https://blog.youtube/rss/", tags: ["youtube"] },
      { url: "https://workspaceupdates.googleblog.com/feeds/posts/default", tags: ["workspace"] },
      { url: "https://chromereleases.googleblog.com/feeds/posts/default", tags: ["chrome", "changelog"] },
      { url: "https://googleprojectzero.blogspot.com/feeds/posts/default", tags: ["security"] },
    ],
    "en",
    ["tech", "official", "google"],
    1.2,
  ),
  rss(
    "microsoft",
    "Microsoft (official blogs)",
    [
      "https://blogs.microsoft.com/feed/",
      "https://news.microsoft.com/source/feed/",
      { url: "https://news.microsoft.com/source/topics/ai/feed/", tags: ["ai"] },
      { url: "https://www.microsoft.com/en-us/research/feed/", tags: ["research"] },
      { url: "https://blogs.windows.com/feed/", tags: ["windows"] },
      { url: "https://azure.microsoft.com/en-us/blog/feed/", tags: ["azure", "cloud"] },
      { url: "https://devblogs.microsoft.com/feed/", tags: ["dev"] },
      { url: "https://www.microsoft.com/en-us/security/blog/feed/", tags: ["security"] },
    ],
    "en",
    ["tech", "official", "microsoft"],
    1.2,
  ),
  rss(
    "meta",
    "Meta (newsroom, engineering)",
    ["https://about.fb.com/feed/", { url: "https://engineering.fb.com/feed/", tags: ["dev"] }],
    "en",
    ["tech", "official", "meta"],
    1.2,
  ),
  rss(
    "apple",
    "Apple (newsroom, developer, ML research)",
    [
      "https://www.apple.com/newsroom/rss-feed.rss",
      { url: "https://developer.apple.com/news/rss/news.rss", tags: ["dev"] },
      { url: "https://machinelearning.apple.com/rss.xml", tags: ["ai", "research"] },
    ],
    "en",
    ["tech", "official", "apple"],
    1.2,
  ),
  rss(
    "nvidia",
    "NVIDIA (news, blog, technical blog)",
    [
      "https://nvidianews.nvidia.com/releases.xml",
      "https://blogs.nvidia.com/feed/",
      { url: "https://developer.nvidia.com/blog/feed", tags: ["dev"] },
    ],
    "en",
    ["tech", "official", "nvidia"],
    1.2,
  ),
  rss(
    "aws",
    "Amazon & AWS (official)",
    [
      "https://aws.amazon.com/blogs/aws/feed/",
      { url: "https://aws.amazon.com/blogs/machine-learning/feed/", tags: ["ai"] },
      "https://www.aboutamazon.com/news/rss",
    ],
    "en",
    ["tech", "official", "amazon"],
  ),
  rss(
    "github",
    "GitHub (blog, changelog)",
    ["https://github.blog/feed/", { url: "https://github.blog/changelog/feed/", tags: ["changelog"] }],
    "en",
    ["tech", "official", "github"],
  ),
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
  // Anthropic has no official feeds; these are community mirrors of anthropic.com on GitHub.
  rss(
    "anthropic",
    "Anthropic (news, research, engineering)",
    [
      "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
      {
        url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml",
        tags: ["research"],
      },
      {
        url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_engineering.xml",
        tags: ["dev"],
      },
    ],
    "en",
    ["ai", "official", "anthropic"],
    1.2,
  ),
  rss("netflix-tech", "Netflix Tech Blog", "https://netflixtechblog.com/feed", "en", [
    "tech",
    "official",
    "netflix",
    "dev",
  ]),

  // Big newsrooms' tech desks (Reuters has no public feed, so it comes via Google News; AP tech
  // stories arrive through the big-tech queries below, a site search for AP is mostly sports)
  gnews("reuters", "Reuters Technology", ["site:reuters.com technology"], "US", ["tech"], 1.1, 40),
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
    "US",
    ["tech"],
    0.8,
    20,
  ),

  // Companies without a usable feed of their own, and the next tier down.
  gnews(
    "companies",
    "Google News (more tech companies)",
    [
      "Netflix OR Spotify OR Uber OR Airbnb",
      "Adobe OR Salesforce OR Oracle OR IBM",
      '"Arm Holdings" OR Broadcom OR Micron OR "SK Hynix"',
      "Huawei OR Xiaomi OR OnePlus OR Oppo",
      "ByteDance OR TikTok OR Alibaba OR Baidu OR Tencent",
      'SpaceX OR Starlink OR "Blue Origin"',
      'Perplexity OR "Hugging Face" OR Cohere OR "Stability AI"',
      "Figma OR Notion OR Canva OR Shopify",
      "Stripe OR PayPal OR Revolut OR Klarna",
      '"Snap Inc" OR Snapchat OR Pinterest OR Reddit OR Discord',
      "PlayStation OR Nintendo OR Xbox OR Steam",
      "Dell OR HP OR Lenovo OR Asus",
    ],
    "US",
    ["tech"],
    0.7,
    15,
  ),
  // Topics: launches, funding, chips, security... regardless of company or outlet.
  gnews(
    "topics",
    "Google News (tech topics)",
    [
      '"AI model" OR "large language model" OR LLM',
      "launches OR unveils smartphone OR laptop OR app",
      'startup raises OR "funding round" OR "Series A" OR "Series B"',
      "semiconductor OR chipmaker OR GPU",
      'cyberattack OR "data breach" OR ransomware OR vulnerability',
      '"quantum computing" OR "quantum computer"',
      'robotics OR "humanoid robot" OR "self-driving"',
      '"electric vehicle" OR "EV battery"',
      '"AI regulation" OR "AI Act" OR "tech antitrust"',
      '"open source" release',
    ],
    "US",
    ["tech"],
    0.7,
    15,
  ),
  // Other English editions: regional launches and local tech business the US edition misses.
  // One source: the editions share about half their stories, which must not count as extra sources.
  gnews(
    "tech-intl",
    "Google News UK/IN/AU/CA/SG (tech)",
    ['"artificial intelligence" OR "AI startup"', 'smartphone OR software OR chipmaker OR "tech company"'],
    ["GB", "IN", "AU", "CA", "SG"],
    ["tech"],
    0.6,
    20,
  ),

  // Tech news (global)
  rss("techmeme", "Techmeme", "https://www.techmeme.com/feed.xml", "en", ["tech"], 1.3),
  rss(
    "techcrunch",
    "TechCrunch",
    [
      "https://techcrunch.com/feed/",
      { url: "https://techcrunch.com/category/artificial-intelligence/feed/", tags: ["ai"] },
      { url: "https://techcrunch.com/category/startups/feed/", tags: ["startups"] },
      { url: "https://techcrunch.com/category/venture/feed/", tags: ["funding"] },
    ],
    "en",
    ["tech", "startups"],
  ),
  rss(
    "theverge",
    "The Verge",
    [
      "https://www.theverge.com/rss/index.xml",
      { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", tags: ["ai"] },
    ],
    "en",
    ["tech"],
  ),
  rss(
    "arstechnica",
    "Ars Technica",
    [
      "https://feeds.arstechnica.com/arstechnica/index",
      { url: "https://arstechnica.com/ai/feed/", tags: ["ai"] },
      { url: "https://arstechnica.com/space/feed/", tags: ["space"] },
      { url: "https://arstechnica.com/gaming/feed/", tags: ["gaming"] },
    ],
    "en",
    ["tech"],
  ),
  rss(
    "wired",
    "Wired",
    [
      "https://www.wired.com/feed/rss",
      { url: "https://www.wired.com/feed/tag/ai/latest/rss", tags: ["ai"] },
      { url: "https://www.wired.com/feed/category/security/latest/rss", tags: ["security"] },
    ],
    "en",
    ["tech"],
  ),
  rss("engadget", "Engadget", "https://www.engadget.com/rss.xml", "en", ["tech"]),
  rss("mittr", "MIT Technology Review", "https://www.technologyreview.com/feed/", "en", ["tech", "ai"]),
  rss(
    "theregister",
    "The Register",
    [
      "https://www.theregister.com/headlines.atom",
      { url: "https://www.theregister.com/security/headlines.atom", tags: ["security"] },
    ],
    "en",
    ["tech"],
  ),
  rss(
    "zdnet",
    "ZDNet",
    [
      "https://www.zdnet.com/news/rss.xml",
      { url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml", tags: ["ai"] },
    ],
    "en",
    ["tech"],
  ),
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
  rss("aim", "Analytics India Magazine", "https://analyticsindiamag.com/feed/", "en", ["ai"], 0.8),

  // New products & developer community
  rss("producthunt", "Product Hunt", "https://www.producthunt.com/feed", "en", [
    "tech",
    "launch",
    "product hunt",
  ]),
  rss(
    "lobsters",
    "Lobsters",
    ["https://lobste.rs/rss", { url: "https://lobste.rs/t/ai.rss", tags: ["ai"] }],
    "en",
    ["tech", "dev"],
  ),
  rss("hn-best", "Hacker News Best (hnrss)", "https://hnrss.org/best", "en", ["tech"], 0.9),
  // Lemmy (federated Reddit alternative): one source for its tech communities, like the Reddit source.
  rss(
    "lemmy-tech",
    "Lemmy (tech communities)",
    [
      "https://lemmy.world/feeds/c/technology.xml?sort=Active",
      "https://lemmy.ml/feeds/c/technology.xml?sort=Active",
      { url: "https://lemdro.id/feeds/c/android.xml?sort=Active", tags: ["android"] },
      { url: "https://programming.dev/feeds/c/programming.xml?sort=Active", tags: ["dev"] },
      { url: "https://lemmy.world/feeds/c/selfhosted.xml?sort=Active", tags: ["selfhosted"] },
      { url: "https://lemmy.ml/feeds/c/linux.xml?sort=Active", tags: ["linux"] },
    ],
    "en",
    ["tech"],
  ),

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
    [
      "yapay zeka",
      "Apple OR Samsung OR Google OR Microsoft OR OpenAI OR Nvidia OR akıllı telefon",
      'girişim yatırım OR "yatırım aldı"',
      '"siber saldırı" OR "veri sızıntısı"',
      'Turkcell OR "Türk Telekom" OR Baykar OR Togg OR Aselsan',
    ],
    "TR",
    ["tech", "turkey"],
    0.8,
  ),
  rss("egirisim", "Egirişim", "https://egirisim.com/feed/", "tr", ["tech", "startups", "turkey"]),
  rss(
    "shiftdelete",
    "ShiftDelete.Net",
    ["https://shiftdelete.net/feed", { url: "https://shiftdelete.net/oyun/feed", tags: ["gaming"] }],
    "tr",
    ["tech", "turkey"],
  ),
  rss("donanimhaber", "DonanımHaber", "https://www.donanimhaber.com/rss/tum/", "tr", ["tech", "turkey"]),
  rss("ntv-teknoloji", "NTV Teknoloji", "https://www.ntv.com.tr/teknoloji.rss", "tr", ["tech", "turkey"]),
  rss("webtekno", "Webtekno", "https://www.webtekno.com/rss.xml", "tr", ["tech", "turkey"]),
  rss("teknoblog", "Teknoblog", "https://www.teknoblog.com/feed/", "tr", ["tech", "turkey"]),
  rss("log", "LOG", "https://www.log.com.tr/feed/", "tr", ["tech", "turkey"]),
  rss("chip", "CHIP Online", "https://www.chip.com.tr/rss", "tr", ["tech", "turkey"]),
  rss("bbc-turkce", "BBC Türkçe", "https://feeds.bbci.co.uk/turkce/rss.xml", "tr", ["turkey"]),

  // ---- Second batch (Oct 2026 probe): lower volume or broader, but all working ----

  // Newsrooms and business press
  rss("bbc-tech", "BBC Technology", "https://feeds.bbci.co.uk/news/technology/rss.xml", "en", ["tech"]),
  rss("wsj-tech", "WSJ Tech", "https://feeds.content.dowjones.io/public/rss/RSSWSJD", "en", ["tech"]),
  rss("fastcompany", "Fast Company Tech", "https://www.fastcompany.com/technology/rss", "en", ["tech"]),
  rss("theinformation", "The Information", "https://www.theinformation.com/feed", "en", ["tech"], 1.1),
  // General news: no "tech" tag, the categorizer decides what counts as tech.
  rss("businessinsider", "Business Insider", "https://feeds.businessinsider.com/custom/all", "en", [], 0.6),
  rss("aljazeera", "Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", "en", [], 0.5),

  // Tech sites
  rss("cnet", "CNET", "https://www.cnet.com/rss/news/", "en", ["tech"]),
  rss("pcworld", "PCWorld", "https://www.pcworld.com/feed", "en", ["tech", "hardware"]),
  rss("windowscentral", "Windows Central", "https://www.windowscentral.com/feeds/all", "en", [
    "tech",
    "microsoft",
  ]),
  rss("siliconangle", "SiliconANGLE", "https://siliconangle.com/feed/", "en", ["tech"]),
  rss("geekwire", "GeekWire", "https://www.geekwire.com/feed/", "en", ["tech", "startups"]),
  rss("ghacks", "Ghacks", "https://www.ghacks.net/feed/", "en", ["tech"]),
  rss("futurism", "Futurism", "https://futurism.com/feed", "en", ["tech"], 0.8),
  rss("newatlas", "New Atlas", "https://newatlas.com/index.rss", "en", ["tech"]),
  rss("insideevs", "InsideEVs", "https://insideevs.com/rss/news/all/", "en", ["tech", "auto"]),
  rss(
    "ieee-spectrum",
    "IEEE Spectrum",
    [
      "https://spectrum.ieee.org/feeds/feed.rss",
      { url: "https://spectrum.ieee.org/feeds/topic/robotics.rss", tags: ["robotics"] },
    ],
    "en",
    ["tech"],
  ),
  rss("servethehome", "ServeTheHome", "https://www.servethehome.com/feed/", "en", ["tech", "hardware"]),
  rss(
    "notebookcheck",
    "Notebookcheck",
    "https://www.notebookcheck.net/RSS-Feed-Notebook-Reviews.8156.0.html",
    "en",
    ["tech", "hardware"],
  ),
  rss("hackaday", "Hackaday", "https://hackaday.com/blog/feed/", "en", ["tech", "hardware"]),
  rss("daringfireball", "Daring Fireball", "https://daringfireball.net/feeds/main", "en", ["tech", "apple"]),
  rss("stratechery", "Stratechery", "https://stratechery.com/feed/", "en", ["tech"]),
  rss("platformer", "Platformer", "https://www.platformer.news/rss/", "en", ["tech"]),
  rss("space", "Space.com", "https://www.space.com/feeds/all", "en", ["tech", "space"]),
  rss("spacenews", "SpaceNews", "https://spacenews.com/feed/", "en", ["tech", "space"]),
  rss("robotreport", "The Robot Report", "https://www.therobotreport.com/feed/", "en", ["tech", "robotics"]),

  // Startups and regional tech
  rss("crunchbase", "Crunchbase News", "https://news.crunchbase.com/feed/", "en", ["tech", "startups"]),
  rss("techeu", "Tech.eu", "https://tech.eu/feed/", "en", ["tech", "startups"]),
  rss("pandaily", "Pandaily", "https://pandaily.com/feed/", "en", ["tech", "china"]),
  rss("technode", "TechNode", "https://technode.com/feed/", "en", ["tech", "china"]),

  // Security
  rss("krebs", "Krebs on Security", "https://krebsonsecurity.com/feed/", "en", ["tech", "security"]),
  rss("darkreading", "Dark Reading", "https://www.darkreading.com/rss.xml", "en", ["tech", "security"]),
  rss("therecord", "The Record", "https://therecord.media/feed", "en", ["tech", "security"]),

  // Developers
  rss("infoq", "InfoQ", "https://feed.infoq.com/", "en", ["tech", "dev"]),
  rss("thenewstack", "The New Stack", "https://thenewstack.io/feed/", "en", ["tech", "dev"]),
  rss("devto", "DEV Community", "https://dev.to/feed", "en", ["tech", "dev"], 0.6),
  rss("lwn", "LWN", "https://lwn.net/headlines/rss", "en", ["tech", "dev"]),

  // AI: news, newsletters and writers
  rss("therundown", "The Rundown AI", "https://www.therundown.ai/feed", "en", ["ai"]),
  rss("importai", "Import AI", "https://importai.substack.com/feed", "en", ["ai"]),
  rss("garymarcus", "Gary Marcus", "https://garymarcus.substack.com/feed", "en", ["ai"], 0.8),
  rss("interconnects", "Interconnects", "https://www.interconnects.ai/feed", "en", ["ai"]),
  rss("raschka", "Sebastian Raschka", "https://magazine.sebastianraschka.com/feed", "en", ["ai"]),
  rss("oneusefulthing", "One Useful Thing", "https://www.oneusefulthing.org/feed", "en", ["ai"]),
  rss("aisnakeoil", "AI Snake Oil", "https://www.aisnakeoil.com/feed", "en", ["ai"]),
  rss("bensbites", "Ben's Bites", "https://www.bensbites.com/feed", "en", ["ai"]),
  rss("tds", "Towards Data Science", "https://towardsdatascience.com/feed", "en", ["ai"], 0.7),
  // New research papers: hundreds a day, so a low weight and only the first 40 per list.
  rss(
    "arxiv",
    "arXiv (AI/ML papers)",
    ["https://rss.arxiv.org/rss/cs.AI", "https://rss.arxiv.org/rss/cs.LG", "https://rss.arxiv.org/rss/cs.CL"],
    "en",
    ["ai", "research"],
    0.4,
    40,
  ),

  // More official company blogs
  rss("salesforce", "Salesforce News", "https://www.salesforce.com/news/feed/", "en", [
    "tech",
    "official",
    "salesforce",
  ]),
  rss("cloudflare", "Cloudflare Blog", "https://blog.cloudflare.com/rss/", "en", [
    "tech",
    "official",
    "cloudflare",
  ]),
  rss("vercel", "Vercel", "https://vercel.com/atom", "en", ["tech", "official", "vercel", "dev"]),
  rss("stripe", "Stripe Blog", "https://stripe.com/blog/feed.rss", "en", ["tech", "official", "stripe"]),
  rss("ollama", "Ollama", "https://ollama.com/blog/rss.xml", "en", ["ai", "official", "ollama"]),
  rss("docker", "Docker Blog", "https://www.docker.com/blog/feed/", "en", [
    "tech",
    "official",
    "docker",
    "dev",
  ]),
  rss("kubernetes", "Kubernetes Blog", "https://kubernetes.io/feed.xml", "en", ["tech", "official", "dev"]),
  rss("mozilla", "Mozilla Blog", "https://blog.mozilla.org/en/feed/", "en", ["tech", "official", "mozilla"]),
  rss("spotify", "Spotify Newsroom", "https://newsroom.spotify.com/feed/", "en", [
    "tech",
    "official",
    "spotify",
  ]),

  // Community and video
  rss("hn-launch", "Launch HN (hnrss)", "https://hnrss.org/launches", "en", ["tech", "launch", "startups"]),
  rss("tildes-tech", "Tildes ~tech", "https://tildes.net/~tech/topics.rss", "en", ["tech"]),
  // YouTube channel feeds are free and keyless: add any channel_id here.
  rss(
    "youtube-tech",
    "YouTube tech channels",
    [
      "UCBJycsmduvYEL83R_U4JriQ", // MKBHD
      "UCXuqSBlHAE6Xw-yeJA0Tunw", // Linus Tech Tips
      "UCsBjURrPoezykLs9EqgamOA", // Fireship
      "UCbfYPyITQ-7l4upoX8nvctg", // Two Minute Papers
      "UCNJ1Ymd5yFuUPtn21xtRbbw", // AI Explained
    ].map((id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`),
    "en",
    ["tech", "video"],
    0.8,
    10,
  ),

  // More Turkish
  rss(
    "milliyet-teknoloji",
    "Milliyet Teknoloji",
    "https://www.milliyet.com.tr/rss/rssnew/teknolojirss.xml",
    "tr",
    ["tech", "turkey"],
  ),
  rss(
    "haberturk-teknoloji",
    "Habertürk Teknoloji",
    "https://www.haberturk.com/rss/kategori/teknoloji.xml",
    "tr",
    ["tech", "turkey"],
  ),
  rss("hurriyet-teknoloji", "Hürriyet Teknoloji", "https://www.hurriyet.com.tr/rss/teknoloji", "tr", [
    "tech",
    "turkey",
  ]),
  rss(
    "sozcu-teknoloji",
    "Sözcü Bilim-Teknoloji",
    "https://www.sozcu.com.tr/feeds-rss-category-bilim-teknoloji",
    "tr",
    ["tech", "turkey"],
  ),
  rss(
    "trt-teknoloji",
    "TRT Haber Bilim-Teknoloji",
    "https://www.trthaber.com/bilim_teknoloji_articles.rss",
    "tr",
    ["tech", "turkey"],
  ),
  rss("teknoseyir", "TeknoSeyir", "https://teknoseyir.com/feed", "tr", ["tech", "turkey"]),
  rss("swipeline", "Swipeline", "https://swipeline.co/feed/", "tr", ["tech", "startups", "turkey"]),
  rss("foundern", "FounderN", "https://www.foundern.com/feed/", "tr", ["tech", "startups", "turkey"]),
  rss("evrimagaci", "Evrim Ağacı", "https://evrimagaci.org/rss.xml", "tr", ["turkey", "science"]),
  rss("indir", "Indir.com Haber", "https://www.indir.com/haber/rss/", "tr", ["tech", "turkey"]),

  // ---- Third batch (second probe, Oct 2026): top platforms we didn't have yet ----

  // Google News' own Technology / Science sections (curated by Google, per edition)
  rss(
    "gnews-sections",
    "Google News (Technology & Science sections)",
    [
      "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pIUWlnQVAB?hl=en-GB&gl=GB&ceid=GB:en",
      {
        url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en",
        tags: ["science"],
      },
      {
        url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FuUnlHZ0pVVWlnQVAB?hl=tr&gl=TR&ceid=TR:tr",
        lang: "tr",
        tags: ["turkey"],
      },
    ],
    "en",
    ["tech"],
    0.9,
    40,
  ),

  // US / UK / global newsrooms
  rss("axios", "Axios", "https://api.axios.com/feed/", "en", [], 0.8),
  rss("time-tech", "TIME Tech", "https://time.com/tech/feed/", "en", ["tech"]),
  rss("nbc-tech", "NBC News Tech", "https://feeds.nbcnews.com/nbcnews/public/tech", "en", ["tech"]),
  rss("cbs-tech", "CBS News Technology", "https://www.cbsnews.com/latest/rss/technology", "en", ["tech"]),
  rss("abc-tech", "ABC News Technology", "https://abcnews.go.com/abcnews/technologyheadlines", "en", [
    "tech",
  ]),
  rss("fox-tech", "Fox News Tech", "https://moxie.foxnews.com/google-publisher/tech.xml", "en", ["tech"]),
  rss("npr-tech", "NPR Technology", "https://feeds.npr.org/1019/rss.xml", "en", ["tech"]),
  rss("latimes-tech", "LA Times Technology", "https://www.latimes.com/business/technology/rss2.0.xml", "en", [
    "tech",
  ]),
  rss(
    "atlantic-tech",
    "The Atlantic Technology",
    "https://www.theatlantic.com/feed/channel/technology/",
    "en",
    ["tech"],
  ),
  rss("vox-tech", "Vox Technology", "https://www.vox.com/rss/technology/index.xml", "en", ["tech"]),
  rss("politico-tech", "Politico Technology", "https://rss.politico.com/technology.xml", "en", [
    "tech",
    "policy",
  ]),
  rss(
    "economist-scitech",
    "The Economist Science & Technology",
    "https://www.economist.com/science-and-technology/rss.xml",
    "en",
    ["tech", "science"],
  ),
  rss("quartz", "Quartz", "https://qz.com/rss", "en", [], 0.8),
  rss("independent-tech", "The Independent Tech", "https://www.independent.co.uk/tech/rss", "en", ["tech"]),
  rss("sky-tech", "Sky News Technology", "https://feeds.skynews.com/feeds/rss/technology.xml", "en", [
    "tech",
  ]),
  rss("euronews-next", "Euronews Next", "https://www.euronews.com/rss?level=vertical&name=next", "en", [
    "tech",
  ]),
  rss("dw-scitech", "DW Science & Tech", "https://rss.dw.com/xml/rss_en_science", "en", ["science"]),
  rss("404media", "404 Media", "https://www.404media.co/rss/", "en", ["tech"]),
  rss("bigtechnology", "Big Technology", "https://www.bigtechnology.com/feed", "en", ["tech"]),
  rss("restofworld", "Rest of World", "https://restofworld.org/feed/latest/", "en", ["tech"]),

  // Asia-Pacific, India, Canada
  rss("scmp-tech", "SCMP Tech", "https://www.scmp.com/rss/36/feed", "en", ["tech", "china"]),
  rss(
    "cna-tech",
    "CNA Technology",
    "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936",
    "en",
    ["tech", "asia"],
  ),
  rss(
    "abc-au-science",
    "ABC Australia Science & Tech",
    "https://www.abc.net.au/news/feed/2942460/rss.xml",
    "en",
    ["science"],
  ),
  rss(
    "et-tech",
    "Economic Times Tech",
    "https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms",
    "en",
    ["tech", "india"],
  ),
  rss("gadgets360", "Gadgets 360", "https://feeds.feedburner.com/gadgets360-latest", "en", ["tech", "india"]),
  rss(
    "thehindu-tech",
    "The Hindu Technology",
    "https://www.thehindu.com/sci-tech/technology/feeder/default.rss",
    "en",
    ["tech", "india"],
  ),
  rss("mint-tech", "Mint Technology", "https://www.livemint.com/rss/technology", "en", ["tech", "india"]),
  rss(
    "ht-tech",
    "Hindustan Times Tech",
    "https://www.hindustantimes.com/feeds/rss/technology/rssfeed.xml",
    "en",
    ["tech", "india"],
  ),

  // Enterprise IT (Foundry & others)
  rss("computerworld", "Computerworld", "https://www.computerworld.com/feed/", "en", ["tech"]),
  rss("infoworld", "InfoWorld", "https://www.infoworld.com/feed/", "en", ["tech", "dev"]),
  rss("networkworld", "Network World", "https://www.networkworld.com/feed/", "en", ["tech"]),
  rss("cio", "CIO", "https://www.cio.com/feed/", "en", ["tech"]),
  rss("csoonline", "CSO Online", "https://www.csoonline.com/feed/", "en", ["tech", "security"]),
  rss("techrepublic", "TechRepublic", "https://www.techrepublic.com/rssfeeds/articles/", "en", ["tech"]),
  rss("eweek", "eWeek", "https://www.eweek.com/feed/", "en", ["tech"]),
  rss("dcd", "DatacenterDynamics", "https://www.datacenterdynamics.com/en/rss/", "en", [
    "tech",
    "data centers",
  ]),

  // Consumer tech, phones, PC hardware
  rss("androidcentral", "Android Central", "https://www.androidcentral.com/feeds/all", "en", [
    "tech",
    "android",
  ]),
  rss("androidheadlines", "Android Headlines", "https://www.androidheadlines.com/feed", "en", [
    "tech",
    "android",
  ]),
  rss("sammobile", "SamMobile", "https://www.sammobile.com/feed/", "en", ["tech", "samsung"]),
  rss("gsmarena", "GSMArena", "https://www.gsmarena.com/rss-news-reviews.php3", "en", [
    "tech",
    "smartphones",
  ]),
  rss("macworld", "Macworld", "https://www.macworld.com/feed", "en", ["tech", "apple"]),
  rss("macstories", "MacStories", "https://www.macstories.net/feed/", "en", ["tech", "apple"]),
  rss("sixcolors", "Six Colors", "https://sixcolors.com/feed/", "en", ["tech", "apple"]),
  rss("thurrott", "Thurrott", "https://www.thurrott.com/feed", "en", ["tech", "microsoft"]),
  rss("pocketlint", "Pocket-lint", "https://www.pocket-lint.com/feed/", "en", ["tech"]),
  rss("trustedreviews", "Trusted Reviews", "https://www.trustedreviews.com/feed", "en", ["tech"]),
  rss("t3", "T3", "https://www.t3.com/feeds/all", "en", ["tech"]),
  rss("stuff", "Stuff", "https://www.stuff.tv/feed/", "en", ["tech"]),
  rss("liliputing", "Liliputing", "https://liliputing.com/feed", "en", ["tech", "hardware"]),
  rss("techpowerup", "TechPowerUp", "https://www.techpowerup.com/rss/news", "en", ["tech", "hardware"]),
  rss("kitguru", "KitGuru", "https://www.kitguru.net/feed/", "en", ["tech", "hardware"]),
  rss("interestingengineering", "Interesting Engineering", "https://interestingengineering.com/feed", "en", [
    "tech",
  ]),
  rss("hackernoon", "HackerNoon", "https://hackernoon.com/feed", "en", ["tech", "dev"], 0.6),

  // Science
  rss("popsci", "Popular Science", "https://www.popsci.com/feed/", "en", ["science"]),
  rss("popularmechanics", "Popular Mechanics", "https://www.popularmechanics.com/rss/all.xml/", "en", [
    "science",
  ]),
  rss("sciam", "Scientific American", "http://rss.sciam.com/ScientificAmerican-Global", "en", ["science"]),
  rss(
    "newscientist",
    "New Scientist",
    [
      "https://www.newscientist.com/feed/home/",
      { url: "https://www.newscientist.com/subject/technology/feed/", tags: ["tech"] },
    ],
    "en",
    ["science"],
  ),
  rss("nature", "Nature News", "https://www.nature.com/nature.rss", "en", ["science", "research"]),
  rss("quanta", "Quanta Magazine", "https://www.quantamagazine.org/feed/", "en", ["science"]),
  rss(
    "sciencex",
    "Phys.org & TechXplore",
    [
      { url: "https://techxplore.com/rss-feed/", tags: ["tech"] },
      { url: "https://phys.org/rss-feed/technology-news/", tags: ["tech"] },
    ],
    "en",
    ["science", "research"],
  ),
  rss(
    "sciencedaily",
    "ScienceDaily (tech, computing)",
    [
      "https://www.sciencedaily.com/rss/top/technology.xml",
      "https://www.sciencedaily.com/rss/computers_math.xml",
    ],
    "en",
    ["science", "research"],
  ),
  rss(
    "conversation-tech",
    "The Conversation (technology)",
    "https://theconversation.com/us/technology/articles.atom",
    "en",
    ["tech"],
  ),
  rss("singularityhub", "Singularity Hub", "https://singularityhub.com/feed/", "en", ["tech", "science"]),

  // Space
  rss("nasa", "NASA News", "https://www.nasa.gov/news-release/feed/", "en", ["space", "official", "nasa"]),
  rss("nasaspaceflight", "NASASpaceflight", "https://www.nasaspaceflight.com/feed/", "en", ["space"]),
  rss("spaceflightnow", "Spaceflight Now", "https://spaceflightnow.com/feed/", "en", ["space"]),
  rss("universetoday", "Universe Today", "https://www.universetoday.com/feed/", "en", ["space", "science"]),

  // Robotics, EVs, cars
  rss("robohub", "Robohub", "https://robohub.org/feed/", "en", ["tech", "robotics"]),
  rss("cleantechnica", "CleanTechnica", "https://cleantechnica.com/feed/", "en", [
    "tech",
    "electric vehicles",
  ]),
  rss("electrive", "Electrive", "https://www.electrive.com/feed/", "en", ["tech", "electric vehicles"]),
  rss("teslarati", "Teslarati", "https://www.teslarati.com/feed/", "en", ["tech", "tesla"]),
  rss("thedrive", "The Drive", "https://www.thedrive.com/feed", "en", ["automotive"], 0.6),
  rss("autoblog", "Autoblog", "https://www.autoblog.com/rss.xml", "en", ["automotive"], 0.6),
  rss("motor1", "Motor1", "https://www.motor1.com/rss/news/all/", "en", ["automotive"], 0.6),

  // Gaming (the Gaming category counts as tech)
  rss("ign", "IGN", "https://feeds.ign.com/ign/all", "en", ["gaming"]),
  rss("gamespot", "GameSpot", "https://www.gamespot.com/feeds/news/", "en", ["gaming"]),
  rss("polygon", "Polygon", "https://www.polygon.com/rss/index.xml", "en", ["gaming"]),
  rss("kotaku", "Kotaku", "https://kotaku.com/rss", "en", ["gaming"]),
  rss("eurogamer", "Eurogamer", "https://www.eurogamer.net/feed", "en", ["gaming"]),
  rss("pcgamer", "PC Gamer", "https://www.pcgamer.com/rss/", "en", ["gaming"]),
  rss("rps", "Rock Paper Shotgun", "https://www.rockpapershotgun.com/feed", "en", ["gaming"]),
  rss("vgc", "VGC", "https://www.videogameschronicle.com/feed/", "en", ["gaming"]),
  rss("thegamer", "TheGamer", "https://www.thegamer.com/feed/", "en", ["gaming"], 0.8),
  rss("gamesindustry", "GamesIndustry.biz", "https://www.gamesindustry.biz/feed", "en", [
    "gaming",
    "business",
  ]),
  rss("gamedeveloper", "Game Developer", "https://www.gamedeveloper.com/rss.xml", "en", ["gaming", "dev"]),
  rss(
    "hookshot",
    "Nintendo Life, Push Square, Pure Xbox",
    [
      { url: "https://www.nintendolife.com/feeds/latest", tags: ["nintendo"] },
      { url: "https://www.pushsquare.com/feeds/latest", tags: ["playstation"] },
      { url: "https://www.purexbox.com/feeds/latest", tags: ["xbox"] },
    ],
    "en",
    ["gaming"],
    0.8,
  ),

  // Crypto (own category; not in "Tech only" unless it's also tech)
  rss("coindesk", "CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/", "en", ["crypto"]),
  rss("cointelegraph", "Cointelegraph", "https://cointelegraph.com/rss", "en", ["crypto"]),
  rss("decrypt", "Decrypt", "https://decrypt.co/feed", "en", ["crypto"]),
  rss("theblock", "The Block", "https://www.theblock.co/rss.xml", "en", ["crypto"]),
  rss("bitcoinmagazine", "Bitcoin Magazine", "https://bitcoinmagazine.com/feed", "en", ["crypto", "bitcoin"]),

  // AI newsletters and research
  rss("latentspace", "Latent Space", "https://www.latent.space/feed", "en", ["ai"]),
  rss("mitnews-ai", "MIT News (AI)", "https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml", "en", [
    "ai",
    "research",
  ]),
  rss("aibusiness", "AI Business", "https://aibusiness.com/rss.xml", "en", ["ai"]),
  rss("thesequence", "TheSequence", "https://thesequence.substack.com/feed", "en", ["ai"]),
  rss("exponentialview", "Exponential View", "https://www.exponentialview.co/feed", "en", ["ai"]),
  rss("semianalysis", "SemiAnalysis", "https://newsletter.semianalysis.com/feed", "en", [
    "ai",
    "semiconductors",
  ]),
  rss("understandingai", "Understanding AI", "https://www.understandingai.org/feed", "en", ["ai"]),
  rss("zvi", "Don't Worry About the Vase", "https://thezvi.substack.com/feed", "en", ["ai"], 0.6),
  rss("algorithmicbridge", "The Algorithmic Bridge", "https://www.thealgorithmicbridge.com/feed", "en", [
    "ai",
  ]),
  rss("aiweekly", "AI Weekly", "https://aiweekly.co/issues.rss", "en", ["ai"]),

  // More official company blogs
  rss("amd", "AMD (press releases)", "https://ir.amd.com/news-events/press-releases/rss", "en", [
    "tech",
    "official",
    "amd",
  ]),
  rss("arm", "Arm Newsroom", "https://newsroom.arm.com/rss", "en", ["tech", "official", "arm"]),
  rss("databricks", "Databricks", "https://www.databricks.com/feed", "en", ["ai", "official", "databricks"]),
  rss("snowflake", "Snowflake", "https://www.snowflake.com/feed/", "en", ["tech", "official", "snowflake"]),
  rss("together", "Together AI", "https://www.together.ai/blog/rss.xml", "en", [
    "ai",
    "official",
    "together ai",
  ]),
  rss("waymo", "Waymo", "https://waymo.com/blog/rss.xml", "en", [
    "tech",
    "official",
    "waymo",
    "autonomous vehicles",
  ]),
  rss("figma", "Figma", "https://www.figma.com/blog/feed/atom.xml", "en", ["tech", "official", "figma"]),
  rss(
    "eng-blogs",
    "Engineering blogs (Airbnb, Pinterest)",
    [
      { url: "https://medium.com/feed/airbnb-engineering", tags: ["airbnb"] },
      { url: "https://medium.com/feed/pinterest-engineering", tags: ["pinterest"] },
    ],
    "en",
    ["tech", "official", "dev"],
  ),
  rss("brave", "Brave", "https://brave.com/blog/index.xml", "en", ["tech", "official", "brave"]),

  // Developers: languages, tools, newsletters
  rss("stackoverflow", "Stack Overflow Blog", "https://stackoverflow.blog/feed/", "en", ["tech", "dev"]),
  rss("jetbrains", "JetBrains Blog", "https://blog.jetbrains.com/feed/", "en", ["tech", "dev"]),
  rss(
    "lang-releases",
    "Python, Rust, Go, Node.js, Bun",
    [
      { url: "https://blog.python.org/feeds/posts/default", tags: ["python"] },
      { url: "https://blog.rust-lang.org/feed.xml", tags: ["rust"] },
      { url: "https://go.dev/blog/feed.atom", tags: ["go"] },
      { url: "https://nodejs.org/en/feed/blog.xml", tags: ["node"] },
      { url: "https://bun.sh/rss.xml", tags: ["bun"] },
    ],
    "en",
    ["tech", "dev", "official"],
  ),
  rss("pragmaticengineer", "The Pragmatic Engineer", "https://newsletter.pragmaticengineer.com/feed", "en", [
    "tech",
    "dev",
  ]),
  rss("bytebytego", "ByteByteGo", "https://blog.bytebytego.com/feed", "en", ["tech", "dev"]),
  rss("martinfowler", "Martin Fowler", "https://martinfowler.com/feed.atom", "en", ["tech", "dev"]),
  rss("freecodecamp", "freeCodeCamp", "https://www.freecodecamp.org/news/rss/", "en", ["tech", "dev"], 0.6),
  rss("smashing", "Smashing Magazine", "https://www.smashingmagazine.com/feed/", "en", ["tech", "dev"]),
  rss("csstricks", "CSS-Tricks", "https://css-tricks.com/feed/", "en", ["tech", "dev"]),

  // Security
  rss("helpnetsecurity", "Help Net Security", "https://www.helpnetsecurity.com/feed/", "en", [
    "tech",
    "security",
  ]),
  rss("cyberscoop", "CyberScoop", "https://cyberscoop.com/feed/", "en", ["tech", "security"]),
  rss("schneier", "Schneier on Security", "https://www.schneier.com/feed/atom/", "en", ["tech", "security"]),
  rss("riskybiz", "Risky Business News", "https://news.risky.biz/rss/", "en", ["tech", "security"]),
  rss("troyhunt", "Troy Hunt", "https://www.troyhunt.com/rss/", "en", ["tech", "security"]),
  rss("grahamcluley", "Graham Cluley", "https://grahamcluley.com/feed/", "en", ["tech", "security"]),
  rss("cisa", "CISA Advisories", "https://www.cisa.gov/cybersecurity-advisories/all.xml", "en", [
    "tech",
    "security",
    "official",
  ]),

  // Startups (global)
  rss("ycombinator", "Y Combinator Blog", "https://www.ycombinator.com/blog/rss/", "en", [
    "tech",
    "startups",
  ]),
  rss("eu-startups", "EU-Startups", "https://www.eu-startups.com/feed/", "en", [
    "tech",
    "startups",
    "europe",
  ]),
  rss("techcabal", "TechCabal", "https://techcabal.com/feed/", "en", ["tech", "startups", "africa"]),
  rss("e27", "e27", "https://e27.co/feed/", "en", ["tech", "startups", "asia"]),
  rss("yourstory", "YourStory", "https://yourstory.com/feed", "en", ["tech", "startups", "india"]),

  // More Turkish
  rss(
    "haberler-teknoloji",
    "Haberler.com Teknoloji",
    "https://rss.haberler.com/RssNew.aspx?kategori=teknoloji",
    "tr",
    ["tech", "turkey"],
  ),
  rss("yenisafak-teknoloji", "Yeni Şafak Teknoloji", "https://www.yenisafak.com/rss?xml=teknoloji", "tr", [
    "tech",
    "turkey",
  ]),
  rss("star-teknoloji", "Star Teknoloji", "https://www.star.com.tr/rss/teknoloji.xml", "tr", [
    "tech",
    "turkey",
  ]),
  rss(
    "euronews-tr-next",
    "Euronews Türkçe (Bilim-Teknoloji)",
    "https://tr.euronews.com/rss?level=vertical&name=next",
    "tr",
    ["tech", "turkey"],
  ),
  rss("teknotalk", "TeknoTalk", "https://www.teknotalk.com/feed/", "tr", ["tech", "turkey"]),
  rss("bloomberght", "Bloomberg HT", "https://www.bloomberght.com/rss", "tr", ["turkey", "business"], 0.5),
  rss("gamer-tr", "Gamer.com.tr", "https://www.gamer.com.tr/feed/", "tr", ["gaming", "turkey"]),
  rss("merlininkazani", "Merlin'in Kazanı", "https://www.merlininkazani.com/rss", "tr", ["gaming", "turkey"]),

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

/**
 * Sources that were merged into another source (same publisher) or removed. `db:seed`/`db:reseed`
 * switch them off, so an existing database doesn't keep fetching (and double counting) them.
 */
export const retiredSourceKeys = [
  "rss-deepmind",
  "rss-google-research",
  "rss-google-cloud",
  "rss-android-dev",
  "rss-microsoft-more",
  "rss-meta-eng",
  "rss-apple-dev",
  "rss-nvidia-dev",
  "rss-aws-ml",
  "rss-amazon-news",
  "rss-techcrunch-ai",
  "rss-theverge-ai",
  "rss-arstechnica-ai",
  "rss-wired-ai",
];
