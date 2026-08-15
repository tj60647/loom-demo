/**
 * Roll a reading's PDF back to the file it was uploaded as.
 *
 * Every repair wrote a NEW blob and left the old one in place — "a new key,
 * never an overwrite" — so the original of every repaired reading is still
 * retrievable, and this walks `source_revision` back to it. That matters
 * because a repair rasterised each page it touched at 200dpi against scans
 * that are 350-400dpi: the text got better and the page got worse, and no
 * gate could see it. Until the apply is lossless, the honest state of the
 * library is the state it was uploaded in.
 *
 * What this does NOT throw away: the transcriptions. Every applied repair
 * goes back to `accepted`, so the panel's work — which cost real money and is
 * still correct — can be re-applied by a lossless writer without re-reading a
 * single page.
 *
 * Append-only, like the table it writes to: reverting adds a revision row
 * saying so. Nothing is deleted, and today's file stays in the store.
 *
 *   npx tsx scripts/revert-repairs.ts --dry-run
 *   npx tsx scripts/revert-repairs.ts --apply [sourceId…]
 */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm"
import { db } from "../src/db"
import { passages, sourceRepairs, sourceRevisions, sources } from "../src/db/schema"
import { readingStorage } from "../src/lib/storage"
import { extractPdfPageText, textLayerProjection } from "../src/lib/pdfText"
import { reingestSource } from "../src/lib/reingest"
import { planReanchor, recoverStrandedPassages } from "../src/lib/reanchor"
import { hashText } from "../src/lib/hash"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const ids = args.filter((a) => !a.startsWith("--"))

async function main() {
  if (!apply && !args.includes("--dry-run")) {
    console.error("pass --dry-run or --apply")
    process.exit(1)
  }
  const revisions = await db.select().from(sourceRevisions).orderBy(asc(sourceRevisions.createdAt))
  const targets = [...new Set(revisions.map((r) => r.sourceId))].filter((id) => ids.length === 0 || ids.includes(id))

  for (const sourceId of targets) {
    const source = (await db.select().from(sources).where(eq(sources.id, sourceId)))[0]
    const chain = revisions.filter((r) => r.sourceId === sourceId)
    const original = chain[0]?.predecessorKey
    console.log(`\n=== ${source.title.slice(0, 56)}`)
    if (!original) {
      console.log("   no predecessor recorded — cannot revert; leaving alone")
      continue
    }
    if (source.storageKey === original) {
      console.log("   already on its original file")
      continue
    }
    const exists = await readingStorage.get(original).then((b) => b.length).catch(() => 0)
    if (!exists) {
      console.log(`   ORIGINAL MISSING from the store (${original}) — leaving alone`)
      continue
    }
    const repaired = await readingStorage.get(source.storageKey!).then((b) => b.length).catch(() => 0)
    console.log(`   ${(repaired / 1048576).toFixed(1)}MB repaired  ->  ${(exists / 1048576).toFixed(1)}MB original`)
    console.log(`   revisions rolled back: ${chain.length}`)

    // Which highlights survive the roll-back, measured before anything moves.
    const anchored = await db
      .select({ id: passages.id, content: passages.content, pageNumber: passages.pageNumber, startOffset: passages.startOffset, endOffset: passages.endOffset })
      .from(passages)
      .where(and(eq(passages.sourceId, sourceId), isNotNull(passages.startOffset)))
    const pagesOriginal = await extractPdfPageText(await readingStorage.get(original))
    const projections = new Map(pagesOriginal.map((p) => [p.pageNumber, textLayerProjection(p.textContent)]))
    const touched = [...new Set((await db.select({ p: sourceRepairs.pageNumber }).from(sourceRepairs).where(and(eq(sourceRepairs.sourceId, sourceId), inArray(sourceRepairs.status, ["applied"])))).map((r) => r.p))]
    const plan = planReanchor(anchored, projections, touched)
    console.log(`   highlights: ${anchored.length} anchored — ${plan.unchanged} unmoved, ${plan.moves.length} re-anchored, ${plan.lost.length} need recovery`)

    if (!apply) continue

    const stranded = recoverStrandedPassages(
      anchored,
      new Set(plan.lost.map((e) => e.id)),
      new Map(pagesOriginal.map((p) => [p.pageNumber, p.textContent]))
    )
    await db.update(sources).set({ storageKey: original }).where(eq(sources.id, sourceId))
    await db.insert(sourceRevisions).values({
      sourceId,
      storageKey: original,
      predecessorKey: source.storageKey,
      reason: `reverted ${chain.length} repaired revision${chain.length === 1 ? "" : "s"} to the uploaded original — the apply rasterised pages at 200dpi against a ${"350-400"}dpi scan; transcriptions kept as accepted`,
    })
    await reingestSource(sourceId, await readingStorage.get(original))
    for (const move of plan.moves) {
      await db.update(passages).set({ startOffset: move.startOffset, endOffset: move.endOffset, pageContentHash: hashText(projections.get(move.pageNumber) ?? "") }).where(eq(passages.id, move.id))
    }
    for (const rec of stranded.recovered) {
      await db.update(passages).set({ content: rec.content, startOffset: rec.startOffset, endOffset: rec.endOffset, pageContentHash: hashText(projections.get(rec.pageNumber) ?? "") }).where(eq(passages.id, rec.id))
    }
    // The transcriptions survive as decisions, ready for a lossless writer.
    const back = await db.update(sourceRepairs).set({ status: "accepted", appliedAt: null }).where(and(eq(sourceRepairs.sourceId, sourceId), eq(sourceRepairs.status, "applied"))).returning({ id: sourceRepairs.id })
    console.log(`   reverted · ${back.length} transcriptions kept as accepted · ${stranded.recovered.length} passages recovered, ${stranded.unrecoverable.length} unrecoverable`)
    if (stranded.unrecoverable.length) console.log(`     NOT removed, left for a person: ${stranded.unrecoverable.map((u) => `p${u.pageNumber}`).join(", ")}`)
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
