import { contextualUnavailableDefinition } from "@/lib/entity-definition";

export type EntityPart = {
  text: string;
  entity: boolean;
  definition?: string;
};

const ENTITY_DEFINITIONS: Record<string, string> = {
  "Abdul El-Sayed": "An American physician and public-health advocate who formerly led Detroit’s health department. He is best known nationally for bringing universal health care and public-health reform into major Michigan political campaigns.",
  "Anthropic": "An AI research and product company founded by former OpenAI researchers. It is best known for the Claude model family and for making AI safety and controllability central to its research and products.",
  "AP News": "The news service of The Associated Press, an independent nonprofit cooperative with journalists around the world. It is best known for supplying widely republished, on-the-ground reporting used by thousands of news organizations.",
  "Block": "Block, Inc. is a financial-technology company co-founded by Jack Dorsey and Jim McKelvey. It is best known for Square merchant payments, Cash App, Afterpay, and products intended to broaden access to digital commerce and finance.",
  "ChatGPT": "A conversational AI product developed by OpenAI. It is best known for bringing general-purpose generative AI into widespread public use for writing, research, coding, and other knowledge work.",
  "China": "A country in East Asia with one of the world’s largest populations and economies. Its manufacturing scale, trade relationships, military power, and permanent seat on the UN Security Council give it major global influence.",
  "Claude": "A family of AI assistants and language models developed by Anthropic. It is best known for long-context analysis, writing and coding capabilities, and Anthropic’s emphasis on AI safety.",
  "Dario Amodei": "An American AI researcher and entrepreneur who previously led research at OpenAI. He is best known for co-founding Anthropic and shaping the development and safety strategy behind its Claude models.",
  "Detroit": "Michigan’s largest city and the center of its largest metropolitan area. It is best known worldwide as the historic center of the American automobile industry and for its influence on music, labor, and manufacturing.",
  "Donald Trump": "An American political figure who has served as president of the United States. His populist movement reshaped the Republican Party and significantly influenced American immigration, trade, judicial, and foreign policy.",
  "East Lansing": "A city adjoining Michigan’s capital, Lansing. It is best known as the home of Michigan State University, making higher education and research central to the city’s identity and economy.",
  "Elon Musk": "A technology executive associated with Tesla, SpaceX, xAI, and other ventures. He is best known for accelerating commercial electric vehicles and private spaceflight while exerting broad influence over technology and online public discourse.",
  "Florida": "A populous state in the southeastern United States. It is best known for tourism, aerospace activity, rapid population growth, and its recurring importance in national elections.",
  "Fox News": "A major American cable and digital news organization. It is best known for its large conservative-leaning audience and its substantial influence on Republican politics and right-of-center public debate.",
  "Gaza": "A densely populated Palestinian territory on the Mediterranean coast. It is globally significant because the Israeli–Palestinian conflict, repeated wars, displacement, and humanitarian conditions there affect regional security and international diplomacy.",
  "Google DeepMind": "Google’s artificial-intelligence research laboratory, formed from DeepMind and Google Brain. It is best known for breakthroughs including AlphaGo, AlphaFold, and major contributions to Google’s Gemini AI models.",
  "Grand Rapids": "A city in western Michigan and the state’s second-largest city. It is best known as a regional center for health care, furniture design and manufacturing, higher education, and the arts.",
  "Houthi": "The Houthis, officially known as Ansar Allah, are a Yemen-based Zaydi political and armed movement that controls much of northern Yemen. They are a central party in Yemen’s civil war, and their attacks on Red Sea shipping and regional targets have affected international security and trade.",
  "Houthis": "The Houthis, officially known as Ansar Allah, are a Yemen-based Zaydi political and armed movement that controls much of northern Yemen. They are a central party in Yemen’s civil war, and their attacks on Red Sea shipping and regional targets have affected international security and trade.",
  "Israel": "A country in the Middle East established in 1948. It has major global significance through its role in the Israeli–Palestinian conflict, regional security, technology, religion, and close ties with the United States.",
  "Jev": "An AI model introduced by TypeSafe AI as part of its System One family. It is best known for the company’s effort to build models that reason through problems using a different architecture from conventional large language models.",
  "Kansas": "A state in the central United States. It is best known for agricultural production, aviation manufacturing, and its historical role in the conflict over slavery before the American Civil War.",
  "Lansing": "The capital of Michigan and the seat of the state government. It is best known for hosting Michigan’s executive, legislative, and judicial institutions and for its close economic connection to nearby Michigan State University.",
  "Lenfest Institute": "The Lenfest Institute for Journalism is a Philadelphia-based nonprofit that supports sustainable local news. It is best known as the nonprofit owner of The Philadelphia Inquirer and for funding, training, and developing new business models for local journalism.",
  "Lenfest Institute for Journalism": "The Lenfest Institute for Journalism is a Philadelphia-based nonprofit that supports sustainable local news. It is best known as the nonprofit owner of The Philadelphia Inquirer and for funding, training, and developing new business models for local journalism.",
  "Macomb County": "A populous county in southeastern Michigan that includes Warren and communities north of Detroit. Its large suburban electorate, manufacturing base, and automotive workforce make it economically and politically important in Michigan.",
  "Meta": "The technology company that owns Facebook, Instagram, WhatsApp, and Threads. It has had worldwide impact on social communication and digital advertising and is also known for the Llama AI models and major investment in virtual reality.",
  "Michigan": "A Great Lakes state in the upper Midwest of the United States. It is best known for the American automobile industry, extensive freshwater coastlines, manufacturing, and an important role in national elections.",
  "Michigan State University": "A public research university in East Lansing founded in 1855. It is best known as a pioneering land-grant university and for major programs in agriculture, engineering, education, and scientific research.",
  "Mistral AI": "A French AI company founded by former Meta and Google DeepMind researchers. It is best known for efficient open-weight language models and for advancing Europe’s effort to build competitive, independent AI technology.",
  "New York": "A state in the northeastern United States; the name also commonly refers to New York City. The city is best known as a global center of finance, media, culture, immigration, and international diplomacy.",
  "OpenAI": "An AI research and product company that develops ChatGPT and the GPT model family. It is best known for helping move generative AI into mainstream public and commercial use, reshaping software, education, media, and knowledge work.",
  "Reuters": "A global news agency operated by Thomson Reuters. It is best known for rapid, widely syndicated reporting on politics, conflict, business, and financial markets used by newsrooms and institutions worldwide.",
  "Russia": "A country spanning Eastern Europe and northern Asia and possessing one of the world’s largest nuclear arsenals. Its military power, energy exports, permanent UN Security Council seat, and war against Ukraine give it major global influence.",
  "TypeSafe AI": "An AI company developing the Jev and System One model family. It is best known for pursuing an alternative model architecture intended to improve reasoning beyond conventional next-token language models.",
  "Ukraine": "An Eastern European country that became independent from the Soviet Union in 1991. Its resistance to Russia’s invasion has reshaped European security, NATO policy, energy markets, and international debates over sovereignty.",
  "United States": "A federal republic of 50 states with the world’s largest economy by nominal output and extensive military and diplomatic reach. Its institutions, currency, technology companies, culture, and foreign policy have enormous global influence.",
  "Warren": "A city in Macomb County and Michigan’s third-largest city. It is best known as an automotive and defense-manufacturing center and as the home of the U.S. Army’s Detroit Arsenal.",
  "White House": "The official residence and principal workplace of the president of the United States. The term also refers to the presidential administration, whose decisions can shape American law, diplomacy, military policy, and the global economy.",
  "Yemen": "A country at the southern end of the Arabian Peninsula beside the Red Sea and Gulf of Aden. It is globally significant because its civil war and humanitarian crisis intersect with regional rivalries and shipping routes near the Bab el-Mandeb strait.",
  "xAI": "An AI company founded by Elon Musk that develops the Grok model family. It is best known for integrating Grok with the X platform and for rapidly building large-scale computing infrastructure to compete with leading AI laboratories.",
  "Zohran Mamdani": "An American democratic-socialist politician associated with New York state and city politics. He is best known for emphasizing housing affordability, public transit, and other cost-of-living issues while broadening the visibility of South Asian and Muslim political representation.",
};

const GENERIC_PROPER_PHRASES = new Set([
  "Associated Press",
  "Breaking News",
  "Global Headlines",
  "Meaningful Good News",
  "National Headlines",
  "Screen Cinema",
  "Top AI News",
]);

const GENERIC_LEADING_PROPER_WORDS = new Set([
  "After",
  "Before",
  "Breaking",
  "During",
  "Following",
  "Inside",
  "Meanwhile",
  "Outside",
  "Since",
  "This",
  "When",
  "While",
]);

function isCredibleProperNameCandidate(raw: string) {
  const words = raw.split(/\s+/);
  if (words.some((word) => /[’']s$/i.test(word))) return false;
  if (GENERIC_LEADING_PROPER_WORDS.has(words[0])) return false;
  return true;
}

export function knownEntityDefinition(term: string) {
  const key = Object.keys(ENTITY_DEFINITIONS).find((candidate) =>
    candidate === "Block" ? term === "Block" : candidate.toLowerCase() === term.toLowerCase(),
  );
  return key ? ENTITY_DEFINITIONS[key] : undefined;
}

function occurrences(text: string, term: string) {
  const matches: Array<{ start: number; end: number; text: string; definition?: string; known: boolean }> = [];
  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const start = lowerText.indexOf(lowerTerm, cursor);
    if (start === -1) break;
    const end = start + term.length;
    const before = text[start - 1];
    const after = text[end];
    if (
      (!before || !/[\p{L}\p{N}]/u.test(before))
      && (!after || !/[\p{L}\p{N}]/u.test(after))
      && (term !== "Block" || text.slice(start, end) === "Block")
    ) {
      matches.push({ start, end, text: text.slice(start, end), definition: ENTITY_DEFINITIONS[term], known: true });
    }
    cursor = end;
  }
  return matches;
}

export function entityParts(text: string): EntityPart[] {
  const candidates = Object.keys(ENTITY_DEFINITIONS).flatMap((term) => occurrences(text, term));
  const properName = /\b(?:[A-Z][\p{L}’'.-]+|[A-Z]{2,})(?:\s+(?:(?:of|the|and|for)\s+)?(?:[A-Z][\p{L}’'.-]+|[A-Z]{2,})){1,3}\b/gu;

  for (const match of text.matchAll(properName)) {
    const start = match.index;
    const raw = match[0].replace(/^The\s+/, "");
    const adjustedStart = start + match[0].length - raw.length;
    if (
      raw.length < 5
      || GENERIC_PROPER_PHRASES.has(raw)
      || !isCredibleProperNameCandidate(raw)
    ) continue;
    const contextualDefinition = contextualUnavailableDefinition(raw, text);
    candidates.push({
      start: adjustedStart,
      end: adjustedStart + raw.length,
      text: raw,
      known: false,
      ...(contextualDefinition.startsWith("A reliable background match")
        ? {}
        : { definition: contextualDefinition }),
    });
  }

  candidates.sort((a, b) => Number(b.known) - Number(a.known) || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.some((current) => candidate.start < current.end && candidate.end > current.start)) continue;
    selected.push(candidate);
  }
  selected.sort((a, b) => a.start - b.start);

  if (!selected.length) return [{ text, entity: false }];
  const parts: EntityPart[] = [];
  let cursor = 0;
  for (const entity of selected) {
    if (entity.start > cursor) parts.push({ text: text.slice(cursor, entity.start), entity: false });
    parts.push({ text: entity.text, entity: true, ...(entity.definition ? { definition: entity.definition } : {}) });
    cursor = entity.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), entity: false });
  return parts;
}
