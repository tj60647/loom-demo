import { getRepairSettings } from "@/actions/repairs"
import { respondWithRead } from "@/lib/readRoute"

// The repair panel's reader roster and guard values, for src/lib/reads.ts.
// Admin-only via the read's own requireAdmin.
export async function GET() {
  return respondWithRead("getRepairSettings", () => getRepairSettings())
}
