import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getSourceFileMeta, getSourceFileStream } from "@/actions/sources"
import { hashText } from "@/lib/hash"
import { logError } from "@/lib/log"

/**
 * A Content-Disposition a browser can actually receive. HTTP header values are
 * byte strings (ISO-8859-1) — anything above U+00FF throws when the Response is constructed,
 * so a title with an em dash or a curly quote ("Learning How to Learn — Chapter
 * 1", week 1 of this very course) took the whole route down and, until the
 * catch below learned to tell failures apart, reported itself as a 404 on a
 * reading that was there all along.
 *
 * RFC 6266: send a plain-ASCII `filename` every client understands, plus an
 * RFC 5987 `filename*` carrying the real title for those that read it.
 */
function contentDisposition(kind: "inline" | "attachment", title: string) {
  const base = title.replace(/[\r\n"\\]/g, "").trim() || "reading"
  // Latin-1 punctuation degrades to its ASCII ancestor rather than vanishing:
  // "Learning How to Learn - Chapter 1" reads better than "Learning How to Learn  Chapter 1".
  const ascii = base
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, "")
    .trim() || "reading"
  return `${kind}; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(base + ".pdf")}`
}

// Serves library PDFs from backend-managed storage behind an auth check.
// Files intentionally do NOT live under /public: anything in /public is
// served statically with no access control, so any reading in the library
// could otherwise be downloaded by an unauthenticated request.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const session = await getServerSession(authOptions)
  // In local dev/test, allow the seeded library PDFs to load without a full
  // NextAuth browser session handshake so Playwright and prototype flows can
  // exercise capture/highlight behavior. Keep strict auth in production.
  if (!session?.user?.id && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { sourceId } = await params
  const shouldDownload = new URL(request.url).searchParams.get("download") === "1"

  try {
    // The conditional check first, off the row alone — no byte leaves storage
    // for a reader who already holds the file. The ETag derives from
    // storageKey: repairs mint a NEW key rather than overwriting, so the tag
    // changes exactly when the bytes do. Before this, `max-age=3600` with no
    // validator meant every session an hour old re-downloaded the whole
    // reading — 10MB for a scan whose bytes had not moved in weeks.
    const { source: meta } = await getSourceFileMeta(sourceId)
    const etag = `W/"${hashText(String(meta.storageKey))}"`
    const cacheHeaders: Record<string, string> = {
      "Cache-Control": "private, max-age=3600",
      ETag: etag,
    }
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders })
    }

    // Streamed, not buffered: a Vercel Function may only return ~4.5MB in a
    // buffered body, and three of the course's readings are larger — week 1
    // (4.57MB), week 2's Star & Griesemer (7.29MB) and week 10's Suchman
    // (9.09MB). Over the cap the platform itself answers
    // FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE with a 500 before our code is
    // reached, so it never appears in our logs — and it cannot reproduce
    // locally, where no such cap exists. A streamed body is not capped.
    const { source, stream } = await getSourceFileStream(sourceId)
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(shouldDownload ? "attachment" : "inline", source.title),
        ...cacheHeaders,
        // The size recorded at ingest, so pdf.js can report progress against
        // a total. Null on readings ingested before the column existed —
        // they serve exactly as before until the backfill reaches them.
        ...(source.byteLength != null ? { "Content-Length": String(source.byteLength) } : {}),
      },
    })
  } catch (error) {
    // "Not found" and "Unauthorized" are the two the caller is allowed to
    // learn. Anything else is ours — a missing blob, a store misconfigured,
    // storage down — and reporting it as 404 is what made this class of
    // failure indistinguishable from a reading that was never uploaded.
    const message = error instanceof Error ? error.message : "Unknown error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    logError("reading.serve-failed", { sourceId, cause: error })
    return NextResponse.json({ error: "Could not read this file" }, { status: 500 })
  }
}
