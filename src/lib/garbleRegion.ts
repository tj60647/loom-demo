/**
 * Where on the page the gibberish is.
 *
 * Knowing a page is damaged is not enough to repair it. A repair needs the
 * region — both because re-reading a 900x900 crop is far more accurate than
 * re-reading a whole page, and because a crop is something a person can check.
 * An instructor can compare one region against its transcription in half a
 * minute; proofreading a chapter is hours, which is the difference between a
 * review protocol that happens and one that is nominal.
 *
 * Regions are found from the text layer, not from the image: pdf.js reports
 * where each run of characters sits, so the words that failed the dictionary
 * can be traced straight back to their coordinates. That also means the region
 * is exact rather than guessed — it is precisely the area whose extracted text
 * is wrong.
 */
import type { PdfPageProxy } from "@/lib/pdfjs"
import { isGarbledToken, lowercaseBodyTokens } from "@/lib/garble"

/** Padding around a region, in rendered pixels, so glyphs are not clipped. */
const REGION_PADDING = 8

/**
 * Vertical gap, as a multiple of line height, above which two damaged runs are
 * separate regions rather than one. Keeps a caption at the foot of a page from
 * being merged with a heading at the top into a box covering everything.
 */
const REGION_SPLIT_LINES = 3

type TextItem = { str?: string; transform?: number[]; width?: number; height?: number }

export type GarbleRegion = {
  /** Rendered-pixel box, at the scale this was measured at. */
  x: number
  y: number
  width: number
  height: number
  /** The unrecognised words inside it — what the repair has to account for. */
  words: string[]
}

/**
 * Locate the damaged areas of one page.
 *
 * `scale` is the render scale the caller will crop at, so the boxes come back
 * in the same pixel space as its canvas and need no further conversion.
 */
export async function locateGarbleRegions(
  page: PdfPageProxy,
  scale: number
): Promise<GarbleRegion[]> {
  const viewport = page.getViewport({ scale })
  const content = await page.getTextContent()
  const items = (content.items as TextItem[]).filter((item) => (item.str ?? "").trim().length > 0)

  type Box = { x0: number; y0: number; x1: number; y1: number; words: string[]; line: number }
  const boxes: Box[] = []

  for (const item of items) {
    const bad = lowercaseBodyTokens(item.str ?? "").filter(isGarbledToken)
    if (bad.length === 0) continue

    const transform = item.transform ?? [1, 0, 0, 1, 0, 0]
    const height = Math.max(8, (item.height ?? 10) * scale)
    // pdf.js reports the text origin with y measured up from the page foot;
    // the canvas measures down from the head.
    const x0 = transform[4] * scale
    const y0 = viewport.height - transform[5] * scale - height
    boxes.push({
      x0,
      y0,
      x1: x0 + Math.max(4, (item.width ?? 0) * scale),
      y1: y0 + height * 1.3,
      words: bad,
      line: height,
    })
  }

  if (boxes.length === 0) return []

  // Merge boxes that sit within a few lines of each other. Damage is usually
  // contiguous — a mis-read column, a rotated caption — and one box per word
  // would give a repair pass hundreds of crops instead of one or two.
  boxes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const merged: Box[] = []
  for (const box of boxes) {
    const last = merged[merged.length - 1]
    if (last && box.y0 - last.y1 < last.line * REGION_SPLIT_LINES) {
      last.x0 = Math.min(last.x0, box.x0)
      last.y0 = Math.min(last.y0, box.y0)
      last.x1 = Math.max(last.x1, box.x1)
      last.y1 = Math.max(last.y1, box.y1)
      last.words.push(...box.words)
    } else {
      merged.push({ ...box, words: [...box.words] })
    }
  }

  return merged.map((box) => ({
    x: Math.max(0, Math.floor(box.x0) - REGION_PADDING),
    y: Math.max(0, Math.floor(box.y0) - REGION_PADDING),
    width: Math.min(viewport.width, Math.ceil(box.x1) + REGION_PADDING) - Math.max(0, Math.floor(box.x0) - REGION_PADDING),
    height: Math.min(viewport.height, Math.ceil(box.y1) + REGION_PADDING) - Math.max(0, Math.floor(box.y0) - REGION_PADDING),
    words: [...new Set(box.words)],
  }))
}
