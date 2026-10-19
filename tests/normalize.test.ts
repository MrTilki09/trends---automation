import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  extractKeywords,
  guessLang,
  lowercase,
  normalizeTitle,
} from "../lib/pipeline/normalize";

describe("canonicalizeUrl", () => {
  it("lowercases host, strips www, fragment and trailing slash", () => {
    expect(canonicalizeUrl("https://WWW.Example.COM/Path/To/#section")).toBe("https://example.com/Path/To");
  });

  it("treats http and https as the same page", () => {
    expect(canonicalizeUrl("http://example.com/a")).toBe(canonicalizeUrl("https://example.com/a"));
  });

  it("removes tracking params and sorts the rest", () => {
    expect(
      canonicalizeUrl("https://example.com/a?utm_source=x&b=2&utm_medium=y&fbclid=123&a=1&ref=hn&gclid=9"),
    ).toBe("https://example.com/a?a=1&b=2");
  });

  it("keeps meaningful params and non-default ports", () => {
    expect(canonicalizeUrl("https://example.com:8443/item?id=5")).toBe("https://example.com:8443/item?id=5");
    expect(canonicalizeUrl("https://news.ycombinator.com/item?id=123")).toBe(
      "https://news.ycombinator.com/item?id=123",
    );
  });

  it("handles the root path and default ports", () => {
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com");
    expect(canonicalizeUrl("http://example.com:80/x/")).toBe("https://example.com/x");
  });

  it("returns null for invalid or non-http URLs", () => {
    expect(canonicalizeUrl("not a url")).toBeNull();
    expect(canonicalizeUrl("mailto:me@example.com")).toBeNull();
    expect(canonicalizeUrl(undefined)).toBeNull();
    expect(canonicalizeUrl("")).toBeNull();
  });
});

describe("Turkish-aware lowercasing", () => {
  it("uses Turkish rules for tr", () => {
    expect(lowercase("IŞIK", "tr")).toBe("ışık");
    expect(lowercase("İSTANBUL", "tr")).toBe("istanbul");
  });

  it("uses default rules otherwise", () => {
    expect(lowercase("LINUX", "en")).toBe("linux");
    expect(lowercase("LINUX")).toBe("linux");
  });
});

describe("normalizeTitle", () => {
  it("strips punctuation and extra whitespace", () => {
    expect(normalizeTitle("  OpenAI   releases GPT-6!!  (finally) ")).toBe("openai releases gpt 6 finally");
  });

  it("folds Turkish characters so variants match", () => {
    expect(normalizeTitle("İSTANBUL'da IŞIK şöleni", "tr")).toBe("istanbul da isik soleni");
    expect(normalizeTitle("Yapay Zekâ girişimi büyüdü", "tr")).toBe("yapay zeka girisimi buyudu");
  });

  it("makes Turkish and English spellings of a name converge", () => {
    // "İstanbul" written by a Turkish source vs "Istanbul" by an English one.
    expect(normalizeTitle("İstanbul hosts summit", "tr")).toBe(normalizeTitle("Istanbul hosts summit", "en"));
  });

  it("does not turn the English capital I into a dotless ı", () => {
    expect(normalizeTitle("I tried it", "en")).toBe("i tried it");
  });

  it("keeps digits", () => {
    expect(normalizeTitle("Linux 7.3 Released")).toBe("linux 7 3 released");
  });
});

describe("guessLang", () => {
  it("detects Turkish-specific letters", () => {
    expect(guessLang("Yapay zekâ girişimi")).toBe("tr");
    expect(guessLang("Plain english title")).toBeUndefined();
  });
});

describe("extractKeywords", () => {
  it("returns frequent non-stopword tokens", () => {
    const kws = extractKeywords([
      "openai releases gpt 6 model",
      "openai gpt 6 is here",
      "the new gpt 6 model from openai",
    ]);
    expect(kws.slice(0, 2)).toEqual(["openai", "gpt"]);
    expect(kws).toContain("model");
    expect(kws).not.toContain("the");
    expect(kws).not.toContain("6");
  });

  it("filters Turkish stopwords", () => {
    const kws = extractKeywords(["yapay zeka icin yeni bir donem ve firsat"]);
    expect(kws).toEqual(["yapay", "zeka", "donem", "firsat"]);
  });
});
