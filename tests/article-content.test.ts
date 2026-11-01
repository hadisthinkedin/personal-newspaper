import { describe, expect, it, vi } from "vitest";
import { enrichArticleContent, extractArticleText, findAlternateCoverage, parseGoogleNewsCandidates } from "@/lib/article-content";
import { storyParagraphs } from "@/lib/editorial";
import type { Article } from "@/lib/news";

const houthiStory: Article = {
  id: "houthi-yemen",
  title: "Houthi rebels strike Yemen’s government forces, killing at least 53",
  url: "https://news.google.com/rss/articles/example?oc=5",
  source: "AP News",
  category: "global",
  publishedAt: "2026-10-19T20:37:00.000Z",
  description: "",
  image: null,
  lens: "wire",
  viaAggregator: true,
};

describe("linked article content", () => {
  it("drops a leading AP photo caption when structured data contains the full report", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      articleBody: "People ride in a pickup truck during a funeral procession. (AP Photo/Example) CAIRO (AP) — Houthi rebels struck Yemeni government forces with ballistic missiles. The attack killed at least 53 soldiers.",
    })}</script>`;

    const content = extractArticleText(html);

    expect(content).toMatch(/^CAIRO \(AP\) — Houthi rebels/);
    expect(content).not.toContain("funeral procession");
  });

  it("extracts only AP's story body instead of duplicating surrounding photo captions", () => {
    const html = `<html><body>
      <p>People ride in a pickup truck during a funeral procession. (AP Photo/Example)</p>
      <div class="RichTextStoryBody RichTextBody">
        <p>Houthi rebels struck Yemeni government forces with ballistic missiles on Monday.</p>
        <p>The attack killed at least 53 soldiers at a military camp, officials said.</p>
        <div class="advertisement"><p>Advertisement</p></div>
        <p>An additional 200 recruits were wounded in southern Shabwa province.</p>
        <p>The rebels acknowledged targeting the camp.</p>
      </div>
      <p>People ride in a pickup truck during a funeral procession. (AP Photo/Example)</p>
    </body></html>`;

    const content = extractArticleText(html);

    expect(content).toContain("at least 53 soldiers");
    expect(content).toContain("200 recruits were wounded");
    expect(content).not.toContain("funeral procession");
    expect(content.match(/Houthi rebels struck/g)).toHaveLength(1);
  });

  it("uses facts extracted from a Google News source instead of generating headline/source boilerplate", async () => {
    const directUrl = "https://apnews.com/article/yemen-houthis-saudi-fighting-example";
    const articleHtml = `
      <html><body>
        <div id="article-body" itemprop="articleBody">
          <div class="subscriber-preview"><p>Iran-backed Houthi rebels struck Yemeni government forces with ballistic missiles on Monday.</p></div>
          <div class="subscriber-preview"><p>The attack killed at least 53 soldiers at a military camp, Yemeni military officials said.</p></div>
          <div class="subscriber-preview"><p>An additional 200 recruits were wounded at the camp in the southern province of Shabwa.</p></div>
          <div class="subscriber-preview"><p>The provincial government said the death toll could rise.</p></div>
        </div>
      </body></html>`;
    const batchPayload = JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", directUrl]), null, null, null, "0"]]);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('<c-wiz><div jscontroller="x" data-n-a-sg="signature" data-n-a-ts="123"></div></c-wiz>'))
      .mockResolvedValueOnce(new Response(batchPayload))
      .mockResolvedValueOnce(new Response(articleHtml, { headers: { "content-type": "text/html" } }));

    const enriched = await enrichArticleContent(houthiStory, fetcher);
    const paragraphs = storyParagraphs(enriched);
    const prose = paragraphs.join(" ");

    expect(enriched.sourceUrl).toBe(directUrl);
    expect(enriched.content).toContain("ballistic missiles");
    expect(prose).toContain("200 recruits were wounded");
    expect(prose).not.toContain("published the report used for this story");
    expect(prose).not.toContain("Its published headline is");
    expect(prose).not.toContain("Readers should consult the linked account");
  });

  it("uses the AP translation mirror when AP blocks the direct server request", async () => {
    const directUrl = "https://apnews.com/article/yemen-houthis-saudi-fighting-example";
    const translatedHtml = `<html><body><div id="article-body" itemprop="articleBody">
      <p>Houthi rebels struck Yemeni government forces with ballistic missiles on Monday.</p>
      <p>The attack killed at least 53 soldiers at a military camp, officials said.</p>
      <p>An additional 200 recruits were wounded in the southern province of Shabwa.</p>
      <p>Authorities said rescue operations were continuing and the toll could rise.</p>
    </div></body></html>`;
    const batchPayload = JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", directUrl]), null, null, null, "0"]]);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('<c-wiz><div data-n-a-sg="signature" data-n-a-ts="123"></div></c-wiz>'))
      .mockResolvedValueOnce(new Response(batchPayload))
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(new Response(translatedHtml, { headers: { "content-type": "text/html" } }));

    const enriched = await enrichArticleContent(houthiStory, fetcher);

    expect(fetcher.mock.calls[3]?.[0].toString()).toContain("apnews-com.translate.goog/article/");
    expect(enriched.sourceUrl).toBe(directUrl);
    expect(enriched.content).toContain("at least 53 soldiers");
    expect(enriched.content).toContain("200 recruits were wounded");
  });

  it("keeps every rendered factual paragraph within the four-to-six sentence contract", () => {
    const content = Array.from({ length: 11 }, (_, index) => `Sentence ${index + 1} provides a substantive reported fact.`).join(" ");
    const paragraphs = storyParagraphs({ ...houthiStory, content });
    const counts = paragraphs.map((paragraph) => paragraph.match(/\./g)?.length ?? 0);

    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((count) => count >= 4 && count <= 6)).toBe(true);
  });
});

describe("alternate coverage for paywalled stories", () => {
  const reuters: Article = {
    id: "elsayed",
    title: "US Senate candidate El-Sayed wants Democratic rival to stay away, source says",
    url: "https://www.reuters.com/world/us/elsayed",
    source: "Reuters",
    category: "abdul",
    publishedAt: "2026-10-31T12:00:00.000Z",
    description: "",
    image: null,
    lens: "tracker",
    viaAggregator: true,
  };
  const rss = `<rss><channel>
    <item><title>US Senate candidate El-Sayed wants Democratic rival to stay away, source says - Reuters</title><link>https://news.google.com/rss/articles/R1</link><pubDate>Sat, 31 Oct 2026 13:00:00 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item>
    <item><title>El-Sayed campaign wants Stevens to stay away - Politico</title><link>https://news.google.com/rss/articles/P1</link><pubDate>Sat, 31 Oct 2026 13:00:00 GMT</pubDate><source url="https://www.politico.com">Politico</source></item>
    <item><title>US Senate candidate El-Sayed wants Democratic rival to stay away, source says - TradingView</title><link>https://www.tradingview.com/news/elsayed</link><pubDate>Sat, 31 Oct 2026 14:00:00 GMT</pubDate><source url="https://www.tradingview.com">TradingView</source></item>
    <item><title>El-Sayed and Stevens clash in final primary debate before Democratic rival stay away fight - Bridge Michigan</title><link>https://news.google.com/rss/articles/B1</link><pubDate>Mon, 03 Aug 2026 13:00:00 GMT</pubDate><source url="https://www.bridgemi.com">Bridge Michigan</source></item>
    <item><title>US Senate candidate El-Sayed wants Democratic rival to stay away - TMZ</title><link>https://news.google.com/rss/articles/T1</link><pubDate>Sat, 31 Oct 2026 13:00:00 GMT</pubDate><source url="https://www.tmz.com">TMZ</source></item>
    <item><title>Lions beat Packers in overtime - Detroit Free Press</title><link>https://www.freep.com/lions</link><pubDate>Sat, 31 Oct 2026 13:00:00 GMT</pubDate><source url="https://www.freep.com">Detroit Free Press</source></item>
  </channel></rss>`;
  const body = "<article>" + Array.from({ length: 8 }, (_, index) => `<p>Paragraph ${index + 1} explains in detail what the El-Sayed campaign asked of Haley Stevens this week.</p>`).join("") + "</article>";

  it("keeps only same-cycle similar stories from other, readable outlets", () => {
    const candidates = parseGoogleNewsCandidates(rss, reuters);
    expect(candidates.map((candidate) => candidate.publisher)).toEqual(["TradingView"]);
  });

  it("reads the full story from the alternate outlet and records it for citation", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://news.google.com/rss/search")) return new Response(rss, { headers: { "content-type": "application/rss+xml" } });
      if (url === "https://www.tradingview.com/news/elsayed") return new Response(body, { headers: { "content-type": "text/html" } });
      return new Response("blocked", { status: 403 });
    });
    const alternate = await findAlternateCoverage(reuters, fetcher);
    expect(alternate?.source).toBe("TradingView");
    expect(alternate?.url).toBe("https://www.tradingview.com/news/elsayed");
    expect(alternate?.content).toContain("Paragraph 8");
  });
});
