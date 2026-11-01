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

  it("links every headline to the publisher page", () => {
    const { container } = render(<Newsroom initial={payload} editionDate="2026-10-20" editionKind="today" />);
    const link = container.querySelector("#global article.story-article h3 a.story-headline-link");
    expect(link).toHaveAttribute("href", "https://apnews.com/article/yemen-houthis-saudi-fighting");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("routes a headline-only story to the publisher instead of padding it", () => {
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
    expect(story?.querySelector("h3 a")).toHaveAttribute("href", "https://elevenlabs.io/blog/new-model");
    expect(story?.querySelector("a.read-full")?.textContent).toContain("ElevenLabs Blog");
    expect(story?.textContent).not.toMatch(/ersatz|no usable article facts/i);
  });
});
