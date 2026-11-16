import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "./db/client";
import { notifications, pushTokens, type NotificationPrefs } from "./db/schema";
import { DEFAULT_NOTIFICATION_PREFS } from "./data/app-users";
import { momentumOf } from "./data/feed";
import { APP_SCHEME } from "./app-links";
import { TECH_ONLY } from "./data/topics";
import type { Logger } from "./logger";

/*
 * "Breaking in what you follow" push notifications (plan §8), sent by the worker after each collection.
 *
 * A user gets a push for a topic when it matches one of their follows AND either
 *   - it is rising (score up ≥ 10% in 6 h) and its score is at least NOTIFY.minScore, or
 *   - it is a launch by a company they follow.
 * Caps: at most 3 pushes per day, none 23:00–08:00 in their time zone, one per topic ever, and at
 * most one per run (the best match), so a busy hour never sends a burst.
 * Delivery: Expo's push service (it talks to APNs and FCM; EAS holds those credentials).
 */

export const NOTIFY = { minScore: 0.8, perDay: 3, quietStart: 23, quietEnd: 8, freshHours: 12 } as const;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function savePushToken(db: DB, userId: number, token: string, platform: string) {
  await db
    .insert(pushTokens)
    .values({ token, userId, platform })
    .onConflictDoUpdate({ target: pushTokens.token, set: { userId, platform } });
}

export async function removePushToken(db: DB, userId: number, token: string) {
  await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, userId)));
}

/** The local hour (0–23) at `now` in a time zone; falls back to Europe/Istanbul. */
export function localHour(now: Date, timeZone: string): number {
  const fmt = (tz: string) =>
    Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(now)) % 24;
  try {
    return fmt(timeZone);
  } catch {
    return fmt("Europe/Istanbul");
  }
}

export const isQuietHour = (hour: number) => hour >= NOTIFY.quietStart || hour < NOTIFY.quietEnd;

export type NotifyTopic = {
  id: number;
  title: string;
  category: string | null;
  tags: string[];
  score: number;
  pastScore: number | null;
  ageHours: number;
  publisher: string | null;
};

export type NotifyUser = {
  id: number;
  follows: { kind: string; value: string }[];
  prefs: NotificationPrefs;
  sentLast24h: number;
  notifiedTopicIds: Set<number>;
};

export type PlannedPush = { userId: number; topicId: number; title: string; body: string };

/** Which push each user should get now (pure; the worker does the I/O). */
export function planPushes(users: NotifyUser[], topics: NotifyTopic[], now: Date): PlannedPush[] {
  const out: PlannedPush[] = [];
  const eligible = topics
    .map((t) => ({
      t,
      rising: momentumOf(t.score, t.pastScore, t.ageHours).momentum === "rising" && t.score >= NOTIFY.minScore,
      launch: t.tags.includes("launch"),
    }))
    .filter((x) => x.rising || x.launch)
    .sort((a, b) => b.t.score - a.t.score);
  for (const u of users) {
    if (!u.prefs.breaking || u.sentLast24h >= NOTIFY.perDay) continue;
    if (isQuietHour(localHour(now, u.prefs.timeZone))) continue;
    const cats = new Set(u.follows.filter((f) => f.kind === "category").map((f) => f.value));
    const companies = new Set(u.follows.filter((f) => f.kind === "company").map((f) => f.value));
    const tags = new Set(u.follows.filter((f) => f.kind === "tag").map((f) => f.value));
    const pick = eligible.find(({ t, rising, launch }) => {
      if (u.notifiedTopicIds.has(t.id)) return false;
      const byCompany = t.tags.some((tag) => companies.has(tag));
      const followed = byCompany || (t.category != null && cats.has(t.category)) || t.tags.some((tag) => tags.has(tag));
      // Launches only notify for followed companies; everything else must be rising.
      return followed && (rising || (launch && byCompany));
    });
    if (pick) {
      out.push({
        userId: u.id,
        topicId: pick.t.id,
        title: pick.rising ? "Trending now" : "New launch",
        body: pick.t.publisher ? `${pick.t.title} · ${pick.t.publisher}` : pick.t.title,
      });
    }
  }
  return out;
}

type Ticket = { status: "ok" | "error"; details?: { error?: string } };

/** Sends through Expo's push service in batches of 100. Returns tokens Expo says are dead. */
export async function sendExpoPushes(
  messages: { to: string; title: string; body: string; data: Record<string, unknown> }[],
  accessToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sent: number; deadTokens: string[] }> {
  const deadTokens: string[] = [];
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetchImpl(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(batch.map((m) => ({ ...m, sound: "default", priority: "high" }))),
    });
    if (!res.ok) throw new Error(`Expo push failed: HTTP ${res.status}`);
    const { data } = (await res.json()) as { data: Ticket[] };
    data.forEach((ticket, k) => {
      if (ticket.status === "ok") sent++;
      else if (ticket.details?.error === "DeviceNotRegistered") deadTokens.push(batch[k]!.to);
    });
  }
  return { sent, deadTokens };
}

/** Worker step after scoring. Never throws for delivery problems (logged instead). */
export async function runNotifications(
  db: DB,
  opts: { logger: Logger; accessToken?: string; dryRun?: boolean; now?: Date; fetchImpl?: typeof fetch },
): Promise<{ planned: number; sent: number }> {
  const now = opts.now ?? new Date();
  const userRows = (
    await db.execute(sql`
      SELECT u.id, ns.prefs,
             coalesce((SELECT json_agg(json_build_object('kind', f.kind, 'value', f.value))
                       FROM follows f WHERE f.user_id = u.id), '[]') AS follows,
             (SELECT count(*)::int FROM notifications n
               WHERE n.user_id = u.id AND n.sent_at > ${new Date(now.getTime() - 86_400_000)}) AS sent_24h,
             coalesce((SELECT array_agg(n.topic_id) FROM notifications n
                       WHERE n.user_id = u.id AND n.topic_id IS NOT NULL), '{}') AS notified
      FROM users u
      LEFT JOIN notification_settings ns ON ns.user_id = u.id
      WHERE u.banned_at IS NULL AND EXISTS (SELECT 1 FROM push_tokens p WHERE p.user_id = u.id)`)
  ).rows as Record<string, unknown>[];
  if (userRows.length === 0) return { planned: 0, sent: 0 };

  const topicRows = (
    await db.execute(sql`
      SELECT t.id, t.title, coalesce(t.category, t.llm_category) AS category, t.tags, t.score,
             extract(epoch FROM (${now} - coalesce(t.published_at, t.first_seen_at))) / 3600 AS age_hours,
             coalesce(t.snippet_publisher,
                      (SELECT r.publisher FROM raw_items r WHERE r.topic_id = t.id LIMIT 1)) AS publisher,
             (SELECT h.score FROM topic_score_history h
               WHERE h.topic_id = t.id AND h.created_at <= ${now}::timestamptz - interval '6 hours'
               ORDER BY h.created_at DESC LIMIT 1) AS past_score
      FROM topics t
      WHERE t.status <> 'ignored' AND ${TECH_ONLY}
        AND coalesce(t.published_at, t.first_seen_at) > ${new Date(now.getTime() - NOTIFY.freshHours * 3_600_000)}
      ORDER BY t.score DESC LIMIT 300`)
  ).rows as Record<string, unknown>[];

  const users: NotifyUser[] = userRows.map((r) => ({
    id: Number(r.id),
    follows: r.follows as { kind: string; value: string }[],
    prefs: { ...DEFAULT_NOTIFICATION_PREFS, ...((r.prefs as Partial<NotificationPrefs> | null) ?? {}) },
    sentLast24h: Number(r.sent_24h ?? 0),
    notifiedTopicIds: new Set(((r.notified as number[] | null) ?? []).map(Number)),
  }));
  const topics: NotifyTopic[] = topicRows.map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    category: (r.category as string | null) ?? null,
    tags: (r.tags as string[] | null) ?? [],
    score: Number(r.score),
    pastScore: r.past_score == null ? null : Number(r.past_score),
    ageHours: Number(r.age_hours),
    publisher: (r.publisher as string | null) ?? null,
  }));

  const planned = planPushes(users, topics, now);
  if (planned.length === 0 || opts.dryRun) {
    opts.logger.info({ planned: planned.length, dryRun: !!opts.dryRun }, "notifications planned");
    return { planned: planned.length, sent: 0 };
  }

  // Record first (the unique (user, topic) index makes "one per topic ever" hold even across workers).
  const recorded = await db
    .insert(notifications)
    .values(planned.map((p) => ({ userId: p.userId, topicId: p.topicId, kind: "breaking", sentAt: now })))
    .onConflictDoNothing()
    .returning({ userId: notifications.userId, topicId: notifications.topicId });
  const keep = new Set(recorded.map((r) => `${r.userId}:${r.topicId}`));
  const toSend = planned.filter((p) => keep.has(`${p.userId}:${p.topicId}`));
  const tokens = await db
    .select({ token: pushTokens.token, userId: pushTokens.userId })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, [...new Set(toSend.map((p) => p.userId))]));
  const messages = toSend.flatMap((p) =>
    tokens
      .filter((t) => t.userId === p.userId)
      .map((t) => ({
        to: t.token,
        title: p.title,
        body: p.body,
        data: { url: `${APP_SCHEME}://topic/${p.topicId}`, topicId: p.topicId },
      })),
  );
  try {
    const { sent, deadTokens } = await sendExpoPushes(messages, opts.accessToken, opts.fetchImpl);
    if (deadTokens.length) await db.delete(pushTokens).where(inArray(pushTokens.token, deadTokens));
    opts.logger.info({ planned: planned.length, sent, removedTokens: deadTokens.length }, "notifications sent");
    return { planned: planned.length, sent };
  } catch (err) {
    opts.logger.error({ err }, "push delivery failed");
    return { planned: planned.length, sent: 0 };
  }
}
