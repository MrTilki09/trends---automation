import { normalizeTitle } from "./normalize";

/*
 * Rule-based categorizer: gives every topic one main category without needing an LLM.
 *
 * Each category has keywords in English and Turkish, written in *normalized* form
 * (lowercase, no accents: "yapay zeka", "girisim"). A keyword ending in "*" is a prefix,
 * which handles Turkish suffixes: "oyun*" matches "oyunlari", "girisim*" matches "girisimleri".
 *
 * Signals are weighted: a feed/source tag counts most, then the title, then the summary.
 * The best-scoring category wins; below MIN_SCORE the topic stays uncategorized.
 * To tune: edit CATEGORY_RULES (and add a test in tests/classify.test.ts).
 */

export const CATEGORY_RULES: Record<string, string[]> = {
  AI: [
    "ai",
    "artificial intelligence",
    "yapay zeka*",
    "llm*",
    "chatgpt",
    "openai",
    "anthropic",
    "claude",
    "gemini",
    "deepseek",
    "mistral",
    "copilot",
    "gpt",
    "machine learning",
    "makine ogrenmesi",
    "neural",
    "ai agents",
    "agents",
    "agentic",
    "genai",
    "generative ai",
    "hugging face",
    "transformer*",
    "kisisel zeka",
    "llama",
    "qwen",
    "grok",
    "robot*",
    "robotik*",
    "ajan",
    "ajani",
    "ajanlar*",
    "benchmark*",
  ],
  Startups: [
    "startup*",
    "girisim*",
    "funding",
    "raises",
    "raised",
    "yatirim*",
    "venture*",
    "vc",
    "seed round",
    "series a",
    "series b",
    "series c",
    "acquisition",
    "acquires",
    "acquired",
    "satin al*",
    "unicorn",
    "ipo",
    "valuation",
    "degerleme",
    "founder*",
    "kurucu*",
    "accelerator",
    "y combinator",
    "launch hn",
    "acquire",
  ],
  Mobile: [
    "iphone",
    "android",
    "smartphone*",
    "akilli telefon*",
    "galaxy",
    "ios",
    "app store",
    "google play",
    "mobil",
    "mobile",
    "pixel",
    "apps",
    "uygulama*",
    "telefon*",
    "xiaomi",
    "huawei",
    "oneplus",
    "ipad",
    "android auto",
    "apple watch",
    "wearable*",
  ],
  Hardware: [
    "chip*",
    "gpu*",
    "cpu*",
    "nvidia",
    "amd",
    "intel",
    "processor*",
    "islemci*",
    "ekran karti*",
    "donanim*",
    "hardware",
    "semiconductor*",
    "laptop*",
    "radeon",
    "geforce",
    "rtx",
    "tsmc",
    "arm",
    "pc",
    "dram",
    "ssd",
    "anakart*",
    "arduino",
    "cip",
    "cipler*",
    "cipi",
    "cipset*",
    "raspberry pi",
    "risc v",
  ],
  Gaming: [
    "game",
    "games",
    "gaming",
    "oyun*",
    "playstation",
    "ps5",
    "xbox",
    "nintendo",
    "switch 2",
    "steam",
    "esports",
    "espor*",
    "gta",
    "valve",
    "epic games",
    "twitch",
  ],
  Security: [
    "security",
    "guvenlik*",
    "hack*",
    "breach*",
    "vulnerability",
    "vulnerabilities",
    "malware",
    "ransomware",
    "privacy",
    "gizlilik*",
    "cyber*",
    "siber*",
    "exploit*",
    "surveillance",
    "phishing",
    "zero day",
    "cve",
    "veri sizinti*",
    "dolandirici*",
    "spyware",
    "encryption",
    "sifreleme",
  ],
  Software: [
    "linux",
    "open source",
    "acik kaynak",
    "programming",
    "developer*",
    "github",
    "javascript",
    "typescript",
    "python",
    "rust",
    "kernel",
    "software",
    "yazilim*",
    "api",
    "database",
    "postgres*",
    "compiler",
    "show hn",
    "framework",
    "windows",
    "macos",
    "openbsd",
    "freebsd",
    "nixos",
    "unix",
    "emulator*",
    "browser",
    "chrome",
    "firefox",
    "cloud",
    "bulut",
    "devops",
    "kubernetes",
    "docker",
  ],
  "Science & Space": [
    "science",
    "bilim*",
    "space",
    "uzay*",
    "nasa",
    "spacex",
    "physics",
    "fizik",
    "research*",
    "arastirma*",
    "climate",
    "iklim*",
    "satellite*",
    "uydu*",
    "biology",
    "math",
    "mathematics",
    "matematik",
    "astronom*",
    "rocket",
    "roket*",
    "mars",
    "moon",
    "ay gorevi",
    "quantum",
    "kuantum",
    "dinosaur*",
    "fossil*",
    "populer bilim",
    "solar",
    "energy",
    "enerji*",
    "nuclear",
    "nukleer*",
  ],
  "Auto & EV": [
    "electric vehicle*",
    "tesla",
    "otomobil*",
    "elektrikli*",
    "car",
    "cars",
    "autonomous",
    "otonom",
    "togg",
    "battery",
    "batarya*",
    "self driving",
    "waymo",
    "rivian",
    "byd",
    "otomotiv*",
    "sarj*",
    "opel",
    "renault",
    "fiat",
    "tofas",
    "toyota",
    "bmw",
    "mercedes",
    "volkswagen",
    "hyundai",
    "ford",
    "honda",
    "audi",
    "volvo",
    "porsche",
    "chery",
    "suv",
    "sedan",
    "hatchback",
  ],
  Business: [
    "economy",
    "ekonomi*",
    "market*",
    "borsa*",
    "stock*",
    "inflation",
    "enflasyon*",
    "dolar",
    "euro",
    "earnings",
    "revenue",
    "gelir*",
    "layoff*",
    "isten cikar*",
    "merkez bankasi",
    "faiz*",
    "is dunyasi",
    "tariff*",
    "gumruk*",
    "economic*",
    "odeme*",
    "payment*",
    "banka*",
    "bank",
    "bankasi",
    "profit",
    "zarar",
    "sirket*",
    "ceo",
    "antitrust",
    "bitcoin",
    "crypto*",
    "kripto*",
    "blockchain",
    "fintech",
    "e ticaret",
    "e commerce",
    "retail",
  ],
  "Social & Media": [
    "twitter",
    "meta",
    "facebook",
    "instagram",
    "tiktok",
    "youtube",
    "social media",
    "sosyal medya",
    "whatsapp",
    "threads",
    "bluesky",
    "reddit",
    "influencer*",
    "podcast*",
    "streaming",
    "spotify",
    "creator*",
    "icerik ureticisi",
  ],
  Politics: [
    "election*",
    "secim*",
    "government",
    "hukumet*",
    "regulation*",
    "regulat*",
    "law",
    "yasa*",
    "kanun*",
    "court",
    "mahkeme*",
    "president",
    "cumhurbaskani*",
    "parliament",
    "meclis*",
    "policy",
    "eu",
    "avrupa birligi",
    "ban",
    "yasak*",
    "minister*",
    "bakan*",
    "chp",
    "akp",
    "mhp",
    "trump",
    "congress",
    "senate",
    "ftc",
    "doj",
    "lawsuit",
    "dava*",
    "immigration",
    "goc*",
    "police",
    "polis*",
    "war",
    "savas*",
    "gozalti*",
    "tutuklan*",
    "belediye*",
    "operasyon*",
    "basbakan*",
    "prime minister",
    "savci*",
    "prosecutor*",
    "nato",
    "ukraine",
    "ukrayna",
    "israel",
    "israil",
    "gaza",
    "gazze",
  ],
  Sports: [
    "football",
    "futbol*",
    "soccer",
    "match",
    "maci",
    "macin*",
    "maclar*",
    "league",
    "lig",
    "ligi",
    "liginde",
    "fk",
    "sk",
    "spor",
    "spor*",
    "galatasaray",
    "fenerbahce",
    "besiktas",
    "trabzonspor",
    "nba",
    "nfl",
    "uefa",
    "fifa",
    "transfer*",
    "goal",
    "gol",
    "golu",
    "golunu",
    "basketbol*",
    "voleybol*",
    "tennis",
    "tenis",
    "formula 1",
    "f1",
    "olimpiyat*",
    "olympic*",
    "champions league",
    "sampiyonlar ligi",
    "super lig",
    "milli takim*",
  ],
  Entertainment: [
    "film*",
    "movie*",
    "dizi*",
    "music",
    "muzik*",
    "album*",
    "celebrity",
    "unlu*",
    "actor",
    "actress",
    "oyuncu*",
    "concert",
    "konser*",
    "netflix",
    "disney",
    "hbo",
    "marvel",
    "box office",
    "gise*",
    "oscar*",
    "grammy*",
    "sarkici*",
    "singer",
    "tv",
    "televizyon*",
    "yarisma*",
    "anime",
  ],
  "Aviation & Defense": [
    "airbus",
    "boeing",
    "aviation",
    "havacilik*",
    "ucak*",
    "airline*",
    "havayolu*",
    "thy",
    "defense",
    "defence",
    "savunma*",
    "hurjet",
    "kaan",
    "baykar",
    "tb2",
    "drone*",
    "iha",
    "siha",
    "fuze*",
    "missile*",
    "aselsan",
    "tusas",
  ],
  Health: [
    "health",
    "saglik*",
    "medical",
    "tibbi",
    "cancer",
    "kanser*",
    "vaccine*",
    "asi",
    "asilar*",
    "hospital*",
    "hastane*",
    "disease*",
    "hastalik*",
    "biotech*",
    "drug*",
    "ilac*",
    "fda",
    "virus*",
    "covid",
    "doktor*",
    "doctor*",
    "epidemic",
    "salgin*",
    "mental health",
    "obesity",
    "obezite",
  ],
};

const WEIGHT_TAG = 2;
const WEIGHT_TITLE = 1.5;
const WEIGHT_SUMMARY = 0.5;
const MIN_SCORE = 1; // one title keyword (1.125) is enough; one summary keyword (0.375) is not

type Matcher = { category: string; exact: Set<string>; phrases: string[]; prefixes: string[] };

const MATCHERS: Matcher[] = Object.entries(CATEGORY_RULES).map(([category, keywords]) => {
  const exact = new Set<string>();
  const phrases: string[] = [];
  const prefixes: string[] = [];
  for (const kw of keywords) {
    if (kw.endsWith("*")) prefixes.push(` ${kw.slice(0, -1)}`);
    else if (kw.includes(" ")) phrases.push(` ${kw} `);
    else exact.add(kw);
  }
  return { category, exact, phrases, prefixes };
});

/** How many keywords of each category appear in an already-normalized text. */
function matchCounts(normalized: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!normalized) return counts;
  const padded = ` ${normalized} `;
  const words = new Set(normalized.split(" "));
  for (const m of MATCHERS) {
    let n = 0;
    for (const w of words) if (m.exact.has(w)) n++;
    for (const p of m.phrases) if (padded.includes(p)) n++;
    for (const p of m.prefixes) if (padded.includes(p)) n++;
    if (n > 0) counts.set(m.category, n);
  }
  return counts;
}

export type ClassifyInput = {
  /** Normalized titles of the topic's items. */
  titles: string[];
  /** Normalized tags of the topic's items. */
  tags: string[];
  summaries?: string[];
};

/** Returns the best category and the per-category scores (for debugging/tuning). */
export function classify(input: ClassifyInput): { category: string | null; scores: Record<string, number> } {
  const scores: Record<string, number> = {};
  const add = (texts: string[], weight: number) => {
    for (const t of texts) {
      // Each text contributes at most `weight` per category, so long texts don't dominate.
      for (const [cat, n] of matchCounts(t))
        scores[cat] = (scores[cat] ?? 0) + weight * Math.min(n, 2) * 0.75;
    }
  };
  add(input.tags, WEIGHT_TAG);
  add(input.titles, WEIGHT_TITLE);
  add(
    (input.summaries ?? []).map((s) => normalizeTitle(s)),
    WEIGHT_SUMMARY,
  );

  let best: string | null = null;
  let bestScore = 0;
  for (const [cat, s] of Object.entries(scores)) {
    if (s > bestScore) {
      best = cat;
      bestScore = s;
    }
  }
  return { category: bestScore >= MIN_SCORE ? best : null, scores };
}

export const CATEGORIES = Object.keys(CATEGORY_RULES);

// Feed categories that carry no information.
const NOISE_TAGS = new Set([
  "genel",
  "haberler",
  "haber",
  "news",
  "uncategorized",
  "featured",
  "top stories",
  "general",
  "diger",
  "other",
  "blog",
  "manset",
  "gundem",
  "son dakika",
  "one cikanlar",
  "popular",
  "home",
]);

/** Normalizes raw tags (feed categories + source tags): folded lowercase, de-duplicated, noise removed. */
export function normalizeTags(raw: (string | null | undefined)[], max = 15): string[] {
  const out: string[] = [];
  for (const t of raw) {
    if (!t) continue;
    const n = normalizeTitle(t);
    if (!n || n.length > 40 || NOISE_TAGS.has(n) || out.includes(n)) continue;
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** Most frequent values first (ties keep first-seen order). */
export function topByFrequency(values: string[], max: number): string[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([v]) => v);
}
