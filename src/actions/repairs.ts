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
import { ACCEPTED_OVERLAP_FLOOR, acceptedTextMatchesReadings } from "@/lib/repairReview"
import { repairPageTextLayers } from "@/lib/textLayerRepair"
import { reingestSource } from "@/lib/reingest"
import { extractPdfPageText, textLayerProjection } from "@/lib/pdfText"
import { reportGarble } from "@/lib/garble"
import { consensusSettings } from "@/lib/repairConsensus"
import { planReanchor } from "@/lib/reanchor"
import { hashText } from "@/lib/hash"

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

/**
 * How much of a page's text a repair must keep to be worth keeping.
 *
 * Not 1.0: a correct transcription of a damaged page legitimately differs in
 * length, dropping the running header a scan smeared into the body and the
 * hyphenation fragments a line break left behind. Well under half, though, is
 * not a transcription of the page — it is a transcription of part of it.
 */
const MIN_KEPT_TEXT_SHARE = 0.6

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
    console.error("[repair] refused", error)
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
    // it — 20 of this library's 43 passages are that kind, carrying a written
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
          console.warn(`[repair] batch could not read ${repair.id}`, error)
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

    const rows = await db.select().from(sourceRepairs).where(eq(sourceRepairs.id, repairId)).limit(1)
    const repair = rows[0]
    if (!repair) throw new Error("Repair not found")

    const readings = await db
      .select()
      .from(sourceRepairReadings)
      .where(eq(sourceRepairReadings.repairId, repairId))

    const check = acceptedTextMatchesReadings(
      acceptedText,
      readings.map((reading) => ({
        reader: reading.reader,
        text: reading.text,
        uncertain: reading.uncertain,
        illegibleShare: reading.illegibleShare,
      }))
    )
    if (!check.ok) throw new Error(check.reason)

    await db
      .update(sourceRepairs)
      .set({
        status: "accepted",
        acceptedText,
        acceptedByUserId: session.user.id,
        acceptedAt: new Date(),
        reviewNote: note,
      })
      .where(eq(sourceRepairs.id, repairId))
    revalidate()
    return { pageNumber: repair.pageNumber }
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
 * Gated three ways, because this is the only act here a student can see:
 *
 *   - Refuses if anyone has highlighted the reading. Replacing a page's text
 *     moves the substrate their offsets were measured against.
 *   - Refuses if the PDF has changed since the damage was measured. A decision
 *     is only valid for the file it was made about.
 *   - Refuses to keep the result unless the damage actually fell. A repair that
 *     does not measure better is discarded and the reading is left alone.
 */
export async function applyRepairs(sourceId: string) {
  return attempt(async () => {
    await requireAdmin()

    const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
    const source = rows[0]
    if (!source?.storageKey) throw new Error("That reading has no stored file.")

    const accepted = await db
      .select()
      .from(sourceRepairs)
      .where(and(eq(sourceRepairs.sourceId, sourceId), eq(sourceRepairs.status, "accepted")))
      .orderBy(asc(sourceRepairs.pageNumber))

    if (accepted.length === 0) throw new Error("Nothing has been accepted for this reading yet.")

    const stale = accepted.filter((repair) => repair.measuredAgainstKey !== source.storageKey)
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} accepted repair${stale.length === 1 ? " was" : "s were"} measured against an older ` +
          `version of this PDF. Re-detect and review again before applying.`
      )
    }

    const original = await readingStorage.get(source.storageKey)
    const pagesBefore = await extractPdfPageText(original)
    const before = reportGarble(pagesBefore)

    // One transcription per page: a page may carry several damaged regions, and
    // the page's text layer is replaced once, from all of them together.
    const byPage = new Map<number, string[]>()
    for (const repair of accepted) {
      const list = byPage.get(repair.pageNumber) ?? []
      list.push(repair.acceptedText ?? "")
      byPage.set(repair.pageNumber, list)
    }

    const repaired = await repairPageTextLayers(
      original,
      [...byPage.entries()].map(([pageNumber, texts]) => ({
        pageNumber,
        text: texts.join("\n"),
      }))
    )

    const pagesAfter = await extractPdfPageText(repaired.bytes)
    const after_ = reportGarble(pagesAfter)

    /**
     * Did any repaired page LOSE its text?
     *
     * This has to be asked before the damage rate is consulted, because the
     * damage rate cannot answer it. `reportGarble` measures the share of
     * MEASURABLE pages that are damaged, and a page with almost no text left is
     * not measurable — so emptying a damaged page drops it out of both the
     * numerator and the denominator and the rate falls. Measured on *Design as
     * Critique*: replacing page 2's 2,290 characters with the single word
     * accepted for it moved the rate from 0.750 to 0.727, and the guard below
     * kept it. Deleting a page read as repairing it.
     */
    const lengthBefore = new Map(pagesBefore.map((page) => [page.pageNumber, page.textContent.trim().length]))
    const lengthAfter = new Map(pagesAfter.map((page) => [page.pageNumber, page.textContent.trim().length]))
    const emptied = repaired.pagesReplaced
      .map((pageNumber) => ({
        pageNumber,
        was: lengthBefore.get(pageNumber) ?? 0,
        now: lengthAfter.get(pageNumber) ?? 0,
      }))
      .filter((page) => page.now < page.was * MIN_KEPT_TEXT_SHARE)
    if (emptied.length > 0) {
      const worst = emptied.sort((a, b) => a.now / (a.was || 1) - b.now / (b.was || 1))[0]
      throw new Error(
        `Discarded: page ${worst.pageNumber} would keep only ${worst.now} of its ${worst.was} characters. ` +
          `A repair replaces a page's whole text layer, so an accepted transcription has to cover the ` +
          `whole page — this one does not. The reading is unchanged.`
      )
    }

    const improved = (after_.garbledPageRate ?? 1) < (before.garbledPageRate ?? 0)
    if (!improved) {
      throw new Error(
        `Discarded: the repair did not measure better (${before.pagesGarbled} damaged pages before, ` +
          `${after_.pagesGarbled} after). The reading is unchanged.`
      )
    }

    /**
     * Can every existing highlight be carried across?
     *
     * This used to be a flat refusal whenever any passage referenced the reading,
     * which was wrong three times over: passages with no offsets were never
     * measured against a text layer and cannot be disturbed by one; highlights
     * on pages this repair does not touch are not affected; and a quote that
     * occurs exactly once on its page can simply be found again. All of that is
     * decided HERE — against the repaired reading built in memory, before a
     * single passage of it is stored — so a repair that would strand a highlight is
     * refused having changed nothing.
     */
    const anchored = await db
      .select({
        id: passages.id,
        content: passages.content,
        pageNumber: passages.pageNumber,
        startOffset: passages.startOffset,
        endOffset: passages.endOffset,
      })
      .from(passages)
      .where(and(eq(passages.sourceId, sourceId), isNotNull(passages.startOffset)))

    const projectionsAfter = new Map(
      pagesAfter.map((page) => [page.pageNumber, textLayerProjection(page.textContent)])
    )
    const plan = planReanchor(anchored, projectionsAfter, repaired.pagesReplaced)
    if (plan.lost.length > 0) {
      const worst = plan.lost[0]
      throw new Error(
        `Discarded: ${plan.lost.length} highlight${plan.lost.length === 1 ? "" : "s"} could not be carried ` +
          `across this repair, so nothing was changed. On page ${worst.pageNumber}, ${worst.why} — ` +
          `“${worst.quote}…”. A student's quotation is not something to break in passing; if this repair ` +
          `matters more than that highlight, the highlight has to be dealt with first.`
      )
    }

    // A new key, never an overwrite: the original stays retrievable, and one blob
    // store is shared by every environment.
    const revisedKey = `readings/${sourceId}-repaired-${Date.now()}.pdf`
    await readingStorage.put(revisedKey, repaired.bytes)
    await db.update(sources).set({ storageKey: revisedKey }).where(eq(sources.id, sourceId))
    await reingestSource(sourceId, repaired.bytes)

    // After re-ingest, so the hash a highlight carries names the page rows that
    // now exist rather than the ones that did a moment ago.
    for (const move of plan.moves) {
      const projection = projectionsAfter.get(move.pageNumber) ?? ""
      await db
        .update(passages)
        .set({
          startOffset: move.startOffset,
          endOffset: move.endOffset,
          pageContentHash: hashText(projection),
        })
        .where(eq(passages.id, move.id))
    }

    await db
      .update(sourceRepairs)
      .set({ status: "applied", appliedAt: new Date() })
      .where(and(eq(sourceRepairs.sourceId, sourceId), eq(sourceRepairs.status, "accepted")))

    revalidate()
    return {
      pagesReplaced: repaired.pagesReplaced,
      damagedPagesBefore: before.pagesGarbled,
      damagedPagesAfter: after_.pagesGarbled,
      revisedKey,
      highlightsMoved: plan.moves.length,
      highlightsUnchanged: plan.unchanged,
    }
  })
}
