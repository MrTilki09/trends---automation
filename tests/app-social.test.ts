import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "../lib/app-api/auth";
import { checkText, foldText } from "../lib/app-api/moderation";
import { normalizeFollows, publicName } from "../lib/data/app-users";
import { personalBoost } from "../lib/data/feed";
import { DEFAULT_NOTIFICATION_PREFS } from "../lib/data/app-users";
import { isQuietHour, localHour, planPushes, sendExpoPushes, type NotifyTopic, type NotifyUser } from "../lib/notify";

const SECRET = "x".repeat(40);

describe("app access tokens", () => {
  const now = 1_800_000_000;
  it("round-trips and expires", () => {
    const t = signAccessToken({ uid: 7, sid: 3, exp: now + 900 }, SECRET);
    expect(verifyAccessToken(t, SECRET, now)).toEqual({ uid: 7, sid: 3, exp: now + 900 });
    expect(verifyAccessToken(t, SECRET, now + 901)).toBeNull();
  });

  it("rejects tampering, other secrets, dashboard cookies and junk", () => {
    const t = signAccessToken({ uid: 7, sid: 3, exp: now + 900 }, SECRET);
    const [p, data, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: 1, sid: 3, exp: now + 900 })).toString("base64url");
    expect(verifyAccessToken(`${p}.${forged}.${mac}`, SECRET, now)).toBeNull();
    expect(verifyAccessToken(t, "y".repeat(40), now)).toBeNull();
    expect(verifyAccessToken(`${data}.${mac}`, SECRET, now)).toBeNull();
    expect(verifyAccessToken("", SECRET, now)).toBeNull();
    expect(verifyAccessToken(undefined, SECRET, now)).toBeNull();
  });
});

describe("follows", () => {
  it("keeps only values topics actually store", () => {
    expect(
      normalizeFollows([
        { kind: "category", value: "ai" },
        { kind: "category", value: "Not a category" },
        { kind: "company", value: "NVIDIA" },
        { kind: "company", value: "acme" },
        { kind: "lang", value: "tr" },
        { kind: "lang", value: "xx" },
        { kind: "tag", value: "Open Source" },
        { kind: "category", value: "AI" },
      ]),
    ).toEqual([
      { kind: "category", value: "AI" },
      { kind: "company", value: "nvidia" },
      { kind: "lang", value: "tr" },
      { kind: "tag", value: "open source" },
    ]);
  });

  it("has no personal boost without follows", () => {
    expect(personalBoost([])).toBeNull();
    expect(personalBoost([{ kind: "company", value: "nvidia" }])).not.toBeNull();
  });

  it("shows a public name without leaking the email", () => {
    expect(publicName({ displayName: null, handle: null, username: "deniz@example.com" })).toBe("deniz");
    expect(publicName({ displayName: null, handle: "deniz", username: "d@example.com" })).toBe("@deniz");
    expect(publicName({ displayName: "Deniz K.", handle: "deniz", username: "d@example.com" })).toBe("Deniz K.");
  });
});

describe("word filter", () => {
  it("blocks slurs and explicit words in English and Turkish, also disguised", () => {
    for (const t of ["s.i.k.t.i.r git", "Siiiiktir", "or0spu", "Amk ya", "you retard"]) expect(checkText(t).ok).toBe(false);
  });
  it("lets normal tech talk through, including words that contain a blocked one", () => {
    for (const t of ["flame retardant materials", "This GPU is great", "Sıkıntı yok, güzel haber", "a b c test", "Scunthorpe"])
      expect(checkText(t).ok).toBe(true);
  });
  it("folds Turkish letters and leetspeak", () => {
    expect(foldText("ŞİMDİ 1ç1n")).toBe("simdi icin");
  });
});

describe("push planning", () => {
  // 12:00 UTC = 15:00 Istanbul (not quiet).
  const noon = new Date(Date.UTC(2026, 10, 14, 12));
  const topic = (o: Partial<NotifyTopic>): NotifyTopic => ({
    id: 1,
    title: "NVIDIA announces a new GPU",
    category: "Hardware",
    tags: ["nvidia", "launch"],
    score: 1.2,
    pastScore: 0.6,
    ageHours: 3,
    publisher: "TechPowerUp",
    ...o,
  });
  const user = (o: Partial<NotifyUser>): NotifyUser => ({
    id: 10,
    follows: [{ kind: "company", value: "nvidia" }],
    prefs: DEFAULT_NOTIFICATION_PREFS,
    sentLast24h: 0,
    notifiedTopicIds: new Set(),
    ...o,
  });

  it("sends one push for a followed company's launch, opening the story", () => {
    expect(planPushes([user({})], [topic({})], noon)).toEqual([
      { userId: 10, topicId: 1, title: "Trending now", body: "NVIDIA announces a new GPU · TechPowerUp" },
    ]);
  });

  it("needs a follow match, and rising topics need a minimum score", () => {
    expect(planPushes([user({ follows: [{ kind: "category", value: "AI" }] })], [topic({})], noon)).toEqual([]);
    const weak = topic({ tags: ["nvidia"], score: 0.5, pastScore: 0.2 });
    expect(planPushes([user({})], [weak], noon)).toEqual([]);
  });

  it("respects the daily cap, quiet hours, opt-out and one-per-topic", () => {
    expect(planPushes([user({ sentLast24h: 3 })], [topic({})], noon)).toEqual([]);
    const night = new Date(Date.UTC(2026, 10, 14, 21)); // 00:00 in Istanbul
    expect(planPushes([user({})], [topic({})], night)).toEqual([]);
    expect(planPushes([user({ prefs: { ...DEFAULT_NOTIFICATION_PREFS, breaking: false } })], [topic({})], noon)).toEqual([]);
    expect(planPushes([user({ notifiedTopicIds: new Set([1]) })], [topic({})], noon)).toEqual([]);
  });

  it("picks only the best match per user per run", () => {
    const pushes = planPushes([user({})], [topic({ id: 1, score: 1.0 }), topic({ id: 2, score: 2.0 })], noon);
    expect(pushes.map((p) => p.topicId)).toEqual([2]);
  });

  it("knows local hours in other time zones", () => {
    expect(localHour(noon, "America/New_York")).toBe(7);
    expect(isQuietHour(7)).toBe(true);
    expect(isQuietHour(8)).toBe(false);
    expect(localHour(noon, "Not/AZone")).toBe(15);
  });

  it("sends through Expo and reports dead tokens", async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }),
      )) as unknown as typeof fetch;
    const res = await sendExpoPushes(
      [
        { to: "ExponentPushToken[a]", title: "t", body: "b", data: {} },
        { to: "ExponentPushToken[b]", title: "t", body: "b", data: {} },
      ],
      undefined,
      fake,
    );
    expect(res).toEqual({ sent: 1, deadTokens: ["ExponentPushToken[b]"] });
  });
});
