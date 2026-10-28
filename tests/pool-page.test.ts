import { describe, expect, it } from "vitest";
import { exportFilename, toCsv, toExportRow, toJson } from "../lib/data/export";
import { pageWindow, parsePage, parseTopicFilters, publicView } from "../lib/data/topic-filters";
import { parseTagFilter, type TopicListRow } from "../lib/data/topics";

describe("Pool paging", () => {
  it("defaults to page 1 with 50 per page", () => {
    expect(parsePage(new URLSearchParams())).toEqual({ page: 1, per: 50 });
  });

  it("accepts valid values and ignores bad ones", () => {
    expect(parsePage({ page: "3", per: "100" })).toEqual({ page: 3, per: 100 });
    expect(parsePage({ page: "0", per: "7" })).toEqual({ page: 1, per: 50 });
    expect(parsePage({ page: "-2", per: "abc" })).toEqual({ page: 1, per: 50 });
    expect(parsePage({ page: "999999" }).page).toBe(10_000);
  });

  it("shows the first, last and nearby page numbers with gaps", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(10, 20)).toEqual([1, null, 8, 9, 10, 11, 12, null, 20]);
    // A gap of exactly one page is shown as that page, not as "…".
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, 6, null, 20]);
  });
});

describe("public view (signed-out visitors)", () => {
  it("shows every status except ignored, whatever the URL asks for", () => {
    const f = publicView(parseTopicFilters(new URLSearchParams("status=ignored&tag=launch")));
    expect(f).toMatchObject({ status: "all", hideIgnored: true, tag: "launch" });
  });
});

const row = (over: Partial<TopicListRow> = {}): TopicListRow => ({
  id: 1,
  title: "Çinliler bataryada sınır tanımıyor: Xiaomi'den 10.000 mAh",
  canonicalUrl: "https://chip.com.tr/a",
  score: 0.87654,
  sourceCount: 2,
  itemCount: 3,
  category: "Mobile",
  tags: ["launch", "turkey"],
  lang: "tr",
  status: "new",
  publishedAt: new Date("2026-10-21T10:00:00Z"),
  firstSeenAt: new Date("2026-10-21T10:00:00Z"),
  lastSeenAt: new Date("2026-10-21T11:00:00Z"),
  sources: [
    { key: "chip", name: "CHIP Online" },
    { key: "dh", name: "DonanımHaber" },
  ],
  llmSummary: null,
  ...over,
});

// Byte-order mark at the start of the CSV (makes Excel read it as UTF-8).
const BOM = "\uFEFF";

describe("export", () => {
  it("CSV: BOM for Excel, header row, quoted cells, Turkish letters kept", () => {
    const csv = toCsv([toExportRow(row({ title: 'He said "hi", then left' }))]);
    expect(
      csv.startsWith(
        BOM + "title,url,score,category,tags,language,published,sources,source_count,summary\r\n",
      ),
    ).toBe(true);
    expect(csv).toContain(
      '"He said ""hi"", then left",https://chip.com.tr/a,0.877,Mobile,"launch, turkey",tr,',
    );
    expect(csv).toContain('"CHIP Online, DonanımHaber",2,');
    expect(toCsv([toExportRow(row())])).toContain("Çinliler bataryada sınır tanımıyor");
  });

  it("CSV: a headline that looks like a formula can't run in a spreadsheet", () => {
    const csv = toCsv([toExportRow(row({ title: '=HYPERLINK("http://evil")' }))]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it("JSON: metadata plus the rows", () => {
    const json = JSON.parse(
      toJson([toExportRow(row())], { exportedAt: new Date("2026-10-27T00:00:00Z"), filters: "tag=launch" }),
    );
    expect(json).toMatchObject({ exportedAt: "2026-10-27T00:00:00.000Z", filters: "tag=launch", count: 1 });
    expect(json.topics[0]).toMatchObject({
      title: row().title,
      sources: "CHIP Online, DonanımHaber",
      score: 0.877,
    });
  });

  it("names the file after the date and the view", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(exportFilename("csv", {}, now, "UTC")).toBe("trend-pool-2026-10-27.csv");
    // 22:30 UTC is already the next day in Istanbul.
    expect(exportFilename("csv", {}, new Date("2026-10-27T22:30:00Z"), "Europe/Istanbul")).toBe(
      "trend-pool-2026-10-28.csv",
    );
    expect(exportFilename("json", { category: "AI", tag: "show hn" }, now, "UTC")).toBe(
      "trend-pool-2026-10-27-ai-show-hn.json",
    );
  });
});

describe("Pool tag filter", () => {
  it("takes several tags, exclusions and any spelling of a tag", () => {
    expect(parseTagFilter("Apple, launch, -Deals, !sponsored")).toEqual({
      include: ["apple", "launch"],
      exclude: ["deals", "sponsored"],
    });
    expect(parseTagFilter("Yapay Zeka")).toEqual({ include: ["ai"], exclude: [] });
    expect(parseTagFilter(" , ")).toEqual({ include: [], exclude: [] });
    expect(parseTagFilter(undefined)).toEqual({ include: [], exclude: [] });
  });
});
