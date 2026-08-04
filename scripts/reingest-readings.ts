/**
 * Re-derive stored page text, covers and scores from the PDFs as they stand.
 *
 * Two uses:
 *
 *   - After repairing a reading's PDF, to make the repair take effect. Fixing
 *     the file alone changes nothing the app reads; the stored page rows are
 *     what search, highlight reconciliation and the score all use.
 *   - As a backfill, to give readings added before the structural probe existed
 *     their geometry and glyph-mapping metrics, so the triage report in
 *     scripts/diagnose-readings.ts can see the whole library rather than only
 *     what it re-measures on the spot.
 *
 * THIS REPLACES PAGE TEXT, which is what every stored highlight offset is
 * measured against. It is safe on a reading with no highlights and destructive
 * on one that has them — see the note at the top of src/lib/reingest.ts. The
 * --force flag exists because that distinction should be a deliberate act.
 *
 * One blob store is shared by every environment, and the page text lives in a
 * per-environment database, so this reads production bytes wherever it is run.
 * It writes only to the database it is pointed at, plus the shared cover key.
 *
 * Usage:
 *   npx tsx scripts/reingest-readings.ts --dry-run          # what would change
 *   npx tsx scripts/reingest-readings.ts <sourceId> ...     # named readings
 *   npx tsx scripts/reingest-readings.ts --all              # every shared reading
 *   npx tsx scripts/reingest-readings.ts --all --force      # including ones with highlights
 *
 * Requires DATABASE_URL and blob credentials (.env.local).
 */
import { count, eq, inArray, isNotNull, and } from "drizzle-orm"
import { db, databaseLabel } from "../src/db"
import { bytes, sources } from "../src/db/schema"
import { readingStorage } from "../src/lib/storage"
import { reingestSource } from "../src/lib/reingest"
import { diagnoseExtraction } from "../src/lib/extractionDiagnosis"
import { computeExtractionMetrics } from "../src/lib/readingScore"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const force = args.includes("--force")
const all = args.includes("--all")
const ids = args.filter((arg) => !arg.startsWith("--"))

async function main() {
  if (!all && ids.length === 0) {
    console.error(
      "[reingest] name at least one sourceId, or pass --all. Add --dry-run to see what would change."
    )
    process.exit(1)
  }

  const rows = await db
    .select({ id: sources.id, title: sources.title, storageKey: sources.storageKey })
    .from(sources)
    .where(
      all
        ? and(isNotNull(sources.storageKey), eq(sources.isOwn, false))
        : inArray(sources.id, ids)
    )

  if (rows.length === 0) {
    console.log("[reingest] nothing matched")
    return
  }

  // This one writes. Naming the target is not decoration.
  console.log(`[reingest] database: ${databaseLabel()}`)
  console.log(
    `[reingest] ${rows.length} reading${rows.length === 1 ? "" : "s"}${dryRun ? " (dry run)" : ""}`
  )

  let done = 0
  let skipped = 0

  for (const row of rows) {
    if (!row.storageKey) {
      console.log(`  skip   ${row.title} — no stored file`)
      skipped += 1
      continue
    }

    // The whole safety question in one query: replacing page text moves every
    // offset measured against it, so a reading anyone has highlighted needs a
    // deliberate decision rather than a batch run.
    const [{ value: byteCount }] = await db
      .select({ value: count() })
      .from(bytes)
      .where(eq(bytes.sourceId, row.id))

    if (byteCount > 0 && !force) {
      console.log(
        `  HOLD   ${row.title} — ${byteCount} highlight${byteCount === 1 ? "" : "s"} anchored to the current text; re-run with --force to replace it anyway`
      )
      skipped += 1
      continue
    }

    try {
      const buffer = await readingStorage.get(row.storageKey)

      if (dryRun) {
        // Measure without writing, so the report is real rather than predicted.
        const { extractPdfPageText } = await import("../src/lib/pdfText")
        const { probePdfStructure } = await import("../src/lib/pdfStructure")
        const pages = await extractPdfPageText(buffer)
        const structure = await probePdfStructure(buffer)
        const metrics = computeExtractionMetrics(pages, { coverRendered: true, structure })
        const diagnosis = diagnoseExtraction(metrics, structure.fonts)
        console.log(
          `  would  ${row.title} — ${pages.length} pages, ${byteCount} highlights, remedy: ${diagnosis.remedy}`
        )
        continue
      }

      const result = await reingestSource(row.id, buffer)
      const warn = byteCount > 0 ? ` — REPLACED text under ${byteCount} highlights` : ""
      console.log(
        `  ok     ${row.title} — ${result.replacedPages} → ${result.pageCount} pages, cover ${
          result.coverRendered ? "rendered" : "FAILED"
        }${warn}`
      )
      done += 1
    } catch (error) {
      console.error(`  FAIL   ${row.title} — ${error instanceof Error ? error.message : error}`)
      skipped += 1
    }
  }

  console.log(`[reingest] ${done} re-ingested, ${skipped} skipped`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("[reingest] failed:", error instanceof Error ? error.message : error)
    process.exit(1)
  }
)
