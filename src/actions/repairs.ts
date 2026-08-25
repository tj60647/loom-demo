"use server"

/**
 * Admin actions for repairing gibberish in a reading.
 *
 * Four acts, deliberately separate, because they differ in cost and in what
 * they risk:
 *
 *   detect      — free, repeatable, writes only proposals
 *   transcribe  — costs money and a minute; writes readings, changes nothing
 *   accept      — a person's decision, recorded with their name on it
 *   apply       — the only one that changes what a student sees
 *
 * Keeping them apart is what lets the expensive step be retried, the decision be
 * audited, and the change be refused if it does not measure better.
 */
import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm"
import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth/next"
import { db } from "@/db"
import { authOptions, isAdminUser } from "@/lib/auth"
import { passages, sourceRepairs, sourceRepairReadings, sources, users } from "@/db/schema"
import { readingStorage } from "@/lib/storage"
import { detectRepairsForSource, repairSettings, transcribeRepairRegion } from "@/lib/repairPipeline"
import { ACCEPTED_OVERLAP_FLOOR } from "@/lib/repairReview"
import { MIN_KEPT_TEXT_SHARE, acceptRepairDecision, applyAcceptedRepairs } from "@/lib/repairApply"
import { consensusSettings } from "@/lib/repairConsensus"
import { logWarn } from "@/lib/log"

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (!isAdminUser(session.user)) {
    const rows = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
    if (rows[0]?.role !== "ADMIN") throw new Error("Unauthorized")
  }
  return session
}

function revalidate() {
  revalidatePath("/admin/library")
}

export type Refused = { ok: false; error: string }

/**
 * Run an act, and hand back a refusal rather than throwing it.
 *
 * Next redacts the message of anything a Server Function throws in a production
 * build — the client receives a digest and "an error occurred". Every refusal in
 * this file is a sentence somebody has to read before they can act: which
 * highlights are in the way, why the repair measured worse than the damage,
 * which version of the PDF a decision was made against. Thrown, all of them
 * arrive as the same shrug.
 *
 * So expected errors are return values here, which is what Next 16 asks for, and
 * the guard clauses that produce them still read as `throw`. Unexpected errors
 * come back the same way on purpose: this surface is admin-only, and an operator
 * is better served by "Blob not found for key: …" than by a digest. They are
 * logged as well, because a returned error is not one the platform will notice.
 */
async function attempt<T extends object>(
  act: () => Promise<T>
): Promise<({ ok: true } & T) | Refused> {
  try {
    return { ok: true, ...(await act()) }
  } catch (error) {
    logWarn("repair.refused", { cause: error })
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Everything an admin needs to review one reading's proposals. */
export async function getRepairsForSource(sourceId: string) {
  await requireAdmin()

  const repairs = await db
    .select()
    .from(sourceRepairs)
    .where(eq(sourceRepairs.sourceId, sourceId))
    .orderBy(asc(sourceRepairs.pageNumber))

  if (repairs.length === 0) return []

  const readings = await db
    .select()
    .from(sourceRepairReadings)
    .where(
      inArray(
        sourceRepairReadings.repairId,
        repairs.map((repair) => repair.id)
      )
    )
    .orderBy(asc(sourceRepairReadings.reader))

  return repairs.map((repair) => ({
    ...repair,
    readings: readings.filter((reading) => reading.repairId === repair.id),
  }))
}

/**
 * What the panel is, in its own words, for the settings dialog.
 *
 * Every number here is read from the module that uses it — never retyped — so
 * the dialog cannot quietly describe a system that no longer exists. The
 * thresholds this file owns are stated here too, because a reviewer deciding
 * whether to press "write into the reading" is entitled to know what would make
 * that refuse.
 */
export async function getRepairSettings() {
  await requireAdmin()
  return {
    ...repairSettings(),
    consensus: consensusSettings(),
    guards: {
      acceptedOverlapFloor: ACCEPTED_OVERLAP_FLOOR,
      minKeptTextShare: MIN_KEPT_TEXT_SHARE,
    },
  }
}

/**
 * Which readings carry proposals, and which carry highlights.
 *
 * The library page renders the whole shelf, and asking `getRepairsForSource` for
 * every card would be a round trip apiece for a panel that is empty on all but
 * the damaged few. Two grouped counts answer both questions at once, and the
 * page then fetches full rows only where there is something to show. The
 * highlight count is what the panel means by `hasHighlights` — it comes from
 * here rather than from the panel so that the page can say "this one is locked"
 * without opening it.
 */
export async function getRepairSummary() {
  await requireAdmin()

  const [repairRows, highlightRows] = await Promise.all([
    db
      .select({ sourceId: sourceRepairs.sourceId, status: sourceRepairs.status, value: count() })
      .from(sourceRepairs)
      .groupBy(sourceRepairs.sourceId, sourceRepairs.status),
    // Only highlights with offsets. A passage typed or pasted rather than selected
    // was never measured against a text layer, so replacing one cannot disturb
    // it — 20 of this library's 43 passages were that kind when this was
    // written (2026-08; the counts drift with every capture), carrying a written
    // location like "p. 387 (abstract)" and nothing to move. Counting them made
    // the panel say "7 highlights anchored to this reading" about a reading with
    // none, and refused a repair that would have broken nothing.
    db
      .select({ sourceId: passages.sourceId, value: count() })
      .from(passages)
      .where(isNotNull(passages.startOffset))
      .groupBy(passages.sourceId),
  ])

  const repairs: Record<string, { total: number; proposed: number; accepted: number; applied: number }> = {}
  for (const row of repairRows) {
    const entry = (repairs[row.sourceId] ??= { total: 0, proposed: 0, accepted: 0, applied: 0 })
    entry.total += row.value
    if (row.status === "proposed") entry.proposed += row.value
    if (row.status === "accepted") entry.accepted += row.value
    if (row.status === "applied") entry.applied += row.value
  }

  const highlights: Record<string, number> = {}
  for (const row of highlightRows) {
    // A passage captured outside the library has no sourceId and anchors to nothing.
    if (row.sourceId) highlights[row.sourceId] = row.value
  }

  return { repairs, highlights }
}

/** Find damaged regions. Cheap and repeatable; refreshes undecided proposals. */
export async function detectRepairs(sourceId: string) {
  return attempt(async () => {
    await requireAdmin()

    const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
    const source = rows[0]
    if (!source?.storageKey) throw new Error("That reading has no stored file to examine.")

    const result = await detectRepairsForSource(
      sourceId,
      await readingStorage.get(source.storageKey),
      source.storageKey
    )
    revalidate()
    return result
  })
}

/** Read one region. Synchronous, so the admin sees the result they asked for. */
export async function transcribeRepair(repairId: string) {
  return attempt(async () => {
    await requireAdmin()
    const result = await transcribeRepairRegion(repairId)
    revalidate()
    return result
  })
}

/**
 * Read every region of a reading that has not been read yet.
 *
 * The queue is the `status` column rather than any infrastructure, so a run cut
 * short by a function timeout leaves the regions it finished finished and the
 * rest exactly as they were — pressing the button again continues. That is also
 * why each region commits on its own instead of at the end.
 */
export async function transcribeAllRepairs(sourceId: string) {
  return attempt(async () => {
    await requireAdmin()

    const pending = await db
      .select({ id: sourceRepairs.id })
      .from(sourceRepairs)
      .where(and(eq(sourceRepairs.sourceId, sourceId), eq(sourceRepairs.status, "proposed")))
      .orderBy(asc(sourceRepairs.pageNumber))

    after(async () => {
      for (const repair of pending) {
        try {
          await transcribeRepairRegion(repair.id)
        } catch (error) {
          logWarn("repair.batch-unreadable", { repairId: repair.id, cause: error })
        }
      }
      revalidate()
    })

    return { queued: pending.length }
  })
}

/**
 * Record an admin's decision.
 *
 * The text is checked against the readings before it is stored — not to second
 * guess the reviewer, who may correct freely, but to catch text that came from
 * somewhere other than this page. That has happened: a summary of the readings
 * was once written into a PDF and improved every automatic measure while being
 * unrelated to the page.
 */
export async function acceptRepair(repairId: string, acceptedText: string, note = "") {
  return attempt(async () => {
    const session = await requireAdmin()
    const result = await acceptRepairDecision(repairId, acceptedText, note, session.user.id)
    revalidate()
    return result
  })
}

export async function rejectRepair(repairId: string, note: string) {
  return attempt(async () => {
    await requireAdmin()
    if (!note.trim()) {
      throw new Error("Say why — a rejection with no reason teaches the next reader nothing.")
    }
    await db
      .update(sourceRepairs)
      .set({ status: "rejected", reviewNote: note })
      .where(eq(sourceRepairs.id, repairId))
    revalidate()
    return {}
  })
}

/**
 * Write the accepted repairs into a new revision of the reading.
 *
 * The gates — highlights carried or refused, staleness, measured improvement —
 * live in src/lib/repairApply.ts with the write itself, shared verbatim with
 * the operational scripts. This wrapper owns what a server boundary owns: the
 * session, the refusal envelope, the revalidate.
 */
export async function applyRepairs(sourceId: string) {
  return attempt(async () => {
    await requireAdmin()
    const result = await applyAcceptedRepairs(sourceId)
    revalidate()
    return result
  })
}
