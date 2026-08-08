import { searchLoom } from "@/actions/search"
import { respondWithRead } from "@/lib/readRoute"

// Shelf search over the student's own holdings, for src/lib/reads.ts.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? ""
  return respondWithRead("searchLoom", () => searchLoom(q))
}
