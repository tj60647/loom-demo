import { getUserLoomData } from "@/actions/loom"
import { respondWithRead } from "@/lib/readRoute"

// The student's whole loom, for src/lib/reads.ts. Same function the actions
// layer uses — including resolveActiveCourseId's idempotent orphan adoption,
// so a student whose first request after enrolment is this read still gets
// their pre-course work adopted (contracts invariant 5).
export async function GET() {
  return respondWithRead("getUserLoomData", () => getUserLoomData())
}
