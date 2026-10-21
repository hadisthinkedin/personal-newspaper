import { describe, expect, it } from "vitest";
import { buildNewsPayload } from "@/lib/news";

describe("buildNewsPayload", () => {
  it("reports successful and failed sources without dropping good articles", () => {
    const updatedAt = new Date("2026-10-17T12:00:00Z");
    const payload = buildNewsPayload(
      [
        {
          source: "Reuters",
          category: "global",
          ok: true,
          method: "Google News",
          articles: [{ id: "1", title: "Story", url: "https://reuters.com/1", source: "Reuters", category: "global", publishedAt: null, description: "", image: null, lens: "wire", viaAggregator: true }],
        },
        { source: "WDET", category: "detroit", ok: false, method: "direct", articles: [], error: "Timed out" },
      ],
      updatedAt,
    );

    expect(payload.updatedAt).toBe(updatedAt.toISOString());
    expect(payload.articles).toHaveLength(1);
    expect(payload.sources).toEqual([
      { source: "Reuters", category: "global", ok: true, count: 1, method: "Google News" },
      { source: "WDET", category: "detroit", ok: false, count: 0, method: "direct", error: "Timed out" },
    ]);
  });
});
