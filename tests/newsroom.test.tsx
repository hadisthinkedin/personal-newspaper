// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Newsroom from "@/components/Newsroom";
import type { NewsPayload } from "@/lib/news";

const payload: NewsPayload = {
  updatedAt: "2026-10-20T12:00:00.000Z",
  sources: [{ source: "AP World", category: "global", ok: true, count: 1, method: "Google News" }],
  upcomingEvents: [],
  articles: [{
    id: "houthi",
    title: "Houthi rebels strike Yemen’s government forces, killing at least 53",
    url: "https://apnews.com/article/yemen-houthis-saudi-fighting",
    source: "AP News",
    category: "global",
    publishedAt: "2026-10-20T20:37:00.000Z",
    description: "",
    image: null,
    lens: "wire",
    viaAggregator: true,
    sourceUrl: "https://apnews.com/article/yemen-houthis-saudi-fighting",
    content: "Houthi rebels struck forces aligned with Yemen’s internationally recognized government with ballistic missiles. The attack killed at least 53 soldiers at a military camp, Yemeni military officials said. An additional 200 recruits were wounded at the camp in the southern province of Shabwa. The provincial government said the death toll could rise as rescuers continued their work.",
  }],
};

afterEach(cleanup);

describe("substantive story prose", () => {
  it("offers only today's and yesterday's editions", () => {
    const { container } = render(<Newsroom initial={payload} editionDate="2026-10-20" editionKind="today" />);
    const links = [...container.querySelectorAll(".edition-picker a")];
    expect(links).toHaveLength(2);
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Today’s Edition", "/"],
      ["Yesterday’s Edition", "/?edition=yesterday"],
    ]);
    expect(container.textContent).not.toMatch(/older editions|archive/i);
  });

  it("leads with the event and does not pad a thin wire item with publishing-process commentary", () => {
    const { container } = render(<Newsroom initial={payload} editionDate="2026-10-20" editionKind="today" />);
    const story = container.querySelector("#global article.story-article");
    expect(story).not.toBeNull();
    const readableStory = story?.cloneNode(true) as HTMLElement;
    readableStory.querySelectorAll('[role="tooltip"]').forEach((tooltip) => tooltip.remove());
    const prose = readableStory.textContent?.toLowerCase() ?? "";

    expect(prose).toMatch(/houthi rebels (struck|strike).*yemen.*government forces/);
    expect(prose).toContain("at least 53");
    expect(prose).not.toMatch(/published headline|the report states|readers should consult|this edition/);
  });

  it("keeps headlines as plain text and cites the publisher only inline", () => {
    const { container } = render(<Newsroom initial={payload} editionDate="2026-10-20" editionKind="today" />);
    const story = container.querySelector("#global article.story-article");
    expect(story?.querySelector("h3 a")).toBeNull();
    expect(story?.querySelector("a.source-citation")).toHaveAttribute("href", "https://apnews.com/article/yemen-houthis-saudi-fighting");
  });

  it("cites the outlet whose full text was used when the original was paywalled", () => {
    const paywalled: NewsPayload = {
      ...payload,
      articles: [{
        ...payload.articles[0],
        id: "reuters",
        source: "Reuters",
        sourceUrl: "https://www.reuters.com/world/example",
        contentSource: "TradingView",
        contentUrl: "https://www.tradingview.com/news/example",
      }],
    };
    const { container } = render(<Newsroom initial={paywalled} editionDate="2026-10-20" editionKind="today" />);
    const story = container.querySelector("#global article.story-article");
    expect(story?.textContent).toContain("Full text via TradingView");
    expect(story?.querySelector("a.source-citation")).toHaveAttribute("href", "https://www.tradingview.com/news/example");
    expect(story?.textContent).toContain("at least 53");
  });

  it("does not send readers away from a headline-only story", () => {
    const thin: NewsPayload = {
      ...payload,
      articles: [{
        id: "eleven",
        title: "ElevenLabs launches a new speech model",
        url: "https://elevenlabs.io/blog/new-model",
        source: "ElevenLabs Blog",
        category: "elevenlabs",
        publishedAt: "2026-10-20T12:00:00.000Z",
        description: "A short teaser.",
        image: null,
        lens: "official",
        viaAggregator: false,
      }],
    };
    const { container } = render(<Newsroom initial={thin} editionDate="2026-10-20" editionKind="today" />);
    const story = container.querySelector("#elevenlabs article.story-article--thin");
    expect(story).not.toBeNull();
    expect(story?.querySelector("h3 a")).toBeNull();
    expect(story?.textContent).toContain("A short teaser.");
    expect(story?.textContent).not.toMatch(/read the full|open the headline|ersatz/i);
    expect(story?.querySelector("a.source-citation")).toHaveAttribute("href", "https://elevenlabs.io/blog/new-model");
  });
});
