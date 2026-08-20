import { getActiveCourse } from "@/actions/courses"
import { respondWithRead } from "@/lib/readRoute"

// The course the header names, for src/lib/reads.ts. Null when signed out or
// unenrolled — the header goes unlabelled, never errors.
export async function GET() {
  return respondWithRead("getActiveCourse", () => getActiveCourse())
}
