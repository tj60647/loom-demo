/**
 * Pre-rendered page images — the resolution pyramid the viewer reads from.
 *
 * The matrix view is a contact sheet of every page in a reading, and until
 * these existed each "thumbnail" was manufactured in the browser by decoding
 * the scan's full-resolution page images (a 132-page scan carries ~12
 * megapixels of JPX/JBIG2 per page — ~1.6 gigapixels of WASM decode to paint
 * one screen of thumbnails). Scanned-book readers (Internet Archive, Google
 * Books, HathiTrust) all resolve this the same way: the server renders each
 * page once, at fixed widths, and the client shows images. This module is
 * that render.
 *
 * Two widths, chosen against the viewer's actual tiers:
 *   - 320  — the impostor: matrix cells below reading zoom (~15-25KB/page).
 *     Same width covers render at, for the same reason (140px frame at 2x).
 *   - 1280 — the reading tier: legible at matrix reading-zoom and an instant
 *     under-layer for page mode; pdf.js still renders NATIVE resolution on
 *     top for deep zoom, so 1280 never has to be the ceiling.
 *
 * One pdf.js render per page, at the large width; the small image is a
 * downscale of the large canvas — the decode is the expensive part, and this
 * halves it.
 *
 * Keys are per-source, overwritten in place on re-ingest (the covers model):
 * a repair that changes the bytes re-renders the images in the same pass
 * that replaces the canonical text. deleteSource sweeps the images, the
 * sheet and the revision blobs on the way out (since 2026-08-20; before
 * that, deleting a source orphaned all of them).
 */
import { createCanvas, loadImage } from "@napi-rs/canvas"
import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { sourcePages, sources } from "@/db/schema"
import { destroyPdf, loadPdfjs, pdfjsWasmUrl } from "@/lib/pdfjs"
import { spreadLayout, pageX } from "@/lib/spreadLayout"
import { readingStorage } from "@/lib/storage"
import { logWarn } from "@/lib/log"

export const PAGE_IMAGE_WIDTHS = [320, 1280] as const
export type PageImageWidth = (typeof PAGE_IMAGE_WIDTHS)[number]
/** Width of the whole-document sheet (below). */
export const SHEET_WIDTH = 2560

export function getSourcePageImageKey(sourceId: string, pageNumber: number, width: number) {
  return `pages/${sourceId}/${pageNumber}.w${width}.webp`
}

export function getSourceSheetKey(sourceId: string) {
  return `pages/${sourceId}/sheet.w${SHEET_WIDTH}.webp`
}

/**
 * The level of the pyramid ABOVE the page: the whole matrix contact sheet as
 * ONE image — a map's low-zoom tile, where a single fetch covers the whole
 * territory. Opening the matrix at fit used to be 132 image requests (each
 * an authenticated function invocation); the sheet makes it one, already
 * cached, with the per-page thumbs painting over their own cells as they
 * arrive — invisibly, because the sheet is composed FROM those same thumbs.
 *
 * Composed with the client's own spreadLayout at the thumb's native 320px
 * page width, so server and client geometry agree to within the rounding of
 * the gap terms (~0.1% — invisible at fit-all, and erased where it could
 * ever be seen by the identical thumbs replacing their cells). Same red-line
 * standing as the covers: a derived render cache of a deterministic
 * projection, not geometry anyone authored.
 *
 * Page dims come from source_page (the grid-cell aspect is the tallest
 * page, the client's own rule). Thumbs may be passed in-memory (the render
 * pass just produced them) or fetched from blob (the ensure/backfill path).
 */
async function composeAndStoreSheet(
  sourceId: string,
  thumbs: Map<number, Buffer>
): Promise<boolean> {
  const rows = await db
    .select({ pageNumber: sourcePages.pageNumber, width: sourcePages.width, height: sourcePages.height })
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, sourceId))
    .orderBy(asc(sourcePages.pageNumber))
  const numPages = Math.max(rows.length, thumbs.size)
  if (numPages === 0 || thumbs.size === 0) return false

  let gridAspect = 0
  for (const row of rows) {
    if (row.width && row.height) gridAspect = Math.max(gridAspect, row.height / row.width)
  }
  if (gridAspect === 0) gridAspect = 11 / 8.5

  const pageW = PAGE_IMAGE_WIDTHS[0]
  const layout = spreadLayout(numPages, pageW, pageW * gridAspect, true)
  const scale = Math.min(SHEET_WIDTH / layout.canvasW, 1)
  const sheet = createCanvas(Math.round(layout.canvasW * scale), Math.round(layout.canvasH * scale))
  const context = sheet.getContext("2d")
  // Transparent ground: the client lays the sheet over the stage's own
  // colour, so the gutters between pages stay the stage's, not ours.

  for (const spread of layout.spreads) {
    for (const p of spread.rightPage ? [spread.leftPage, spread.rightPage] : [spread.leftPage]) {
      const thumb = thumbs.get(p)
      const x = pageX(layout, spread, p, pageW) * scale
      const y = spread.y * scale
      const w = pageW * scale
      if (!thumb) {
        // A page whose render failed still occupies its cell — a white
        // stand-in, exactly what the live slot shows for it.
        context.fillStyle = "#ffffff"
        context.fillRect(x, y, w, layout.unitH * scale)
        continue
      }
      try {
        const image = await loadImage(thumb)
        context.drawImage(image, x, y, w, (image.height / image.width) * w)
      } catch {
        context.fillStyle = "#ffffff"
        context.fillRect(x, y, w, layout.unitH * scale)
      }
    }
  }

  await readingStorage.put(getSourceSheetKey(sourceId), await sheet.encode("webp", 80))
  return true
}

export type PageImageRenderResult = {
  sourceId: string
  pageCount: number
  rendered: number
  /** Pages whose render or encode failed; the viewer falls back to pdf.js. */
  failed: number[]
}

/**
 * Render and store both image sizes for every page of a source.
 *
 * Same getDocument options as the cover renderer — that configuration is the
 * one proven to decode this library's scans in Node (`useWasm: false` rides
 * the JS fallback codecs; the WASM binaries do not load from file:// here).
 * Per-page failures warn and continue: one blank or hostile page must not
 * cost the other hundred their images.
 */
export async function renderSourcePageImages(
  sourceId: string,
  data: Buffer
): Promise<PageImageRenderResult> {
  const pdfjsLib = await loadPdfjs()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    wasmUrl: pdfjsWasmUrl(),
    useWasm: false,
  })
  const doc = await loadingTask.promise

  const [large, small] = [PAGE_IMAGE_WIDTHS[1], PAGE_IMAGE_WIDTHS[0]]
  let rendered = 0
  const failed: number[] = []
  // Kept for the sheet compose below — the thumbs are already in memory, so
  // the sheet costs a composite and an encode, never a second render.
  const thumbs = new Map<number, Buffer>()

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      try {
        const page = await doc.getPage(pageNumber)
        const unscaled = page.getViewport({ scale: 1 })
        if (!(unscaled.width > 0)) throw new Error("page has no width")
        const viewport = page.getViewport({ scale: large / unscaled.width })
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        const context = canvas.getContext("2d")
        // White, not transparent: the page IS paper, and WebP over transparent
        // composites to black in an <img> on some grounds.
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: context, viewport }).promise

        const smallCanvas = createCanvas(
          small,
          Math.max(1, Math.round((canvas.height / canvas.width) * small))
        )
        const smallContext = smallCanvas.getContext("2d")
        smallContext.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height)

        const [largeBytes, smallBytes] = await Promise.all([
          canvas.encode("webp", 80),
          smallCanvas.encode("webp", 78),
        ])
        await Promise.all([
          readingStorage.put(getSourcePageImageKey(sourceId, pageNumber, large), largeBytes),
          readingStorage.put(getSourcePageImageKey(sourceId, pageNumber, small), smallBytes),
        ])
        thumbs.set(pageNumber, smallBytes)
        rendered += 1
      } catch (error) {
        failed.push(pageNumber)
        logWarn("pages.image-render-failed", { sourceId, pageNumber, cause: error })
      }
    }
  } finally {
    await destroyPdf(doc, loadingTask)
  }

  try {
    await composeAndStoreSheet(sourceId, thumbs)
  } catch (error) {
    logWarn("pages.sheet-compose-failed", { sourceId, cause: error })
  }

  return { sourceId, pageCount: doc.numPages, rendered, failed }
}

/**
 * Compose the sheet from thumbs already in blob — the path for readings whose
 * page images predate the sheet. Costs page-count small reads and one write;
 * no PDF is fetched and nothing is re-rendered.
 */
export async function composeSheetFromStored(sourceId: string): Promise<boolean> {
  const rows = await db
    .select({ pageNumber: sourcePages.pageNumber })
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, sourceId))
  if (rows.length === 0) return false
  const thumbs = new Map<number, Buffer>()
  const batch = 16
  for (let start = 0; start < rows.length; start += batch) {
    await Promise.all(
      rows.slice(start, start + batch).map(async (row) => {
        try {
          thumbs.set(
            row.pageNumber,
            await readingStorage.get(getSourcePageImageKey(sourceId, row.pageNumber, PAGE_IMAGE_WIDTHS[0]))
          )
        } catch {
          // No thumb for this page; the sheet shows its white cell.
        }
      })
    )
  }
  if (thumbs.size === 0) return false
  return composeAndStoreSheet(sourceId, thumbs)
}

/** Same one-run gate as ensureSourcePageImages, for the sheet route's miss
 *  path. Falls through to the full render only when there are no thumbs to
 *  compose from at all. */
const sheetInflight = new Set<string>()

export async function ensureSourceSheet(sourceId: string): Promise<void> {
  if (sheetInflight.has(sourceId)) return
  sheetInflight.add(sourceId)
  try {
    if (await composeSheetFromStored(sourceId)) return
    await ensureSourcePageImages(sourceId)
  } catch (error) {
    sheetInflight.delete(sourceId)
    logWarn("pages.sheet-failed", { sourceId, cause: error })
  }
}

/**
 * One full generation per source per process, at most — the pages route calls
 * this on a cache miss, and a cold matrix open misses 132 times at once.
 * Without the gate each miss would fetch the whole PDF and render the whole
 * document; with it, the first miss starts the run and the rest return to
 * their 404s (the client falls back to pdf.js for this session and finds the
 * images next time).
 */
const inflight = new Set<string>()

export async function ensureSourcePageImages(sourceId: string): Promise<void> {
  if (inflight.has(sourceId)) return
  inflight.add(sourceId)
  try {
    const [source] = await db
      .select({ storageKey: sources.storageKey })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .limit(1)
    // No file is a settled state, not a failure — stay in the set so the
    // route's misses stop re-asking.
    if (!source?.storageKey) return
    const data = await readingStorage.get(source.storageKey)
    await renderSourcePageImages(sourceId, data)
    // Stays in the set on success too: the images exist now, and a second
    // run would only overwrite them with themselves.
  } catch (error) {
    // A real failure clears the gate so a later request can retry.
    inflight.delete(sourceId)
    logWarn("pages.images-failed", { sourceId, cause: error })
  }
}
