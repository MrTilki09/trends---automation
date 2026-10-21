import { describe, expect, it } from "vitest";
import { filtersToQuery, parsePaging, parseTopicFilters } from "../lib/data/topic-filters";
import { RateLimiter, clientIp } from "../lib/util/rate-limit";
import { TtlCache } from "../lib/util/ttl-cache";

describe("topic filters (shared by Pool and /api/topics)", () => {
  it("applies defaults", () => {
    expect(parseTopicFilters(new URLSearchParams())).toEqual({
      focus: "tech",
      status: "new",
      window: "72h",
      sort: "score",
      dir: "desc",
      source: undefined,
      category: undefined,
      tag: undefined,
      lang: undefined,
      q: undefined,
    });
  });

  it("round-trips: an API URL built from the Pool parses back to the same filters", () => {
    const filters = parseTopicFilters(
      new URLSearchParams("focus=all&window=24h&sort=published&category=AI&tag=launch&lang=en&q=gpt 6"),
    );
    const query = filtersToQuery(filters);
    expect(parseTopicFilters(new URLSearchParams(query))).toEqual(filters);
    expect(query).toContain("tag=launch");
    expect(query).toContain("q=gpt+6");
  });

  it("ignores invalid values instead of failing", () => {
    const f = parseTopicFilters(new URLSearchParams("status=bogus&window=99y&sort=x&dir=sideways&focus=?"));
    expect(f).toMatchObject({ status: "new", window: "72h", sort: "score", dir: "desc", focus: "tech" });
  });

  it("maps the old sort=newest to published/desc", () => {
    expect(parseTopicFilters(new URLSearchParams("sort=newest"))).toMatchObject({
      sort: "published",
      dir: "desc",
    });
  });

  it("accepts Next.js searchParams objects too", () => {
    expect(parseTopicFilters({ tag: ["launch", "ignored"], category: "AI" })).toMatchObject({
      tag: "launch",
      category: "AI",
    });
  });

  it("clamps paging", () => {
    expect(parsePaging(new URLSearchParams())).toEqual({ limit: 200, offset: 0 });
    expect(parsePaging(new URLSearchParams("limit=99999&offset=-5"))).toEqual({ limit: 500, offset: 0 });
    expect(parsePaging(new URLSearchParams("limit=abc&offset=20"))).toEqual({ limit: 200, offset: 20 });
  });
});

describe("TtlCache", () => {
  it("expires entries and evicts the oldest past the cap", () => {
    let t = 0;
    const c = new TtlCache<string>(1000, 2, () => t);
    c.set("a", "1");
    c.set("b", "2");
    c.set("c", "3");
    expect(c.get("a")).toBeUndefined(); // evicted (cap 2)
    expect(c.get("b")).toBe("2");
    t = 1500;
    expect(c.get("b")).toBeUndefined(); // expired
  });

  it("computes once for concurrent identical requests", async () => {
    const c = new TtlCache<number>(1000);
    let calls = 0;
    const compute = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => c.getOrCompute("k", compute)));
    expect(calls).toBe(1);
    expect(results.every((r) => r.value === 42)).toBe(true);
    expect((await c.getOrCompute("k", compute)).hit).toBe(true);
  });
});

describe("RateLimiter", () => {
  it("allows a burst, then blocks, then refills", () => {
    let t = 0;
    const rl = new RateLimiter(3, 1, 100, () => t); // 3 burst, 1/sec refill
    expect([rl.take("ip"), rl.take("ip"), rl.take("ip")].every((r) => r.allowed)).toBe(true);
    const blocked = rl.take("ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(rl.take("other-ip").allowed).toBe(true); // per client
    t = 1000;
    expect(rl.take("ip").allowed).toBe(true);
  });

  it("keeps memory bounded under many clients", () => {
    const rl = new RateLimiter(5, 1, 50);
    for (let i = 0; i < 1000; i++) rl.take(`ip-${i}`);
    // @ts-expect-error reading private field in a test
    expect(rl.buckets.size).toBeLessThanOrEqual(50);
  });

  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "cf-connecting-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" }))).toBe(
      "5.6.7.8",
    );
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
