import { getGraphEvents } from "@/actions/loom"
import { respondWithRead } from "@/lib/readRoute"

// The capture log, for src/lib/reads.ts.
export async function GET() {
  return respondWithRead("getGraphEvents", () => getGraphEvents())
}
