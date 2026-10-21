import { filterEditionArticles, loadArchivedEdition, relativeEditionDates } from "@/lib/editions";
import { getNews, type NewsPayload } from "@/lib/news";

export type EditionKind = "today" | "yesterday";

export type ResolvedEdition = {
  kind: EditionKind;
  date: string;
  payload: NewsPayload;
  archived: boolean;
};

export async function getEdition(kind: EditionKind, now = new Date()): Promise<ResolvedEdition> {
  const dates = relativeEditionDates(now);
  const date = dates[kind];

  if (kind === "yesterday") {
    const archived = await loadArchivedEdition(date);
    if (archived) return { kind, date, payload: archived, archived: true };
  }

  const live = await getNews(date);
  return {
    kind,
    date,
    archived: false,
    payload: {
      ...live,
      articles: filterEditionArticles(live.articles, date),
    },
  };
}

export function editionKindFromValue(value: string | string[] | null | undefined): EditionKind {
  return value === "yesterday" ? "yesterday" : "today";
}
