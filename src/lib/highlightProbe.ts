/**
 * Will a highlight made in this reading actually hold?
 *
 * The extraction score used to answer that with a proxy: pages carrying at
 * least 300 characters. The proxy is not the question, and on this library it
 * gave the wrong answer twice — two readings were failing on `anchorability`
 * while every simulated highlight in them anchored perfectly, because they are
 * figure-heavy documents and the measure was counting pictures as missing text.
 *
 * So this simulates the real mechanism instead. A capture is a span of the
 * browser's text layer plus the offsets it was taken at; re-highlighting finds
 * that span again at those offsets. Both halves are plain string work, which
 * means the question can be asked directly and cheaply rather than inferred:
 *
 *   - Is the span findable at its own offset? If `indexOf` lands somewhere
 *     earlier, the reconciliation in `createPassage` will silently re-anchor the
 *     student's passage to the wrong place on the page.
 *   - Is it unique? A span that occurs twice is one the fuzzy fallback in
 *     PdfViewer can mark in the wrong spot once the precise path is unavailable.
 *
 * What this deliberately does NOT judge is whether the words are worth quoting —
 * a page of clean mojibake anchors beautifully. That is legibility's job, and
 * keeping the two apart is what lets a reading fail for the right reason.
 */
import { textLayerProjection } from "@/lib/pdfText"

/**
 * Capture sizes to simulate, in characters.
 *
 * Measured from the captures students have actually made: 27 at the shortest,
 * 66 at the tenth percentile, 129 at the quarter, 191 at the median. An earlier
 * version of this probe tested one 180-character span and skipped any page too
 * short to hold one — which excluded 44% of real capture sizes and every page
 * whose only text is a caption or a heading.
 *
 * There is no lower bound on a highlight. A student can take a label off a
 * photograph or a three-word heading, and both are ordinary. What changes with
 * length is not whether a capture is possible but whether it is UNIQUE: short
 * spans collide more often, and a collision is what actually breaks
 * re-highlighting. So the short sizes are here to be tested, not excluded.
 */
const SPAN_SIZES = [30, 80, 200]

/** Captures attempted per size per page, spread evenly through it. */
const SPANS_PER_SIZE = 3

/** Non-whitespace a span needs before it is text rather than a gap. */
const MIN_SPAN_SUBSTANCE = 8

export type HighlightProbe = {
  /** Pages carrying any text at all — every one of them is testable. */
  pagesTested: number
  spansTested: number
  /** Spans that could not be found at the offset they were taken from. */
  misanchored: number
  /** Spans occurring more than once on their page. */
  ambiguous: number
  /**
   * Share of simulated captures that would anchor cleanly. Null when no page
   * carried enough text to try — "not measured", never "failed".
   */
  anchorRate: number | null
}

/**
 * Simulate captures across a document.
 *
 * Takes stored page text and projects it to the browser's string first, because
 * that is the string a real capture's offsets index into — testing against the
 * stored text would measure a string no client has ever seen.
 */
export function probeHighlights(pages: { pageNumber: number; textContent: string }[]): HighlightProbe {
  let pagesTested = 0
  let spansTested = 0
  let misanchored = 0
  let ambiguous = 0

  for (const page of pages) {
    const layer = textLayerProjection(page.textContent)
    // Any text at all is testable. A page holding a single caption is a page a
    // student can quote from, and excluding it would be the old length floor
    // wearing a different name.
    if (layer.trim().length === 0) continue
    pagesTested += 1

    for (const size of SPAN_SIZES) {
      // A page shorter than this size still gets tested — at its own length.
      const span_len = Math.min(size, layer.length)
      if (span_len < MIN_SPAN_SUBSTANCE) continue

      const step = Math.max(1, Math.floor((layer.length - span_len) / SPANS_PER_SIZE))
      for (let attempt = 0; attempt < SPANS_PER_SIZE; attempt += 1) {
        const start = attempt * step
        if (start + span_len > layer.length) break

        const span = layer.slice(start, start + span_len)
        if (span.trim().length < MIN_SPAN_SUBSTANCE) continue
        spansTested += 1

        const first = layer.indexOf(span)
        if (first !== start) {
          misanchored += 1
          continue
        }
        if (layer.indexOf(span, start + 1) !== -1) {
          ambiguous += 1
        }
      }
    }
  }

  return {
    pagesTested,
    spansTested,
    misanchored,
    ambiguous,
    anchorRate:
      spansTested > 0 ? (spansTested - misanchored - ambiguous) / spansTested : null,
  }
}
