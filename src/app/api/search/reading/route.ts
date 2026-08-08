import { NextResponse } from "next/server"
import { searchReading } from "@/actions/search"
import { respondWithRead } from "@/lib/readRoute"

// Find-in-this-reading, for src/lib/reads.ts.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const sourceId = params.get("sourceId")
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 })
  }
  const q = params.get("q") ?? ""
  return respondWithRead("searchReading", () => searchReading(sourceId, q))
}
