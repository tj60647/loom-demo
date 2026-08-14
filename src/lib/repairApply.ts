/**
 * The decision and the write — accept and apply, as library code.
 *
 * Extracted from src/actions/repairs.ts so that the admin actions and the
 * operational scripts (scripts/reprocess-library.ts) run the SAME guards on
 * the SAME path. The actions add what a server boundary owns — the session,
 * the revalidate, the refusal envelope — and nothing else; a script adds the
 * acting user explicitly. Neither gets its own copy of the rules.
 *
 * Nothing here authenticates. Callers decide who may act and hand the actor in,
 * the same contract ingestReading holds.
 */
import { and, asc, eq, isNotNull } from "drizzle-orm"
import { db } from "@/db"
import { passages, sourceRepairs, sourceRepairReadings, sourceRevisions, sources } from "@/db/schema"
import { readingStorage } from "@/lib/storage"
import { acceptedTextMatchesReadings } from "@/lib/repairReview"
import { repairPageTextLayers } from "@/lib/textLayerRepair"
import { reingestSource } from "@/lib/reingest"
import { extractPdfPageText, textLayerProjection } from "@/lib/pdfText"
import { reportGarble } from "@/lib/garble"
import { planReanchor } from "@/lib/reanchor"
import { hashText } from "@/lib/hash"

/**
 * How much of a page's text a repair must keep to be worth keeping.
 *
 * Not 1.0: a correct transcription of a damaged page legitimately differs in
 * length, dropping the running header a scan smeared into the body and the
 * hyphenation fragments a line break left behind. Well under half, though, is
 * not a transcription of the page — it is a transcription of part of it.
 */
export const MIN_KEPT_TEXT_SHARE = 0.6

/**
 * Record a decision on one repair, in the acting user's name.
 *
 * The text is checked against the readings before it is stored — not to second
 * guess the reviewer, who may correct freely, but to catch text that came from
 * somewhere other than this page. That has happened: a summary of the readings
 * was once written into a PDF and improved every automatic measure while being
 * unrelated to the page.
 */
export async function acceptRepairDecision(
  repairId: string,
  acceptedText: string,
  note: string,
  byUserId: string
) {
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
      acceptedByUserId: byUserId,
      acceptedAt: new Date(),
      reviewNote: note,
    })
    .where(eq(sourceRepairs.id, repairId))
  return { pageNumber: repair.pageNumber }
}

/**
 * Write the accepted repairs into a new revision of the reading.
 *
 * Gated three ways, because this is the only act here a student can see:
 *
 *   - Refuses if any highlight cannot be carried across. Replacing a page's
 *     text moves the substrate its offsets were measured against.
 *   - Refuses if the PDF has changed since the damage was measured. A decision
 *     is only valid for the file it was made about.
 *   - Refuses to keep the result unless it actually measures better — the
 *     garble rate falling, or text restored to a page that had none while the
 *     rate held. A repair that does neither is discarded unwritten.
 */
export async function applyAcceptedRepairs(sourceId: string) {
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

  /**
   * Better means two different things, and the rate only sees one of them.
   *
   * A garble repair improves by making the rate FALL. A transcription of a
   * page that had no text at all — a scanned page the OCR never reached —
   * cannot move the rate down, because a textless page was never measurable
   * to begin with; its whole improvement is text existing where none did.
   * The old strictly-less gate refused exactly those repairs on any reading
   * whose measurable pages were already clean, which is most scans.
   *
   * So: the rate falling is still improvement, and text restored to a
   * near-empty page counts too — but only while the rate did not RISE,
   * because restoring one page by garbling another is not a trade this
   * gate is allowed to make.
   */
  const rateFell = (after_.garbledPageRate ?? 1) < (before.garbledPageRate ?? 0)
  const rateHeld = (after_.garbledPageRate ?? 1) <= (before.garbledPageRate ?? 0)
  const textRestored = repaired.pagesReplaced.some(
    (pageNumber) => (lengthBefore.get(pageNumber) ?? 0) < 200 && (lengthAfter.get(pageNumber) ?? 0) >= 200
  )
  if (!rateFell && !(rateHeld && textRestored)) {
    throw new Error(
      `Discarded: the repair did not measure better (${before.pagesGarbled} damaged pages before, ` +
        `${after_.pagesGarbled} after, and no textless page gained a text layer). The reading is unchanged.`
    )
  }

  /**
   * Can every existing highlight be carried across?
   *
   * Decided HERE — against the repaired reading built in memory, before a
   * single byte of it is stored — so a repair that would strand a highlight is
   * refused having changed nothing. Passages with no offsets were never
   * measured against a text layer and cannot be disturbed; highlights on
   * untouched pages are unaffected; a quote that occurs exactly once on its
   * page is simply found again.
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
  // The lineage row, in the same act as the rotation: without it the old key
  // is an orphan the store holds and nothing addresses (see source_revision).
  await db.insert(sourceRevisions).values({
    sourceId,
    storageKey: revisedKey,
    predecessorKey: source.storageKey,
    reason: `applied ${accepted.length} repair${accepted.length === 1 ? "" : "s"} on page${
      repaired.pagesReplaced.length === 1 ? "" : "s"
    } ${repaired.pagesReplaced.join(", ")}`,
  })
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

  return {
    pagesReplaced: repaired.pagesReplaced,
    damagedPagesBefore: before.pagesGarbled,
    damagedPagesAfter: after_.pagesGarbled,
    revisedKey,
    highlightsMoved: plan.moves.length,
    highlightsUnchanged: plan.unchanged,
  }
}
