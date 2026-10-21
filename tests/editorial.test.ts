import { describe, expect, it } from "vitest";
import { buildPerspectiveClusters, consequenceFor } from "@/lib/editorial";
import type { Article } from "@/lib/news";

function article(overrides: Partial<Article>): Article {
  return {
    id: "story",
    title: "A consequential development",
    url: "https://example.com/story",
    source: "Reuters",
    category: "global",
    publishedAt: "2026-10-19T00:00:00.000Z",
    description: "",
    image: null,
    lens: "wire",
    viaAggregator: false,
    ...overrides,
  };
}

describe("consequenceFor", () => {
  it("does not turn an international diplomacy story into technology analysis because incidental text contains AI", () => {
    const result = consequenceFor(article({
      title: "Putin proposes summit with Trump and Xi to discuss Ukraine deal",
      description: "The Financial Express carries analysis of diplomatic talks and capital markets.",
    }));

    expect(result).toContain("diplomacy");
    expect(result).not.toContain("product launch");
  });

  it("uses technology analysis for an actual technology story", () => {
    const result = consequenceFor(article({
      category: "technology",
      lens: "technology",
      title: "New AI chip changes model training costs",
    }));

    expect(result).toContain("technical capability");
  });
});

describe("buildPerspectiveClusters", () => {
  it("matches left- and right-leaning coverage to the same wire headline instead of mixing unrelated stories", () => {
    const wire = article({ id: "wire", title: "Trump announces new tariff negotiations with China", category: "global" as Article["category"] });
    const left = article({ id: "left", title: "Trump tariffs raise new concerns over China trade talks", category: "global" as Article["category"], source: "CNN", lens: "left-framing" });
    const right = article({ id: "right", title: "White House defends Trump tariff strategy in China negotiations", category: "global" as Article["category"], source: "Fox News", lens: "right-framing" });
    const unrelated = article({ id: "weather", title: "Storm brings rain to the Northeast", category: "global" as Article["category"], source: "CNN", lens: "left-framing" });

    expect(buildPerspectiveClusters([wire, unrelated, left, right])).toEqual([
      { anchor: wire, left, right },
    ]);
  });

  it("does not attach a perspective story merely because it shares one generic topic word", () => {
    const wire = article({ id: "wire", title: "President signs emergency budget bill after shutdown talks" });
    const unrelated = article({ id: "left", title: "Senator outlines long-term education budget priorities", source: "CNN", lens: "left-framing" });

    expect(buildPerspectiveClusters([wire, unrelated])).toEqual([{ anchor: wire }]);
  });

  it("does not attach an unrelated cyberattack video to a Haiti security story", () => {
    const haiti = article({
      id: "haiti",
      title: "Gangs in Haiti target foreign troops in the biggest attack since a new force began operations",
      source: "AP News",
    });
    const fridge = article({
      id: "fridge",
      title: "French fridge cyber attack reveals U.S. vulnerabilities, hackers are definitely targeting us, expert John Walsh reveals",
      source: "Fox News",
      lens: "right-framing",
    });

    expect(buildPerspectiveClusters([haiti, fridge])).toEqual([{ anchor: haiti }]);
  });

  it("groups matching AP and Reuters reports as one story and ranks that corroborated headline first", () => {
    const trivial = article({ id: "trivial", title: "President attends an evening dinner in Washington", publishedAt: "2026-10-19T12:00:00Z" });
    const reuters = article({ id: "reuters", title: "Congress passes emergency budget bill after shutdown talks", source: "Reuters", publishedAt: "2026-10-19T10:00:00Z" });
    const ap = article({ id: "ap", title: "Congress passes emergency budget bill to end shutdown", source: "AP News", publishedAt: "2026-10-19T09:00:00Z" });

    const clusters = buildPerspectiveClusters([trivial, reuters, ap]);

    expect(clusters[0].anchor).toBe(ap);
    expect(clusters[0].wireSupport).toBe(reuters);
    expect(clusters.filter((cluster) => [cluster.anchor.id, cluster.wireSupport?.id].includes("ap"))).toHaveLength(1);
  });
});
