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
  maxItemsPerFeed = 30,
): SourceSeed => ({
  key: `rss-${key}`,
  name,
  type: "rss",
  weight,
  config: {
    feeds: (Array.isArray(url) ? url : [url]).map((u) => ({ url: u, lang })),
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
  rss("shiftdelete", "ShiftDelete.Net", "https://shiftdelete.net/feed", "tr", ["tech", "turkey"]),
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
  rss("ieee-spectrum", "IEEE Spectrum", "https://spectrum.ieee.org/feeds/feed.rss", "en", ["tech"]),
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
  rss(
    "techcrunch-ai",
    "TechCrunch AI",
    "https://techcrunch.com/category/artificial-intelligence/feed/",
    "en",
    ["ai"],
  ),

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
  rss("wired-ai", "Wired AI", "https://www.wired.com/feed/tag/ai/latest/rss", "en", ["ai"]),
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
  rss("google-cloud", "Google Cloud Blog", "https://cloudblog.withgoogle.com/rss/", "en", [
    "tech",
    "official",
    "google",
  ]),
  rss(
    "android-dev",
    "Android Developers Blog",
    "https://android-developers.googleblog.com/feeds/posts/default",
    "en",
    ["tech", "official", "google", "dev"],
  ),
  rss(
    "microsoft-more",
    "Microsoft (Research, Windows, Azure, DevBlogs)",
    [
      "https://www.microsoft.com/en-us/research/feed/",
      "https://blogs.windows.com/feed/",
      "https://azure.microsoft.com/en-us/blog/feed/",
      "https://devblogs.microsoft.com/feed/",
    ],
    "en",
    ["tech", "official", "microsoft"],
  ),
  rss("meta-eng", "Meta Engineering", "https://engineering.fb.com/feed/", "en", [
    "tech",
    "official",
    "meta",
    "dev",
  ]),
  rss("amazon-news", "Amazon News", "https://www.aboutamazon.com/news/rss", "en", [
    "tech",
    "official",
    "amazon",
  ]),
  rss(
    "apple-dev",
    "Apple (Developer News, Machine Learning)",
    ["https://developer.apple.com/news/rss/news.rss", "https://machinelearning.apple.com/rss.xml"],
    "en",
    ["tech", "official", "apple"],
  ),
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
