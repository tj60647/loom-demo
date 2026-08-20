/**
 * Re-derive everything a reading's PDF implies, from the PDF it has now.
 *
 * Until this existed, `extractPdfPageText` had exactly one call site — the
 * upload — so a reading's page text was frozen at the moment it was added. That
 * is fine while the file never changes, and useless the moment it does: repair a
 * broken font map or re-OCR a scan and the improved text lives only inside the
 * PDF, while search, highlight reconciliation and the extraction score all keep
 * reading the stale rows. "Rescore" did not close the gap either — it replays
 * the rubric over the stored text without re-reading the file.
 *
 * So this is the other half of any remediation: replace the stored pages, the
 * cover and the score together, from the bytes as they stand.
 *
 * WHAT THIS DESTROYS. Page text is the substrate every stored highlight offset
 * is measured against, and this replaces it wholesale. A passage captured before
 * the change keeps its old offsets and its old `pageContentHash`, which will no
 * longer match — the viewer falls back to fuzzy matching, and for the very
 * readings most worth repairing (the ones whose text was mojibake) the fuzzy
 * match has nothing to match against, because the passage's own stored text is the
 * mojibake. Carrying highlights across a repair is a separate problem with a
 * separate answer (src/lib/offsetRemap.ts). This function does not attempt it,
 * and callers should be reaching for it while a reading has no highlights on it
 * — before a cohort arrives, not during one.
 */
import { db } from "@/db"
import { sourcePages, sources } from "@/db/schema"
import { eq } from "drizzle-orm"
import { extractPdfPageText, textLayerProjection } from "@/lib/pdfText"
import { probePdfStructure, type PdfStructure } from "@/lib/pdfStructure"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"
import { renderSourcePageImages } from "@/lib/pdfPages"
import { readingStorage } from "@/lib/storage"
import { recordHeuristicScore } from "@/lib/readingScore"
import { hashText } from "@/lib/hash"

export type ReingestResult = {
  sourceId: string
  pageCount: number
  /** Page rows removed before the new ones went in. */
  replacedPages: number
  coverRendered: boolean
  structure: PdfStructure
}

/**
 * Replace a source's derived data from the given PDF bytes.
 *
 * Deliberately takes the buffer rather than fetching it, so a caller that has
 * just repaired a file can re-ingest the repaired bytes without a round trip
 * through storage, and a caller checking an existing reading can pass what it
 * already pulled.
 */
export async function reingestSource(
  sourceId: string,
  buffer: Buffer
): Promise<ReingestResult> {
  const pages = await extractPdfPageText(buffer)
  const structure = await probePdfStructure(buffer)

  // Delete-then-insert rather than update: page COUNT can change (a spread
  // split doubles it, a re-OCR can recover pages that extracted to nothing), so
  // there is no row-for-row correspondence to update against. Done in this
  // order so a crash between the two leaves a source with no pages — visibly
  // broken and fixed by re-running — rather than a silent mix of old and new
  // text that would read as correct while anchoring highlights to nothing.
  const removed = await db
    .delete(sourcePages)
    .where(eq(sourcePages.sourceId, sourceId))
    .returning({ id: sourcePages.id })

  if (pages.length > 0) {
    await db.insert(sourcePages).values(
      pages.map((page) => ({
        sourceId,
        pageNumber: page.pageNumber,
        textContent: page.textContent,
        contentHash: hashText(textLayerProjection(page.textContent)),
        width: page.width,
        height: page.height,
      }))
    )
  }

  // The bytes are (or may be) new — a repair mints a new revision — so the
  // serving-time size the reading route reports must follow them.
  await db
    .update(sources)
    .set({ byteLength: buffer.byteLength })
    .where(eq(sources.id, sourceId))

  // The cover is re-rendered too. The renderer has changed since some readings
  // were added — it targets a fixed width and skips blank opening pages — so a
  // reading repaired today should not keep a thumbnail rendered by the old one.
  let coverRendered = false
  try {
    await readingStorage.put(getSourceCoverKey(sourceId), await renderPdfCoverImage(buffer))
    coverRendered = true
  } catch (error) {
    // A reading whose opening pages are genuinely blank has no cover to render.
    // That is recorded by the score, not a reason to fail the re-ingest.
    console.warn("[Loom] Cover render failed during re-ingest", error)
  }

  // And the page images — the viewer's contact sheet reads THESE, not the
  // PDF, so leaving the old ones standing would show pre-repair pages over
  // post-repair text. Failure warns, like the cover: the viewer falls back
  // to rendering from the PDF for any page whose image is missing.
  try {
    await renderSourcePageImages(sourceId, buffer)
  } catch (error) {
    console.warn("[Loom] Page image render failed during re-ingest", error)
  }

  await recordHeuristicScore(sourceId, pages, { coverRendered, structure })

  return {
    sourceId,
    pageCount: pages.length,
    replacedPages: removed.length,
    coverRendered,
    structure,
  }
}
