import { getVocabularyOverlay } from "@/actions/overlays"
import { respondWithRead } from "@/lib/readRoute"

// What others named, for src/lib/reads.ts. No sourceId means the whole weave,
// exactly as the read's null scope does; privacy rules live in the read.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const sourceId = params.get("sourceId")
  const band = params.get("band") === "cohort" ? "cohort" : "section"
  // Staff choose which section to compare; absent means their own.
  const sectionId = params.get("section")
  return respondWithRead("getVocabularyOverlay", () => getVocabularyOverlay(sourceId, band, sectionId))
}
