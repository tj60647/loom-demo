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
 * The geometry half is the derivation `src/lib/garbleRegion.ts` already uses to
 * turn an item into a box: `transform[4]`/`transform[5]` are the item's origin
 * in PDF user space (y up from the bottom), `width`/`height` its extent in the
 * same units, so the top edge is `viewportHeight - transform[5] - height`.
 *
 * Output is NORMALIZED to the page box (0..1 on both axes) so one projection
 * serves every view: 1 page, 2 pages, and the canvas at any zoom all multiply
 * by the page slot they happen to be drawing.
 *
 * LIMITS, named rather than discovered later:
 * - Horizontal text is assumed. A rotated or vertical item gets a box from the
 *   same formula, which will be wrong for it. `getTextContent()` exposes no
 *   per-glyph boxes, so nothing here can do better; academic PDFs are the
 *   readings this serves.
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
 * Item boxes with their offsets, in one pass over the text content.
 *
 * Every item is placed, including the ones with no width: an empty or
 * zero-width item still ADVANCES the offset, so skipping it here would shift
 * every offset after it — the one bug in this file that would be silent and
 * catastrophic, since it would shade the wrong sentences rather than none.
 */
export function placeItems(items: HeatTextItem[], pageHeight: number): PlacedItem[] {
  const placed: PlacedItem[] = []
  let offset = 0

  for (const item of items) {
    const text = item.str ?? ""
    const start = offset
    offset += text.length
    if (text.length === 0) continue

    const transform = item.transform ?? [1, 0, 0, 1, 0, 0]
    // The font's own height when pdf.js gives one, otherwise the vertical
    // scale out of the text matrix — which is what its height is derived from
    // anyway, and is never 0 on a real item.
    const height = item.height || Math.abs(transform[3]) || 0
    placed.push({
      start,
      end: offset,
      left: transform[4],
      top: pageHeight - transform[5] - height,
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
  page: { width: number; height: number },
  spans: HeatSpanInput[]
): HeatRect[] {
  if (!spans.length || !(page.width > 0) || !(page.height > 0)) return []

  const placed = placeItems(items, page.height)
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
