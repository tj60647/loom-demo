/**
 * WHERE A BROWSER CRASH BECOMES A SERVER LOG LINE.
 *
 * src/app/error.tsx posts here when a page throws. Without it a render crash
 * lives only in the reader's own console, which is a place nobody looks and
 * nobody can query — the gap an audit of this branch found on 2026-08-24.
 *
 * DELIBERATELY UNAUTHENTICATED. The boundary fires when the app is already
 * broken, and requiring a session would lose exactly the crashes that happen
 * in or around signing in. What that costs is that anyone can POST here, so
 * nothing is trusted: every field is clamped to a length, the shape is fixed,
 * and the line is written at `warn` rather than `error` because a stranger
 * with curl must not be able to raise something that reads as ours breaking.
 *
 * There is no store and no fan-out: it writes one line to the same structured
 * stream as everything else and answers 204. That is the whole job.
 */
import { NextResponse } from "next/server"
/** `clamp` moved into the logger on #35, where the upstream-body fix needed
 *  the same cut: long enough for a real stack's first frames, short enough
 *  that a body cannot be used to write an essay into the log. */
import { clamp, logWarn } from "@/lib/log"

export async function POST(request: Request) {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    // A malformed body is still a signal that something tried to report a
    // crash, so it is logged rather than dropped — just with nothing in it.
    body = null
  }

  const report = (body ?? {}) as Record<string, unknown>
  logWarn("client.crashed", {
    message: clamp(report.message),
    // Next's own id for a server-side throw, which is what ties this line to
    // the server log entry for the same failure.
    digest: clamp(report.digest),
    stack: clamp(report.stack),
    path: clamp(report.path),
    // Not trusted, but useful for telling one browser's bad day from a real
    // regression everybody is meeting.
    agent: clamp(request.headers.get("user-agent")),
  })

  return new NextResponse(null, { status: 204 })
}
