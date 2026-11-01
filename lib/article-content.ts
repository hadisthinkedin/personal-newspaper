import sanitizeHtml from "sanitize-html";
import type { Article } from "@/lib/news";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let nytCookieCache: { value: string | null; mtimeMs: number } | null = null;

async function readNytCookie(): Promise<string | null> {
  if (typeof window !== "undefined") return null;
  try {
    const [{ default: fs }, { default: path }] = await Promise.all([
      import("node:fs"),
      import("node:path"),
    ]);
    const cookiePath = path.resolve(process.cwd(), ".secrets/nyt-cookie-header.txt");
    const stats = fs.statSync(cookiePath);
    if (nytCookieCache && nytCookieCache.mtimeMs === stats.mtimeMs) return nytCookieCache.value;
    const value = fs.readFileSync(cookiePath, "utf8").trim() || null;
    nytCookieCache = { value, mtimeMs: stats.mtimeMs };
    return value;
  } catch {
    nytCookieCache = { value: null, mtimeMs: 0 };
    return null;
  }
}

function isNytUrl(value: string): boolean {
  try {
    return /(^|\.)nytimes\.com$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

const GOOGLE_BATCH_URL = "https://news.google.com/_/DotsSplashUi/data/batchexecute";
const GART_CONTEXT = [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0];

function apTranslationMirror(value: string) {
  try {
    const source = new URL(value);
    if (!/(^|\.)apnews\.com$/i.test(source.hostname)) return null;
    const mirror = new URL(`https://apnews-com.translate.goog${source.pathname}${source.search}`);
    mirror.searchParams.set("_x_tr_sl", "auto");
    mirror.searchParams.set("_x_tr_tl", "en");
    mirror.searchParams.set("_x_tr_hl", "en");
    return mirror.toString();
  } catch {
    return null;
  }
}

// Tailwind-style class names such as "[&>strong]:font-bold" put ">" inside
// quoted attributes, so tags must be matched with quote-aware attribute parsing.
const PARAGRAPH_PATTERN = /<p\b(?:[^>"']|"[^"]*"|'[^']*')*>([\s\S]*?)<\/p>/gi;

function plainText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/&(?:amp|#38);/gi, "&")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdBodies(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdBodies);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [typeof record.articleBody === "string" ? record.articleBody : "", ...Object.values(record).flatMap(jsonLdBodies)].filter(Boolean);
}

function cleanArticleText(value: string) {
  const text = plainText(value);
  const apDateline = text.match(/\b[A-Z][A-Z .'-]{2,40} \(AP\) — /);
  return (apDateline?.index !== undefined && apDateline.index < 1_000 ? text.slice(apDateline.index) : text).slice(0, 12_000);
}

function divBodyWithClass(html: string, className: string) {
  const openingPattern = new RegExp(`<div\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, "i");
  const opening = openingPattern.exec(html);
  if (!opening || opening.index === undefined) return "";
  const contentStart = opening.index + opening[0].length;
  const divTags = /<\/?div\b[^>]*>/gi;
  divTags.lastIndex = contentStart;
  let depth = 1;
  for (let tag = divTags.exec(html); tag; tag = divTags.exec(html)) {
    depth += /^<\/div/i.test(tag[0]) ? -1 : 1;
    if (depth === 0) return html.slice(contentStart, tag.index);
  }
  return "";
}

const PHOTO_CAPTION = /\((?:AP|AFP|Reuters|Getty Images?)[^)]*Photo[^)]*\)|\bPhoto(?:graph)?: |\(Photo by /i;
const BOILERPLATE_PARAGRAPH = /\b(?:cookies?|subscribe|newsletter|sign up|log in|all rights reserved|advertisement|javascript|your browser|privacy policy|terms of (?:use|service)|follow us)\b/i;

function paragraphText(html: string, minimumLength = 40) {
  return [...html.matchAll(PARAGRAPH_PATTERN)]
    .map((match) => plainText(match[1]))
    .filter((text) => text.length >= minimumLength);
}

export function extractArticleText(html: string): string {
  const candidates: string[] = [];
  const jsonBodies: string[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonBodies.push(...jsonLdBodies(JSON.parse(match[1])));
    } catch {
      // Invalid publisher JSON-LD is ignored in favor of semantic HTML below.
    }
  }
  if (jsonBodies.length) candidates.push(cleanArticleText(jsonBodies.join(" ")));

  const apStoryBody = divBodyWithClass(html, "RichTextStoryBody");
  if (apStoryBody) {
    const paragraphs = paragraphText(apStoryBody);
    if (paragraphs.length) candidates.push(cleanArticleText(paragraphs.join(" ")));
  }

  const articleBodyStart = html.search(/<(?:main|article|div)[^>]*(?:itemprop=["']articleBody["']|id=["']article-body["'])[^>]*>/i);
  const semantic = articleBodyStart >= 0
    ? html.slice(articleBodyStart, html.search(/<\/body>/i) >= 0 ? html.search(/<\/body>/i) : undefined)
    : (html.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? "");
  if (semantic) {
    const paragraphs = paragraphText(semantic);
    if (paragraphs.length) candidates.push(cleanArticleText(paragraphs.join(" ")));
  }

  // Last structural resort for pages without semantic markup: every
  // substantial paragraph in the document, minus obvious site chrome.
  const body = html.replace(/<(script|style|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  const looseParagraphs = paragraphText(body, 80).filter((text) => !BOILERPLATE_PARAGRAPH.test(text) && !PHOTO_CAPTION.test(text));
  if (looseParagraphs.length >= 3) candidates.push(cleanArticleText(looseParagraphs.join(" ")));

  // Structured bodies (JSON-LD, AP story body, semantic article) win whenever
  // they carry a real story; loose page paragraphs can include photo captions
  // and related-story teasers, so they are only a fallback.
  const structured = candidates.slice(0, candidates.length - (looseParagraphs.length >= 3 ? 1 : 0));
  const firstReal = structured.find((candidate) => usableSentenceCount(candidate) >= 4);
  if (firstReal) return firstReal;
  let best = "";
  for (const candidate of candidates) {
    if (usableSentenceCount(candidate) > usableSentenceCount(best)) best = candidate;
  }
  if (best) return best;

  const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  return description ? plainText(description[1]).slice(0, 1_000) : "";
}

function googleArticleId(value: string) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return url.hostname === "news.google.com" && ["articles", "read"].includes(parts.at(-2) ?? "") ? parts.at(-1) ?? null : null;
  } catch {
    return null;
  }
}

export async function resolveGoogleNewsUrl(value: string, fetcher: Fetcher = fetch): Promise<string | null> {
  const id = googleArticleId(value);
  if (!id) return value;
  const paramsUrl = `https://news.google.com/rss/articles/${id}?hl=en-US&gl=US&ceid=US:en`;
  const page = await fetcher(paramsUrl, { headers: { "user-agent": "TheDailyBread/2.0" } });
  if (!page.ok) return null;
  const html = await page.text();
  const signature = html.match(/data-n-a-sg=["']([^"']+)["']/)?.[1];
  const timestamp = html.match(/data-n-a-ts=["']([^"']+)["']/)?.[1];
  if (!signature || !timestamp) return null;

  const inner = ["garturlreq", GART_CONTEXT, id, /^\d+$/.test(timestamp) ? Number(timestamp) : timestamp, signature];
  const request = [["Fbv4je", JSON.stringify(inner), null, "0"]];
  const body = new URLSearchParams({ "f.req": JSON.stringify([request]) }).toString();
  const response = await fetcher(GOOGLE_BATCH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  if (!response.ok) return null;
  let text = await response.text();
  if (text.includes("\n\n")) text = text.split("\n\n", 2)[1];
  text = text.trim().replace(/^\)\]\}'\s*/, "");
  try {
    const rows = JSON.parse(text) as unknown[];
    for (const row of rows) {
      if (!Array.isArray(row) || typeof row[2] !== "string") continue;
      const payload = JSON.parse(row[2]) as unknown;
      if (Array.isArray(payload) && payload[0] === "garturlres" && typeof payload[1] === "string") return payload[1];
    }
  } catch {
    return null;
  }
  return null;
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
// Publishers whose article bodies are not reachable without a subscription or
// a real browser. Alternate coverage from these is skipped to save time.
const HARD_PAYWALL_HOST = /(?:^|\.)(?:reuters|bloomberg|wsj|nytimes|washingtonpost|economist|theinformation|theathletic|barrons|newyorker|ft|politico|axios|latimes|bostonglobe|theatlantic|foreignpolicy|foreignaffairs)\.com$|(?:^|\.)ft\.com$/i;
const MIN_STORY_SENTENCES = 6;
// Celebrity tabloids and content farms are not used as the text of record.
const UNRELIABLE_PUBLISHER = /^(?:TMZ|Daily Mail|Mail Online|The Sun|Daily Star|Mirror|Daily Express|Express|Page Six|Radar Online|OK!|Perez Hilton|MSN|Yahoo|AOL|Newsbreak|NewsBreak|Ground News|Biztoc|BizToc|Head Topics|Opoyi)\b/i;

const TITLE_STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "from", "as", "is", "are", "was", "were", "be", "says", "say", "said", "after", "over", "about", "into", "its", "his", "her", "their", "new"]);

function titleTokens(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((word) => word.length > 2 && !TITLE_STOPWORDS.has(word)));
}

export function titleSimilarity(a: string, b: string) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.min(left.size, right.size);
}

export function usableSentenceCount(text: string) {
  return [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)]
    .filter(({ segment }) => segment.trim().length >= 30 && /[.!?][”"')\]]*\s*$/.test(segment.trim())).length;
}

function hostOf(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

type Candidate = { title: string; link: string; publisher: string; publisherUrl: string; similarity: number; publishedAt: number | null };
const MAX_ALTERNATE_DRIFT_MS = 3 * 24 * 60 * 60 * 1000;

export function parseGoogleNewsCandidates(xml: string, article: Pick<Article, "title" | "source"> & { publishedAt?: string | null }): Candidate[] {
  const original = article.publishedAt ? Date.parse(article.publishedAt) : NaN;
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  return items.map((item) => {
    const rawTitle = plainText(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = plainText(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    const source = item.match(/<source url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/);
    const publisher = plainText(source?.[2] ?? "");
    const title = publisher && rawTitle.endsWith(` - ${publisher}`) ? rawTitle.slice(0, -(publisher.length + 3)) : rawTitle;
    const published = Date.parse(plainText(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? ""));
    return { title, link, publisher, publisherUrl: source?.[1] ?? "", similarity: titleSimilarity(article.title, title), publishedAt: Number.isNaN(published) ? null : published };
  })
    .filter((candidate) => candidate.link && candidate.publisher
      && candidate.publisher.toLowerCase() !== article.source.toLowerCase()
      && !UNRELIABLE_PUBLISHER.test(candidate.publisher)
      && !HARD_PAYWALL_HOST.test(hostOf(candidate.publisherUrl))
      && candidate.similarity >= 0.3
      // Same story means same news cycle: an older report on the same people is a different event.
      && (Number.isNaN(original) || (candidate.publishedAt !== null && Math.abs(candidate.publishedAt - original) <= MAX_ALTERNATE_DRIFT_MS)))
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * When the original publisher withholds the article body (paywall, bot wall,
 * video page), read the same story from another outlet so the digest can carry
 * the full text itself. The alternate outlet is recorded for citation.
 */
export async function findAlternateCoverage(article: Article, fetcher: Fetcher = fetch, maximumCandidates = 4): Promise<{ content: string; source: string; url: string } | null> {
  const params = new URLSearchParams({ q: `${article.title} when:7d`, hl: "en-US", gl: "US", ceid: "US:en" });
  const response = await fetcher(`https://news.google.com/rss/search?${params}`, { headers: { "user-agent": "TheDailyBread/2.0" }, signal: AbortSignal.timeout(6_000) });
  if (!response.ok) return null;
  const candidates = parseGoogleNewsCandidates(await response.text(), article).slice(0, maximumCandidates);
  // Read candidates in parallel so a slow outlet cannot stall the edition;
  // the most similar readable report wins.
  const reports = await Promise.all(candidates.map(async (candidate) => {
    try {
      const url = await resolveGoogleNewsUrl(candidate.link, fetcher);
      if (!url || HARD_PAYWALL_HOST.test(hostOf(url))) return null;
      const page = await fetcher(url, { headers: { "user-agent": BROWSER_UA }, signal: AbortSignal.timeout(6_000) });
      if (!page.ok || !(page.headers.get("content-type") ?? "text/html").includes("html")) return null;
      const content = extractArticleText(await page.text());
      return usableSentenceCount(content) >= MIN_STORY_SENTENCES ? { content, source: candidate.publisher, url } : null;
    } catch {
      return null;
    }
  }));
  return reports.find(Boolean) ?? null;
}

export async function enrichArticleContent(article: Article, fetcher: Fetcher = fetch): Promise<Article> {
  const enriched = await enrichFromPublisher(article, fetcher);
  // The original publisher's own text wins whenever it is long enough to render as a story.
  if (usableSentenceCount(enriched.content || enriched.description) >= 4) return enriched;
  try {
    const alternate = await findAlternateCoverage(enriched, fetcher);
    return alternate ? { ...enriched, content: alternate.content, contentSource: alternate.source, contentUrl: alternate.url } : enriched;
  } catch {
    return enriched;
  }
}

async function enrichFromPublisher(article: Article, fetcher: Fetcher): Promise<Article> {
  try {
    const sourceUrl = article.viaAggregator ? await resolveGoogleNewsUrl(article.url, fetcher) : article.url;
    if (!sourceUrl) return article;
    if ((article.content?.length ?? 0) >= 800) return { ...article, sourceUrl };
    const nytCookie = isNytUrl(sourceUrl) ? await readNytCookie() : null;
    const requestOptions: RequestInit = {
      headers: {
        "user-agent": BROWSER_UA,
        ...(nytCookie ? { cookie: nytCookie } : {}),
      },
      signal: AbortSignal.timeout(8_000),
    };
    const response = await fetcher(sourceUrl, requestOptions);
    let content = response.ok && (response.headers.get("content-type") ?? "text/html").includes("html")
      ? extractArticleText(await response.text())
      : "";

    const mirrorUrl = !content ? apTranslationMirror(sourceUrl) : null;
    if (mirrorUrl) {
      const mirrorResponse = await fetcher(mirrorUrl, requestOptions);
      if (mirrorResponse.ok && (mirrorResponse.headers.get("content-type") ?? "text/html").includes("html")) {
        content = extractArticleText(await mirrorResponse.text());
      }
    }
    const best = content.length >= (article.content?.length ?? 0) ? content : article.content;
    return { ...article, sourceUrl, ...(best ? { content: best } : {}) };
  } catch {
    return article;
  }
}
