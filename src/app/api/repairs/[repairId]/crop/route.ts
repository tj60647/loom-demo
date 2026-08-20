import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { db } from "@/db"
import { sourceRepairs, users } from "@/db/schema"
import { authOptions, isAdminUser } from "@/lib/auth"
import { readingStorage } from "@/lib/storage"

/**
 * The cropped image of a damaged region, for the admin review screen.
 *
 * Admin-only and served through the app rather than from a public URL, for the
 * same reason readings are: a crop is a piece of a copyrighted course reading,
 * and the blob store is private precisely so that nothing about a reading is
 * reachable without a session.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ repairId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 })

  if (!isAdminUser(session.user)) {
    const rows = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
    if (rows[0]?.role !== "ADMIN") return new NextResponse("Not found", { status: 404 })
  }

  const { repairId } = await params
  const rows = await db.select().from(sourceRepairs).where(eq(sourceRepairs.id, repairId)).limit(1)
  const repair = rows[0]
  if (!repair) return new NextResponse("Not found", { status: 404 })

  try {
    const stream = await readingStorage.getStream(repair.cropKey)
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "image/png",
        // A crop never changes once written — it is keyed to the region it was
        // cut from — so it can be cached hard. Private, like the reading.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    })
  } catch {
    return new NextResponse("Not found", { status: 404 })
  }
}
