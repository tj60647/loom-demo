import { NextResponse } from "next/server"
import { draftMetadataForOwnSource } from "@/actions/sources"
import { respondWithRead } from "@/lib/readRoute"

// The same draft for a reading the student minted themselves; ownership is
// checked by the read. Verbatim errors, as for the instructor's draft route.
export async function GET(request: Request) {
  const sourceId = new URL(request.url).searchParams.get("sourceId")
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 })
  }
  return respondWithRead("draftMetadataForOwnSource", () => draftMetadataForOwnSource(sourceId), {
    errors: "verbatim",
  })
}
