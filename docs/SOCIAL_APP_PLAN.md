# Trend Feed — Social App Build Plan (rev. 2)

> Build brief for the coding agent. Read it fully before writing code.
> Build in the milestone order in §12. Finish each milestone, including its acceptance check, before starting the next.
> UI concepts: the "Trend Feed app — UI concepts" design canvas: https://claude.ai/artifact/N6tuuRzMPEELnMtn76wNtp
> (private to the owner until shared from its Share menu).
>
> **Rev. 2 changes (2026-11-14):**
> - Client is **Expo** (development builds + EAS). The CLI was considered and dropped; see §3.
> - **No AI generation anywhere in the app.** It shows only data Trend Pool already collected.
> - The live-database check is in §4.
> - The UI is adjusted to the data as it really is: most stories have a single source.

---

## 1. The idea

A mobile-first social app where people **scroll through what's trending in tech right now**, powered by
Trend Pool (this repo) as the data source.

Trend Pool already does the hard part:
- collects ~310 sources every hour;
- de-duplicates and clusters the same story across sites;
- ranks, categorizes, and tags launches and companies.

The app turns that pool into a feed people react to and discuss.

**One-line pitch:** "The tech stories everyone is talking about, ranked live — one scroll, no noise."

**Rule for the whole app: nothing is generated.** Every piece of text shown is either:
- the publisher's own headline and feed snippet, credited and linking to the original; or
- something users wrote, such as comments.

There are no LLM calls in the app, its API or its worker jobs. Running cost is just hosting.

---

## 2. Scope

### MVP
- **Feed:** infinite vertical scroll of topic cards, with For you / Trending / Latest tabs and category chips.
- **Story page:**
  - the publisher snippet;
  - why it's trending (sources, momentum, Hacker News points);
  - every source article, each linking out;
  - the discussion.
- **Discover:** categories, trending companies and tags, search.
- **Accounts:** sign up and sign in using Trend Pool's member accounts, then onboarding to pick interests.
- **Social:**
  - one-tap reactions: hot / useful / skeptical / wow;
  - comments, with one reply level;
  - save, share link;
  - follow categories, companies and tags.
- **Notifications:** opt-in, rate-limited push for "breaking in what you follow".
- **Moderation basics required by the stores:** report, block, word filter, delete own content, delete account.

### Later (leave hooks, don't build)
- User "takes" attached to a story, following other users, DMs.
- Web client (Expo can build the same app for web later).
- Monetization: a sponsored launch slot, or a Pro tier with custom feeds and alerts. No ads in the MVP.
- Any AI feature. If one is ever added it needs a paid API key, never the owner's subscription.

---

## 3. Decisions

| Decision | Choice | Why |
|---|---|---|
| Client | **Expo (latest SDK) + TypeScript**, development builds (not Expo Go) | Same React Native, with any native module available. Builds iOS from Windows. |
| Navigation | Expo Router (file-based tabs + stacks) | Deep links for free: `trendfeed://topic/123` maps to a file. |
| UI and motion | Reanimated, Gesture Handler, FlashList, expo-image | Handles the full-screen story view, card animations and smooth lists. |
| Styling | StyleSheet + design tokens (`src/theme.ts`) | NativeWind's current release supports up to Expo SDK 57; the app is on SDK 58. Revisit when it catches up. |
| Data fetching | TanStack Query, with the feed cache persisted on the device | Caching, infinite scroll, offline feed. |
| Push | `expo-notifications` + Expo push service | One API for iOS and Android; the worker sends with a plain HTTP call. |
| Builds and release | EAS Build + EAS Submit | Cloud builds for iOS and Android, uploads to TestFlight and Play. No Mac needed. |
| OTA updates | EAS Update | Ship JavaScript fixes without waiting for store review. |
| Backend | **Extend Trend Pool** with a versioned app API (`/api/app/v1/*`) | Users, auth, saved topics and topic data already live here. |
| Repo layout | Two repos: the API in this repo (`/api/app/v1`, schemas in `lib/app-api/schemas.ts`); the Expo app in its own repo `trend-feed`, which keeps an identical copy of the schemas | The app has its own release cycle (stores, OTA). |
| Database | **The same Postgres**, with additive changes only (§4, §6) | Social data needs foreign keys to `topics` and `users`. |
| App auth | Session tokens (access 15 min + refresh 30 days) on top of member accounts | API keys are server-to-server; a key shipped inside an app can be extracted. |
| Anonymous browsing | Yes: the feed and story pages work without an account | Lowest friction. |
| Real-time | Polling + pull-to-refresh | Data changes hourly; WebSockets aren't worth it. |

### Why Expo and not the React Native CLI

- **No Mac needed.** EAS builds iOS in the cloud from Windows.
- **Less setup.** Icons, splash, permissions, deep links and push are entries in `app.config.ts` instead of
  Xcode and Gradle edits.
- **No lock-in.** The UI capabilities are the same, and any native module works in a development build. If the app
  ever outgrows Expo, `npx expo prebuild` produces plain `ios/` and `android/` projects.

**Keep it simple:**
- Don't commit `ios/` or `android/`; they're generated.
- Use Expo SDK libraries before third-party ones.
- Upgrade one Expo SDK at a time.

---

## 4. Can the live database handle it? (checked 2026-11-14)

**Yes, with additive changes.** Nothing existing has to be rewritten or migrated destructively.

### What is there today

| | Value |
|---|---|
| Database size | 102 MB: `raw_items` 21.8k rows / 58 MB, `topics` 19.3k / 34 MB |
| Growth | ~5k topics per 72 h; retention removes untouched items after 30 days, so size is steady |
| Collection run | Hourly, ~1.5 min, rescoring ~8k recent topics |
| Topics in the last 72 h | 5,068 |
| … with a feed snippet (>40 chars) | 4,836 (95%), averaging 276 chars |
| … with a publisher image | 2,399 (47%) |
| … seen on 2+ sources | 364 (7%). On 3+: 64. Most stories have **one** source |
| … with an LLM summary | 0 (enrichment is off, and stays off for the app) |
| Uncategorized (last 72 h) | 816 of 5,068 (16%) |

Load is not a concern at this size. A feed request reads a cached candidate list of a few hundred
topic rows. Postgres serves that easily on the smallest instance.

### Changes the app requires

1. **Retention must not delete topics people interacted with.** Today a topic with status
   `new`/`ignored` that isn't in someone's Saved list is deleted once its items expire. Its comments and
   reactions would cascade away with it.
   - Extend the `NOT EXISTS` guards in `lib/pipeline/retention.ts` to `reactions`, `comments` and `follows`
     hits. The simplest form: "any row in `topic_counters` with a count > 0".
   - Also keep the raw items of those topics, so the story page still lists its sources.
2. **Expose images:**
   - Add `raw_items.image_url`, backfilled from `raw->>'image'`.
   - Add `topics.image_url`: the best image among the topic's items, picked in the cluster/score step.
     Prefer the earliest item from a higher-weight source.
   - About half of the cards will have no image, so the design must look good without one. See §10.
3. **Clean snippet for display** (`raw_items.snippet`, computed at ingest; backfill once). This is
   deterministic text cleanup, not AI:
   - Strip "The post … appeared first on …" (1,251 items have it) and similar feed boilerplate.
   - Strip the Techmeme "Author / Publication:" prefix, and turn it into a credit line instead.
   - Collapse whitespace and cut at a sentence boundary at ≤ 300 chars.

   - Drop the snippet when it only repeats the headline. Google News items do this: their "snippet" is
     "<headline> <Publisher>".

   `topics.snippet` = the snippet of the topic's best item: the same item the headline comes from.
   Show Hacker News posts, which never have a snippet, as headline + points.
3b. **Count publishers, not feeds.** `source_count` counts feeds. So:
   - "Hacker News (top)" + "Hacker News Best" counts as 2;
   - a story found through three Google News searches looks like 3 sources.

   For the app:
   - add `topics.publisher_count`: distinct publishers, with Hacker News and Google News each counting once;
   - for Google News items, take the real publisher from the item (`<source>` element / title suffix) and credit that publisher.

   "On N sources" uses `publisher_count`.
4. **Momentum for "Rising" labels.** The score is recomputed every hour, so keep the history:
   - add a `topic_score_history` table (topic_id, run_id, score), written by the score step;
   - keep it 7 days;
   - compute `momentum` = score now vs. 6 h ago → `rising` / `steady` / `fading`.

   This is also what makes a single-source story look "trending": velocity, not just source count.
5. **Feed indexes** for the app queries:
   - `topics (published_at DESC, id)` already partly exists;
   - add `topics (score DESC, id) WHERE status <> 'ignored'` for cursor paging.
6. **Connection pool:** the web pool is `max: 10` (`lib/db/client.ts`), which is fine for the start.
   - Put app reads behind the 60 s feed cache so app traffic barely touches the database.
   - If the app grows, add PgBouncer, or move to a managed Postgres with a pooler. No schema change is needed for either.
7. **Hosting:** the app API must be reachable from phones, so the Next.js server needs a public HTTPS host
   with the database on the same network:
   - the existing Docker setup on a VPS, or
   - Render web service + managed Postgres. A free Render Postgres is too small and expires; use a paid tier.

   The dashboard stays behind its login; only `/api/app/v1/*` is public.

### What's *not* needed
- No new database engine, no search engine. Postgres `pg_trgm` already powers title search.
- No message queue. Push sending runs as a worker job after each collection, using the existing
  `job_requests` pattern.

---

## 5. App API (`/api/app/v1`)

All JSON. Inputs and outputs are validated with zod; the schemas live in `lib/app-api/schemas.ts` and the Expo app imports them for types.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /auth/signup` · `/auth/login` · `/auth/refresh` · `/auth/logout` | — | Token auth on member accounts; reuses the email verification flow |
| `GET /feed?tab=for-you\|trending\|latest&category=&cursor=` | optional | 20 items + `nextCursor` + `feedVersion` |
| `GET /topics/:id` | optional | Topic + all items (source, title, url, snippet, publishedAt, image) + counters + viewer state |
| `GET /topics/:id/comments?sort=top\|new&cursor=` | optional | Comments, one reply level |
| `POST /topics/:id/comments` · `DELETE /comments/:id` | required | Write / delete own comment |
| `PUT /topics/:id/reaction` `{type}` · `DELETE …/reaction` | required | One reaction per user per topic |
| `PUT /topics/:id/save` · `DELETE …/save` | required | Reuses `saved_topics` |
| `GET /discover` | optional | Category counts, trending companies and tags (24 h), editor picks (owner `shortlisted`) |
| `GET /search?q=&cursor=` | optional | Topic search (`pg_trgm`) |
| `GET/PUT /me/follows` | required | Followed categories, companies, tags, languages |
| `GET/PUT /me/notifications` · `POST /me/push-token` | required | Push settings + Expo push token |
| `POST /reports` · `POST /blocks/:userId` | required | Moderation |
| `DELETE /me` | required | Account deletion (store requirement) |

**Topic shape in feed responses:**
- `id, title, snippet, imageUrl, category, tags, lang, publishedAt`;
- `sourceCount`, plus `sources[]` (name + favicon);
- `momentum`, `stats { hnPoints?, comments? }`;
- `counters { reactions, comments, saves }`;
- `viewer { reaction, saved }`, only when signed in.

**Rules:**
- **Cursor paging:** an opaque cursor encoding `(score, id)`, or `(published_at, id)` for Latest. Never offsets.
- `feedVersion` = the latest finished `fetch_runs.id`. The client uses it to show "N new stories ↑".
- The feed always applies `focus=tech` and `status <> 'ignored'`. The owner's Ignore in the dashboard is editorial control.
- Rate limits per user and per IP (`lib/util/rate-limit.ts`). Comments: 1 per 10 s, 100 per day.

---

## 6. Data model additions (all additive)

```
-- data for the app
raw_items           + image_url, snippet
topics              + image_url, snippet
topic_score_history topic_id, run_id, score, PK(topic_id, run_id)        -- 7-day retention

-- social
app_sessions        id, user_id, refresh_hash, device, created_at, last_used_at, revoked_at
follows             user_id, kind ('category'|'company'|'tag'|'lang'), value, created_at   PK(user_id, kind, value)
reactions           user_id, topic_id, type, created_at                                    PK(user_id, topic_id)
comments            id, topic_id, user_id, parent_id, body, status ('visible'|'hidden'|'deleted'), created_at, edited_at
topic_counters      topic_id PK, reactions, comments, saves, updated_at   -- updated in the same tx
feed_impressions    user_id, topic_id, seen_at                            -- 7-day retention
users               + display_name, handle (unique), avatar_url, onboarded_at

-- safety & push
reports             id, reporter_id, target_type, target_id, reason, status, created_at
blocks              user_id, blocked_user_id, created_at
push_tokens         user_id, token, platform, created_at, last_ok_at
notifications       id, user_id, topic_id, kind, sent_at, opened_at
```

Keep queries in `lib/data/feed.ts` and `lib/data/social.ts`, like the rest of the repo. Every table is created by a
Drizzle migration; no existing column changes type.

---

## 7. Feed ranking (no AI, all from existing signals)

- **Trending:** Trend Pool's `score` × a momentum bonus (rising +20%). Published in the last 72 h, tech focus.
- **Latest:** `published_at` descending.
- **For you:** `score × (1 + 0.5·followMatch + 0.2·languageMatch) − 0.3·alreadySeen`.
  - `followMatch` uses the topic's category, the company tags from `detectSignals`, and its tags.
  - About 25% of each page is top Trending, so the feed doesn't become a bubble.
- **Social boost (after A4):** a small, capped bonus for reactions and comments in the last 6 h.
- **Uncategorized topics** (16%) appear in Trending and Latest but never match a follow. Improving the
  rule-based classifier (more keywords) is a cheap Trend Pool task, not an app task.
- All weights live in one config object. The story page shows "Why you're seeing this".

---

## 8. Notifications

- **Triggers:** a worker job after each collection run. It fires for:
  - a topic that matches a follow **and** crosses a score threshold **and** is rising; or
  - any `launch` from a followed company.
- **Caps:**
  - at most 3 pushes per user per day;
  - none between 23:00 and 08:00 in the user's time zone;
  - one push per topic ever.
- **Delivery:** the worker POSTs to the Expo push API in batches of 100 and reads the receipts.
  - Remove tokens that come back `DeviceNotRegistered`.
  - An Expo access token goes in `.env`, never committed.
- **Deep links:** `trendfeed://topic/:id` (Expo Router route `app/topic/[id].tsx`), plus universal / App Links on
  the public domain later.

---

## 9. Moderation, legal, store requirements

- **App Store guideline 1.2 / Play UGC policy:**
  - a word-list filter (Turkish and English);
  - reporting content and users;
  - blocking users;
  - auto-hiding content after N reports, pending review;
  - published contact details and terms;
  - in-app account deletion.
- **Owner moderation queue:** a new dashboard page `/moderation` to hide or restore comments and ban users.
- **Copyright:** show only:
  - the headline;
  - the publisher's own feed snippet (≤ 300 chars, cleaned per §4);
  - the publisher's feed image, credited;
  - a link to the original.

  Never fetch or show full article text; never scrape images from article pages. When there's no
  snippet, show the headline and sources only. Never substitute generated text.
- **Privacy (KVKK + GDPR):**
  - a privacy policy;
  - data export and deletion;
  - no third-party ad trackers;
  - privacy-first analytics (self-hosted PostHog or Plausible).

---

## 10. Screens (see the design canvas)

1. **Onboarding:** pick interests (categories, companies, language).
2. **Feed:** tabs and category chips. Each story card has:
   - category and momentum badge (Rising / New);
   - title, snippet;
   - source favicons, plus "on N sources" **only when N ≥ 2**;
   - time;
   - reactions, comments, save, share.

   Cards without an image use a typographic layout with the category color, not an empty placeholder.
3. **Full-screen mode:** one story per screen, swipe up for the next. Reanimated + Gesture Handler.
4. **Story:**
   - the snippet, with the publisher credited;
   - why it's trending: momentum, sources, Hacker News points, per-hour sightings;
   - the coverage list;
   - the discussion.
5. **Discover:** search, categories, trending companies and tags, editor picks.
6. **Profile:** follows, saved stories, settings, notification preferences.

The Feed, Full-screen and Story boards on the canvas use these rules (rev. 2):
- The stories are real collected ones, and the text is the publisher's snippet, credited.
- One card has a publisher image (shown as a credited placeholder). One is a Hacker News post with no snippet and no image.
- "On N sources" appears only when N ≥ 2.

Reaction, comment and points counts on the canvas are sample values.

---

## 11. Non-functional

- **Speed:**
  - the feed's first page takes < 300 ms server time;
  - candidates are cached per tab + category for 60 s, with personalization applied on top;
  - lists use FlashList and stay at 60 fps on a mid-range Android phone.
- **Offline:** the last loaded feed shows (TanStack Query persisted on the device).
- **Accessibility:**
  - dynamic type;
  - screen-reader labels on icon buttons;
  - 44 pt touch targets;
  - AA contrast.
- **Language:** English and Turkish UI strings from day one.
- **Monitoring:**
  - API logs (pino);
  - crash reporting (Sentry, via its Expo plugin);
  - basic product metrics.

---

## 12. Milestones

**A0 — Decisions & design.** Confirm §3, update the canvas to the real-data rules in §10, and pick a name and logo.
✅ The owner signs off on the screens and the stack.

**A1 — Data for the app** (Trend Pool only, no mobile code):
- `image_url` + `snippet` (ingest + one-off backfill);
- `topic_score_history` + momentum;
- retention protection;
- feed indexes;
- cursor paging + `feedVersion`;
- anonymous `/feed`, `/topics/:id`, `/discover`, `/search`.

✅ Unit tests:
- cursor stability across a re-rank (no duplicates, no skips);
- snippet cleaning (the boilerplate cases from §4);
- image selection;
- momentum;
- retention keeps a topic that has a comment.

**A2 — Expo skeleton:**
- `npx create-expo-app mobile`;
- Expo Router tabs (Feed, Discover, Profile);
- a typed API client from the shared schemas;
- Feed + Story + Discover, read-only, against A1;
- a development build via EAS for both platforms.

✅ It runs on an Android emulator and a real iPhone (EAS development build) with infinite scroll, pull-to-refresh and the "new stories" pill.

**A3 — Accounts:** token auth, sign-up and sign-in screens, onboarding, follows, "For you".
✅ A new user signs up, confirms their email, picks interests and sees a personalized feed.

**A4 — Social:** reactions, saves, comments + replies, counters, viewer state.
✅ Two test users react and discuss; counts update; deleting a comment works.

**A5 — Safety:** report, block, word filter, `/moderation`, account deletion, terms + privacy.
✅ Every item on the store UGC checklist can be demonstrated.

**A6 — Notifications:** expo-notifications, push tokens, worker job (Expo push API), caps, deep links, settings.
EAS manages the APNs and FCM credentials.
✅ Following "nvidia" + a new NVIDIA launch in a run → exactly one push, which opens the story.

**A7 — Beta:**
- EAS Submit to TestFlight + Play internal testing;
- EAS Update channels (preview, production);
- Sentry;
- analytics;
- README.

✅ 10 beta users for a week without crashes.

---

## 13. Open questions for the owner

1. App name (working name "Trend Feed") and domain. The domain is also needed for universal links.
2. Audience first: Turkish, global, or both? This sets the default language and which sources get weight.
3. Comments at launch, or reactions-only first? Reactions-only means far less moderation work.
4. Will the owner moderate, or should comments start off by default per story?
5. Apple Developer account ($99/yr) and Google Play account ($25 once). Both are needed before A2's iPhone build and A7.
6. Where will production run (VPS with the existing compose, or Render paid tier)?
