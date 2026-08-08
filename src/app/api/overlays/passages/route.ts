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
  const band = params.get("band") === "cohort" ? "cohort" : "section"
  return respondWithRead("getPassagesOverlay", () => getPassagesOverlay(sourceId, band))
}
