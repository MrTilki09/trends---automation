import { describe, expect, it, vi } from "vitest";
import { createOnce } from "../lib/util/once";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("createOnce (idempotency guard for Generate)", () => {
  it("a copy sent while the first request is still running waits and gets the same result", async () => {
    const once = createOnce<number>(60_000);
    const work = deferred<number>();
    const fn = vi.fn(() => work.promise);
    const first = once.run("user1:req-a", fn);
    const copy = once.run("user1:req-a", fn);
    work.resolve(1);
    expect(await first).toEqual({ value: 1, replayed: false });
    expect(await copy).toEqual({ value: 1, replayed: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("copies re-sent after the first finished (the bug: ~every 90 s) do no new work", async () => {
    const once = createOnce<string>(30 * 60_000);
    const fn = vi.fn(async () => "1 post");
    await once.run("user1:req-a", fn);
    for (let i = 0; i < 12; i++) {
      expect(await once.run("user1:req-a", fn)).toEqual({ value: "1 post", replayed: true });
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a new click (new id) generates again", async () => {
    const once = createOnce<string>(60_000);
    const fn = vi.fn(async () => "post");
    await once.run("user1:req-a", fn);
    await once.run("user1:req-b", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("keys are per user", async () => {
    const once = createOnce<string>(60_000);
    const fn = vi.fn(async () => "post");
    await once.run("user1:req-a", fn);
    await once.run("user2:req-a", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("forgets results after the TTL", async () => {
    let t = 0;
    const once = createOnce<string>(1000, () => t);
    const fn = vi.fn(async () => "post");
    await once.run("k", fn);
    t = 999;
    expect((await once.run("k", fn)).replayed).toBe(true);
    t = 1000;
    expect((await once.run("k", fn)).replayed).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(once.size()).toBe(1);
  });

  it("does not remember failures, so the user can retry", async () => {
    const once = createOnce<string>(60_000);
    const fn = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce("post");
    await expect(once.run("k", fn)).rejects.toThrow("network");
    expect(await once.run("k", fn)).toEqual({ value: "post", replayed: false });
  });
});
