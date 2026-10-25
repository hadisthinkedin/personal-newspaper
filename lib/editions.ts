import type { Article, NewsPayload } from "@/lib/news";

export const EDITION_TIME_ZONE = "America/Detroit";

export function editionDateInDetroit(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EDITION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function previousCalendarDate(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function relativeEditionDates(now = new Date()) {
  const today = editionDateInDetroit(now);
  return { today, yesterday: previousCalendarDate(today) };
}

export function filterEditionArticles(articles: Article[], editionDate: string): Article[] {
  return articles.filter((article) => article.publishedAt && editionDateInDetroit(article.publishedAt) === editionDate);
}

export type ArchivedEdition = NewsPayload & { editionDate: string };

type ArchiveFetcher = (input: string, init?: RequestInit) => Promise<Response>;

const ARCHIVE_ROOT = process.env.EDITION_ARCHIVE_URL
  ?? "https://raw.githubusercontent.com/hadisthinkedin/personal-newspaper/editions";

export function editionArchiveUrl(editionDate: string): string {
  return `${ARCHIVE_ROOT}/${editionDate}.json`;
}

export async function loadArchivedEdition(editionDate: string, fetchArchive: ArchiveFetcher = fetch): Promise<ArchivedEdition | null> {
  try {
    const response = await fetchArchive(editionArchiveUrl(editionDate), { next: { revalidate: 300 } } as RequestInit);
    if (!response.ok) return null;
    const value = await response.json() as Partial<ArchivedEdition>;
    if (value.editionDate !== editionDate || !Array.isArray(value.articles) || !Array.isArray(value.sources) || typeof value.updatedAt !== "string") {
      return null;
    }
    return {
      editionDate,
      updatedAt: value.updatedAt,
      sources: value.sources,
      articles: filterEditionArticles(value.articles, editionDate),
      upcomingEvents: Array.isArray(value.upcomingEvents) ? value.upcomingEvents : [],
    };
  } catch {
    return null;
  }
}
