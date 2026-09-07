import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { logError } from "@/lib/log"

/**
 * CAN THIS DEPLOYMENT REACH ITS DATABASE?
 *
 * Written after 2026-09-01, when it could not for about ten hours and nothing
 * noticed. The Neon owner password rotated and production's DATABASE_URL went
 * stale; every NextAuth adapter call failed and no student could sign in —
 * while `/` answered 200 throughout, because those pages render without data.
 *
 * The failure surfaced on `/reading/[sourceId]` (29 5xx that day, measured),
 * a page nobody's monitor was watching and that sees 1–45 requests an hour.
 * Vercel's own error-anomaly detector recorded nothing, across the incident
 * and the 90 days around it. A signal that thin cannot be alerted on.
 *
 * So this route exists to be *asked*, on a schedule, by something outside the
 * deployment: .github/workflows/heartbeat.yml, and any external uptime check.
 * It turns a rare, invisible data failure into a frequent, deterministic 5xx.
 *
 * Deliberately: no session (a monitor cannot sign in), no request parameters,
 * and a body carrying no detail beyond ok/not-ok — the status code is the
 * interface, and a health endpoint is a bad place to describe the inside of a
 * system to whoever asks.
 */

// A prerendered health check reports the health of the build machine. Route
// Handlers are uncached by default in this version and this one reads the
// database, so it would run per-request anyway — but the whole value of the
// route is that it is never answered from a cache, so it says so out loud
// rather than depending on a default holding.
export const dynamic = "force-dynamic"

export async function GET() {
  const noStore = { "cache-control": "no-store, max-age=0" }
  try {
    // `select 1` rather than a table read: this asks whether the connection
    // and its credentials work, and it must not start failing because a
    // migration renamed something.
    await db.execute(sql`select 1`)
    return NextResponse.json({ ok: true }, { headers: noStore })
  } catch (error) {
    logError("health.failed", {
      cause: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false }, { status: 503, headers: noStore })
  }
}
