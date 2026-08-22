import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { resolveViewTarget } from "@/lib/viewUserServer"
import { getUserLoomData, getGraphEvents } from "@/actions/loom"
import { OPEN_LOOM_FILE_MARKER, fileStamp } from "@/lib/objectExport"

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
  // This route exists only inside Open Loom, so EVERY file it serves is a
  // staff copy — the marker is unconditional here, unlike the object
  // downloads, which the student also takes (TJ, 2026-08-22).
  const takenBy = session?.user?.name ?? session?.user?.email ?? "staff"
  const body = JSON.stringify(
    {
      student: { name: viewing.name, email: viewing.email },
      exportedAt: new Date().toISOString(),
      // Same two keys the object exports carry in `provenance`, spelled the
      // same way, so one grep finds every staff copy whatever its shape.
      takenVia: OPEN_LOOM_FILE_MARKER,
      takenBy,
      loom,
      events,
    },
    null,
    2
  )

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      // `open-loom.<student>-loom.<stamp>.json` — the marker leads and the
      // stamp trails, matching objectExportFilename. This file had no stamp
      // at all, against the 2026-08-12 "anywhere a download is made" ruling.
      "Content-Disposition": `attachment; filename="${OPEN_LOOM_FILE_MARKER}.${stem}-loom.${fileStamp()}.json"`,
    },
  })
}
