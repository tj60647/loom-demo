import { NextResponse, after } from "next/server"
import { getSourceFileMeta } from "@/actions/sources"
import { ensureSourceSheet, getSourceSheetKey, SHEET_WIDTH } from "@/lib/pdfPages"
import { readingStorage } from "@/lib/storage"
import { hashText } from "@/lib/hash"

/**
 * The whole-document sheet: the matrix contact sheet as one image, so the
 * view at fit needs one cached fetch instead of one per page. Same contract
 * as the per-page route beside this one — covers-style auth without bytes,
 * ETag off the storage key, and a miss that queues one cheap compose (from
 * the stored thumbs; no PDF is touched) rather than answering slowly.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await params
  try {
    const { source } = await getSourceFileMeta(sourceId)
    const etag = `W/"${hashText(`${source.storageKey}:sheet:${SHEET_WIDTH}`)}"`
    const headers = {
      "Cache-Control": "private, max-age=3600",
      ETag: etag,
    }
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers })
    }
    try {
      const stream = await readingStorage.getStream(getSourceSheetKey(sourceId))
      return new NextResponse(stream, {
        status: 200,
        headers: { ...headers, "Content-Type": "image/webp" },
      })
    } catch {
      after(() => ensureSourceSheet(sourceId))
      return NextResponse.json({ error: "Not rendered yet" }, { status: 404 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    console.error(`[readings] failed to serve sheet for ${sourceId}:`, error)
    return NextResponse.json({ error: "Could not read this image" }, { status: 500 })
  }
}
