# Trend Pool

**A personal tech-news radar that finds what's trending in AI and tech, ranks it, and helps turn it into
social media posts, with you approving every step.**

Trend Pool watches ~45 news sources, company newsrooms and trend feeds three times a day, merges the same story
from different sites into one topic, and ranks the topics so the important launches and announcements float to
the top. You pick the stories worth talking about, and it drafts posts for X, LinkedIn or a blog, plus image
prompts for an Instagram carousel, in English or Turkish.

---

## The goal

Posting about tech and AI consistently means opening dozens of sites every day, spotting which stories actually
matter, checking whether a story is big or just noise, and then writing about it. That's hours of repetitive
work before the creative part even starts.

**Trend Pool automates the legwork and keeps the judgment with you:**

| Step          | What happens                                                                                                                                                                                             | Status                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **1. Watch**  | Collect what's new from ~45 sources on a schedule: official newsrooms (OpenAI, Google, Apple, NVIDIA, Microsoft…), tech and AI news sites, Hacker News, Product Hunt, Google Trends, Turkish tech media. | ✅ Live                                                |
| **2. Sort**   | Remove duplicates, group the same story from different sites into one topic, give it a category (AI, Hardware, Mobile…), tags and a publish date, and rank it.                                           | ✅ Live                                                |
| **3. Write**  | Turn chosen topics into post drafts (X, LinkedIn, blog intro) and Instagram carousel image prompts, in English or Turkish, grounded in the actual articles.                                              | 🟡 Working (with your free NVIDIA API key)             |
| **4. Decide** | Review the pool, shortlist or ignore topics, keep your own Saved list, edit and approve drafts.                                                                                                          | 🟡 Shortlist + Saved work; draft approval flow is next |
| **5. Share**  | Publish approved posts to social platforms.                                                                                                                                                              | ⏳ Planned (copy-paste for now)                        |

Nothing is ever posted automatically. Trend Pool prepares; you decide.

## What makes it useful

- **Signal over noise.** A story covered by TechCrunch, The Verge and Hacker News at the same time is one topic
  marked "×3", and it ranks higher. Launches and official announcements get a boost; old articles fade out.
- **Built for tech.** The default _Tech only_ view hides politics, sports and celebrity news. Quick views jump
  to AI, Launches, Official newsrooms, Show HN, Hardware, Mobile, Security, Startups or Türkiye.
- **Fresh first.** Every topic has its real publish date: sort by newest, or filter to the last 6 hours, 24
  hours, 3 days, a week or a month.
- **Explainable ranking.** Open any topic to see exactly why it scored what it did: engagement, number of
  sources, keyword and launch boosts, and how much it has aged.
- **Bilingual.** Turkish and English sources, Turkish-aware text matching (İ/ı, ş, ğ…), posts in either
  language.
- **Yours.** Runs on your own server in Docker, uses free public feeds and your own keys, and exposes a
  JSON API so other tools can use the pool.

## A quick tour

| Page         | What you do there                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pool**     | The ranked list of topics. Sort, filter by date, category, tag, language or source; shortlist or ignore; save to your list. Every view has a copyable API URL. |
| **Topic**    | One story with all its articles from every source, its score breakdown, tags and summary.                                                                      |
| **Saved**    | Your personal shortlist. Tick topics, choose a format and language, and generate posts and carousel prompts.                                                   |
| **Runs**     | Every collection run: when it ran, what each source returned, and any errors.                                                                                  |
| **Sources**  | Turn sources on and off and see when each last worked.                                                                                                         |
| **API keys** | Create keys for the `/api/topics` JSON API.                                                                                                                    |

## How it works

```
   ~45 sources                     your server (Docker)                          you
 ─────────────────     ┌───────────────────────────────────────────┐     ─────────────────
 Company newsrooms     │  worker                                   │
 Tech & AI news   ───▶ │   collect → de-dupe → group into topics   │
 Hacker News, PH       │   → categorize & tag → rank   (3× a day)  │
 Google Trends         │                  │                        │
 Turkish tech media    │                  ▼                        │
                       │            Postgres database              │
                       │                  │                        │
                       │                  ▼                        │     browse, filter,
                       │  web dashboard + JSON API  ◀──────────────┼──── shortlist, save,
                       │   └ post drafts via your NVIDIA key       │     generate posts
                       └───────────────────────────────────────────┘
```

- The **worker** does all collection in the background, on a schedule or when you press **Run now**.
- The **web** dashboard only reads data and queues jobs, so it stays fast.
- One failing source never breaks a run. You see the error on the Runs page, and everything else still comes in.

Built with TypeScript, Next.js, PostgreSQL and Docker. All business logic lives in `lib/`.

## Quick start

You need [Docker](https://docs.docker.com/get-docker/) and git.

```bash
git clone <your-repo-url> trend-pool && cd trend-pool
cp .env.example .env        # set a real POSTGRES_PASSWORD (same one in DATABASE_URL)
docker compose up -d --build
```

Open <http://localhost:3000> and press **Run now**. About 15 seconds later, the pool fills with today's topics.
Full setup, server deployment and login are in [section 1](#1-setup-from-zero-any-machine-with-docker) and
[section 6](#6-deploy-to-a-linux-server).

## Roadmap

| Next                    | What it adds                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Draft review & approval | Edit, approve or reject generated drafts in the dashboard.                                               |
| Publishing              | Post approved drafts to LinkedIn, X or Instagram (platform APIs or a self-hosted scheduler like Postiz). |
| Mobile approval         | A Telegram bot that sends drafts with Approve / Reject buttons.                                          |
| More sources            | Reddit (two adapters ready, waiting on access), YouTube trending.                                        |
| Multi-user              | Accounts already exist; per-user sources and billing would make it a product.                            |

## Principles

- **Human in the loop.** Nothing is published without your approval.
- **Only official channels.** Public APIs and RSS feeds, no scraping of sites whose terms forbid it.
- **Explainable, tunable rules.** Scoring weights and category keywords are plain code you can read and change.
- **Every failure is visible.** Errors show up on the Runs page and in the logs, never silently swallowed.
- **Cheap to run.** Free sources, one small server, your own API keys.

---

## Documentation

1. [Setup from zero](#1-setup-from-zero-any-machine-with-docker)
2. [Dev workflow](#2-dev-workflow)
3. [How a run works](#3-how-a-run-works), including scoring, dates, categories, tags and filters
4. [Sources](#4-sources): the full list, adding a source, Reddit
5. [Optional: Claude enrichment](#5-optional-claude-enrichment) ·
   [API](#5b-api) ·
   [Saved topics and post generation](#5c-saved-topics-and-post-generation-nvidia) ·
   [Accounts](#5d-accounts-sign-up-with-email-confirmation)
6. [Deploy to a Linux server](#6-deploy-to-a-linux-server): login, HTTPS, backups
7. [Configuration (`.env`)](#7-configuration-env)
8. [Verifying each milestone](#8-verifying-each-milestone)
9. [Decisions](#9-decisions)
10. [Project layout](#10-project-layout)

---

## 1. Setup from zero (any machine with Docker)

You need **Docker** with Compose v2 (Docker Desktop on Windows/macOS, Docker Engine on Linux) and **git**.

```bash
git clone <your-repo-url> trend-pool
cd trend-pool
cp .env.example .env
# Edit .env: at minimum set a real POSTGRES_PASSWORD and put the SAME password in DATABASE_URL.
docker compose up -d --build
```

Open <http://localhost:3000> (on the machine running Docker no login is needed; see §6 for the login). The pool is empty until the first run: press **Run now** (top right).
After ~10–20 s the page refreshes and shows ranked topics.

Useful commands:

```bash
docker compose ps                     # what's running
docker compose logs -f worker         # follow worker logs (JSON)
docker compose down                   # stop (data is kept in the `pgdata` volume)
docker compose down -v                # stop AND DELETE the database
```

## 2. Dev workflow

```bash
npm install            # on the host: editor support, tests, drizzle-kit
npm run dev            # = docker compose -f compose.yaml -f compose.dev.yaml up --build
```

In dev, the code is bind-mounted: `web` runs `next dev` and `worker` runs `tsx watch`, so edits reload
automatically. Postgres is also exposed on `127.0.0.1:5432` for DB tools.

| Script                                  | What it does                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev` / `npm run dev:down`      | start / stop the dev stack                                                                                                                                   |
| `npm test`                              | unit tests (vitest; never touch the network — they use `tests/fixtures`)                                                                                     |
| `npm run lint`, `npm run typecheck`     | ESLint, TypeScript                                                                                                                                           |
| `npm run logs`                          | follow logs of the dev stack                                                                                                                                 |
| `npm run migrate`                       | run migrations + seed in the dev stack                                                                                                                       |
| `npm run db:generate`                   | after changing `lib/db/schema.ts`: create a new SQL migration                                                                                                |
| `npm run db:studio`                     | Drizzle Studio (browse the DB; dev stack must be running)                                                                                                    |
| `npm run db:reindex`                    | recompute dates, tags, language, category and scores for all topics (after changing rules)                                                                   |
| `npm run db:seed` / `npm run db:reseed` | add missing sources / also overwrite existing ones from the seed file (from the host, set `DATABASE_URL=postgres://trendpool:<pw>@localhost:5432/trendpool`) |

## 3. How a run works

`worker/jobs/collect.ts`, one run at a time (Postgres advisory lock):

1. **Collect** every enabled source (max 3 in parallel, 30 s timeout each, 2 retries on network/5xx).
   A failing source is recorded and skipped — the run becomes `partial`, never `failed` unless _all_ fail.
2. **Normalize + de-dupe**: canonical URL (no `utm_*`/`fbclid`/…, no `www.`, no trailing slash) and normalized
   title (Turkish-aware lowercase, accents folded: `İSTANBUL'da IŞIK` → `istanbul da isik`). Items are unique per
   source; seeing an item again only refreshes its metrics. Each item also keeps its **publish date**,
   **language** and **tags** (everything the feed labels the article with, plus the source's configured tags; see
   below).
3. **Cluster** new items into topics: same canonical URL → same topic; otherwise title trigram similarity
   ≥ `CLUSTER_SIMILARITY_THRESHOLD` (0.55) with topics seen in the last 72 h; otherwise a new topic.
   Each topic gets its **publish date** (earliest article), top **tags**, **language** and a **category**.
4. **Score** recent topics (below).
5. **Optional LLM enrichment** (off by default).
6. **Finish**: status `succeeded` / `partial` / `failed` (+ `interrupted` if the worker was stopped mid-run).

Running it twice in a row never creates duplicates.

### Scoring

```
score = (engagement + cross_source_bonus + keyword_boost + launch_boost + llm_boost) × recency_decay
```

| Part               | Meaning                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| engagement         | the topic's best item: its percentile within its source (HN points, Google traffic…) × source weight. RSS has no engagement numbers, so RSS items get a flat 0.3 |
| cross_source_bonus | +0.3 per extra source, max +0.9                                                                                                                                  |
| keyword_boost      | +0.2 if the title/keywords contain one of `NICHE_KEYWORDS` (whole words)                                                                                         |
| launch_boost       | +0.2 if the topic is a launch / announcement (tag `launch`)                                                                                                      |
| llm_boost          | +0.5 × LLM relevance (only when enriched)                                                                                                                        |
| recency_decay      | halves every `SCORE_HALF_LIFE_HOURS` (24 h) since the story was **published** (so an old article we only just found doesn't count as fresh)                      |

The topic page in the dashboard shows each part. The weights live in `lib/pipeline/score.ts` (`DEFAULT_WEIGHTS`).

### Dates, categories, tags and filters

- **Published date**: every source provides one (HN post time, RSS `pubDate`, Google Trends start time).
  A topic's date is its earliest article. Future dates are clamped to "now".
- **Category**: one main category per topic from a keyword classifier (`lib/pipeline/classify.ts`), in
  English and Turkish: AI, Startups, Mobile, Hardware, Gaming, Security, Software, Science & Space, Auto & EV,
  Aviation & Defense, Business, Social & Media, Politics, Sports, Entertainment, Health. Feed tags count most,
  then the title, then the summary. Topics with no clear signal (e.g. a person's name from Google Trends) stay
  uncategorized; LLM enrichment (§5) can fill those in.
- **Tags**: everything a feed says about an article, from an inventory of ~520 feeds (Oct 2026):
  - RSS `<category>` and Atom `<category term>` (The Verge, ZDNet, CNET, Business Insider…), `dc:subject`,
    `media:keywords` (Wired), `media:category`, `news:keywords`, Neowin's hashtags, Hürriyet's `<subcategory>`,
    The Register's kicker ("EXCLUSIVE", "KETTLE"), arXiv subject codes;
  - flags: `sponsored`, `paid`, `affiliate links` (Future plc sites, CNBC), `video` / `shorts` (YouTube);
  - the **section in the article URL** for publishers whose feed has no tags (`wsj.com/tech/ai/…` → `tech`, `ai`;
    `darkreading.com/cloud-security/…`), only for links on the feed's own site, never dates or ids;
  - tags of a publisher's **section feed** (`{ url, tags: ["ai"] }` in the seed, e.g. The Verge AI feed);
  - tags set per source in `config/sources.seed.ts` (e.g. `turkey`, `startups`), plus `show hn`, `search trend`.

  Tags are then **normalized** (`normalizeTags` in `lib/pipeline/classify.ts`): folded to lowercase ASCII, synonyms
  merged across spellings and languages (`Artificial Intelligence`, `AI (artificial intelligence)`, `yapay zekâ`,
  `cs.AI` → `ai`; `Akıllı Telefon` → `smartphones`; `Bilim-Teknoloji` → `science` + `tech`), hierarchical labels
  split (`Security / National Security`), feed furniture dropped (`Latest news`, `Storytype: Standard`, the
  author's own name), and the company a tag is about added (`iPhone` → `apple`). Up to 30 tags per article and
  per topic (most common first). Engagement numbers some feeds carry are kept as metrics: comment counts
  (`slash:comments`, `thr:total`), YouTube views/likes, hnrss points.

- **Language**: `tr` / `en`, from the source.

In the **Pool**: sort by _Top score_ or _Newest first_; filter by _Published last 6h / 24h / 72h / 7d / 30d_,
status, category, tags, language, source and text. Clicking a category or `#tag` badge filters by it.

- **Tags box**: type any tag (suggestions list the 500 most common in view), several comma-separated for _all of
  them_, `-tag` to exclude: `apple, launch, -deals` = Apple launches that aren't deal posts. Any spelling works
  (`Yapay Zeka` finds `ai`). Same syntax in the API (`?tag=ai,-sponsored`).

- **Tech only** (default) hides politics, sports, celebrity and generic news. A topic counts as tech if its
  category is a tech one, or it has no non-tech category and comes from a tech source / is a launch.
  Switch to _Everything_ to see all. (Lists live in `lib/pipeline/classify.ts`: `TECH_CATEGORIES`, `TECH_TAGS`.)
- **Quick views** above the filters: AI, Launches, Official (company newsrooms), Show HN, Hardware, Mobile,
  Security, Startups, Türkiye.
- **Launches**: titles saying something was launched / announced / released / unveiled (EN) or
  tanıttı / duyurdu / kullanıma sundu / satışa sundu (TR) get the `launch` tag and a score boost.
- **Companies**: stories mentioning a big company or its products get a company tag (`openai`, `google`,
  `apple`, `nvidia`, `anthropic`, `microsoft`, `meta`, `samsung`, …) — filter with the tags box.

To tune categories, edit `CATEGORY_RULES` in `lib/pipeline/classify.ts` (a `*` suffix matches Turkish
word endings: `oyun*` → `oyunlari`), add a test case in `tests/classify.test.ts`, then recompute existing
topics with `npm run db:reindex` (dev) or `docker compose run --rm migrate node dist/reindex.js` (prod).

## 4. Sources

Defaults (edit `config/sources.seed.ts`): about 300 sources / 400 feeds (~8,300 items per run, ~60 s to fetch),
all free with no keys. A publisher's main and section feeds are **one source** (so one article never counts as
"seen on 2 sources"):

| Group                      | Sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official (tag `official`)  | OpenAI; Anthropic (news, research, engineering; community mirrors); Google (Blog, AI, DeepMind, Research, Cloud, Android Developers, YouTube, Workspace, Chrome releases, Project Zero); Microsoft (Blog, Source, AI, Research, Windows, Azure, DevBlogs, Security); Meta (newsroom, engineering); Apple (newsroom, developer, ML research); NVIDIA (news, blog, technical blog); Amazon & AWS; GitHub (blog, changelog); Hugging Face; Mistral; Samsung; AMD; Arm; Databricks; Snowflake; Together AI; Waymo; Figma; Netflix, Airbnb, Pinterest engineering; Salesforce; Cloudflare; Vercel; Stripe; Ollama; Docker; Kubernetes; Mozilla; Brave; Spotify; Python, Rust, Go, Node.js, Bun; NASA; CISA |
| Newsrooms                  | Reuters (via Google News), Bloomberg, FT, WSJ, CNBC, Guardian, NYT, BBC, Axios, TIME, NBC, CBS, ABC, Fox, NPR, LA Times, The Atlantic, Vox, Politico, The Economist, Quartz, Independent, Sky News, Euronews, DW, SCMP, CNA, ABC Australia, Economic Times, Mint, The Hindu, Hindustan Times, Gadgets 360, Forbes, Fast Company, The Information, Business Insider, Al Jazeera, Rest of World, 404 Media, Big Technology                                                                                                                                                                                                                                                                              |
| Google News                | Technology & Science sections (US, GB, TR); searches for big tech (12), more companies (12), tech topics (10), UK/IN/AU/CA/SG editions, Turkish edition (5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Tech news                  | Techmeme, TechCrunch (+ AI, startups, venture), The Verge (+ AI), Ars Technica (+ AI, space, gaming), Wired (+ AI, security), Engadget, MIT Tech Review, The Register (+ security), ZDNet (+ AI), CNET, TechRadar, Tom's Guide, Mashable, Gizmodo, Digital Trends, TNW, Slashdot, How-To Geek, Neowin, Ghacks, Futurism, New Atlas, IEEE Spectrum (+ robotics), SiliconANGLE, GeekWire, Stratechery, Platformer, Daring Fireball, Interesting Engineering, HackerNoon                                                                                                                                                                                                                                 |
| Enterprise IT              | Computerworld, InfoWorld, Network World, CIO, CSO Online, TechRepublic, eWeek, DatacenterDynamics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Phones / Apple / PC        | 9to5Mac, 9to5Google, MacRumors, AppleInsider, Macworld, MacStories, Six Colors, Android Authority, Android Police, Android Central, Android Headlines, XDA, SamMobile, GSMArena, Windows Central, Thurrott, Pocket-lint, Trusted Reviews, T3, Stuff, Tom's Hardware, Wccftech, TechSpot, PCWorld, TechPowerUp, KitGuru, Liliputing, Phoronix, ServeTheHome, Notebookcheck, Hackaday                                                                                                                                                                                                                                                                                                                   |
| Science / space / robotics | Popular Science, Popular Mechanics, Scientific American, New Scientist, Nature, Quanta, Phys.org & TechXplore, ScienceDaily, The Conversation, Singularity Hub, Space.com, SpaceNews, NASASpaceflight, Spaceflight Now, Universe Today, The Robot Report, Robohub                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| EVs / cars                 | Electrek, InsideEVs, CleanTechnica, Electrive, Teslarati, The Drive, Autoblog, Motor1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Gaming                     | IGN, GameSpot, Polygon, Kotaku, Eurogamer, PC Gamer, Rock Paper Shotgun, VGC, TheGamer, GamesIndustry.biz, Game Developer, Nintendo Life / Push Square / Pure Xbox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Crypto (tag `crypto`)      | CoinDesk, Cointelegraph, Decrypt, The Block, Bitcoin Magazine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Security                   | BleepingComputer, The Hacker News, SecurityWeek, Krebs, Dark Reading, The Record, Help Net Security, CyberScoop, Schneier, Risky Business, Troy Hunt, Graham Cluley                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Startups                   | Sifted, Tech.eu, EU-Startups, Crunchbase News, Y Combinator, Inc42, YourStory, e27, TechCabal, Pandaily, TechNode                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Developers                 | InfoQ, The New Stack, DEV, LWN, Stack Overflow, JetBrains, Pragmatic Engineer, ByteByteGo, Martin Fowler, freeCodeCamp, Smashing, CSS-Tricks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| AI                         | The Decoder, MarkTechPost, Simon Willison, Unite.AI, Analytics India Magazine, The Rundown, Import AI, Gary Marcus, Interconnects, Raschka, One Useful Thing, AI Snake Oil, Ben's Bites, Towards Data Science, Latent Space, MIT News AI, AI Business, TheSequence, Exponential View, SemiAnalysis, Understanding AI, Zvi, Algorithmic Bridge, AI Weekly, arXiv cs.AI/LG/CL (weight 0.4; revised old papers skipped)                                                                                                                                                                                                                                                                                  |
| Community / video          | Hacker News (top, Show HN, Best, Launch HN), Product Hunt, Lobsters (+ AI), Lemmy (technology ×2, android, programming, selfhosted, linux), Tildes ~tech, YouTube (MKBHD, LTT, Fireship, Two Minute Papers, AI Explained)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Turkish                    | Webrazzi (+ AI), Egirişim, ShiftDelete (+ oyun), DonanımHaber, NTV, Webtekno, Teknoblog, LOG, CHIP, Technopat, Tamindir, Donanım Arşivi, Anadolu Ajansı, Dünya, Milliyet, Habertürk, Hürriyet, Sözcü, TRT Haber, Haberler.com, Yeni Şafak, Star, Euronews Türkçe, TeknoSeyir, TeknoTalk, Swipeline, FounderN, Evrim Ağacı, Indir.com, Bloomberg HT, Gamer.com.tr, Merlin'in Kazanı, BBC Türkçe                                                                                                                                                                                                                                                                                                        |
| Trends                     | Google Trends "Trending now" (TR, US)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Optional                   | Reddit (disabled, see below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Google News search feeds (`gnews(...)` in the seed): any query becomes a feed of the last day's articles, in any
country edition. Titles arrive as "Headline - Publisher"; the RSS adapter strips the suffix (and keeps the
publisher as author) so they cluster with the publisher's own feed. Links stay news.google.com redirects. Queries
that overlap a lot (e.g. the country editions) share one source so a story isn't counted as several sources.

Feeds that are almost XML (raw HTML in descriptions, bare `&`, `&nbsp;`) are repaired and parsed again (Rest of
World needs this). Sources merged into another one are listed in `retiredSourceKeys`; seeding switches them off.

Checked Oct 2026 but not usable: no feed at the URL (an HTML page instead) for Meta AI, Intel, IBM, Qualcomm,
Adobe, Atlassian, LinkedIn Engineering, Hashnode, SC Media, Semafor, Axios Tech, Fortune; blocked (403/429) for
VentureBeat, PCMag, KDnuggets, PhoneArena, Barron's, Japan Times, Fortune Türkiye; stale: CNN Tech, Synced, BAIR,
TensorFlow, Cumhuriyet, Times of India, The Telegraph; an AP site search on Google News is mostly sports.

- Turn sources on/off on the **Sources** page.
- To change configs/feeds: edit the seed file, then `npm run db:reseed` (dev) or
  `docker compose run --rm migrate node dist/seed.js --update` (prod, after rebuilding the image).
  The on/off switch you set in the dashboard is kept.

### Adding a new source type

1. Create `lib/sources/<name>.ts` exporting a `SourceAdapter` (`type`, optional `primaryMetric`, `fetch()`).
   Validate config and responses with zod; return `RawItemInput[]`; don't touch the DB.
2. Register it in `lib/sources/registry.ts`.
3. Save a real response in `tests/fixtures/` and add a parser test.
4. Add a seed entry in `config/sources.seed.ts`.

A new RSS feed needs no code: just add an `rss(...)` line to the seed file.

### Notes on specific sources (verified October 2026)

- **Google Trends**: `https://trends.google.com/trending/rss?geo=TR` works (RSS with `ht:approx_traffic` and
  related `ht:news_item`s). A trend's URL is its first related news article, so it can cluster with RSS items.
- **Reddit**: public `.json` endpoints return **403** and public `.rss` feeds are rate-limited (429) after one
  or two requests, so Reddit needs API credentials. Since Reddit's Responsible Builder Policy (Nov 2025), new
  Data API access requires **approval**. The adapter (OAuth "script" app, password grant) is ready but
  disabled; subreddits are set in the seed (technology, artificial, LocalLLaMA, OpenAI, singularity, gadgets,
  programming). To connect it:
  1. Use (or create) a Reddit account.
  2. Request Data API access through Reddit's developer / Data API request form (non-commercial, personal use;
     describe: read-only, a few requests 3× a day, no redistribution). Wait for approval.
  3. Once approved, create a **script** app at <https://www.reddit.com/prefs/apps> (redirect URI can be
     `http://localhost`). Note the client id (under the app name) and secret.
  4. Put `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` in `.env`
     (an account with 2FA won't work with the password grant), restart: `docker compose up -d`.
  5. Turn on "Reddit (tech subs)" on the **Sources** page and press Run now. Errors show on the Runs page.
     Check Reddit's current developer docs first: the process has changed several times.
- **X/Twitter** and other sites whose terms forbid scraping are intentionally not used.

## 5. Optional: Claude enrichment

With `LLM_ENRICH_ENABLED=true`, each run sends the top `LLM_ENRICH_TOP_N` (30) not-yet-enriched topics to Claude
in **one** call and stores category, relevance (0–1) and a one-line summary. Relevance feeds into the score.
Failures (bad token, usage limit, timeout, bad JSON) never fail the run — they show up on the **Runs** page.

Setup:

1. On your own computer (where Claude Code is installed and you're logged in with Pro/Max), run:
   ```bash
   claude setup-token
   ```
2. Put the printed token in `.env` as `CLAUDE_CODE_OAUTH_TOKEN=...` and set `LLM_ENRICH_ENABLED=true`.
   Optionally set `NICHE_DESCRIPTION` so relevance matches your niche.
3. `docker compose up -d` (recreates the worker with the new env). The token is never logged.

The worker runs `claude -p --output-format json --max-turns 1 --tools ""` with the prompt on stdin, one call
at a time, with a hard timeout (`LLM_TIMEOUT_MS`).

### Subscription policy (important)

Using your Claude subscription here is meant only for **the official CLI, for your own personal use**.
If this ever becomes a product used by other people, switch `LLM_PROVIDER` to an API-key provider
(`anthropic-api` — stubbed in `lib/llm/index.ts`, to be implemented). The Agent SDK does **not** accept
subscription tokens.

## 5b. API

Every Pool view has an **API URL** (box above the table, with a copy button). It is built from the domain
you are browsing on and the current filters:

```
GET https://your-domain/api/topics?focus=tech&status=new&window=24h&sort=published&dir=desc&tag=launch
```

**API keys.** Every call needs a key, created on the dashboard's **API keys** page (`/keys`). The key is shown
once (only its SHA-256 is stored); revoking it there takes effect immediately. Send it as a header:

```bash
curl -H "Authorization: Bearer tp_..." "https://your-domain/api/topics?window=24h"
curl -H "X-API-Key: tp_..." "https://your-domain/api/topics?window=24h"
```

Without a valid key the API answers `401` JSON. Exception: requests made **on the server itself** to
`http://localhost:3000/api/topics` need no key (`AUTH_LOCALHOST_BYPASS`, see §6).

- Returns a **JSON array** of topics: `id, title, url, score, category, tags, lang, status, sources,
sourceCount, itemCount, publishedAt, firstSeenAt, lastSeenAt, summary`.
- The URL stores the **filters, not the results**: call it again tomorrow and you get what matches then
  (`window=24h` is always "the last 24 h from now").
- Parameters (same as the Pool): `focus` (tech|all), `status` (new|shortlisted|ignored|all),
  `window` (6h|24h|72h|7d|30d|all), `sort` (score|published|sources|title|category|status), `dir` (asc|desc),
  `category`, `tag`, `lang`, `source`, `q` (text search), plus `limit` (1–500, default 200) and `offset`.
  Invalid values fall back to defaults instead of erroring.
- CORS is open (`Access-Control-Allow-Origin: *`), so a website can call it from the browser, but it must
  send a key, which its visitors can then see: prefer calling the API from your own backend.

**Load protection** (built in, per web process):

| Layer                                                                                                   | Default         | Setting                  |
| ------------------------------------------------------------------------------------------------------- | --------------- | ------------------------ |
| Response cache: identical requests served from memory, concurrent identical requests share one DB query | 60 s            | `API_CACHE_SECONDS`      |
| `Cache-Control: private`: the calling client may cache, a shared CDN may not (responses need a key)     | 60 s            | same                     |
| Per-IP rate limit (token bucket) → `429` + `Retry-After`                                                | 60 requests/min | `API_RATE_LIMIT_PER_MIN` |
| Result cap                                                                                              | 500 per request | —                        |

Measured on a dev laptop (production build, Oct 2026): ~1,200 req/s from many clients on cached queries,
~1,300 req/s on uncached searches, a flooding client gets 429s while others are unaffected.

**What this does not protect against: real DDoS.** Next.js itself has no DDoS protection: every request
reaches the Node process. The limits above stop one noisy client and absorb normal popularity, but a
large distributed attack (thousands of IPs, network-level floods) can still saturate the server's CPU or
bandwidth. Before making the API public, put a CDN/proxy with DDoS protection in front (e.g. Cloudflare,
free plan): it absorbs floods at the edge. If an old project "didn't slow down under a DDoS", it was most likely hosted
behind such an edge network (Vercel, Cloudflare), not protected by Next.js itself.

**Before going public:**

- Set `DASHBOARD_USER`, `DASHBOARD_PASSWORD_HASH` and `SESSION_SECRET` (§6). Without them nobody can sign in
  from outside (the login refuses everyone; only localhost works).
- Keep the web port bound to `127.0.0.1` and serve the domain through a reverse proxy (Caddy, §6, or a
  Cloudflare Tunnel). Never publish port 3000 directly: the localhost bypass relies on public traffic arriving
  through a proxy (which adds `X-Forwarded-For`). Or set `AUTH_LOCALHOST_BYPASS=false`.
- Use HTTPS (Caddy does it automatically): the session cookie is `Secure` in production.

## 5c. Saved topics and post generation (NVIDIA)

Signed-in users (a real login, not the localhost bypass) get two personal pages:

- **Saved** (`/saved`): your own pool. Press **Save** next to any topic in the Pool (or on its page) to add it.
  Saved topics belong to your account only and are never removed by the retention cleanup.
- **Settings** (`/settings`): your NVIDIA API key and model.

Then on Saved, tick topics, pick a format (X, LinkedIn, blog intro) and language (English/Turkish) and press
**Generate**: one post per topic, written with your key, stored under your account (copy or delete it there).
Up to 10 per click, one at a time (the free endpoints are rate-limited per key).

Each generation also writes an **image prompt pack** for a 3 to 7 slide Instagram carousel (hook first, call to
action last, 4:5 portrait): per slide a goal, a visual concept and one detailed prompt to paste into any image
model (Midjourney, DALL-E, Flux…). Prompts are in English; the text shown on the images is in the post's
language. Both are stored with the post, each with a Copy button.

**Platforms.** Pick Instagram (default), X / Twitter, LinkedIn or Blog intro next to Generate. Each has its
own built-in style (`PLATFORMS` in `lib/posts/prompt.ts`) for both the text and the images:

| Platform  | Post                                                                                  | Images                                                                                          |
| --------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Instagram | hook line, airy lines, "swipe →", save/share CTA, 5-10 hashtags, "link in bio"        | 3-7 slide carousel, 4:5, bold news-card look, swipe cue on slide 1, "save & follow" last        |
| X         | punchy, ≤ 280 chars (or a 2-4 post thread), surprising fact first, 1-2 hashtags, link | 1-4 images, 16:9, one short bold headline readable as a thumbnail                               |
| LinkedIn  | professional, industry impact, closing question, link, ≤ 3 hashtags                   | 5-10 slide document carousel, 4:5, navy/slate + one accent, title + data callout, "1/7" numbers |
| Blog      | title + 3-4 paragraphs                                                                | 1-3 header images, 16:9                                                                         |

On Instagram every slide is a news-cover card: the visual scene fills the frame and the prompt ends with a fixed text
layout (bottom 40% dark gradient, huge bold all-caps headline with the key words in neon lime `#C6F432`, one
short factual subheadline, a small brand watermark at the bottom). The texts are also listed separately on an
`On-image text` line per slide ("Copy slide texts only"), so you can add them by hand in Canva when an image
model misspells them. The watermark is your **Brand** setting in Settings (default "Trend Pool").

To give the model real facts, generation sends a fact sheet: every collected item of the story (source,
summary, points/comments, author, date) plus the description and opening paragraphs of the story's own page,
fetched at that moment (`lib/posts/article.ts`; public addresses only, 8 s timeout, 1.5 MB cap). On the Saved
page every item is collapsed to its title and a summary line; expand it to see its posts.

**Your NVIDIA key.** Create one for free at [build.nvidia.com](https://build.nvidia.com) (profile menu → API
Keys, starts with `nvapi-`) and paste it in Settings. It is stored **encrypted** (AES-256-GCM) in the `users`
table with the server's `SECRETS_KEY`, never shown again (only `nvapi-…last4`) and only used for your own
requests. Set `SECRETS_KEY` once (32+ random characters, e.g. `openssl rand -base64 32`) and keep it: if it
changes, saved keys can't be decrypted and users simply enter them again.

**Model.** Default `nvidia/nemotron-3.5-lightning-30b-a3b`, with its reasoning switched off
(`chat_template_kwargs.enable_thinking=false`, otherwise it spends the token budget thinking and returns no
text). Measured with a real free key (October 2026) it answers in about 2 s, while the free endpoints of
`deepseek-ai/deepseek-v4.1-flash`, `google/gemma-4-31b-it`, `openai/gpt-oss-20b` and `z-ai/glm-5.3-flash` gave
no first token within 75 s (queued). DeepSeek and Gemma stay selectable in Settings for when they are less
busy. A post that takes longer than `NVIDIA_TIMEOUT_MS` (60 s) fails with a message, and the batch stops there.
The list lives in `lib/llm/nvidia.ts`.

## 5d. Accounts (sign-up with email confirmation)

Anyone can create an account on `/signup` with an email and a password (10+ characters). The account can't be
used until the email is confirmed: we send a one-time link (`/verify?token=…`, valid 24 h, only its SHA-256 is
stored). Signing in before that says so and offers to send the link again.

- **Roles.** The owner (`DASHBOARD_USER` from `.env`, or anyone on localhost) can do everything. Members
  (sign-up accounts) can browse the Pool and use their own **Saved** list and **Settings** (NVIDIA key, post
  generation). Runs, Sources, API keys, Run now and Shortlist/Ignore stay owner-only.
- **Abuse limits.** Sign-ups and "send again" share a per-IP limit (5, then 1 every 10 minutes); logins have
  their own (§6). The answer to a sign-up is the same whether or not the email already has an account.
- **Email settings** (same names as Laravel's):

```
APP_URL=https://trends.example.com   # base for the link in the email (else the request's host)
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=…
MAIL_PASSWORD=…
MAIL_ENCRYPTION=tls                  # tls = STARTTLS on 587, ssl = port 465
MAIL_FROM_ADDRESS=…
MAIL_FROM_NAME=Trend Pool
```

Without `MAIL_HOST` nothing is sent: the email (with its link) is only written to the web log, which is handy in
development but means nobody can confirm an account in production.

## 6. Deploy to a Linux server

On a fresh Ubuntu/Debian server:

```bash
# 1. Install Docker Engine + compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Get the code and configure
git clone <your-repo-url> /opt/trend-pool && cd /opt/trend-pool
cp .env.example .env
nano .env        # set POSTGRES_PASSWORD (+ same in DATABASE_URL), NICHE_*, login (below), optional token

# 3. Start
docker compose up -d --build
docker compose ps    # db healthy, migrate exited (0), web + worker up
```

Everything restarts automatically after a crash or reboot (`restart: unless-stopped`).

Update to a new version: `git pull && docker compose up -d --build`.

### Login

The dashboard (`/pool`, `/runs`, `/sources`, `/keys` and all its buttons) needs a username and password.
Set these in `.env`, then `docker compose up -d` to apply:

```bash
# DASHBOARD_PASSWORD_HASH: prompts for the password (needs only Node, no npm install)
node scripts/hash-password.mjs
# …or without Node on the server:
docker run --rm -it -v "$PWD/scripts:/s:ro" node:24-slim node /s/hash-password.mjs

# SESSION_SECRET: 32+ random characters
openssl rand -base64 32
```

```
DASHBOARD_USER=admin
DASHBOARD_PASSWORD_HASH=scrypt.…
SESSION_SECRET=…
```

- Signing in sets an httpOnly, signed session cookie valid for `SESSION_MAX_AGE_DAYS` (30). **Log out** is in
  the header. Changing `SESSION_SECRET` signs every browser out.
- Login attempts are rate-limited per IP (5, then 1 per minute). Failed attempts are logged by the web service.
- **Localhost needs no login** (`AUTH_LOCALHOST_BYPASS=true`, the default): on the server itself,
  <http://localhost:3000> opens the dashboard and the API without a password or key. A request counts as local
  when its Host is `localhost`/`127.0.0.1`/`[::1]` and it did not come through a reverse proxy or CDN
  (`lib/auth/local.ts`). An SSH tunnel (`ssh -L 3000:localhost:3000 user@your-server`) therefore also skips the
  login. Set `AUTH_LOCALHOST_BYPASS=false` to always require it.

### Public domain (HTTPS with Caddy)

Keep `127.0.0.1:3000:3000` in `compose.yaml` and put [Caddy](https://caddyserver.com) on the server in front of
it (automatic HTTPS). `/etc/caddy/Caddyfile`:

```
trends.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

Point the domain's DNS at the server, open ports 80/443, `sudo systemctl reload caddy`. Visitors get the login
page; API clients use a key (§5b). Do **not** open port 3000 to the internet.

### Backups

`scripts/backup.sh` dumps the database to `backups/` (gzip) and deletes dumps older than 14 days.
Add it to the server's crontab (`crontab -e`):

```
15 2 * * * cd /opt/trend-pool && ./scripts/backup.sh >> backups/backup.log 2>&1
```

and make sure `backups/` is copied **off the server** (e.g. `rclone`, `restic`, or your provider's backup).
The restore command is at the bottom of the script.

## 7. Configuration (`.env`)

| Variable                                      | Default           | Meaning                                              |
| --------------------------------------------- | ----------------- | ---------------------------------------------------- |
| `POSTGRES_*`, `DATABASE_URL`                  | —                 | DB credentials (keep the password identical in both) |
| `TZ`                                          | `Europe/Istanbul` | timezone for cron and display                        |
| `COLLECT_CRON`                                | `0 7,13,19 * * *` | when runs are queued (3× a day)                      |
| `CLEANUP_CRON`                                | `30 3 * * *`      | daily retention cleanup                              |
| `SOURCE_TIMEOUT_MS`                           | 30000             | per-source timeout                                   |
| `CLUSTER_SIMILARITY_THRESHOLD`                | 0.55              | title similarity needed to merge items               |
| `CLUSTER_WINDOW_HOURS`                        | 72                | how far back to match / score topics                 |
| `SCORE_HALF_LIFE_HOURS`                       | 24                | recency decay                                        |
| `RAW_ITEM_RETENTION_DAYS`                     | 30                | cleanup age (shortlisted topics are never deleted)   |
| `API_CACHE_SECONDS`, `API_RATE_LIMIT_PER_MIN` | 60, 60            | API cache time and per-IP limit (§5b)                |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD_HASH`   | —                 | dashboard login (§6)                                 |
| `SESSION_SECRET`, `SESSION_MAX_AGE_DAYS`      | —, 30             | signs the session cookie (32+ chars); its lifetime   |
| `AUTH_LOCALHOST_BYPASS`                       | `true`            | localhost skips login and API keys (§6)              |
| `SECRETS_KEY`                                 | —                 | encrypts users' NVIDIA keys (§5c)                    |
| `APP_URL`, `MAIL_*`                           | —                 | sign-up confirmation emails (§5d)                    |
| `NVIDIA_API_BASE_URL`, `NVIDIA_TIMEOUT_MS`    | NVIDIA, 60000     | post generation endpoint and timeout (§5c)           |
| `NICHE_DESCRIPTION`, `NICHE_KEYWORDS`         | AI/tech           | used for keyword boost and LLM relevance             |
| `LLM_*`, `CLAUDE_CODE_OAUTH_TOKEN`            | off               | optional enrichment (§5)                             |
| `REDDIT_*`                                    | empty             | optional Reddit (§4)                                 |

## 8. Verifying each milestone

- **M0** `docker compose up -d --build` → `docker compose ps` shows db healthy, migrate exited 0, web/worker up;
  `docker compose logs worker` shows `heartbeat` every minute; `down` + `up` keeps the data.
- **M1/M2** Press Run now → Runs page shows a run with ≥ 3 sources. Run again → "0 new". Change a feed URL to
  something broken (Sources config + reseed, or SQL) → the run is `partial` and other sources still store items.
- **M3/M4** `npm test` (normalizer, clustering threshold, scoring components, ranking). In the pool, topics with
  "×2"/"×3" are the same story from several sources.
- **M5** `INSERT INTO job_requests (type, payload) VALUES ('collect', '{"trigger":"manual"}');` is picked up
  within ~10 s. `docker compose kill worker` during a run, then `docker compose up -d worker` → that run is
  `interrupted` and the next run works.
- **M6** Browse `/pool`, open a topic, shortlist/ignore, toggle a source, press Run now.
- **M7** With `LLM_ENRICH_ENABLED=true` and an invalid token, the run succeeds and the Runs page shows the
  `[auth]` LLM error. With a valid token, topics get category/relevance/summary.

## 9. Decisions

Choices made where the plan left room (simplest reasonable option):

- **npm** instead of pnpm (comes with Node; one less tool to install).
- **ESLint 9** (eslint-config-next 16 plugins aren't all ESLint 10-ready yet); **TypeScript 5.9** (TS 7 is the new
  native compiler and Next.js tooling still targets the 5.x API).
- Scores/weights use `double precision` instead of `numeric` (no string conversions in JS; precision is plenty).
- Status columns are `text` + TypeScript unions, not Postgres enums, so later phases can add statuses freely.
- Normalization happens when items are stored (`raw_items.normalized_title/canonical_url`), not as a separate pass.
- Clustering similarity is computed in TypeScript with the exact pg_trgm algorithm (unit-testable, and items
  in the same run can match each other). The `pg_trgm` extension + GIN index is still installed for search.
- `raw_items.last_seen_at` was added so a topic stays "live" while its items keep appearing in new runs.
- Each RSS publisher is its own source, so "seen on N sources" works for RSS too.
- RSS items have no engagement metric → flat engagement 0.3 (`noMetricEngagement`).
- Google Trends `externalId` = geo + query + day, so a trend that comes back another day counts as new.
- `migrate` has `restart: "no"` (a one-off job must not loop); all long-running services use `unless-stopped`.
- Job statuses include `interrupted` (in addition to pending/running/done/failed) for crash recovery.
- Retention also deletes finished `job_requests` older than the retention period.
- The image is ~600–850 MB, above the 150–250 MB target: the Claude CLI alone is ~290 MB (native binary).
  Without it the app is ~330 MB. If size matters, split a `worker` build target that's the only one with the CLI.
- Heartbeat is stored in a small `settings` key/value table (`worker_heartbeat`); offline after 3 minutes.

## 10. Project layout

```
app/          Next.js dashboard (pool, pool/[id], runs, sources, keys, saved, settings, login, signup,
              verify), api/topics,
              server actions (actions.ts; user-actions.ts for a user's own data)
proxy.ts      redirects signed-out visitors to /login (pages and actions check again)
components/   UI (shadcn/ui in components/ui)
worker/       index.ts (scheduler, poller, shutdown), jobs/collect.ts, migrate.ts, seed.ts
lib/          ALL business logic: db/, sources/, pipeline/, llm/, data/ (queries), auth/, posts/, config.ts, logger.ts
config/       sources.seed.ts — what to watch
tests/        vitest + fixtures (saved real responses)
scripts/      backup.sh, hash-password.mjs
```
