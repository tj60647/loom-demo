import { getReadingPageManifest } from "@/actions/sources"
import { respondWithRead } from "@/lib/readRoute"

// Per-page facts of a reading — sizes and text lengths — so the viewer can
// lay the whole document out before a single page has rendered. Auth lives in
// the read (authorizeSourceAccess), per src/lib/readRoute.ts's contract.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await params
  return respondWithRead("getReadingPageManifest", () => getReadingPageManifest(sourceId))
}
