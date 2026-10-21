import sanitizeHtml from "sanitize-html";
import type { Article } from "@/lib/news";

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

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

function plainText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
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

export function extractArticleText(html: string): string {
  const jsonBodies: string[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      jsonBodies.push(...jsonLdBodies(JSON.parse(match[1])));
    } catch {
      // Invalid publisher JSON-LD is ignored in favor of semantic HTML below.
    }
  }
  if (jsonBodies.length) return cleanArticleText(jsonBodies.join(" "));

  const apStoryBody = divBodyWithClass(html, "RichTextStoryBody");
  if (apStoryBody) {
    const paragraphs = [...apStoryBody.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => plainText(match[1]))
      .filter((text) => text.length >= 40);
    if (paragraphs.length) return cleanArticleText(paragraphs.join(" "));
  }

  const articleBodyStart = html.search(/<(?:main|article|div)[^>]*(?:itemprop=["']articleBody["']|id=["']article-body["'])[^>]*>/i);
  const semantic = articleBodyStart >= 0
    ? html.slice(articleBodyStart, html.search(/<\/body>/i) >= 0 ? html.search(/<\/body>/i) : undefined)
    : (html.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? "");
  if (semantic) {
    const paragraphs = [...semantic.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => plainText(match[1])).filter((text) => text.length >= 40);
    if (paragraphs.length) return cleanArticleText(paragraphs.join(" "));
  }

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

export async function enrichArticleContent(article: Article, fetcher: Fetcher = fetch): Promise<Article> {
  try {
    const sourceUrl = article.viaAggregator ? await resolveGoogleNewsUrl(article.url, fetcher) : article.url;
    if (!sourceUrl) return article;
    const requestOptions: RequestInit = {
      headers: { "user-agent": "Mozilla/5.0 (compatible; TheDailyBread/2.0; +https://personal-newspaper-three.vercel.app)" },
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
    return { ...article, sourceUrl, ...(content ? { content } : {}) };
  } catch {
    return article;
  }
}
