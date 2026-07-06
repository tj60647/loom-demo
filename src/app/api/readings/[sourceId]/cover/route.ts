import { NextResponse } from "next/server"
import { getSourceFile } from "@/actions/sources"
import { readingStorage } from "@/lib/storage"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"

function renderCoverFallbackSvg(title: string) {
  const safeTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="600" viewBox="0 0 420 600" role="img" aria-label="${safeTitle}">
      <defs>
        <linearGradient id="loom-cover-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f5f1e5" />
          <stop offset="100%" stop-color="#e7deca" />
        </linearGradient>
      </defs>
      <rect width="420" height="600" rx="22" fill="url(#loom-cover-bg)" />
      <rect x="28" y="28" width="364" height="544" rx="18" fill="none" stroke="#cbc7ba" stroke-width="2" />
      <text x="42" y="88" fill="#a8843f" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="18" letter-spacing="3">LOOM LIBRARY</text>
      <foreignObject x="42" y="126" width="336" height="360">
        <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;height:100%;align-items:flex-start;color:#1a1916;font-family:Georgia,serif;font-size:34px;line-height:1.18;font-weight:600;">
          <div>${safeTitle}</div>
        </div>
      </foreignObject>
      <text x="42" y="548" fill="#6b675c" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="15" letter-spacing="2">PREVIEW UNAVAILABLE</text>
    </svg>
  `
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await params

  try {
    const { source, buffer } = await getSourceFile(sourceId)
    const coverKey = getSourceCoverKey(source.id)

    try {
      const coverBuffer = await readingStorage.get(coverKey)
      return new NextResponse(new Uint8Array(coverBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=3600",
        },
      })
    } catch {
      try {
        const coverBuffer = await renderPdfCoverImage(buffer)

        try {
          await readingStorage.put(coverKey, coverBuffer)
        } catch (error) {
          console.warn("[Loom] Failed to persist generated cover image", error)
        }

        return new NextResponse(new Uint8Array(coverBuffer), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=3600",
          },
        })
      } catch (error) {
        console.warn("[Loom] Failed to render cover image", error)
        return new NextResponse(renderCoverFallbackSvg(source.title), {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "private, max-age=3600",
          },
        })
      }
    }
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}