import { eq } from "drizzle-orm"
import { db } from "@/db"
import { sourcePages, sourceRepairs, sourceRevisions } from "@/db/schema"
import { getSourceCoverKey } from "@/lib/pdfCover"
import { PAGE_IMAGE_WIDTHS, getSourcePageImageKey, getSourceSheetKey } from "@/lib/pdfPages"

/**
 * Every blob key the store may hold for one reading: the current file, the
 * cover, the contact sheet, every superseded revision (storageKey and
 * predecessorKey per source_revision row), the page images at both widths,
 * and the repair-panel crops.
 *
 * Call this BEFORE deleting the source row: source_revision, source_page and
 * source_repair all cascade away with it, and their rows are the only record
 * of the revision blobs and the crop keys (crops carry a UUID suffix, so a
 * key lost with its row is a blob lost for good). The recomputable keys —
 * cover, sheet, page images — are asked for unconditionally; `delete` no-ops
 * on a missing pathname, so over-asking costs nothing.
 *
 * One module because two callers must agree: deleteSource (the admin act) and
 * scripts/clean-fixtures.ts (the suite's teardown). A second copy of this
 * list is how one of them would quietly fall behind the next blob family —
 * which is exactly what happened to deleteSource itself before 2026-08-20,
 * when it removed the file and the cover and stranded everything else.
 */
export async function gatherSourceBlobKeys(
  sourceId: string,
  currentStorageKey: string | null
): Promise<Set<string>> {
  const revisionRows = await db
    .select({ storageKey: sourceRevisions.storageKey, predecessorKey: sourceRevisions.predecessorKey })
    .from(sourceRevisions)
    .where(eq(sourceRevisions.sourceId, sourceId))
  const pageRows = await db
    .select({ pageNumber: sourcePages.pageNumber })
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, sourceId))
  const cropRows = await db
    .select({ cropKey: sourceRepairs.cropKey })
    .from(sourceRepairs)
    .where(eq(sourceRepairs.sourceId, sourceId))

  const keys = new Set<string>()
  if (currentStorageKey) keys.add(currentStorageKey)
  keys.add(getSourceCoverKey(sourceId))
  keys.add(getSourceSheetKey(sourceId))
  for (const revision of revisionRows) {
    keys.add(revision.storageKey)
    if (revision.predecessorKey) keys.add(revision.predecessorKey)
  }
  for (const { pageNumber } of pageRows) {
    for (const width of PAGE_IMAGE_WIDTHS) keys.add(getSourcePageImageKey(sourceId, pageNumber, width))
  }
  for (const { cropKey } of cropRows) {
    if (cropKey) keys.add(cropKey)
  }
  return keys
}
