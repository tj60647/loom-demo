import { searchLoom } from "@/actions/search"
import { respondWithRead } from "@/lib/readRoute"

// Search over the student's own holdings, for src/lib/reads.ts. An optional
// sourceId narrows every group to that reading's slice (contextual scope,
// TJ 2026-08-10); authorization is unchanged — the read only ever returns
// the caller's own rows, so a forged sourceId narrows, never widens.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const q = params.get("q") ?? ""
  const sourceId = params.get("sourceId")
  return respondWithRead("searchLoom", () => searchLoom(q, sourceId))
}
