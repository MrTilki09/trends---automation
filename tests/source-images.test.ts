import { describe, expect, it } from "vitest";
import { sourceImagesAllowed, withoutRawImage } from "../lib/sources/images";

describe("sourceImagesAllowed", () => {
  it("allows company newsrooms and GitHub cards only", () => {
    expect(sourceImagesAllowed({ type: "rss", config: { tags: ["ai", "official", "openai"] } })).toBe(true);
    expect(sourceImagesAllowed({ type: "github_repos", config: {} })).toBe(true);
    expect(sourceImagesAllowed({ type: "rss", config: { tags: ["tech"] } })).toBe(false);
    expect(sourceImagesAllowed({ type: "wikipedia_mostread" })).toBe(false);
  });

  it("lets config.imagesAllowed override the default either way", () => {
    expect(sourceImagesAllowed({ type: "rss", config: { tags: ["tech"], imagesAllowed: true } })).toBe(true);
    expect(sourceImagesAllowed({ type: "rss", config: { tags: ["official"], imagesAllowed: false } })).toBe(false);
  });
});

describe("withoutRawImage", () => {
  it("drops only the image key", () => {
    expect(withoutRawImage({ guid: "x", image: "https://a/b.jpg" })).toEqual({ guid: "x" });
    expect(withoutRawImage({ guid: "x" })).toEqual({ guid: "x" });
    expect(withoutRawImage(null)).toBeNull();
  });
});
