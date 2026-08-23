/**
 * WHERE THE COHORT MARKED, AS GEOMETRY — offsets turned into rectangles on the
 * page, without rendering the page.
 *
 * The Passages Overlay ships character offsets. Until now the only thing that
 * could place them was mark.js walking a live text layer, which means heat
 * existed only on pages that had been rendered at a readable zoom. On the
 * Canvas view — 60 pages at fit-all, no text layers — that produced a clean
 * contact sheet with no heat anywhere, which reads as "nobody marked this"
 * rather than "nothing here has been measured" (TJ, 2026-08-22: "i want
 * passages. i want to be able to look at the canvas and see where everyone has
 * been").
 *
 * WHY THIS IS EXACT, NOT AN ESTIMATE. Highlight offsets index the browser text
 * layer's string, and that string is the pdf.js text items' `str` concatenated
 * with nothing between them — src/lib/pdfText.ts says so at its head, and it is
 * why `sourcePages.contentHash` is taken over `textLayerProjection()` (the
 * stored text with its line separators removed) rather than over the stored
 * text itself. So a running sum of `item.str.length` over `getTextContent()`
 * gives every item its exact `[start, end)` in the same coordinate system the
 * offsets are already in. No matching, no search, no fuzz.
 *
 * The geometry half goes THROUGH THE VIEWPORT TRANSFORM, the same way pdf.js
 * positions its own text layer: `transform(viewport.transform, item.transform)`
 * and then top-left = `[tx[4], tx[5] - fontHeight]`.
 *
 * IT DID NOT, AT FIRST, and the error was visible. The first version took the
 * text matrix as page coordinates directly — `left = transform[4]`,
 * `top = height - transform[5] - itemHeight`, which is what
 * `src/lib/garbleRegion.ts` does. That is only right when the page box starts
 * at the origin and the page is unrotated. On this library's scans it does
 * not: measured against mark.js on the live text layer, over 16 runs on one
 * page of "Object Worlds", every projected rect sat 2.37-2.68% of the page
 * width to the RIGHT of the words it claimed (TJ: "the highlight and text
 * locations... look off"). That is the CropBox origin, which the viewport
 * transform subtracts and the naive formula does not. Widths were already
 * within 0.6% and are unchanged.
 *
 * Output is NORMALIZED to the page box (0..1 on both axes) so one projection
 * serves every view: 1 page, 2 pages, and the canvas at any zoom all multiply
 * by the page slot they happen to be drawing.
 *
 * LIMITS, named rather than discovered later:
 * - Horizontal text is assumed. The viewport transform handles a rotated
 *   PAGE, but an item rotated WITHIN the page (a sideways figure caption) gets
 *   an upright box around its origin, which will be wrong for it.
 *   `getTextContent()` exposes no per-glyph boxes, so nothing here can do
 *   better; academic PDFs are the readings this serves.
 * - Within one item the slice is proportional to CHARACTER COUNT, not to glyph
 *   advances, so a partial item's edges sit within a character or two of the
 *   truth on proportional fonts. Items are short runs — pdf.js splits at most
 *   style and position changes — and this is a wash under the words, not a
 *   caret. Whole items, which is most of a long passage, are exact.
 */

/** A pdf.js text item, in the shape this module needs it. */
export type HeatTextItem = {
  str?: string
  /** [a, b, c, d, e, f] — e/f are the origin in PDF user space, y up. */
  transform?: number[]
  width?: number
  height?: number
}

/** Half-open run of characters and how many people marked it. */
export type HeatSpanInput = { start: number; end: number; count: number }

/**
 * A patch of heat, normalized to the page: x/y/w/h are fractions of the page
 * box, so a view multiplies by whatever it is drawing the page at.
 */
export type HeatRect = { x: number; y: number; w: number; h: number; count: number }

/** An item and where it sits in the text-layer string. */
type PlacedItem = {
  start: number
  end: number
  left: number
  top: number
  width: number
  height: number
}

/**
 * Two rects belong to the same run of text if their tops and heights agree to
 * within this fraction of the page height. Not zero: consecutive items on one
 * line routinely differ in the last decimal, and a superscript or a different
 * font on the same line differs by more than that and SHOULD stay separate.
 */
const SAME_LINE = 0.002

/** How far apart, as a fraction of page width, two rects may sit and still merge. */
const JOINABLE_GAP = 0.004

/**
 * The page box a projection is made against: the size `getViewport({scale: 1})`
 * reports, and the transform it carries.
 */
export type HeatViewport = {
  width: number
  height: number
  /**
   * `viewport.transform`. Omitted, this falls back to the flip that an
   * unrotated page box anchored at the origin would have — which is what the
   * naive formula assumed, and is wrong on any page with a CropBox offset.
   */
  transform?: number[]
}

/**
 * Multiply two 2D affine matrices, `m1` applied after `m2`.
 *
 * The same composition pdf.js's own `Util.transform` performs, written out
 * rather than imported: this module is pure so `scripts/check-overlay.ts` can
 * assert it without pulling pdf.js into a plain script.
 */
function compose(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}

/**
 * Item boxes with their offsets, in one pass over the text content.
 *
 * Every item is placed, including the ones with no width: an empty or
 * zero-width item still ADVANCES the offset, so skipping it here would shift
 * every offset after it — the one bug in this file that would be silent and
 * catastrophic, since it would shade the wrong sentences rather than none.
 */
export function placeItems(items: HeatTextItem[], page: HeatViewport): PlacedItem[] {
  const placed: PlacedItem[] = []
  // The flip an unrotated page anchored at (0,0) would carry. Only a fallback:
  // a real viewport's transform also carries the box origin and any rotation.
  const viewport = page.transform ?? [1, 0, 0, -1, 0, page.height]
  let offset = 0

  for (const item of items) {
    const text = item.str ?? ""
    const start = offset
    offset += text.length
    if (text.length === 0) continue

    const tx = compose(viewport, item.transform ?? [1, 0, 0, 1, 0, 0])
    // The height pdf.js gives its own text-layer div: the length of the
    // transformed vertical axis, which already carries the font size, the
    // text matrix's scale and the viewport's.
    const height = Math.hypot(tx[2], tx[3]) || item.height || 0
    placed.push({
      start,
      end: offset,
      left: tx[4],
      // tx[5] is the BASELINE in page coordinates, y down. The box stands on
      // it, so its top is one font-height above.
      top: tx[5] - height,
      width: item.width ?? 0,
      height,
    })
  }

  return placed
}

/**
 * The text-layer string this page's offsets index into.
 *
 * The same concatenation `joinPageItems` performs with its separator suppressed
 * — the browser's string, which is what the client hashes to decide whether the
 * overlay's offsets still describe this page.
 */
export function textLayerString(items: HeatTextItem[]): string {
  let text = ""
  for (const item of items) text += item.str ?? ""
  return text
}

/**
 * Spans → rects, normalized to the page.
 *
 * Adjacent output is merged while the count is equal and the boxes sit on the
 * same line, which is the difference between one rect per marked line and one
 * per pdf.js item — roughly an order of magnitude on a dense page, and the
 * reason this stays cheap when 60 people have marked the same paragraph.
 */
export function projectHeatSpans(
  items: HeatTextItem[],
  page: HeatViewport,
  spans: HeatSpanInput[]
): HeatRect[] {
  if (!spans.length || !(page.width > 0) || !(page.height > 0)) return []

  const placed = placeItems(items, page)
  if (!placed.length) return []

  const out: HeatRect[] = []

  // Both sides in offset order, so the item cursor only ever moves forward:
  // one pass over the items for all the spans together, not one per span.
  const ordered = [...spans].sort((a, b) => a.start - b.start || a.end - b.end)
  let cursor = 0

  for (const span of ordered) {
    if (!(span.end > span.start)) continue
    while (cursor > 0 && placed[cursor - 1].end > span.start) cursor -= 1
    while (cursor < placed.length && placed[cursor].end <= span.start) cursor += 1

    for (let i = cursor; i < placed.length && placed[i].start < span.end; i++) {
      const item = placed[i]
      const from = Math.max(span.start, item.start)
      const to = Math.min(span.end, item.end)
      if (to <= from) continue

      const chars = item.end - item.start
      const x0 = item.left + (item.width * (from - item.start)) / chars
      const x1 = item.left + (item.width * (to - item.start)) / chars

      const rect: HeatRect = {
        x: x0 / page.width,
        y: item.top / page.height,
        w: Math.max(x1 - x0, 0) / page.width,
        h: item.height / page.height,
        count: span.count,
      }

      const last = out[out.length - 1]
      if (
        last &&
        last.count === rect.count &&
        Math.abs(last.y - rect.y) < SAME_LINE &&
        Math.abs(last.h - rect.h) < SAME_LINE &&
        rect.x >= last.x &&
        rect.x - (last.x + last.w) < JOINABLE_GAP
      ) {
        last.w = Math.max(last.w, rect.x + rect.w - last.x)
        continue
      }
      // A zero-width rect draws nothing, but it is kept above if it extends a
      // run — a marked space between two words is part of the passage.
      if (rect.w > 0) out.push(rect)
    }
  }

  return out
}

/**
 * How dark a count paints, 1..5.
 *
 * LOG, NOT LINEAR, and that choice is about the dataset this is built for
 * rather than the one in the dev branch today. Agreement has a long tail: with
 * 60 looms on one reading, most runs carry one or two people and the densest
 * carries a few dozen, so a linear ramp would put nearly every mark in step 1
 * and spend four fifths of the scale on a handful of sentences. On a log ramp
 * the middle of the distribution uses the middle of the scale.
 *
 * The scale is relative to this reading's own densest run, so it cannot
 * saturate: the old absolute `min(count, 5)` painted everything from 5 people
 * to 60 the same shade, which at cohort scale is one flat colour.
 *
 * Against a densest run of 37 the steps change at 3, 6, 11 and 18 — asserted
 * in scripts/check-overlay.ts, and worth knowing before reading a page: the
 * darkest shade means roughly half of everyone who marked the reading at all
 * marked those words.
 */
export function heatBand(count: number, maxCount: number): number {
  if (!(count > 0)) return 0
  // One person everywhere means no agreement to grade. The faintest step is
  // the honest one, and the legend says what the top of the scale is worth.
  if (maxCount <= 1) return 1
  // Five or fewer people at the densest run: the step IS the count. Stretching
  // a range of 2 across all five steps would paint "two people agreed" in the
  // shade reserved for the strongest convergence in the reading, which on a
  // quiet reading is most of the page.
  if (maxCount <= 5) return Math.min(5, count)
  const position = Math.log(Math.min(count, maxCount)) / Math.log(maxCount)
  return Math.min(5, Math.max(1, 1 + Math.floor(position * 4.999)))
}
