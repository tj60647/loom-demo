import { searchReadings } from "@/actions/search"
import { respondWithRead } from "@/lib/readRoute"

// Shelf search over the course's readings, for src/lib/reads.ts. Query length
// and session rules live in the read: short queries and signed-out callers
// both answer [].
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? ""
  return respondWithRead("searchReadings", () => searchReadings(q))
}
