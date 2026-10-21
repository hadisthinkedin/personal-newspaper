import { NextRequest, NextResponse } from "next/server";
import {
  contextualUnavailableDefinition,
  selectWikipediaPage,
  summarizeWikipediaExtract,
  type WikipediaSearchPage,
} from "@/lib/entity-definition";
import { knownEntityDefinition } from "@/lib/entities";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get("term")?.trim().slice(0, 100);
  const context = request.nextUrl.searchParams.get("context")?.trim().slice(0, 500) || "";
  if (!term) return NextResponse.json({ error: "A term is required." }, { status: 400 });

  const knownDefinition = knownEntityDefinition(term);
  if (knownDefinition) {
    return NextResponse.json({ term, definition: knownDefinition, source: "curated reference" });
  }

  try {
    const endpoint = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page");
    endpoint.searchParams.set("q", term);
    endpoint.searchParams.set("limit", "5");
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "TheDailyBread/1.0 (personal news reader)" },
      next: { revalidate: 86_400 },
    });
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);

    const data = (await response.json()) as { pages?: WikipediaSearchPage[] };
    const page = selectWikipediaPage(term, data.pages || [], context);
    if (!page?.title) {
      return NextResponse.json({
        term,
        definition: contextualUnavailableDefinition(term, context),
        source: "article context",
      });
    }

    const summaryEndpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
    const summaryResponse = await fetch(summaryEndpoint, {
      headers: { "User-Agent": "TheDailyBread/1.0 (personal news reader)" },
      next: { revalidate: 86_400 },
    });
    if (!summaryResponse.ok) throw new Error(`Wikipedia summary returned ${summaryResponse.status}`);
    const summary = (await summaryResponse.json()) as { extract?: string; type?: string };
    const definition = summary.type === "disambiguation" ? undefined : summarizeWikipediaExtract(summary.extract || "");

    return NextResponse.json({
      term,
      definition: definition || contextualUnavailableDefinition(term, context),
      source: definition ? "Wikipedia" : "context",
    });
  } catch {
    return NextResponse.json({
      term,
      definition: contextualUnavailableDefinition(term, context),
      source: "article context",
    });
  }
}
