import { NextResponse } from "next/server"
import { logError } from "@/lib/log"

/**
 * The server half of src/lib/reads.ts: answer a GET by running a server-side
 * read from src/actions/* and mapping its outcome onto plain JSON transport.
 *
 * Auth lives in the read itself (getUserId's dev backdoor, requireAdmin,
 * overlayViewer's no-backdoor rule) — these handlers add none of their own, so
 * a read enforces the same gate whether a route or a server component calls it.
 *
 * "Unauthorized" and "Not found" pass through with their status; anything else
 * is ours and answers generically, logged here — except where a route opts into
 * verbatim errors because the message IS the interface (the metadata drafts,
 * whose audience is the author reading the failure, not a student's flash bar).
 */
export async function respondWithRead(
  label: string,
  read: () => Promise<unknown>,
  opts?: { errors?: "generic" | "verbatim" }
) {
  try {
    return NextResponse.json(await read())
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    logError("read.failed", { read: label, cause: error })
    const shown = opts?.errors === "verbatim" ? message : "Could not read just now"
    return NextResponse.json({ error: shown }, { status: 500 })
  }
}
