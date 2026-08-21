import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { resolveViewTarget } from "@/lib/viewUserServer"
import { getUserLoomData, getGraphEvents } from "@/actions/loom"

/**
 * Download the viewed student's loom, whole (TJ, 2026-08-21: "a download
 * loom full with everything") — concepts, passages, edges, links, maps,
 * cloths, views, and the capture log. Exists only inside Open Loom: outside
 * the mode it answers 404, and inside it the two reads below re-run the
 * resolver's gate themselves (they are the same cookie-aware reads the app
 * renders from), so this route grants nothing they would refuse.
 *
 * A student's own export stays client-side from provider state
 * (capabilities.ts object-download) — this endpoint is deliberately
 * view-mode-only, not a general export door.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const viewing = await resolveViewTarget(session?.user?.id)
  if (!viewing) {
    return NextResponse.json({ error: "not viewing a loom" }, { status: 404 })
  }

  const [loom, events] = await Promise.all([getUserLoomData(), getGraphEvents()])

  const stem = (viewing.name ?? viewing.email ?? "student")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const body = JSON.stringify(
    {
      student: { name: viewing.name, email: viewing.email },
      exportedAt: new Date().toISOString(),
      loom,
      events,
    },
    null,
    2
  )

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${stem}-loom.json"`,
    },
  })
}
