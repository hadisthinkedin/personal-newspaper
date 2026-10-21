export type WikipediaSearchPage = {
  title?: string;
  description?: string;
  excerpt?: string;
};

const DISAMBIGUATION = /topics? referred to by the same term|disambiguation/i;
const CONTEXT_STOPWORDS = new Set([
  "about", "after", "against", "american", "before", "being", "could", "discussed",
  "from", "have", "into", "linked", "more", "report", "said", "says", "that", "their",
  "there", "these", "they", "this", "those", "through", "under", "what", "when", "where",
  "which", "while", "with", "would",
]);

function canonicalWord(word: string) {
  if (word.startsWith("cyber")) return "cyber";
  if (word.startsWith("connect")) return "connected";
  if (word.startsWith("secur")) return "security";
  if (word.startsWith("technolog")) return "technology";
  if (word.startsWith("attack")) return "attack";
  return word;
}

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .map(canonicalWord)
    .filter((word) => word.length > 1 && !["the", "of", "for", "inc", "company"].includes(word));
}

function contextWords(value: string, requested: string[]) {
  return [...new Set(normalizedWords(value)
    .filter((word) => !requested.includes(word) && !CONTEXT_STOPWORDS.has(word)))];
}

export function selectWikipediaPage(
  term: string,
  pages: WikipediaSearchPage[],
  context = "",
) {
  const requested = normalizedWords(term);
  if (!requested.length) return undefined;

  const contextual = contextWords(context, requested);
  const looksLikePersonName = requested.length >= 2
    && requested.length <= 4
    && term.split(/\s+/).every((word) => /^[A-Z][\p{L}'’-]+$/u.test(word));

  return pages
    .filter((page) => page.title && !DISAMBIGUATION.test(page.description || ""))
    .map((page) => {
      const titleWords = normalizedWords(page.title || "");
      const overlap = requested.filter((word) => titleWords.includes(word)).length;
      const requestCoverage = overlap / requested.length;
      const titleCoverage = titleWords.length ? overlap / titleWords.length : 0;
      const exact = requested.join(" ") === titleWords.join(" ");
      const identityWords = contextWords(
        `${page.title || ""} ${page.description || ""} ${page.excerpt || ""}`,
        requested,
      );
      const contextualOverlap = contextual.filter((word) => identityWords.includes(word)).length;
      const contextScore = Math.min(2, contextualOverlap * 0.65);

      return {
        page,
        contextualOverlap,
        score: (exact ? 3 : requestCoverage + titleCoverage) + contextScore,
      };
    })
    .filter(({ score, contextualOverlap }) => (
      score >= 1.6
      && (!context || !looksLikePersonName || contextualOverlap > 0)
    ))
    .sort((a, b) => b.score - a.score)[0]?.page;
}

export function summarizeWikipediaExtract(extract: string) {
  const clean = extract.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;

  const sentences = clean
    .match(/[^.!?]+(?:[.!?]+[”"')\]]*|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter((sentence) => /[A-Za-z]/.test(sentence)) ?? [];

  if (!sentences.length) return undefined;
  const selected = sentences.slice(0, 2);
  while (selected.length > 1 && selected.join(" ").length > 520) selected.pop();
  return selected.join(" ");
}

export function unavailableDefinition(term: string) {
  return `A reliable background match for “${term}” was not available. Use the surrounding article and its linked source rather than assuming this refers to a similarly named person or organization.`;
}

export function contextualUnavailableDefinition(term: string, context: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const roleMatch = context.match(new RegExp(
    `\\b(cybersecurity expert|security expert|foreign-policy expert|military expert|expert|analyst|researcher|professor|official|spokesperson)\\s+${escaped}\\b`,
    "i",
  ));
  if (!roleMatch) return unavailableDefinition(term);

  const role = roleMatch[1].toLowerCase();
  let subject = "the subject covered by the linked report";
  if (/cyber|hack|connected device|fridge/i.test(context)) {
    subject = "cybersecurity and attacks on connected devices";
  } else if (/war|military|strike|conflict|attack/i.test(context)) {
    subject = "the conflict and security developments covered by the linked report";
  }

  return `${term} is the ${role} quoted in this report about ${subject}. A reliable independent biography was not available from the reference source, so this definition does not assume that the name belongs to a better-known person.`;
}
