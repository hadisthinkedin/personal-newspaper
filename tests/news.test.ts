import { describe, expect, it } from "vitest";
import { aiNewsScore, dedupeArticles, excerpt, FEEDS, normalizeItem, qualifies, sanitizeText, screenCinemaScore, selectSectionArticles, SECTIONS, type Article } from "@/lib/news";

const source = { name: "Example News", category: "global" as const, url: "https://example.com/feed", lens: "wire" as const };

describe("news normalization", () => {
  it("separates global and national headline desks instead of combining geography with a detached perspective desk", () => {
    expect(SECTIONS.slice(0, 2).map((section) => [section.id, section.label])).toEqual([
      ["global", "Global Headlines"],
      ["national", "National Headlines"],
    ]);
    expect(SECTIONS.some((section) => section.id === ("perspective" as typeof section.id))).toBe(false);
  });

  it("has a dedicated AI desk with official OpenAI, Anthropic, and Jev sources plus independent reporting", () => {
    expect(SECTIONS.some((section) => section.id === ("ai" as typeof section.id) && section.label === "Top AI News")).toBe(true);
    const aiFeeds = FEEDS.filter((feed) => feed.category === ("ai" as typeof feed.category));
    expect(aiFeeds.map((feed) => feed.name)).toEqual(expect.arrayContaining([
      "OpenAI News",
      "Anthropic News",
      "TypeSafe / Jev",
      "Reuters AI",
      "The Verge AI",
      "TechCrunch AI",
      "The New York Times Technology",
    ]));
  });
  it("normalizes a feed item and removes unsafe HTML", () => {
    const article = normalizeItem(
      {
        title: "  A real headline  ",
        link: "https://example.com/story?utm_source=rss#top",
        isoDate: "2026-10-17T12:00:00Z",
        contentSnippet: "<script>alert(1)</script><p>A concise <strong>summary</strong>.</p>",
        enclosure: { url: "https://images.example.com/photo.jpg", type: "image/jpeg" },
      },
      source,
    );

    expect(article).toMatchObject({
      title: "A real headline",
      url: "https://example.com/story",
      source: "Example News",
      category: "global",
      description: "A concise summary.",
      image: "https://images.example.com/photo.jpg",
      lens: "wire",
      viaAggregator: false,
    });
    expect(article?.id).toBeTruthy();
  });

  it("uses the named Google News publisher and removes its title suffix", () => {
    const article = normalizeItem(
      { title: "A policy development - Reuters", link: "https://news.google.com/rss/articles/abc", googleSource: "Reuters" },
      { ...source, name: "Reuters desk", viaGoogle: true },
    );
    expect(article).toMatchObject({ title: "A policy development", source: "Reuters", image: null, viaAggregator: true });
  });

  it("removes Google News navigation boilerplate instead of presenting it as article reporting", () => {
    const article = normalizeItem(
      {
        title: "A policy development - AP News",
        link: "https://news.google.com/rss/articles/ap",
        googleSource: "AP News",
        contentSnippet: "A policy development AP NewsSee more headlines & perspectives on the Google News app",
      },
      { ...source, name: "AP desk", viaGoogle: true },
    );
    expect(article?.description).toBe("");
  });

  it("rejects invalid, non-http, or titleless entries", () => {
    expect(normalizeItem({ title: "", link: "https://example.com" }, source)).toBeNull();
    expect(normalizeItem({ title: "Bad", link: "javascript:alert(1)" }, source)).toBeNull();
  });

  it("sanitizes active markup and limits source excerpts to 25 words", () => {
    expect(sanitizeText("<p>Hello &amp; goodbye</p><script>bad()</script>")).toBe("Hello & goodbye");
    expect(excerpt(Array.from({ length: 30 }, (_, index) => `word${index}`).join(" ")).split(/\s+/)).toHaveLength(25);
    expect(excerpt(Array.from({ length: 30 }, (_, index) => `word${index}`).join(" "))).toMatch(/…$/);
  });
});

describe("wire headline qualification", () => {
  const wire = (title: string): Article => ({
    id: title,
    title,
    description: title,
    url: "https://reuters.com/story",
    source: "Reuters",
    category: "global",
    publishedAt: null,
    image: null,
    lens: "wire",
    viaAggregator: true,
  });

  it.each([
    "A composite image shows the jet from a black hole at the center of a galaxy",
    "U.S. Vice President Kamala Harris meets with Democratic members in Washington",
    "Top Photos of the Day",
  ])("rejects Google News photo-caption artifacts: %s", (title) => {
    expect(qualifies(wire(title))).toBe(false);
  });

  it("keeps substantive Reuters reporting", () => {
    expect(qualifies(wire("Crisis-weary Hungarians lose faith in government"))).toBe(true);
  });

  it("rejects a non-English Google News duplicate from an English-language wire desk", () => {
    expect(qualifies(wire("Les USA ont repris le partage de renseignements avec l'Ukraine, dit Zelensky - Reuters"))).toBe(false);
  });

  it("reads AP's actual World and U.S. headline feeds instead of a keyword search that can return no AP stories", () => {
    const apFeeds = FEEDS.filter((feed) => feed.name.startsWith("AP "));
    expect(apFeeds).toHaveLength(2);
    expect(apFeeds.map((feed) => feed.url)).toEqual([
      expect.stringContaining("/headlines/section/topic/WORLD"),
      expect.stringContaining("/headlines/section/topic/NATION"),
    ]);
  });

  it("ranks consequential reporting above a newer low-value item instead of selecting feed order", () => {
    const newest = wire("Five things to know from today's political photo gallery");
    newest.id = "newest";
    newest.category = "michigan";
    newest.lens = "local";
    newest.publishedAt = "2026-10-19T12:00:00Z";
    const consequential = wire("Governor signs $2 billion school funding and infrastructure budget");
    consequential.id = "consequential";
    consequential.category = "michigan";
    consequential.lens = "local";
    consequential.publishedAt = "2026-10-19T10:00:00Z";

    expect(selectSectionArticles([newest, consequential], "michigan", 1)).toEqual([consequential]);
  });
});

describe("Top AI News qualification and ranking", () => {
  const aiArticle = (title: string, description = "", overrides: Partial<Article> = {}): Article => ({
    id: title,
    title,
    description,
    url: "https://example.com/ai-story",
    source: "The Verge",
    category: "ai",
    publishedAt: "2026-10-19T10:00:00Z",
    image: null,
    lens: "technology",
    viaAggregator: false,
    ...overrides,
  });

  it.each([
    ["OpenAI launches GPT-6 reasoning model for ChatGPT", "The model changes reliability and agent capabilities."],
    ["Anthropic updates Claude safety policy after new evaluation", "The lab publishes model behavior results."],
    ["Introducing System One Models and Jev", "TypeSafe releases Jev for structured automation."],
    ["Congress passes national AI safety and transparency law", "The legislation regulates artificial intelligence systems."],
    ["US restricts exports of AI chips used to train frontier models", "The policy affects model infrastructure."],
  ])("keeps material AI developments: %s", (title, description) => {
    expect(qualifies(aiArticle(title, description))).toBe(true);
  });

  it.each([
    "The 25 best ChatGPT prompts to try this weekend",
    "How to use AI to plan your next vacation",
    "Sponsored guide to buying an AI writing subscription",
    "Apple releases a new phone with a better camera",
  ])("rejects low-value or unrelated items: %s", (title) => {
    expect(qualifies(aiArticle(title))).toBe(false);
  });

  it("preserves coverage of OpenAI, Anthropic, and emerging tools when each has a qualifying development", () => {
    const openai = aiArticle("OpenAI launches GPT-6 for ChatGPT", "The release expands reasoning and agent capabilities.", { id: "openai", source: "OpenAI News", lens: "official" });
    const openaiSecond = aiArticle("OpenAI releases GPT-6.1 security model for ChatGPT", "The launch updates frontier safety systems.", { id: "openai-2", source: "OpenAI News", lens: "official" });
    const anthropic = aiArticle("Anthropic announces Claude usage update", "A product policy update.", { id: "anthropic", source: "Anthropic", lens: "official" });
    const jev = aiArticle("Jev reaches developers through Vercel AI Gateway", "TypeSafe expands access to its emerging model.", { id: "jev", source: "TechCrunch AI" });
    const selected = selectSectionArticles([openai, openaiSecond, anthropic, jev], "ai", 3);
    expect(selected.some((item) => /OpenAI|ChatGPT/.test(item.title))).toBe(true);
    expect(selected.some((item) => /Anthropic|Claude/.test(item.title))).toBe(true);
    expect(selected.some((item) => /Jev|TypeSafe/.test(`${item.title} ${item.description}`))).toBe(true);
  });

  it("ranks a major model launch above a newer prompt list and limits source dominance", () => {
    const launch = aiArticle("OpenAI launches GPT-6 reasoning model for ChatGPT", "A major frontier model release.", { id: "launch", source: "OpenAI News", lens: "official", publishedAt: "2026-10-19T09:00:00Z" });
    const policy = aiArticle("Anthropic updates Claude safety policy after new evaluation", "The policy changes frontier model deployment.", { id: "policy", source: "Anthropic", lens: "official", publishedAt: "2026-10-19T08:00:00Z" });
    const verge1 = aiArticle("AI company launches a model for enterprise agents", "The release adds automation capabilities.", { id: "v1", source: "The Verge", publishedAt: "2026-10-19T12:00:00Z" });
    const verge2 = aiArticle("US passes artificial intelligence safety law", "The regulation affects major model developers.", { id: "v2", source: "The Verge", publishedAt: "2026-10-19T11:00:00Z" });
    const verge3 = aiArticle("AI lab releases security evaluation for frontier model", "The research documents new risks.", { id: "v3", source: "The Verge", publishedAt: "2026-10-19T10:30:00Z" });
    const jev = aiArticle("Introducing System One Models and Jev", "TypeSafe releases an emerging AI tool.", { id: "jev", source: "TypeSafe AI", lens: "official", publishedAt: "2026-10-18T10:00:00Z" });
    expect(aiNewsScore(launch)).toBeGreaterThan(aiNewsScore(verge1));
    expect(aiNewsScore(jev)).toBeGreaterThan(aiNewsScore(verge1));
    const selected = selectSectionArticles([verge1, verge2, verge3, launch, policy, jev], "ai", 5);
    expect(selected).toContain(launch);
    expect(selected).toContain(policy);
    expect(selected).toContain(jev);
    expect(selected.filter((item) => item.source === "The Verge")).toHaveLength(2);
  });
});

describe("Screen & Cinema qualification", () => {
  const cinemaArticle = (title: string, description = "", overrides: Partial<Article> = {}): Article => ({
    id: title,
    title,
    description,
    url: "https://variety.com/story",
    source: "Variety",
    category: "screen-cinema",
    publishedAt: null,
    image: null,
    lens: "trade",
    viaAggregator: false,
    ...overrides,
  });

  it.each([
    ["Marvel Studios casts actor as new X-Men lead", "The feature film begins production this year."],
    ["Universal begins production on Christopher Nolan’s next film", "The Hollywood studio starts shooting the theatrical feature."],
    ["Greta Gerwig to direct new Warner Bros. feature film", "The filmmaker has boarded the studio movie."],
    ["Paramount sets theatrical release date for Mission: Impossible sequel", "The movie will open nationwide."],
    ["A24 acquires U.S. distribution rights to new thriller film", "The motion picture receives a theatrical release."],
  ])("keeps material Hollywood movie news: %s", (title, description) => {
    expect(qualifies(cinemaArticle(title, description))).toBe(true);
  });

  it.each([
    ["Inde Navarrette on Meeting Pamela Anderson, Hosting SNL and X-Men Stunt Training", "A profile mentioning her film career."],
    ["Shah Rukh Khan announces new Bollywood film", "The Indian cinema production begins this year."],
    ["China Box Office: Resident Evil Retains Top Spot", "The film leads the Chinese box office."],
    ["Korea Box Office: Anime Sensation Dominates Weekend", "The animated film leads the frame."],
    ["Video Game Reignites Ideas for a Film Franchise", "The director teases a future movie."],
    ["HBO renews acclaimed drama series for a third season", "The television show returns next fall."],
    ["Oscar winner reveals what making her latest movie taught her", "An interview with the actor."],
    ["Apple TV debuts a new original podcast", "The broadcast discusses a feature film."],
    ["Film festival announces award winners", "The awards honor this year’s movies."],
  ])("rejects profiles, non-Hollywood, television, and awards coverage: %s", (title, description) => {
    expect(qualifies(cinemaArticle(title, description))).toBe(false);
  });

  it("does not mistake podcast or cast teases for a casting transaction", () => {
    expect(qualifies(cinemaArticle("New podcast previews a Hollywood film", "The cast teases the movie."))).toBe(false);
  });

  it("requires explicit Hollywood scope even when a movie trade reports the item", () => {
    const generic = cinemaArticle("New feature film begins production", "A new theatrical movie starts shooting.");
    const scoped = cinemaArticle("Apple Original Films begins production on new feature", "The movie starts shooting.", { source: "Apple TV+ Press", lens: "official" });
    expect(qualifies(generic)).toBe(false);
    expect(qualifies(scoped)).toBe(true);
  });

  it("ranks material developments and limits source dominance", () => {
    const items = [
      cinemaArticle("Marvel Studios casts a new lead for feature film", "The movie enters production.", { id: "v1", source: "Variety", publishedAt: "2026-10-19T12:00:00Z" }),
      cinemaArticle("Warner Bros. begins production on feature film", "The theatrical movie starts shooting.", { id: "v2", source: "Variety", publishedAt: "2026-10-19T11:00:00Z" }),
      cinemaArticle("Paramount sets theatrical release for sequel film", "The movie opens nationwide.", { id: "v3", source: "Variety", publishedAt: "2026-10-19T10:00:00Z" }),
      cinemaArticle("A24 acquires film distribution rights", "The feature receives a theatrical release.", { id: "d1", source: "Deadline", publishedAt: "2026-10-19T09:00:00Z" }),
      cinemaArticle("Universal hires director for new feature film", "The movie enters production.", { id: "h1", source: "The Hollywood Reporter", publishedAt: "2026-10-19T08:00:00Z" }),
    ];
    expect(screenCinemaScore(items[0])).toBeGreaterThan(0);
    const selected = selectSectionArticles(items, "screen-cinema", 4);
    expect(selected).toHaveLength(4);
    expect(selected.filter((item) => item.source === "Variety")).toHaveLength(2);
  });
});

describe("dedupeArticles", () => {
  it("deduplicates canonical URLs and near-identical titles inside a desk, retaining the richer item", () => {
    const base = normalizeItem({ title: "One Big Story", link: "https://example.com/a?utm_medium=rss" }, source)!;
    const richer = { ...base, url: "https://example.com/a", description: "Useful context", image: "https://example.com/a.jpg" };
    const sameTitle = { ...base, id: "other", url: "https://another.example/story", title: "ONE big story!" };
    expect(dedupeArticles([base, richer, sameTitle])).toEqual([richer]);
  });

  it("keeps the same headline when it serves a different editorial desk", () => {
    const first = normalizeItem({ title: "Shared headline", link: "https://example.com/a" }, source)!;
    const second = { ...first, id: "second", category: "national" as const };
    expect(dedupeArticles([first, second])).toHaveLength(2);
  });
});
