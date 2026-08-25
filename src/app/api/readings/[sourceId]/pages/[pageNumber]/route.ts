import { NextResponse, after } from "next/server"
import { getSourceFileMeta } from "@/actions/sources"
import { ensureSourcePageImages, getSourcePageImageKey, PAGE_IMAGE_WIDTHS, type PageImageWidth } from "@/lib/pdfPages"
import { readingStorage } from "@/lib/storage"
import { hashText } from "@/lib/hash"
import { logError } from "@/lib/log"

/**
 * One pre-rendered page image, at one of the fixed widths (?w=320|1280).
 *
 * The happy path is the covers model: a small cached WebP streamed from blob
 * behind an auth check that never touches the PDF. The ETag derives from the
 * source's storageKey — repairs mint a NEW key, so a repaired reading's
 * images revalidate as changed while an untouched reading answers 304.
 *
 * A miss serves 404 and queues one whole-document generation via after() —
 * never a render inline: a cold matrix open can miss a hundred times at
 * once, and each inline render would fetch and decode the entire PDF.
 * ensureSourcePageImages gates itself so those misses collapse into one run;
 * the viewer falls back to rendering from the PDF this session and finds the
 * images next time.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string; pageNumber: string }> }
) {
  const { sourceId, pageNumber } = await params
  const page = Number.parseInt(pageNumber, 10)
  if (!Number.isInteger(page) || page < 1) {
    return NextResponse.json({ error: "Bad page number" }, { status: 400 })
  }
  const requested = Number(new URL(request.url).searchParams.get("w") ?? PAGE_IMAGE_WIDTHS[0])
  if (!(PAGE_IMAGE_WIDTHS as readonly number[]).includes(requested)) {
    return NextResponse.json({ error: "Bad width" }, { status: 400 })
  }
  const width = requested as PageImageWidth

  try {
    const { source } = await getSourceFileMeta(sourceId)
    const etag = `W/"${hashText(`${source.storageKey}:${page}:${width}`)}"`
    const headers = {
      "Cache-Control": "private, max-age=3600",
      ETag: etag,
    }
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers })
    }

    try {
      const stream = await readingStorage.getStream(getSourcePageImageKey(sourceId, page, width))
      return new NextResponse(stream, {
        status: 200,
        headers: { ...headers, "Content-Type": "image/webp" },
      })
    } catch {
      // Not rendered yet (reading predates the pipeline, or ingest's render
      // is still running). Queue the one-shot generation and say so.
      after(() => ensureSourcePageImages(sourceId))
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
    logError("page-image.serve-failed", { sourceId, pageNumber: page, width, cause: error })
    return NextResponse.json({ error: "Could not read this image" }, { status: 500 })
  }
}
