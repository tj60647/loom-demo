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
import { measurePageGarble, reportGarble } from "@/lib/garble"
import { planReanchor, recoverStrandedPassages } from "@/lib/reanchor"
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
 * A refusal that names the page that caused it. An apply covers every accepted
 * page at once, so one page failing a per-page gate vetoes the rest — and a
 * batch caller that knows WHICH page can set that one repair aside (rejected,
 * with this reason as its record) and apply the pages that measured well,
 * instead of holding a whole document on its worst page forever.
 */
export class ApplyRefusedPage extends Error {
  constructor(message: string, public readonly pageNumber: number) {
    super(message)
    this.name = "ApplyRefusedPage"
  }
}

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
    throw new ApplyRefusedPage(
      `Discarded: page ${worst.pageNumber} would keep only ${worst.now} of its ${worst.was} characters. ` +
        `A repair replaces a page's whole text layer, so an accepted transcription has to cover the ` +
        `whole page — this one does not. The reading is unchanged.`,
      worst.pageNumber
    )
  }

  /**
   * Better, measured where the repair actually happened.
   *
   * The gate used to compare the whole document's damaged-PAGE count, which is
   * blind twice over. A bibliography transcribed perfectly still classifies as
   * a garbled page — author names are not dictionary words — so a real repair
   * of one measured as no improvement and was refused. And a textless page
   * gaining text moves no rate at all, because an unmeasurable page was never
   * in the denominator. Untouched pages carry identical bytes through the
   * rewrite, so the only pages that can change are the replaced ones — and the
   * honest question is whether THEIR damage fell, word by word:
   *
   *   - the garbled-word rate across the replaced pages fell, or
   *   - a page that had no text worth measuring now carries a real layer,
   *
   * and never the trade where restoring one page garbles another — a rise on
   * any replaced page's own rate still refuses.
   */
  const replacedRate = (pages: { pageNumber: number; textContent: string }[]) => {
    let garbled = 0
    let body = 0
    for (const pageNumber of repaired.pagesReplaced) {
      const text = pages.find((page) => page.pageNumber === pageNumber)?.textContent ?? ""
      const measure = measurePageGarble(pageNumber, text)
      if (measure) {
        garbled += measure.rate * measure.bodyWords
        body += measure.bodyWords
      }
    }
    return body > 0 ? garbled / body : null
  }
  const beforeRate = replacedRate(pagesBefore)
  const afterRate = replacedRate(pagesAfter)
  // Per page, not only in aggregate: one page repaired well must not carry
  // another repaired badly through the gate.
  for (const pageNumber of repaired.pagesReplaced) {
    const wasText = pagesBefore.find((page) => page.pageNumber === pageNumber)?.textContent ?? ""
    const nowText = pagesAfter.find((page) => page.pageNumber === pageNumber)?.textContent ?? ""
    const was = measurePageGarble(pageNumber, wasText)
    const now = measurePageGarble(pageNumber, nowText)
    if (was && now && now.rate > was.rate + 0.05) {
      throw new ApplyRefusedPage(
        `Discarded: page ${pageNumber} would read WORSE after this repair ` +
          `(garbled-word rate ${(was.rate * 100).toFixed(1)}% → ${(now.rate * 100).toFixed(1)}%). The reading is unchanged.`,
        pageNumber
      )
    }
  }
  const rateFell = afterRate != null && (beforeRate == null || afterRate < beforeRate)
  const textRestored = repaired.pagesReplaced.some(
    (pageNumber) => (lengthBefore.get(pageNumber) ?? 0) < 200 && (lengthAfter.get(pageNumber) ?? 0) >= 200
  )
  if (!rateFell && !textRestored) {
    const show = (rate: number | null) => (rate == null ? "unmeasurable" : `${(rate * 100).toFixed(1)}%`)
    throw new Error(
      `Discarded: the repair did not measure better on the pages it replaced ` +
        `(garbled-word rate ${show(beforeRate)} before, ${show(afterRate)} after; document damage ` +
        `${before.pagesGarbled}→${after_.pagesGarbled} pages). The reading is unchanged.`
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
  /**
   * A quote the corrected page no longer contains used to refuse the whole
   * apply. Ruled by TJ, 2026-08-14: a capture of garbled OCR must not block
   * the correction — the testers will understand. Best effort, the highlight
   * is RECREATED on the corrected wording (fuzzy word-match; the student's
   * note, question and concepts ride along, only the quoted substrate
   * updates); where no honest equivalent exists, the passage is removed and
   * its concepts survive — the schema has always guaranteed that a concept
   * outlives any passage. Both outcomes are returned so the operator can tell
   * the people affected.
   */
  // The STORED-form text, line boundaries kept — recovery matches against
  // this and converts its offsets to projection space itself.
  const stranded = recoverStrandedPassages(
    anchored,
    new Set(plan.lost.map((entry) => entry.id)),
    new Map(pagesAfter.map((page) => [page.pageNumber, page.textContent]))
  )

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
  for (const recovered of stranded.recovered) {
    const projection = projectionsAfter.get(recovered.pageNumber) ?? ""
    await db
      .update(passages)
      .set({
        content: recovered.content,
        startOffset: recovered.startOffset,
        endOffset: recovered.endOffset,
        pageContentHash: hashText(projection),
      })
      .where(eq(passages.id, recovered.id))
  }
  for (const removed of stranded.unrecoverable) {
    // Cascade takes the passage↔concept pointers; the concepts themselves stay.
    await db.delete(passages).where(eq(passages.id, removed.id))
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
    /** Recreated on the corrected wording — old and new text, for telling the owner. */
    passagesRecovered: stranded.recovered.map(({ id, pageNumber, was, content }) => ({ id, pageNumber, was, now: content.slice(0, 80) })),
    /** Removed outright; their concepts survive. */
    passagesRemoved: stranded.unrecoverable.map(({ id, pageNumber, quote }) => ({ id, pageNumber, quote })),
  }
}
