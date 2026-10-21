import { describe, expect, it } from "vitest";
import { classify, normalizeTags, topByFrequency } from "../lib/pipeline/classify";
import { normalizeTitle } from "../lib/pipeline/normalize";

const cat = (title: string, tags: string[] = [], lang?: string) =>
  classify({ titles: [normalizeTitle(title, lang)], tags: normalizeTags(tags) }).category;

describe("classify", () => {
  it("categorizes English tech headlines", () => {
    expect(cat("OpenAI releases GPT-6 with agentic coding")).toBe("AI");
    expect(cat("Fintech startup raises $40M Series B led by Accel")).toBe("Startups");
    expect(cat("Nvidia unveils new GPU architecture for data centers")).toBe("Hardware");
    expect(cat("Linux 7.3 released with new kernel scheduler")).toBe("Software");
    expect(cat("Ransomware gang claims breach of hospital network")).toBe("Security");
    expect(cat("SpaceX rocket lands on Mars test pad, NASA says")).toBe("Science & Space");
  });

  it("categorizes Turkish headlines, including suffixed words", () => {
    expect(cat("Yapay zekâ girişimi 10 milyon dolar yatırım aldı", [], "tr")).toBe("Startups");
    expect(cat("Yeni yapay zeka modeli Türkçe destekliyor", [], "tr")).toBe("AI");
    expect(cat("Galatasaray - Fenerbahçe maçı ne zaman?", [], "tr")).toBe("Sports");
    expect(cat("manisa fk - muğlaspor", [], "tr")).toBe("Sports");
    expect(cat("Elektrikli otomobil satışları rekor kırdı", [], "tr")).toBe("Auto & EV");
    expect(cat("Merkez Bankası faiz kararını açıkladı", [], "tr")).toBe("Business");
  });

  it("uses feed/source tags as a strong signal", () => {
    expect(cat("The next chapter", ["Artificial Intelligence"])).toBe("AI");
    expect(cat("Haftanın öne çıkanları", ["Oyun", "PC"], "tr")).toBe("Gaming");
  });

  it("avoids Turkish/English false friends", () => {
    // "ev" (home), "mac" (Apple), "light" (lig*), "golf" (gol*) must not trigger Auto/Sports.
    expect(cat("Ev fiyatları yükseliyor", [], "tr")).not.toBe("Auto & EV");
    expect(cat("Apple's new Mac lineup")).not.toBe("Sports");
    expect(cat("Lightweight golf gadgets")).not.toBe("Sports");
  });

  it("leaves topics without signal uncategorized", () => {
    expect(cat("nikumaroro")).toBeNull();
    expect(cat("Someone behind the software is me")).toBe("Software");
  });
});

describe("normalizeTags", () => {
  it("folds case/accents, removes noise and duplicates", () => {
    expect(normalizeTags(["Yapay Zeka", "yapay zekâ", "Genel", "AI", " ", null, "Haberler"])).toEqual([
      "yapay zeka",
      "ai",
    ]);
  });

  it("caps the number of tags", () => {
    expect(
      normalizeTags(
        Array.from({ length: 30 }, (_, i) => `tag${i}`),
        5,
      ),
    ).toHaveLength(5);
  });
});

describe("topByFrequency", () => {
  it("orders by count, ties by first appearance", () => {
    expect(topByFrequency(["tr", "en", "en", "tr", "en"], 1)).toEqual(["en"]);
    expect(topByFrequency(["a", "b", "b", "c"], 2)).toEqual(["b", "a"]);
  });
});

describe("classify (real uncategorized headlines from a run)", () => {
  it.each([
    ["Opel, Astra’nın fiyatını düşürdü: Daha ucuz versiyonda neler eksildi?", "tr", "Auto & EV"],
    ["Apple'ın 1.4nm çipleri için tarih ortaya çıktı: A22 Pro ilk olabilir", "tr", "Hardware"],
    ["Stripe will acquire OpenRouter for $7.5B", "en", "Startups"],
    ["Çukurova Belediyesi'ne operasyon: Belediye Başkanı dahil 44 kişi gözaltına alındı", "tr", "Politics"],
    [
      "Airbus, HÜRJET Üzerinden Türkiye İle Havacılık Ortaklığını Büyütmeyi Hedefliyor",
      "tr",
      "Aviation & Defense",
    ],
    ["Wine Ported to OpenBSD", "en", "Software"],
    ["Making Solar Panels with a Microwave [video]", "en", "Science & Space"],
  ])("%s", (title, lang, expected) => {
    expect(cat(title, [], lang)).toBe(expected);
  });
});
