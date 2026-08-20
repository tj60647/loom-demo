import { NextResponse } from "next/server"
import { draftMetadataForSource } from "@/actions/sources"
import { respondWithRead } from "@/lib/readRoute"

// Draft card metadata off a library PDF, for src/lib/reads.ts. Admin-only via
// the read's requireAdmin. Verbatim errors: the audience is the instructor
// reading why their draft failed, and the message is the interface.
export async function GET(request: Request) {
  const sourceId = new URL(request.url).searchParams.get("sourceId")
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 })
  }
  return respondWithRead("draftMetadataForSource", () => draftMetadataForSource(sourceId), {
    errors: "verbatim",
  })
}
