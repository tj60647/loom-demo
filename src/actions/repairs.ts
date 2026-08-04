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
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth/next"
import { db } from "@/db"
import { authOptions, isAdminUser } from "@/lib/auth"
import { bytes, sourceRepairs, sourceRepairReadings, sources, users } from "@/db/schema"
import { readingStorage } from "@/lib/storage"
import { detectRepairsForSource, transcribeRepairRegion } from "@/lib/repairPipeline"
import { acceptedTextMatchesReadings } from "@/lib/repairReview"
import { repairPageTextLayers } from "@/lib/textLayerRepair"
import { reingestSource } from "@/lib/reingest"
import { extractPdfPageText } from "@/lib/pdfText"
import { reportGarble } from "@/lib/garble"

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

/** Find damaged regions. Cheap and repeatable; refreshes undecided proposals. */
export async function detectRepairs(sourceId: string) {
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
}

/** Read one region. Synchronous, so the admin sees the result they asked for. */
export async function transcribeRepair(repairId: string) {
  await requireAdmin()
  const result = await transcribeRepairRegion(repairId)
  revalidate()
  return result
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
}

export async function rejectRepair(repairId: string, note: string) {
  await requireAdmin()
  if (!note.trim()) throw new Error("Say why — a rejection with no reason teaches the next reader nothing.")
  await db
    .update(sourceRepairs)
    .set({ status: "rejected", reviewNote: note })
    .where(eq(sourceRepairs.id, repairId))
  revalidate()
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
  await requireAdmin()

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source?.storageKey) throw new Error("That reading has no stored file.")

  const [{ value: byteCount }] = await db
    .select({ value: count() })
    .from(bytes)
    .where(eq(bytes.sourceId, sourceId))
  if (byteCount > 0) {
    throw new Error(
      `${byteCount} highlight${byteCount === 1 ? " is" : "s are"} anchored to this reading's current text. ` +
        `Repairing it now would move them. Repair before a cohort works in a reading, not after.`
    )
  }

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
  const before = reportGarble(await extractPdfPageText(original))

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

  const after_ = reportGarble(await extractPdfPageText(repaired.bytes))
  const improved = (after_.garbledPageRate ?? 1) < (before.garbledPageRate ?? 0)
  if (!improved) {
    throw new Error(
      `Discarded: the repair did not measure better (${before.pagesGarbled} damaged pages before, ` +
        `${after_.pagesGarbled} after). The reading is unchanged.`
    )
  }

  // A new key, never an overwrite: the original stays retrievable, and one blob
  // store is shared by every environment.
  const revisedKey = `readings/${sourceId}-repaired-${Date.now()}.pdf`
  await readingStorage.put(revisedKey, repaired.bytes)
  await db.update(sources).set({ storageKey: revisedKey }).where(eq(sources.id, sourceId))
  await reingestSource(sourceId, repaired.bytes)

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
  }
}
