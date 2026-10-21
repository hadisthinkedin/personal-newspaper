import { editorialWorthiness, type Article, type SectionId } from "@/lib/news";

const DEFAULT_CONSEQUENCE: Record<SectionId, string> = {
  global: "The consequences may reach diplomacy, economic confidence, international security, civilian life, or the United States’ relationships abroad.",
  national: "The consequences may reach federal policy, public institutions, economic confidence, civil rights, or daily life across the United States.",
  michigan: "The outcome could shape state policy, public services, education, elections, or Michigan’s economy.",
  detroit: "The development bears directly on Detroit’s residents, neighborhoods, institutions, or public resources.",
  "warren-macomb": "The practical effects may be felt through local services, public safety, schools, taxes, or development close to home.",
  lansing: "The story may affect Lansing, East Lansing, Michigan State University, or institutions used by the community each week.",
  abdul: "The report adds evidence about the candidate’s policy agenda, coalition, public record, or position in a nationally watched Michigan race.",
  mamdani: "The development tests how a prominent political agenda translates into governing choices, public accountability, and consequences for New Yorkers.",
  technology: "The change could alter the tools, platforms, standards, or competitive landscape that technical workers and consumers depend on.",
  ai: "The development could change model capability, access, safety, labor, market power, regulation, or how people and institutions use artificial intelligence.",
  "screen-cinema": "The report concerns a material creative, production, distribution, or business decision rather than celebrity gossip or unsupported rumor.",
  "good-news": "The value lies in measurable progress: a funded intervention, approved treatment, implemented program, or documented improvement in people’s lives.",
};

export function consequenceFor(article: Article) {
  const text = `${article.title} ${article.description}`.toLowerCase();

  if (article.category === "ai") {
    return "The consequential question is not the announcement alone but whether capability, cost, access, safety, regulation, or practical reliability changes for people and institutions using AI.";
  }
  if (article.category === "technology") {
    return "The issue extends beyond a product launch because it may change technical capability, market power, security exposure, privacy, or the terms under which people use a platform.";
  }
  if (article.category === "screen-cinema") {
    return "The durable signal is a concrete creative or business commitment, because development talk matters less than financing, production, distribution, and release plans.";
  }
  if (article.category === "good-news") {
    return "The meaningful measure is whether the development improves access, safety, treatment, opportunity, or well-being beyond the announcement itself.";
  }
  if (/\b(election|ballot|vote|primary|campaign|candidate)\b/.test(text)) {
    return "Its practical significance lies in how it may alter electoral power, coalition strategy, or the policy choices available after voters decide.";
  }
  if (/\b(court|judge|lawsuit|legal|ruling|indictment|supreme court)\b/.test(text)) {
    return "The important consequence is legal rather than rhetorical: the decision may change rights, enforcement, institutional authority, or the rules other cases must follow.";
  }
  if (/\b(budget|funding|grant|tax|spending|billion|million)\b/.test(text)) {
    return "The numbers matter because they determine which promises are funded, which communities receive resources, and what tradeoffs appear elsewhere in the budget.";
  }
  if (/\b(war|military|missile|attack|ceasefire|troops|conflict)\b/.test(text)) {
    return "The immediate stakes include civilian safety and regional stability, while the longer-term effects may reach alliances, diplomacy, energy, and migration.";
  }
  if (/\b(health|drug|vaccine|disease|hospital|medical|treatment|fda|who)\b/.test(text)) {
    return "The meaningful measure is whether the development improves access, safety, treatment, or health outcomes beyond the announcement itself.";
  }
  if (["michigan", "detroit", "warren-macomb", "lansing"].includes(article.category) && /\b(housing|transit|road|development|school|police|council|mayor)\b/.test(text)) {
    return "The story becomes consequential through implementation: timelines, public money, service quality, and the distribution of costs and benefits across the community.";
  }
  return DEFAULT_CONSEQUENCE[article.category];
}

export function storyParagraphs(article: Article): string[] {
  const sourceText = article.content?.trim() || article.description.trim();
  if (!sourceText) return [];
  const sentences = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(sourceText)]
    .map(({ segment }) => segment.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length >= 30
      && /[.!?][”"')\]]*$/.test(sentence)
      && sentence.toLowerCase() !== article.title.toLowerCase())
    .slice(0, 24);
  if (sentences.length < 4) return [];

  let usableCount = sentences.length;
  let paragraphCount = 0;
  while (usableCount >= 4 && paragraphCount === 0) {
    const minimumParagraphs = Math.ceil(usableCount / 6);
    const maximumParagraphs = Math.floor(usableCount / 4);
    if (minimumParagraphs <= maximumParagraphs) paragraphCount = minimumParagraphs;
    else usableCount -= 1;
  }
  if (!paragraphCount) return [];

  const paragraphs: string[] = [];
  let cursor = 0;
  for (let index = 0; index < paragraphCount; index += 1) {
    const remainingSentences = usableCount - cursor;
    const remainingParagraphs = paragraphCount - index;
    const size = Math.ceil(remainingSentences / remainingParagraphs);
    paragraphs.push(sentences.slice(cursor, cursor + size).join(" "));
    cursor += size;
  }
  return paragraphs;
}

export type PerspectiveCluster = {
  anchor: Article;
  wireSupport?: Article;
  left?: Article;
  right?: Article;
};

const MATCH_STOPWORDS = new Set([
  "about", "after", "again", "against", "amid", "among", "and", "are", "but", "from", "have", "into", "more", "new", "news", "over", "says", "that", "the", "their", "this", "through", "under", "will", "with", "world", "would", "report", "reports", "update", "updates", "latest", "live", "what", "why", "how", "who", "its", "his", "her", "they", "you", "our", "for", "not", "out", "has", "had", "was", "were",
]);

function topicTokens(article: Article) {
  return new Set(
    `${article.title} ${article.description}`
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/(?:ing|ed|es|s|al)$/i, ""))
      .filter((word) => word.length >= 4 && !MATCH_STOPWORDS.has(word)),
  );
}

function overlapScore(anchor: Article, candidate: Article) {
  const anchorTokens = topicTokens(anchor);
  const candidateTokens = topicTokens(candidate);
  return [...anchorTokens].reduce((score, token) => score + (candidateTokens.has(token) ? 1 : 0), 0);
}

export function buildPerspectiveClusters(articles: Article[], maximum = 3): PerspectiveCluster[] {
  const wires = articles.filter((article) => article.lens === "wire");
  const usedWires = new Set<string>();
  const wireClusters: PerspectiveCluster[] = [];
  const priorityWires = [...wires].sort((a, b) => {
    const apDifference = Number(b.source === "AP News") - Number(a.source === "AP News");
    return apDifference || editorialWorthiness(b) - editorialWorthiness(a);
  });

  for (const wire of priorityWires) {
    if (usedWires.has(wire.id)) continue;
    const support = wires
      .filter((candidate) => candidate.id !== wire.id && candidate.source !== wire.source && !usedWires.has(candidate.id))
      .map((candidate) => ({ candidate, score: overlapScore(wire, candidate) }))
      .filter(({ score }) => score >= 3)
      .sort((a, b) => b.score - a.score || editorialWorthiness(b.candidate) - editorialWorthiness(a.candidate))[0]?.candidate;
    const anchor = support?.source === "AP News" ? support : wire;
    const wireSupport = support ? (anchor.id === wire.id ? support : wire) : undefined;
    usedWires.add(anchor.id);
    if (wireSupport) usedWires.add(wireSupport.id);
    wireClusters.push({ anchor, ...(wireSupport ? { wireSupport } : {}) });
  }

  const rankedClusters = wireClusters
    .sort((a, b) => {
      const score = (cluster: PerspectiveCluster) => editorialWorthiness(cluster.anchor)
        + (cluster.anchor.source === "AP News" ? 5 : 0)
        + (cluster.wireSupport ? 6 : 0);
      return score(b) - score(a);
    })
    .slice(0, maximum);
  const available = {
    left: articles.filter((article) => article.lens === "left-framing"),
    right: articles.filter((article) => article.lens === "right-framing"),
  };
  const used = new Set<string>();

  function bestMatch(cluster: PerspectiveCluster, candidates: Article[]) {
    const ranked = candidates
      .filter((candidate) => !used.has(candidate.id))
      .map((candidate) => ({
        candidate,
        score: Math.max(overlapScore(cluster.anchor, candidate), cluster.wireSupport ? overlapScore(cluster.wireSupport, candidate) : 0),
      }))
      .filter(({ score }) => score >= 3)
      .sort((a, b) => b.score - a.score);
    const match = ranked[0]?.candidate;
    if (match) used.add(match.id);
    return match;
  }

  return rankedClusters.map((cluster) => {
    const left = bestMatch(cluster, available.left);
    const right = bestMatch(cluster, available.right);
    return {
      ...cluster,
      ...(left ? { left } : {}),
      ...(right ? { right } : {}),
    };
  });
}
