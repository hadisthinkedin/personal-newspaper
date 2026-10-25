import crypto from "node:crypto";
import Parser from "rss-parser";
import sanitizeHtml from "sanitize-html";
import { unstable_cache } from "next/cache";
import { enrichArticleContent } from "@/lib/article-content";
import { fetchBurgessEvents, filterFutureEvents, type UpcomingEvent } from "@/lib/events";

export const SECTIONS = [
  { id: "global", label: "Global Headlines", dek: "The world’s consequential events, with wire facts followed by the emphases found in left- and right-leaning American coverage.", limit: 12 },
  { id: "national", label: "National Headlines", dek: "The biggest United States stories, separating the factual baseline from how CNN and Fox frame the same developments.", limit: 12 },
  { id: "michigan", label: "Michigan", dek: "State government, elections, education, the economy and public accountability.", limit: 4 },
  { id: "detroit", label: "Detroit", dek: "Consequential government, housing, infrastructure, safety and community reporting.", limit: 3 },
  { id: "warren-macomb", label: "Warren & Macomb", dek: "Developments close to home that materially affect residents.", limit: 3 },
  { id: "lansing", label: "Lansing & East Lansing", dek: "City government, MSU and significant public-safety or development stories.", limit: 3 },
  { id: "abdul", label: "Abdul El-Sayed Tracker", dek: "Campaign actions, policy positions and election reporting without the social-media noise.", limit: 3 },
  { id: "mamdani", label: "Zohran Mamdani Tracker", dek: "Government actions and policy implementation, separated from praise, criticism and viral clips.", limit: 3 },
  { id: "technology", label: "Technology", dek: "Products, platforms and the broader technology market, checked against primary documentation where possible.", limit: 4 },
  { id: "ai", label: "Top AI News", dek: "The most consequential developments in ChatGPT, OpenAI, Anthropic, frontier models, policy, safety and genuinely useful emerging AI tools.", limit: 6 },
  { id: "screen-cinema", label: "Screen & Cinema", dek: "Confirmed casting, production, directing, release, franchise and studio-business developments in Hollywood movies.", limit: 5 },
  { id: "good-news", label: "Meaningful Good News", dek: "Approved treatments, implemented policy, real funding and measurable progress—not vague future promises.", limit: 3 },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
export type Lens = "wire" | "left-framing" | "right-framing" | "local" | "tracker" | "technology" | "trade" | "official";
export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  category: SectionId;
  publishedAt: string | null;
  description: string;
  image: string | null;
  lens: Lens;
  viaAggregator: boolean;
  sourceUrl?: string;
  content?: string;
};
export type SourceHealth = { source: string; category: SectionId; ok: boolean; count: number; method: "direct" | "Google News"; error?: string };
export type NewsPayload = { articles: Article[]; updatedAt: string; sources: SourceHealth[]; upcomingEvents: UpcomingEvent[] };
export type FeedSource = { name: string; category: SectionId; url: string; lens: Lens; viaGoogle?: boolean; allowedPublishers?: string[] };
type FeedItem = Parser.Item & Record<string, unknown>;
type FeedResult = { source: string; category: SectionId; ok: boolean; articles: Article[]; method: "direct" | "Google News"; error?: string };

function googleNews(query: string) {
  const params = new URLSearchParams({ q: query, hl: "en-US", gl: "US", ceid: "US:en" });
  return `https://news.google.com/rss/search?${params}`;
}

function googleNewsTopic(topic: "WORLD" | "NATION") {
  return `https://news.google.com/rss/headlines/section/topic/${topic}?hl=en-US&gl=US&ceid=US:en`;
}

export const FEEDS: FeedSource[] = [
  { name: "AP World", category: "global", url: googleNewsTopic("WORLD"), lens: "wire", viaGoogle: true, allowedPublishers: ["AP News"] },
  { name: "Reuters World", category: "global", url: googleNews("site:reuters.com (Ukraine OR Russia OR China OR Israel OR Europe OR Asia OR Africa OR \"Middle East\") when:2d -sports"), lens: "wire", viaGoogle: true, allowedPublishers: ["Reuters"] },
  { name: "CNN World", category: "global", url: googleNews("site:cnn.com (Ukraine OR Russia OR China OR Israel OR Europe OR Asia OR Africa OR \"Middle East\") when:2d -sports"), lens: "left-framing", viaGoogle: true, allowedPublishers: ["CNN"] },
  { name: "Fox World", category: "global", url: googleNews("site:foxnews.com (Ukraine OR Russia OR China OR Israel OR Europe OR Asia OR Africa OR \"Middle East\") when:2d -sports"), lens: "right-framing", viaGoogle: true, allowedPublishers: ["Fox News"] },
  { name: "AP U.S.", category: "national", url: googleNewsTopic("NATION"), lens: "wire", viaGoogle: true, allowedPublishers: ["AP News"] },
  { name: "Reuters U.S.", category: "national", url: googleNews("source:Reuters Trump when:4d -sports"), lens: "wire", viaGoogle: true, allowedPublishers: ["Reuters"] },
  { name: "CNN U.S.", category: "national", url: googleNews("site:cnn.com (politics OR economy OR health OR immigration OR Congress OR \"White House\" OR Supreme Court) when:2d -sports"), lens: "left-framing", viaGoogle: true, allowedPublishers: ["CNN"] },
  { name: "Fox U.S.", category: "national", url: googleNews("site:foxnews.com (politics OR economy OR health OR immigration OR Congress OR \"White House\" OR Supreme Court) when:2d -sports"), lens: "right-framing", viaGoogle: true, allowedPublishers: ["Fox News"] },
  { name: "Bridge Michigan", category: "michigan", url: "https://bridgemi.com/feed/", lens: "local" },
  { name: "Michigan Public", category: "michigan", url: "https://www.michiganpublic.org/index.rss", lens: "local" },
  { name: "Michigan Advance", category: "michigan", url: "https://michiganadvance.com/feed/", lens: "local" },
  { name: "BridgeDetroit", category: "detroit", url: "https://www.bridgedetroit.com/feed/", lens: "local" },
  { name: "WDET", category: "detroit", url: "https://wdet.org/feed/", lens: "local" },
  { name: "Warren / Macomb desk", category: "warren-macomb", url: googleNews("site:macombdaily.com (Warren OR Macomb) when:14d"), lens: "tracker", viaGoogle: true },
  { name: "Lansing City Pulse", category: "lansing", url: "https://lansingcitypulse.com/feed/", lens: "local" },
  { name: "East Lansing Info", category: "lansing", url: "https://eastlansinginfo.news/feed/", lens: "local" },
  { name: "Lansing / MSU desk", category: "lansing", url: googleNews("((site:lansingstatejournal.com OR site:statenews.com) (Lansing OR \"East Lansing\" OR MSU)) when:7d"), lens: "tracker", viaGoogle: true },
  { name: "Abdul El-Sayed desk", category: "abdul", url: googleNews("\"Abdul El-Sayed\" when:14d"), lens: "tracker", viaGoogle: true },
  { name: "Zohran Mamdani desk", category: "mamdani", url: googleNews("\"Zohran Mamdani\" when:7d"), lens: "tracker", viaGoogle: true },
  { name: "The Verge", category: "technology", url: "https://www.theverge.com/rss/index.xml", lens: "technology" },
  { name: "Ars Technica", category: "technology", url: "https://feeds.arstechnica.com/arstechnica/index", lens: "technology" },
  { name: "TechCrunch", category: "technology", url: "https://techcrunch.com/feed/", lens: "technology" },
  { name: "OpenAI News", category: "ai", url: "https://openai.com/news/rss.xml", lens: "official" },
  { name: "Anthropic News", category: "ai", url: googleNews("site:anthropic.com/news Anthropic when:30d"), lens: "official", viaGoogle: true, allowedPublishers: ["Anthropic"] },
  { name: "TypeSafe / Jev", category: "ai", url: googleNews("site:typesafe.ai/blog (Jev OR \"System One\") when:90d"), lens: "official", viaGoogle: true, allowedPublishers: ["TypeSafe AI"] },
  { name: "Reuters AI", category: "ai", url: googleNews("source:Reuters (OpenAI OR ChatGPT OR Anthropic OR Claude OR \"artificial intelligence\" OR \"AI model\") when:7d"), lens: "technology", viaGoogle: true, allowedPublishers: ["Reuters"] },
  { name: "The Verge AI", category: "ai", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", lens: "technology" },
  { name: "TechCrunch AI", category: "ai", url: "https://techcrunch.com/category/artificial-intelligence/feed/", lens: "technology" },
  { name: "The New York Times Technology", category: "ai", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", lens: "technology" },
  { name: "Variety", category: "screen-cinema", url: "https://variety.com/v/film/feed/", lens: "trade" },
  { name: "Deadline", category: "screen-cinema", url: "https://deadline.com/v/film/feed/", lens: "trade" },
  { name: "The Hollywood Reporter", category: "screen-cinema", url: "https://www.hollywoodreporter.com/c/movies/movie-news/feed/", lens: "trade" },
  { name: "Apple TV+ Press", category: "screen-cinema", url: "https://www.apple.com/tv-pr/news-feed.xml", lens: "official" },
  { name: "Disney", category: "screen-cinema", url: "https://thewaltdisneycompany.com/feed/", lens: "official" },
  { name: "U.S. FDA", category: "good-news", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", lens: "official" },
  { name: "WHO / FDA / UNICEF desk", category: "good-news", url: googleNews("(site:who.int OR site:fda.gov OR site:unicef.org) (approved OR funding OR launched OR decline OR progress) when:14d"), lens: "official", viaGoogle: true },
];

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
      ["dc:date", "dcDate"],
      ["source", "googleSource"],
    ],
  },
});

export function sanitizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  const withoutActive = input.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const clean = sanitizeHtml(withoutActive, { allowedTags: [], allowedAttributes: {} });
  return clean
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&(?:lt|#60);/gi, "<")
    .replace(/&(?:gt|#62);/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  [...url.searchParams.keys()].forEach((key) => {
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  });
  return url.toString().replace(/\?$/, "");
}

function firstMediaUrl(value: unknown): string | null {
  const list = Array.isArray(value) ? value : [value];
  for (const entry of list) {
    if (typeof entry === "string") {
      const url = safeUrl(entry);
      if (url) return url;
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const attributes = (record.$ ?? record) as Record<string, unknown>;
      const url = safeUrl(attributes.url ?? attributes.href);
      if (url) return url;
    }
  }
  return null;
}

function htmlImage(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const match = value.match(/<img[^>]+src=["']([^"']+)["']/i);
    const url = match && safeUrl(match[1]);
    if (url) return url;
  }
  return null;
}

function itemImage(item: FeedItem): string | null {
  const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && (!enclosure.type || enclosure.type.startsWith("image/"))) {
    const url = safeUrl(enclosure.url);
    if (url) return url;
  }
  const itunes = item.itunes as { image?: string } | undefined;
  return firstMediaUrl(item.mediaContent) || firstMediaUrl(item.mediaThumbnail) || safeUrl(itunes?.image) || htmlImage(item.contentEncoded, item.content, item.summary);
}

function googlePublisher(item: FeedItem): string | null {
  return sanitizeText(item.googleSource) || null;
}

function cleanGoogleTitle(title: string, publisher: string | null) {
  if (!publisher) return title;
  const suffix = ` - ${publisher}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

export function normalizeItem(item: FeedItem, source: FeedSource): Article | null {
  const publisher = source.viaGoogle ? googlePublisher(item) : null;
  const rawTitle = sanitizeText(item.title);
  const title = source.viaGoogle ? cleanGoogleTitle(rawTitle, publisher) : rawTitle;
  const rawUrl = safeUrl(item.link ?? item.guid);
  if (title.replace(/[^a-z0-9]/gi, "").length < 8 || !rawUrl) return null;

  const url = canonicalUrl(rawUrl);
  const rawDate = item.isoDate ?? item.pubDate ?? item.dcDate;
  let publishedAt: string | null = null;
  if (typeof rawDate === "string") {
    const date = new Date(rawDate);
    if (!Number.isNaN(date.getTime())) publishedAt = date.toISOString();
  }

  let description = sanitizeText(item.contentSnippet ?? item.summary ?? item.contentEncoded ?? item.content).slice(0, 420);
  if (source.viaGoogle) {
    description = description.replace(/\s*See more headlines\s*&\s*perspectives[\s\S]*$/i, "").trim();
    if (description === rawTitle || description === `${title} ${publisher ?? ""}`.trim()) description = "";
  }

  return {
    id: crypto.createHash("sha1").update(`${source.category}:${url}`).digest("hex").slice(0, 16),
    title,
    url,
    source: publisher ?? source.name,
    category: source.category,
    publishedAt,
    description,
    image: source.viaGoogle ? null : itemImage(item),
    lens: source.lens,
    viaAggregator: Boolean(source.viaGoogle),
  };
}

function richness(article: Article) {
  return (article.image ? 2 : 0) + (article.description ? 1 : 0) + (article.publishedAt ? 0.5 : 0);
}

function titleKey(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function dedupeArticles(input: Article[]): Article[] {
  const map = new Map<string, Article>();
  const titles = new Map<string, string>();
  for (const article of input) {
    const urlKey = `${article.category}:${canonicalUrl(article.url)}`;
    const title = `${article.category}:${titleKey(article.title)}`;
    const key = titles.get(title) ?? urlKey;
    const prior = map.get(key);
    if (!prior || richness(article) > richness(prior)) map.set(key, article);
    titles.set(title, key);
  }
  return [...map.values()].sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0));
}

export function excerpt(input: string, maximumWords = 25) {
  const words = sanitizeText(input).split(/\s+/).filter(Boolean);
  const shortened = words.length > maximumWords;
  return `${words.slice(0, maximumWords).join(" ")}${shortened ? "…" : ""}`;
}

const MOVIE_MEDIUM = /\b(films?|movies?|feature(?: film)?|motion picture|theatrical|cinema|box office|sequel|prequel|biopic|documentary)\b/i;
const CASTING_EVENT = /\b(?:casts? (?!teases?\b|members?\b|discuss(?:es|ed)?\b)[^.!?]{1,60}(?:\bas\b|\bin\b|\bfor\b)|casts? (?:an? )?(?:actor|actress)|cast as|joins? (?:the )?cast|set to star|tapped to (?:star|play)|in talks to (?:star|join))\b/i;
const PRODUCTION_EVENT = /\b(?:greenlit|greenlights?|begins? production|enters production|begins? filming|starts? shooting|wraps? (?:production|filming)|halts? production|shuts? down production|put on ice)\b/i;
const DIRECTING_EVENT = /\b(?:to direct|will direct|boards? as director|hires? [^.!?]{0,50} director|directorial debut)\b/i;
const RELEASE_EVENT = /\b(?:sets?|moves?|delays?|pushes?|pulls?) [^.!?]{0,60}\b(?:release(?: date)?|theatrical release)\b|\b(?:trailer|teaser|first look)\b/i;
const BUSINESS_EVENT = /\b(?:acquires?|lands?|options?|finances?|distribution rights?|distribution deal|box office|opening weekend|studio merger|movie slate|film slate|franchise|reboot|remake|sequel|prequel|spin-?off)\b/i;
const TV_ONLY = /\b(?:TV series|television series|drama series|limited series|streaming series|season \d+|new season|showrunner|episodes?|renew(?:s|ed)?|cancel(?:s|ed|led)?)\b/i;
const PERSONALITY_OR_PROMO = /\b(?:interview|profile|red carpet|fashion|style|dating|wedding|personal life|opens up|looks back|relives|reveals?|reacts?|meets?|meeting|hosting SNL|stunt training|net worth)\b/i;
const AWARDS_OR_OBITUARY = /\b(?:awards?|nominations?|nominees?|Oscars?|Emmys?|Golden Globes?|festival awards?|dies|dead|obituary|aged \d+)\b/i;
const NON_HOLLYWOOD_INDUSTRY = /\b(?:Bollywood|Tollywood|Kollywood|Nollywood|Indian cinema|Hindi-language film|Tamil-language film|Telugu-language film|China(?:'s)? box office|Chinese box office|Korea(?:n)? box office|Korean cinema|K-drama|anime|Busan)\b/i;
const NON_MOVIE_MEDIUM = /\b(?:video games?|gaming|podcasts?|soundtracks?|concert film|music video)\b/i;
const WIRE_MEDIA_CAPTION = /^(?:top photos|editor'?s choice pictures|a (?:composite )?image (?:shows|of)|(?:u\.s\. )?(?:vice )?president .{0,120} (?:meets with|watches? the)|tourists? visit|smoke and flames rise|a soldier (?:takes|poses))/i;
const NON_ENGLISH_WIRE_WORD = /\b(?:les|des|avec|dans|une|dit|ont|aux|pour|selon|repris|partage|renseignements|guerre|los|las|una|según|dice|gobierno|guerra)\b/gi;
const HOLLYWOOD_SCOPE = /\b(?:Hollywood|domestic box office|Marvel Studios|DC Studios|Warner Bros\.?|Universal(?: Pictures)?|Paramount(?: Pictures)?|Sony Pictures|Columbia Pictures|Amazon MGM|MGM|Lionsgate|A24|Neon|Focus Features|Searchlight Pictures|20th Century Studios|Pixar|Walt Disney Animation Studios|Apple Original Films|Lucasfilm|Star Wars)\b/i;

function cinemaSignals(article: Article) {
  const title = article.title;
  const text = `${title} ${article.description}`;
  const casting = CASTING_EVENT.test(text);
  const production = PRODUCTION_EVENT.test(text);
  const directing = DIRECTING_EVENT.test(text);
  const release = RELEASE_EVENT.test(text);
  const business = BUSINESS_EVENT.test(text);
  return { title, text, casting, production, directing, release, business, material: casting || production || directing || release || business };
}

export function screenCinemaScore(article: Article): number {
  if (article.category !== "screen-cinema") return 0;
  const signals = cinemaSignals(article);
  let score = MOVIE_MEDIUM.test(signals.title) ? 4 : MOVIE_MEDIUM.test(article.description) ? 1 : 0;
  if (signals.casting || signals.production || signals.directing) score += 8;
  if (signals.release || signals.business) score += 6;
  if (HOLLYWOOD_SCOPE.test(signals.text)) score += 3;
  score += article.lens === "official" ? 2 : article.lens === "trade" ? 1 : 0;
  if (/\b(?:trailer|teaser|first look)\b/i.test(signals.text)) score -= 2;
  if (PERSONALITY_OR_PROMO.test(signals.text)) score -= 8;
  return score;
}

const HIGH_IMPACT = /\b(?:approv(?:es?|ed|al)|passes?|signs?|ruling|court|laws?|war|attack|ceasefire|elections?|votes?|budget|funding|billion|million|shutdown|tariffs?|sanctions?|policy|investigat(?:es?|ion)|indict(?:s|ed|ment)?|arrests?|killed|deaths?|earthquake|wildfire|strikes?|layoffs?|acquires?|launches?)\b/gi;
const PUBLIC_CONSEQUENCE = /\b(?:government|congress|president|governor|legislature|school|education|health|hospital|housing|transit|infrastructure|economy|jobs?|rights?|immigration|security|military|climate|energy|taxes?|prices?)\b/gi;
const LOW_VALUE_FORMAT = /\b(?:photo gallery|top photos|five things|\d+ things|what to (?:know|watch)|quiz|opinion|commentary|week in pictures|best dressed)\b/i;
const AI_TOPIC = /\b(?:artificial intelligence|generative AI|AI|OpenAI|ChatGPT|GPT(?:-[0-9A-Za-z.]+)?|Anthropic|Claude|Gemini|DeepMind|xAI|Grok|Meta AI|Llama|Mistral|Jev|TypeSafe|System One models?|large language models?|LLMs?|machine learning|neural networks?|AI chips?|AI agents?|model weights?|frontier models?)\b/i;
const AI_EVENT = /\b(?:launch(?:es|ed)?|release[sd]?|unveil(?:s|ed)?|introduc(?:es|ed|ing)|announce[sd]?|update[sd]?|upgrade[sd]?|open[- ]sources?|model|benchmark|evaluation|research|safety|security|policy|regulat(?:es?|ion)|legislation|laws?|court|lawsuit|copyright|invest(?:s|ment)?|funding|acquir(?:es?|ed)|partnership|deal|adopt(?:s|ed|ion)|deploy(?:s|ed|ment)?|train(?:s|ed|ing)|inference|chips?|agents?|ban[sn]?|restrict(?:s|ed|ion)?|expand(?:s|ed)|outage|breach|usage)\b/i;
const AI_LOW_VALUE = /\b(?:best (?:AI|ChatGPT)|ChatGPT prompts?|prompt ideas?|how to use|tips and tricks|sponsored|shopping guide|buying guide|coupon|deal of the day|newsletter|podcast|quiz|opinion)\b/i;
const AI_MAJOR_ENTITY = /\b(?:OpenAI|ChatGPT|GPT(?:-[0-9A-Za-z.]+)?|Anthropic|Claude|Gemini|DeepMind|xAI|Grok|Meta AI|Llama|Mistral|Jev|TypeSafe)\b/gi;
const AI_USER_PRIORITY = /\b(?:Jev|TypeSafe)\b/i;

export function editorialWorthiness(article: Article): number {
  const text = `${article.title} ${article.description}`;
  const impact = text.match(HIGH_IMPACT)?.length ?? 0;
  const consequence = text.match(PUBLIC_CONSEQUENCE)?.length ?? 0;
  let score = Math.min(impact, 3) * 4 + Math.min(consequence, 3) * 2;
  if (article.source === "AP News") score += 4;
  else if (article.source === "Reuters") score += 3;
  else if (article.lens === "official") score += 2;
  if (article.description.trim()) score += 1;
  if (LOW_VALUE_FORMAT.test(text)) score -= 12;
  return score;
}

export function aiNewsScore(article: Article): number {
  if (article.category !== "ai") return 0;
  const text = `${article.title} ${article.description}`;
  let score = editorialWorthiness(article);
  score += Math.min(article.title.match(AI_MAJOR_ENTITY)?.length ?? 0, 2) * 5;
  if (AI_EVENT.test(article.title)) score += 5;
  if (/\b(?:safety|security|policy|regulat(?:es?|ion)|legislation|law|copyright|benchmark|evaluation|research)\b/i.test(text)) score += 4;
  if (article.lens === "official") score += 3;
  if (article.source === "Reuters" || article.source === "The New York Times") score += 2;
  if (AI_USER_PRIORITY.test(text)) score += 8;
  if (AI_LOW_VALUE.test(text)) score -= 24;
  return score;
}

const AI_COVERAGE_GROUPS = [
  /\b(?:OpenAI|ChatGPT|GPT(?:-[0-9A-Za-z.]+)?)\b/i,
  /\b(?:Anthropic|Claude)\b/i,
  /\b(?:Jev|TypeSafe)\b/i,
];

function selectAiArticles(candidates: Article[], limit: number) {
  const timestamp = (article: Article) => article.publishedAt ? Date.parse(article.publishedAt) || 0 : 0;
  const latest = Math.max(...candidates.map(timestamp), 0);
  const freshnessWindow = 30 * 24 * 60 * 60 * 1000;
  const fresh = candidates.filter((article) => !timestamp(article) || !latest || latest - timestamp(article) <= freshnessWindow);
  const ranked = [...fresh].sort((a, b) => aiNewsScore(b) - aiNewsScore(a) || timestamp(b) - timestamp(a));
  const selected: Article[] = [];
  const sourceCounts = new Map<string, number>();
  const add = (article: Article | undefined) => {
    if (!article || selected.includes(article) || selected.length >= limit || (sourceCounts.get(article.source) ?? 0) >= 2) return;
    selected.push(article);
    sourceCounts.set(article.source, (sourceCounts.get(article.source) ?? 0) + 1);
  };

  for (const group of AI_COVERAGE_GROUPS) {
    add(ranked.find((article) => group.test(`${article.title} ${article.description}`)));
  }
  for (const article of ranked) add(article);

  const rankIndex = new Map(ranked.map((article, index) => [article.id, index]));
  return selected.sort((a, b) => (rankIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rankIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export function selectSectionArticles(articles: Article[], category: SectionId, limit: number): Article[] {
  const candidates = articles.filter((article) => article.category === category && qualifies(article));
  const newest = (article: Article) => article.publishedAt ? Date.parse(article.publishedAt) || 0 : 0;
  if (category === "global" || category === "national") {
    return candidates.sort((a, b) => editorialWorthiness(b) - editorialWorthiness(a) || newest(b) - newest(a));
  }
  if (category === "ai") return selectAiArticles(candidates, limit);
  if (category !== "screen-cinema") {
    return candidates.sort((a, b) => editorialWorthiness(b) - editorialWorthiness(a) || newest(b) - newest(a)).slice(0, limit);
  }
  const ranked = [...candidates].sort((a, b) => screenCinemaScore(b) - screenCinemaScore(a) || newest(b) - newest(a));
  const selected: Article[] = [];
  const counts = new Map<string, number>();
  for (const article of ranked) {
    if ((counts.get(article.source) ?? 0) >= 2) continue;
    selected.push(article);
    counts.set(article.source, (counts.get(article.source) ?? 0) + 1);
    if (selected.length === limit) return selected;
  }
  for (const article of ranked) {
    if (selected.some((item) => item.id === article.id)) continue;
    selected.push(article);
    if (selected.length === limit) break;
  }
  return selected;
}

export function qualifies(article: Article) {
  const text = `${article.title} ${article.description}`;
  if (article.category === "global" || article.category === "national") {
    if (article.lens === "wire" && WIRE_MEDIA_CAPTION.test(article.title)) return false;
    if (article.lens === "wire" && (article.title.match(NON_ENGLISH_WIRE_WORD)?.length ?? 0) >= 3) return false;
    return !/\b(NFL|NBA|MLB|NHL|touchdown|quarterback|playoffs?|tournament|final score|defeats?|beats?|season opener)\b/i.test(text);
  }
  if (article.category === "screen-cinema") {
    const signals = cinemaSignals(article);
    if (!MOVIE_MEDIUM.test(signals.text) || !signals.material) return false;
    if (TV_ONLY.test(signals.text) || NON_MOVIE_MEDIUM.test(signals.text) || NON_HOLLYWOOD_INDUSTRY.test(signals.text) || AWARDS_OR_OBITUARY.test(signals.text)) return false;
    if (PERSONALITY_OR_PROMO.test(signals.text) && !signals.casting) return false;
    if (!HOLLYWOOD_SCOPE.test(signals.text)) return false;
    return true;
  }
  if (article.category === "ai") {
    const sourceEstablishesTopic = article.source === "OpenAI News" || article.source === "Anthropic" || article.source === "TypeSafe AI";
    return !AI_LOW_VALUE.test(text) && (sourceEstablishesTopic || AI_TOPIC.test(text)) && AI_EVENT.test(text);
  }
  if (article.category === "good-news") {
    return /(approv|fund|launch|declin|progress|treatment|vaccine|recover|prevent|expand|improv|agreement|milestone)/i.test(text);
  }
  return true;
}

async function fetchFeed(source: FeedSource): Promise<FeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: { "user-agent": "TheDailyBread/2.0", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
      next: { revalidate: 900, tags: ["news-feeds"] },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const feed = await parser.parseString(xml);
    const articles = (feed.items ?? [])
      .map((item) => normalizeItem(item as unknown as FeedItem, source))
      .filter((article): article is Article => Boolean(article))
      .filter((article) => !source.allowedPublishers || source.allowedPublishers.some((publisher) => publisher.toLowerCase() === article.source.toLowerCase()))
      .filter(qualifies)
      .slice(0, 30);
    return { source: source.name, category: source.category, ok: true, articles, method: source.viaGoogle ? "Google News" : "direct" };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Timed out" : error instanceof Error ? error.message : "Feed unavailable";
    return { source: source.name, category: source.category, ok: false, articles: [], method: source.viaGoogle ? "Google News" : "direct", error: message.slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}

export function buildNewsPayload(results: FeedResult[], updatedAt = new Date(), upcomingEvents: UpcomingEvent[] = []): NewsPayload {
  return {
    articles: dedupeArticles(results.flatMap((result) => result.articles)),
    updatedAt: updatedAt.toISOString(),
    sources: results.map((result) => ({
      source: result.source,
      category: result.category,
      ok: result.ok,
      count: result.articles.length,
      method: result.method,
      ...(!result.ok && result.error ? { error: result.error } : {}),
    })),
    upcomingEvents,
  };
}

async function loadNews() {
  const [feedResults, events] = await Promise.all([
    Promise.all(FEEDS.map(fetchFeed)),
    fetchBurgessEvents().then((list) => filterFutureEvents(list)).catch(() => [] as UpcomingEvent[]),
  ]);
  const payload = buildNewsPayload(feedResults, new Date(), events);
  const selectedIds = new Set(
    SECTIONS.flatMap((section) => selectSectionArticles(payload.articles, section.id, section.limit)
      .slice(0, Math.min(section.limit, 3))
      .map((article) => article.id)),
  );
  const enriched = await Promise.all(payload.articles.map((article) => selectedIds.has(article.id) ? enrichArticleContent(article) : article));
  return { ...payload, articles: enriched };
}

const getNewsCached = unstable_cache(
  async (editionDate: string) => {
    void editionDate;
    return loadNews();
  },
  ["daily-bread-news-v3"],
  { revalidate: 900, tags: ["news"] },
);

export function getNews(editionDate = "current") {
  return getNewsCached(editionDate);
}
