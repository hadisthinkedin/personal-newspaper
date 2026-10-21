import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getNews } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag("news-feeds", { expire: 0 });
  revalidateTag("news", { expire: 0 });
  revalidatePath("/", "page");
  revalidatePath("/api/news", "page");

  const edition = await getNews();
  return NextResponse.json({
    ok: true,
    warmedAt: new Date().toISOString(),
    editionUpdatedAt: edition.updatedAt,
    articles: edition.articles.length,
    healthySources: edition.sources.filter((source) => source.ok).length,
    sources: edition.sources.length,
  });
}
