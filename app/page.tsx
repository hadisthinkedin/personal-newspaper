import Newsroom from "@/components/Newsroom";
import { editionKindFromValue, getEdition } from "@/lib/edition-service";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ edition?: string | string[] }> }) {
  const params = await searchParams;
  const kind = editionKindFromValue(params.edition);
  const edition = await getEdition(kind);
  return <Newsroom initial={edition.payload} editionDate={edition.date} editionKind={edition.kind} />;
}
