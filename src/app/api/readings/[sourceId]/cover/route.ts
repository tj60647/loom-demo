import { NextResponse } from "next/server"
import { getSourceFile } from "@/actions/sources"
import { readingStorage } from "@/lib/storage"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"

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
      const coverBuffer = await renderPdfCoverImage(buffer)
      await readingStorage.put(coverKey, coverBuffer)
      return new NextResponse(new Uint8Array(coverBuffer), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=3600",
        },
      })
    }
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}