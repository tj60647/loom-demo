/**
 * Which pages can be repaired by re-reading them, and where their text sits.
 *
 * The region is found from the text layer, not from the image: pdf.js reports
 * where each run of characters sits, so the crop is exact rather than guessed —
 * it is precisely the area the page's text occupies, margins and all the white
 * space around them excluded.
 *
 * This file used to locate damage in SUB-REGIONS — a mis-read column, a
 * sideways caption — on the reasoning that a 900x900 crop is read more
 * accurately than a whole page and checked by a person far faster. Both halves
 * of that are true and neither survived contact with what a repair does: the
 * text layer of a PDF cannot be edited in place, so writing a transcription
 * back replaces the WHOLE page (see textLayerRepair.ts). A sub-region crop
 * therefore repairs one paragraph by deleting the rest of the page. The unit of
 * repair has to be the unit of replacement, so it is the page.
 */
import type { PdfPageProxy } from "@/lib/pdfjs"
import { isGarbled, isGarbledToken, lowercaseBodyTokens, measurePageGarble } from "@/lib/garble"

/** Padding around the box, in rendered pixels, so glyphs are not clipped. */
const REGION_PADDING = 8

type TextItem = { str?: string; transform?: number[]; width?: number; height?: number }

export type PageRepairRegion = {
  /** Rendered-pixel box, at the scale this was measured at. */
  x: number
  y: number
  width: number
  height: number
  /** The unrecognised words in it — what the repair has to account for. */
  words: string[]
  /**
   * The page read as damage by its own glyphs, with the spaces put back. This
   * is what says a crop is worth taking — see `locatePageRepairRegion`.
   */
  glyphRate: number
  bodyWords: number
}

/**
 * The one region of a page that can be repaired: all of its text.
 *
 * Two findings force this, and both were measured on real pages of this
 * library rather than reasoned about.
 *
 * **The unit of repair has to be the unit of replacement.** `textLayerRepair`
 * cannot edit a PDF's text operators in place — nothing can, short of parsing
 * and rewriting the content stream — so it rasterises the page and lays a fresh
 * text layer over it, built from the accepted transcription and nothing else.
 * Transcribing a 559x219 box and writing it back therefore does not correct a
 * paragraph; it deletes every other paragraph on the page. Page 9 of *Design as
 * Critique* was proposed as five such boxes, and applying them would have
 * replaced 1,485 characters with whatever those five held.
 *
 * **The damage has to be in the glyphs.** A page whose only fault is lost
 * spaces between text items reads as 33% garbage in the stored text and as
 * clean prose in the items themselves, because each item is still a real word.
 * There is nothing on such a page for a model to re-read — the picture is
 * perfect — so it gets no crop and is reported instead. That is what kept
 * proposing a 108x59 box around `quo`.
 *
 * Returns null when the page needs no repair, or needs a different one.
 */
export async function locatePageRepairRegion(
  page: PdfPageProxy,
  pageNumber: number,
  scale: number
): Promise<PageRepairRegion | null> {
  const viewport = page.getViewport({ scale })
  const content = await page.getTextContent()
  const items = (content.items as TextItem[]).filter((item) => (item.str ?? "").trim().length > 0)
  if (items.length === 0) return null

  // Joined with a SPACE, which is the whole point: it restores what a broken
  // text layer lost, so what is left is damage a picture of the page can fix.
  const glyphView = measurePageGarble(pageNumber, items.map((item) => item.str ?? "").join(" "))
  if (!glyphView || !isGarbled(glyphView)) return null

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const item of items) {
    const transform = item.transform ?? [1, 0, 0, 1, 0, 0]
    const height = Math.max(8, (item.height ?? 10) * scale)
    const left = transform[4] * scale
    const top = viewport.height - transform[5] * scale - height
    x0 = Math.min(x0, left)
    y0 = Math.min(y0, top)
    x1 = Math.max(x1, left + Math.max(4, (item.width ?? 0) * scale))
    y1 = Math.max(y1, top + height * 1.3)
  }

  // Whole pixels: the box becomes a canvas, and a canvas of 2238.06 x 3138.78
  // is not a thing. Rounded outward so nothing is cropped off a glyph.
  const x = Math.max(0, Math.floor(x0) - REGION_PADDING)
  const y = Math.max(0, Math.floor(y0) - REGION_PADDING)
  return {
    x,
    y,
    width: Math.min(Math.floor(viewport.width), Math.ceil(x1) + REGION_PADDING) - x,
    height: Math.min(Math.floor(viewport.height), Math.ceil(y1) + REGION_PADDING) - y,
    // The words a reader is warned not to reproduce. Item-level, because those
    // are the ones actually visible in the crop.
    words: [
      ...new Set(
        items.flatMap((item) => lowercaseBodyTokens(item.str ?? "").filter(isGarbledToken))
      ),
    ],
    glyphRate: glyphView.rate,
    bodyWords: glyphView.bodyWords,
  }
}
