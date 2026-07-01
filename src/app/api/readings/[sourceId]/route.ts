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
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { sourceId } = await params

  try {
    const { source, buffer } = await getSourceFile(sourceId)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${source.title.replace(/"/g, "")}.pdf"`,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
