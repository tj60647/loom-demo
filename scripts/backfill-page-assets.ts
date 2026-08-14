/**
 * Backfill the per-page assets that ingest now produces as a matter of course:
 *
 *   - source_page.width/height — page sizes in PDF points, so the viewer can
 *     lay a reading out before anything renders (kills the aspect storm);
 *   - source.byteLength — so the reading route can send Content-Length;
 *   - the pre-rendered page images (pages/{id}/{n}.w{320,1280}.webp) the
 *     matrix contact sheet reads instead of decoding the scan in the browser.
 *
 * NON-DESTRUCTIVE, unlike reingest: page TEXT is never touched, so stored
 * highlight offsets are never at risk. Dimensions are written onto the
 * existing rows by page number; images are written to blob keys nothing else
 * owns. Safe to re-run; skips what is already filled unless --force.
 *
 * One blob store is shared by every environment, and page rows live in a
 * per-environment database — same caveat as reingest-readings.ts.
 *
 * Usage:
 *   npx tsx scripts/backfill-page-assets.ts --dry-run          # what would change
 *   npx tsx scripts/backfill-page-assets.ts <sourceId> ...     # named readings
 *   npx tsx scripts/backfill-page-assets.ts --all              # every shared reading
 *   npx tsx scripts/backfill-page-assets.ts --all --force      # re-render even where present
 *   npx tsx scripts/backfill-page-assets.ts --all --dims-only  # skip image rendering
 *
 * Requires DATABASE_URL and blob credentials (.env.local).
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm"
import { db, databaseLabel } from "../src/db"
import { sourcePages, sources } from "../src/db/schema"
import { readingStorage } from "../src/lib/storage"
import { destroyPdf, loadPdfjs } from "../src/lib/pdfjs"
import { getSourcePageImageKey, renderSourcePageImages, PAGE_IMAGE_WIDTHS } from "../src/lib/pdfPages"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const force = args.includes("--force")
const all = args.includes("--all")
const dimsOnly = args.includes("--dims-only")
const imagesOnly = args.includes("--images-only")
const ids = args.filter((arg) => !arg.startsWith("--"))

/** Page sizes only — never the text. extractPdfPageText would re-derive text
 *  we must not touch; this reads just the viewports. */
async function readPageSizes(buffer: Buffer) {
  const pdfjsLib = await loadPdfjs()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const doc = await loadingTask.promise
  const sizes = new Map<number, { width: number; height: number }>()
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      sizes.set(pageNumber, { width: viewport.width, height: viewport.height })
    }
  } finally {
    await destroyPdf(doc, loadingTask)
  }
  return sizes
}

async function hasPageImages(sourceId: string) {
  try {
    await readingStorage.get(getSourcePageImageKey(sourceId, 1, PAGE_IMAGE_WIDTHS[0]))
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!all && ids.length === 0) {
    console.error(
      "[backfill] name at least one sourceId, or pass --all. Add --dry-run to see what would change."
    )
    process.exit(1)
  }

  console.log(`[backfill] database: ${databaseLabel()}`)

  const rows = await db
    .select({
      id: sources.id,
      title: sources.title,
      storageKey: sources.storageKey,
      byteLength: sources.byteLength,
    })
    .from(sources)
    .where(
      all
        ? and(isNotNull(sources.storageKey), eq(sources.isOwn, false))
        : inArray(sources.id, ids)
    )

  for (const source of rows) {
    if (!source.storageKey) {
      console.log(`[backfill] ${source.title}: reference-only, skipped`)
      continue
    }

    const pageRows = await db
      .select({ pageNumber: sourcePages.pageNumber, width: sourcePages.width })
      .from(sourcePages)
      .where(eq(sourcePages.sourceId, source.id))
    const missingDims = pageRows.filter((row) => row.width == null).length
    const needsDims = !imagesOnly && (force ? pageRows.length > 0 : missingDims > 0)
    const needsSize = source.byteLength == null || force
    const needsImages = !dimsOnly && (force || !(await hasPageImages(source.id)))

    if (!needsDims && !needsSize && !needsImages) {
      console.log(`[backfill] ${source.title}: complete, skipped`)
      continue
    }
    if (dryRun) {
      console.log(
        `[backfill] ${source.title}: would fill ` +
          [
            needsDims ? `${force ? pageRows.length : missingDims} page dims` : null,
            needsSize ? "byteLength" : null,
            needsImages ? "page images" : null,
          ]
            .filter(Boolean)
            .join(", ")
      )
      continue
    }

    const buffer = await readingStorage.get(source.storageKey)

    if (needsSize) {
      await db
        .update(sources)
        .set({ byteLength: buffer.byteLength })
        .where(eq(sources.id, source.id))
    }

    if (needsDims) {
      const sizes = await readPageSizes(buffer)
      let updated = 0
      for (const row of pageRows) {
        if (!force && row.width != null) continue
        const size = sizes.get(row.pageNumber)
        if (!size) continue // stored rows and file disagree on page count; warn below
        await db
          .update(sourcePages)
          .set({ width: size.width, height: size.height })
          .where(
            and(eq(sourcePages.sourceId, source.id), eq(sourcePages.pageNumber, row.pageNumber))
          )
        updated += 1
      }
      if (sizes.size !== pageRows.length) {
        console.warn(
          `[backfill] ${source.title}: file has ${sizes.size} pages but ${pageRows.length} rows are stored — dims written where page numbers matched. The text likely predates a repair; reingest decides that, not this script.`
        )
      }
      console.log(`[backfill] ${source.title}: ${updated} page dims written`)
    }

    if (needsImages) {
      const result = await renderSourcePageImages(source.id, buffer)
      console.log(
        `[backfill] ${source.title}: ${result.rendered}/${result.pageCount} page images rendered` +
          (result.failed.length ? ` (failed: ${result.failed.join(", ")})` : "")
      )
    }
  }

  console.log("[backfill] done")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("[backfill] failed:", error)
    process.exit(1)
  }
)
