import { getSources } from "@/actions/sources"
import { respondWithRead } from "@/lib/readRoute"

// The caller's shelf, for src/lib/reads.ts. Session-optional, like the read
// it fronts: signed out it answers [] rather than 401.
export async function GET() {
  return respondWithRead("getSources", () => getSources())
}
