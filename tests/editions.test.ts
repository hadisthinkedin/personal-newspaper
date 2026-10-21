import { describe, expect, it } from "vitest";
import { editionDateInDetroit, filterEditionArticles, loadArchivedEdition, relativeEditionDates } from "@/lib/editions";
import type { Article } from "@/lib/news";

function article(id: string, publishedAt: string | null): Article {
  return {
    id,
    title: `Headline ${id}`,
    url: `https://example.com/${id}`,
    source: "Example News",
    category: "global",
    publishedAt,
    description: "A consequential event with public impact.",
    image: null,
    lens: "wire",
    viaAggregator: false,
  };
}

describe("calendar-day editions", () => {
  it("uses America/Detroit calendar boundaries rather than UTC boundaries", () => {
    expect(editionDateInDetroit(new Date("2026-10-21T03:59:59Z"))).toBe("2026-10-20");
    expect(editionDateInDetroit(new Date("2026-10-21T04:00:00Z"))).toBe("2026-10-21");
  });

  it("includes only reports published on the requested Detroit calendar day", () => {
    const articles = [
      article("previous", "2026-10-21T03:59:59Z"),
      article("start", "2026-10-21T04:00:00Z"),
      article("end", "2026-10-22T03:59:59Z"),
      article("next", "2026-10-22T04:00:00Z"),
      article("undated", null),
    ];

    expect(filterEditionArticles(articles, "2026-10-21").map(({ id }) => id)).toEqual(["start", "end"]);
  });

  it("loads a GitHub archive defensively and drops cross-day records", async () => {
    const fetchArchive = async () => new Response(JSON.stringify({
      editionDate: "2026-10-20",
      updatedAt: "2026-10-21T03:55:00Z",
      sources: [],
      articles: [article("correct", "2026-10-20T16:00:00Z"), article("wrong", "2026-10-21T16:00:00Z")],
    }));

    const edition = await loadArchivedEdition("2026-10-20", fetchArchive);
    expect(edition?.articles.map(({ id }) => id)).toEqual(["correct"]);
    expect(edition?.editionDate).toBe("2026-10-20");
  });

  it("offers exactly today and yesterday for a given Detroit date", () => {
    expect(relativeEditionDates(new Date("2026-10-21T16:00:00Z"))).toEqual({
      today: "2026-10-21",
      yesterday: "2026-10-20",
    });
  });
});
