/**
 * THE GATE'S MEMORY.
 *
 * `decideSignIn` allows or refuses and, until now, remembered neither. The only
 * trace of a refusal was a `/auth/error` request in Vercel's log, which keeps
 * the timestamp and DROPS the query string — so the address the person actually
 * presented, the one fact that makes a refusal actionable, survived nowhere.
 * Checked against production on 2026-08-24: 20 refusals across two days, twelve
 * of them in two bursts minutes apart, none attributable to anybody.
 *
 * This writes the row. See `authEvents` in src/db/schema.ts for what it keeps
 * and what it deliberately does not.
 */
import { db } from "@/db"
import { authEvents } from "@/db/schema"
import { lt } from "drizzle-orm"
import { logError, logInfo, logWarn } from "@/lib/log"

/** How long a decision is kept (TJ, 2026-08-24: "add prune 180"). */
export const AUTH_EVENT_DAYS = 180

export type AuthOutcome = "allowed" | "not-on-roster" | "no-verified-email"

/**
 * ONE IN TWENTY-FIVE WRITES ALSO PRUNES.
 *
 * Not every write, because this runs inside the sign-in callback and a student
 * waiting on a redirect should not also wait on a DELETE. Not a scheduled job
 * either: the drift check already shows what happens to a production chore that
 * depends on somebody remembering, and there is no cron here to hang it on.
 *
 * At a course's volume — dozens of sign-ins a day — one in twenty-five is a
 * sweep every few days, which is ample for a 180-day window. The delete is a
 * range scan on `auth_event_at_idx` that finds nothing almost every time.
 */
const PRUNE_ODDS = 25

/**
 * Delete decisions older than the window. Exported so a script or a future
 * scheduled job can call it directly rather than waiting for the dice.
 */
export async function pruneAuthEvents(days = AUTH_EVENT_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const gone = await db.delete(authEvents).where(lt(authEvents.at, cutoff)).returning({ id: authEvents.id })
  if (gone.length > 0) logInfo("auth.pruned", { removed: gone.length, olderThanDays: days })
  return gone.length
}

/**
 * Record one decision.
 *
 * NEVER THROWS. A gate that failed closed because its audit trail was
 * unavailable would turn a logging outage into an outage — the same rule
 * `recordEvent` follows in src/lib/graphEvent.ts, and the reason both swallow
 * rather than propagate.
 *
 * IT DOES COST THE SIGN-IN A ROUND TRIP, and saying otherwise would be a lie:
 * the caller awaits it, so the redirect waits on one INSERT, and on one write
 * in twenty-five a DELETE as well. That is the deliberate price of the record
 * — at a course's volume it is a few tens of milliseconds on a path taken once
 * a session. The way to remove it is Vercel's `waitUntil`, which hands the
 * write to the platform after the response goes out; `@vercel/functions` is
 * not a dependency here, and adding one to save 40ms on sign-in is not a trade
 * worth making today. Revisit if this ever runs somewhere busy.
 *
 * The line also goes to the operational log, so a refusal is visible in
 * `vercel logs` in the moment AND in the table next week. Two audiences: the
 * person debugging now, and the professor asking in March.
 */
export async function recordAuthEvent(entry: {
  email: string
  outcome: AuthOutcome
  provider?: string
}): Promise<void> {
  const row = {
    email: entry.email,
    outcome: entry.outcome,
    provider: entry.provider ?? "",
  }
  // The operational half first: it costs nothing and survives a database that
  // is the reason the row could not be written.
  if (entry.outcome === "allowed") logInfo("auth.allowed", row)
  else logWarn("auth.refused", row)

  try {
    await db.insert(authEvents).values(row)
    if (Math.floor(Math.random() * PRUNE_ODDS) === 0) await pruneAuthEvents()
  } catch (error) {
    logError("auth.record-failed", { ...row, cause: error })
  }
}
