import { describe, expect, it } from "vitest";
import { fetchBurgessEvents, filterFutureEvents } from "@/lib/events";

const FIXTURE = `<!doctype html><html><head></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      upcomingEvents: [
        {
          id: "1994643496392",
          name: "Innovate State: Brewed Locally, Connected Globally",
          summary: "A panel on fintech.",
          url: "https://www.eventbrite.com/e/innovate-state-brewed-locally-connected-globally-tickets-1994643496392",
          start: { utc: "2027-01-15T22:00:00Z", local: "2027-01-15T17:00:00" },
          end: { utc: "2027-01-15T23:30:00Z", local: "2027-01-15T18:30:00" },
          primary_venue: { name: "Burgess Institute, East Lansing" },
          image: { url: "https://img.evbuc.com/example.jpg" },
          is_free: true,
          is_online_event: false,
        },
        {
          id: "stale-event",
          name: "Already past",
          url: "https://www.eventbrite.com/e/already-past-123",
          start: { utc: "2020-01-01T00:00:00Z", local: "2019-12-31T19:00:00" },
          end: { utc: "2020-01-01T02:00:00Z" },
        },
      ],
    },
  },
})}</script></body></html>`;

describe("burgess events scraper", () => {
  it("normalizes upcomingEvents from __NEXT_DATA__", async () => {
    const fetcher: typeof fetch = async () => new Response(FIXTURE, { status: 200, headers: { "content-type": "text/html" } });
    const events = await fetchBurgessEvents(fetcher);
    expect(events.length).toBe(2);
    const first = events.find((e) => e.id === "1994643496392")!;
    expect(first.name).toContain("Brewed Locally");
    expect(first.startIso).toBe("2027-01-15T22:00:00.000Z");
    expect(first.venue).toBe("Burgess Institute, East Lansing");
    expect(first.isFree).toBe(true);
    expect(first.organizer).toBe("Burgess Institute");
  });

  it("filters out finished events relative to now", async () => {
    const fetcher: typeof fetch = async () => new Response(FIXTURE, { status: 200, headers: { "content-type": "text/html" } });
    const events = await fetchBurgessEvents(fetcher);
    const future = filterFutureEvents(events, new Date("2026-10-25T00:00:00Z"));
    expect(future.map((e) => e.id)).toEqual(["1994643496392"]);
  });

  it("returns empty on error without throwing", async () => {
    const fetcher: typeof fetch = async () => { throw new Error("network down"); };
    const events = await fetchBurgessEvents(fetcher);
    expect(events).toEqual([]);
  });
});
