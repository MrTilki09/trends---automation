# Trend Pool

A personal tool that, on a schedule, gathers what's trending (Hacker News, Google Trends, tech/news RSS
feeds), removes duplicates, groups the same story from different sources into one **topic**, ranks the topics,
and shows them in a dashboard where you can **shortlist** or **ignore** them.

This is **Phase 1** of a bigger "content machine" (later phases will turn topics into post drafts, add approval,
and publish). Nothing is ever posted anywhere by this code.

```
            ┌──────────── Docker ───────────────────────────────────────────────┐
 browser ──▶│ web (Next.js dashboard) ──┐                                       │
 (localhost)│                           ├──▶ db (Postgres 17)                   │
            │ worker (scheduler+jobs) ──┘     ▲  job_requests table = queue    │
            │   └─ fetches sources, clusters, scores, optional `claude -p`     │
            │ migrate (runs once at start: DB migrations + seed sources)       │
            └───────────────────────────────────────────────────────────────────┘
```

- The **web** app never collects anything. "Run now" just inserts a row in `job_requests`.
- The **worker** picks up that row within ~10 s (and also queues runs itself on a schedule).
- All logic is in `lib/` (sources, pipeline, scoring, LLM, DB access); `app/` and `worker/` stay thin.

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

Open <http://localhost:3000>. The pool is empty until the first run: press **Run now** (top right).
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
   **language** and **tags** (the feed's own `<category>` labels + the source's configured tags).
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
- **Tags**: the feeds' own categories (e.g. TechCrunch "AI", Webrazzi "Yapay Zeka"), plus tags set per source in
  `config/sources.seed.ts` (e.g. `turkey`, `startups`), plus `show hn`, `search trend`.
- **Language**: `tr` / `en`, from the source.

In the **Pool**: sort by _Top score_ or _Newest first_; filter by _Published last 6h / 24h / 72h / 7d / 30d_,
status, category, tag, language, source and text. Clicking a category or `#tag` badge filters by it.

- **Tech only** (default) hides politics, sports, celebrity and generic news. A topic counts as tech if its
  category is a tech one, or it has no non-tech category and comes from a tech source / is a launch.
  Switch to _Everything_ to see all. (Lists live in `lib/pipeline/classify.ts`: `TECH_CATEGORIES`, `TECH_TAGS`.)
- **Quick views** above the filters: AI, Launches, Official (company newsrooms), Show HN, Hardware, Mobile,
  Security, Startups, Türkiye.
- **Launches**: titles saying something was launched / announced / released / unveiled (EN) or
  tanıttı / duyurdu / kullanıma sundu / satışa sundu (TR) get the `launch` tag and a score boost.
- **Companies**: stories mentioning a big company or its products get a company tag (`openai`, `google`,
  `apple`, `nvidia`, `anthropic`, `microsoft`, `meta`, `samsung`, …) — filter with the tag dropdown.

To tune categories, edit `CATEGORY_RULES` in `lib/pipeline/classify.ts` (a `*` suffix matches Turkish
word endings: `oyun*` → `oyunlari`), add a test case in `tests/classify.test.ts`, then recompute existing
topics with `npm run db:reindex` (dev) or `docker compose run --rm migrate node dist/reindex.js` (prod).

## 4. Sources

Defaults (edit `config/sources.seed.ts`), about 45 sources, all free with no keys:

| Group                               | Sources                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Official newsrooms (tag `official`) | OpenAI, Google Blog, Google DeepMind, Microsoft, Meta, Apple, NVIDIA (news + blog), AWS, GitHub, Hugging Face, Mistral AI, Samsung                                                   |
| Tech news                           | Techmeme, TechCrunch, The Verge, Ars Technica, Wired, Engadget, MIT Technology Review, The Register, ZDNet, 9to5Mac, 9to5Google, Android Authority, Tom's Hardware, BleepingComputer |
| AI news                             | The Decoder, MarkTechPost, Simon Willison                                                                                                                                            |
| New products / dev                  | Hacker News (top + Show HN), Product Hunt, Lobsters                                                                                                                                  |
| Turkish                             | Webrazzi, Egirişim, ShiftDelete, DonanımHaber, NTV Teknoloji, Webtekno, Teknoblog, LOG, CHIP Online, BBC Türkçe                                                                      |
| Trends                              | Google Trends "Trending now" (TR, US)                                                                                                                                                |
| Optional                            | Reddit (disabled, see below)                                                                                                                                                         |

Checked Oct 2026 but not usable: Anthropic and Meta AI have no RSS feed (404); VentureBeat blocks automated
requests (429).

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

## 6. Deploy to a Linux server

On a fresh Ubuntu/Debian server:

```bash
# 1. Install Docker Engine + compose plugin (official convenience script)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Get the code and configure
git clone <your-repo-url> /opt/trend-pool && cd /opt/trend-pool
cp .env.example .env
nano .env        # set POSTGRES_PASSWORD (+ same in DATABASE_URL), NICHE_*, optional token

# 3. Start
docker compose up -d --build
docker compose ps    # db healthy, migrate exited (0), web + worker up
```

Everything restarts automatically after a crash or reboot (`restart: unless-stopped`).

Update to a new version: `git pull && docker compose up -d --build`.

### Accessing the dashboard

There is **no login yet**, so the web port is bound to the server's localhost only (`127.0.0.1:3000`).
Reach it with an SSH tunnel from your computer:

```bash
ssh -L 3000:localhost:3000 user@your-server
```

…then open <http://localhost:3000> locally. Alternatively, install [Tailscale](https://tailscale.com) on both
machines. Do **not** open port 3000 to the internet. (When auth is added later, put Caddy in front for HTTPS.)

### Backups

`scripts/backup.sh` dumps the database to `backups/` (gzip) and deletes dumps older than 14 days.
Add it to the server's crontab (`crontab -e`):

```
15 2 * * * cd /opt/trend-pool && ./scripts/backup.sh >> backups/backup.log 2>&1
```

and make sure `backups/` is copied **off the server** (e.g. `rclone`, `restic`, or your provider's backup).
The restore command is at the bottom of the script.

## 7. Configuration (`.env`)

| Variable                              | Default           | Meaning                                              |
| ------------------------------------- | ----------------- | ---------------------------------------------------- |
| `POSTGRES_*`, `DATABASE_URL`          | —                 | DB credentials (keep the password identical in both) |
| `TZ`                                  | `Europe/Istanbul` | timezone for cron and display                        |
| `COLLECT_CRON`                        | `0 7,13,19 * * *` | when runs are queued (3× a day)                      |
| `CLEANUP_CRON`                        | `30 3 * * *`      | daily retention cleanup                              |
| `SOURCE_TIMEOUT_MS`                   | 30000             | per-source timeout                                   |
| `CLUSTER_SIMILARITY_THRESHOLD`        | 0.55              | title similarity needed to merge items               |
| `CLUSTER_WINDOW_HOURS`                | 72                | how far back to match / score topics                 |
| `SCORE_HALF_LIFE_HOURS`               | 24                | recency decay                                        |
| `RAW_ITEM_RETENTION_DAYS`             | 30                | cleanup age (shortlisted topics are never deleted)   |
| `NICHE_DESCRIPTION`, `NICHE_KEYWORDS` | AI/tech           | used for keyword boost and LLM relevance             |
| `LLM_*`, `CLAUDE_CODE_OAUTH_TOKEN`    | off               | optional enrichment (§5)                             |
| `REDDIT_*`                            | empty             | optional Reddit (§4)                                 |

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
app/          Next.js dashboard (pool, pool/[id], runs, sources) + server actions
components/   UI (shadcn/ui in components/ui)
worker/       index.ts (scheduler, poller, shutdown), jobs/collect.ts, migrate.ts, seed.ts
lib/          ALL business logic: db/, sources/, pipeline/, llm/, data/ (queries), config.ts, logger.ts
config/       sources.seed.ts — what to watch
tests/        vitest + fixtures (saved real responses)
scripts/      backup.sh
```
