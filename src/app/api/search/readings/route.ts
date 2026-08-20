import { searchReadings } from "@/actions/search"
import { respondWithRead } from "@/lib/readRoute"

// Shelf search over the course's readings, for src/lib/reads.ts. Query length
// and session rules live in the read: short queries and signed-out callers
// both answer []. An optional sourceId narrows to one reading (contextual
// scope, TJ 2026-08-10) — it filters the caller's own shelf, never widens it.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const q = params.get("q") ?? ""
  const sourceId = params.get("sourceId")
  return respondWithRead("searchReadings", () => searchReadings(q, sourceId))
}
