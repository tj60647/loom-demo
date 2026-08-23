import { NextResponse } from "next/server"
import { getPassagesOverlay } from "@/actions/overlays"
import { respondWithRead } from "@/lib/readRoute"

// Peer passage heat for one reading, for src/lib/reads.ts. Every privacy rule
// (rulings 1–4 in src/actions/overlays.ts's header, including the per-reading
// gate and the no-dev-backdoor stance) lives in the read itself.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const sourceId = params.get("sourceId")
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 })
  }
  const raw = params.get("band")
  const band = raw === "cohort" ? "cohort" : raw === "student" ? "student" : "section"
  // Staff choose which section to compare; absent means their own.
  const sectionId = params.get("section")
  // Only the student band reads this, and the action re-checks that the target
  // is a LEARNER of the viewer's own course before it counts a single row.
  const studentId = params.get("student")
  return respondWithRead("getPassagesOverlay", () =>
    getPassagesOverlay(sourceId, band, sectionId, studentId)
  )
}
