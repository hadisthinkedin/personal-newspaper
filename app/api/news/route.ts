import { NextResponse } from "next/server";
import { editionKindFromValue, getEdition } from "@/lib/edition-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = editionKindFromValue(searchParams.get("edition"));
  const edition = await getEdition(kind);
  return NextResponse.json({
    ...edition.payload,
    editionDate: edition.date,
    editionKind: edition.kind,
    archived: edition.archived,
  });
}
