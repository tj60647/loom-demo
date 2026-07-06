import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getSourceFile } from "@/actions/sources"

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
    const { source, buffer } = await getSourceFile(sourceId)
    const safeFilename = `${source.title.replace(/"/g, "")}.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
