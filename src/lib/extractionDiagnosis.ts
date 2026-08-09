/**
 * Why is this reading bad, and what is the cheapest thing that would fix it?
 *
 * The extraction score answers "can a student quote this?". It is a verdict, and
 * a verdict is not a plan: a 2 on legibility could be a scanned page with no text
 * at all, a font whose character map is broken, or a book opening scanned as one
 * landscape sheet — three defects whose correct treatments have nothing in common.
 * Sending all three to OCR is the mistake this module exists to prevent. OCR on a
 * PDF whose only fault is a broken /ToUnicode map throws away a perfect vector
 * text layer and replaces it with a guess.
 *
 * So the remedies are ordered by how much they destroy, and the first one that
 * applies wins:
 *
 *   1. rebuild-tounicode — rewrites a font's character map. No pixel changes, no
 *      text reflow, and the page renders identically. Only extraction changes.
 *   2. split-spread — rewrites page boxes. Lossless for a page whose text layer
 *      is already good; the words and their order survive untouched.
 *   3. ocr — replaces the text layer outright. The only correct answer when
 *      there is no text to save, and the wrong answer whenever there is.
 *   4. manual-review — the honest output when the measurements do not agree on a
 *      cause, or when the cause is one no tool should decide unaided.
 *
 * Nothing here modifies anything. It reads measurements and returns a plan.
 */
import type { ExtractionMetrics } from "@/lib/types"
import type { FontStructure } from "@/lib/pdfStructure"

/**
 * Share of glyphs resolving to no character at all before the font map is
 * considered broken. Deliberately low: a document is normally at 0, and a single
 * broken font among several can wreck the reading while accounting for only a
 * slice of the glyphs. Anything above this is a defect, not noise.
 */
const UNMAPPED_GLYPH_FLOOR = 0.02

/**
 * Punctuation-between-letters occurrences per 1,000 characters before the text
 * is considered to be ligatures-as-punctuation rather than ordinary prose.
 * Real prose does produce a few (`co-`operative`, quoted `it's`), so this is a
 * rate, not a presence test.
 */
const PUNCT_IN_WORD_PER_KCHAR = 1.5

/** Median chars/page below which a page's text layer is furniture, not content. */
const SPARSE_PAGE_CHARS = 200

/**
 * Share of over-long tokens at which a document has lost its word boundaries.
 *
 * Calibrated against this library rather than chosen: of 22 readings, sixteen
 * sit at or below 0.4% — that floor is our own extractor, which joins pdf.js
 * items with no separator and so fuses the last word of each line to the first
 * of the next. The damaged readings are an order of magnitude clear of it, at
 * 3% to 30%. Nothing lands in between, so the two thresholds below separate
 * cleanly with room to spare.
 *
 * What this catches is the failure no other measure here can see: text that is
 * real English, in real proportions, with the spaces gone. `junkCharRatio` reads
 * zero, the letter distribution is perfect, the function words are all present —
 * and a student who quotes a sentence gets `designismore thanastyle`.
 */
const LOST_BOUNDARY_HIGH = 0.05
const LOST_BOUNDARY_LOW = 0.02

/**
 * Share of a single font's glyphs that must fail to resolve before that font is
 * called broken, and the number of glyphs it needs before the share means
 * anything. A font is the unit a /ToUnicode repair actually operates on, so a
 * font that is wholly unmapped is worth naming even when it is a rounding error
 * document-wide — that is the difference between "somewhere in this file the
 * text is wrong" and "this font, these glyphs".
 */
const BROKEN_FONT_RATIO = 0.5
const BROKEN_FONT_MIN_GLYPHS = 10

/**
 * Glyph-name leaks per 1,000 characters before the text is called defective. A
 * genuinely mapless font leaks a name for every ligature in the document —
 * hundreds — so a handful is noise from a URL or a citation, not a fault.
 */
const GLYPH_LEAK_PER_KCHAR = 0.5

export type DefectKind =
  | "spread-geometry"
  | "no-text-layer"
  | "broken-font-map"
  | "lost-word-boundaries"
  | "sparse-text-layer"
  | "non-latin-script"
  | "unexplained"

export type RemedyKind =
  | "none"
  | "rebuild-tounicode"
  | "split-spread"
  | "ocr"
  | "manual-review"

export type Defect = {
  kind: DefectKind
  /**
   * How much the measurements support this, not how bad it is. "low" means the
   * signal is present but has an innocent explanation worth ruling out by eye.
   */
  confidence: "high" | "medium" | "low"
  /** The numbers that produced it, for a human deciding whether to believe it. */
  evidence: string[]
  remedy: RemedyKind
}

export type Diagnosis = {
  /** Ordered by which remedy to reach for first. Empty when nothing is wrong. */
  defects: Defect[]
  /** The remedy for the first defect, or "none". */
  remedy: RemedyKind
  /** One line for a report. */
  summary: string
  /**
   * Measurements the diagnosis wanted and did not have. A structural defect
   * cannot be ruled out without the PDF passages, and saying so is not the same as
   * reporting a clean bill of health.
   */
  notMeasured: string[]
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Diagnose from measurements alone.
 *
 * `metrics` may come from a rescore over stored page text, in which case the
 * structural fields are absent — the geometry and glyph checks then report
 * themselves as unmeasured rather than passing silently.
 */
export function diagnoseExtraction(
  metrics: ExtractionMetrics,
  /**
   * Per-font tallies from probePdfStructure. Optional for the same reason the
   * structural metrics are, and worth passing whenever the passages are at hand:
   * the document-wide unmapped share dilutes a single broken font into
   * invisibility, while a repair has to name that font to act.
   */
  fonts?: FontStructure[]
): Diagnosis {
  const defects: Defect[] = []
  const notMeasured: string[] = []

  const hasStructure = metrics.glyphCount != null && metrics.spreadPages != null
  if (!hasStructure) {
    notMeasured.push(
      "page geometry and glyph mapping — needs the PDF passages, not just the stored page text"
    )
  }

  // 1. Geometry first, because a spread is the one defect that hides behind a
  //    perfect score: clean prose, normal letter distribution, no junk. If the
  //    page unit is wrong, every text measurement below it is measuring the
  //    wrong thing.
  if (metrics.spreadPages != null && metrics.spreadPages > 0) {
    defects.push({
      kind: "spread-geometry",
      confidence: "high",
      evidence: [
        `${metrics.spreadPages} of ${metrics.pageCount} pages render wider than tall`,
      ],
      remedy: "split-spread",
    })
  }

  // 2. Nothing to read. Prefer the glyph count over the character count: it
  //    distinguishes "the page has no text operators" from "the text extracted
  //    to an empty string", and only the former is unambiguously a scan.
  const noGlyphs = metrics.glyphCount != null && metrics.glyphCount === 0
  const noText = metrics.pageCount > 0 && metrics.totalChars === 0
  if (noGlyphs || noText) {
    defects.push({
      kind: "no-text-layer",
      confidence: "high",
      evidence: noGlyphs
        ? [`no text-drawing operators on any of ${metrics.pageCount} pages`]
        : [`${metrics.pageCount} pages extracted to no text at all`],
      remedy: "ocr",
    })
  } else if (metrics.scannedPages != null && metrics.scannedPages > 0) {
    // Partly scanned: some pages carry a text layer and some are images. Counted
    // from scanned pages, not from text-free ones — a blank verso or a section
    // divider has no text either, and OCR has nothing to find on it. Before this
    // distinction, a 235-page book with one blank leaf was reported as needing
    // OCR just as loudly as one with 19 scanned pages.
    defects.push({
      kind: "no-text-layer",
      // A handful of scanned plates in a long book is normal and not worth a
      // remediation pass; a tenth of the book is the reading being unquotable.
      confidence: metrics.scannedPages / metrics.pageCount >= 0.05 ? "high" : "low",
      evidence: [
        `${metrics.scannedPages} of ${metrics.pageCount} pages are images with no text over them` +
          (metrics.blankPages ? ` (plus ${metrics.blankPages} blank)` : ""),
      ],
      remedy: "ocr",
    })
  }

  // 3. The surgical case. Any one of these is enough on its own, and they are
  //    reported together because each sees a different way the same underlying
  //    fault shows up.
  const fontMapEvidence: string[] = []
  if (metrics.unmappedGlyphRatio != null && metrics.unmappedGlyphRatio > UNMAPPED_GLYPH_FLOOR) {
    fontMapEvidence.push(
      `${percent(metrics.unmappedGlyphRatio)} of glyphs resolve to no character`
    )
  }
  const leakRate =
    metrics.totalChars > 0 && metrics.glyphNameLeaks != null
      ? (metrics.glyphNameLeaks / metrics.totalChars) * 1000
      : 0
  if (leakRate > GLYPH_LEAK_PER_KCHAR) {
    fontMapEvidence.push(
      `${metrics.glyphNameLeaks} glyph names left in the text (${leakRate.toFixed(1)} per 1,000 chars)`
    )
  }
  const punctRate =
    metrics.totalChars > 0 && metrics.punctuationInWord != null
      ? (metrics.punctuationInWord / metrics.totalChars) * 1000
      : 0
  if (punctRate > PUNCT_IN_WORD_PER_KCHAR) {
    fontMapEvidence.push(`${punctRate.toFixed(1)} punctuation-inside-word per 1,000 chars`)
  }
  // The existing language-likeness pair. Both failing at once is the signature
  // the scorer already names a broken font map, so it belongs to this defect
  // rather than being reported as a separate mystery.
  if (
    metrics.letterFreqSimilarity != null &&
    metrics.functionWordsPerKChar != null &&
    metrics.letterFreqSimilarity < 0.85 &&
    metrics.functionWordsPerKChar < 8
  ) {
    fontMapEvidence.push(
      `letter distribution ${metrics.letterFreqSimilarity} and ${metrics.functionWordsPerKChar} common words per 1,000 chars — the text does not read as language`
    )
  }

  if (fontMapEvidence.length > 0) {
    defects.push({
      kind: "broken-font-map",
      // One signal can have an innocent reading; two agreeing rarely do.
      confidence: fontMapEvidence.length >= 2 ? "high" : "medium",
      evidence: fontMapEvidence,
      remedy: "rebuild-tounicode",
    })
  } else if (fonts) {
    // Nothing wrong document-wide, but a single font may still be entirely
    // unmapped — 12 glyphs out of 36,000 rounds to zero everywhere above while
    // being 100% of that font. Reported at low confidence because a small,
    // wholly-unmapped font is as often an ornament or a symbol set, where
    // resolving to no character is correct, as it is a fault.
    const brokenFonts = fonts.filter(
      (font) =>
        font.glyphCount >= BROKEN_FONT_MIN_GLYPHS &&
        font.unmappedGlyphs / font.glyphCount >= BROKEN_FONT_RATIO
    )
    if (brokenFonts.length > 0) {
      defects.push({
        kind: "broken-font-map",
        confidence: "low",
        evidence: brokenFonts
          .slice(0, 3)
          .map(
            (font) =>
              `font ${font.name}: ${font.unmappedGlyphs}/${font.glyphCount} glyphs unmapped, but only ${percent(
                font.glyphCount / Math.max(1, metrics.glyphCount ?? font.glyphCount)
              )} of the document — check by eye before repairing`
          ),
        remedy: "manual-review",
      })
    }
  }

  // 4. Words run together. This is the defect that matters most for quoting,
  //    and the one every other check here is blind to: the characters are right,
  //    the language is right, and the spaces are gone. A reading can score 4 or 5
  //    across the board and still hand a student `designismore thanastyle`.
  //
  //    The remedy is a fresh OCR pass — the damage is baked into the existing
  //    text layer, so no amount of font or geometry repair reaches it. Gate any
  //    replacement on beating the current text by this same measure, since a
  //    second-rate OCR of an already-OCR'd scan can easily be worse.
  if (metrics.longTokenRatio != null && metrics.longTokenRatio >= LOST_BOUNDARY_LOW) {
    const high = metrics.longTokenRatio >= LOST_BOUNDARY_HIGH
    defects.push({
      kind: "lost-word-boundaries",
      confidence: high ? "high" : "low",
      evidence: [
        `${percent(metrics.longTokenRatio)} of words run together — a clean reading here is under 0.5%`,
      ],
      remedy: "ocr",
    })
  }

  // 5. A text layer that exists but carries only furniture — a running header, a
  //    repeated download watermark. Scores as "has text" while being unquotable.
  if (
    !noGlyphs &&
    !noText &&
    metrics.medianCharsPerPage < SPARSE_PAGE_CHARS &&
    metrics.pageCount > 0
  ) {
    defects.push({
      kind: "sparse-text-layer",
      confidence: "medium",
      evidence: [
        `median ${metrics.medianCharsPerPage} chars per page — too little to be body text`,
      ],
      remedy: "ocr",
    })
  }

  // 6. Not English, or not Latin at all. No tool here should decide which.
  if (metrics.latinShare != null && metrics.letterFreqSimilarity == null && metrics.latinShare < 0.5) {
    defects.push({
      kind: "non-latin-script",
      confidence: "high",
      evidence: [`${percent(metrics.latinShare)} of letters are a–z`],
      remedy: "manual-review",
    })
  }

  // Remedies, least destructive first. A broken map is repaired before a page is
  // split, and both before anything is re-OCR'd.
  const order: RemedyKind[] = ["rebuild-tounicode", "split-spread", "ocr", "manual-review"]
  defects.sort((a, b) => order.indexOf(a.remedy) - order.indexOf(b.remedy))

  const remedy = defects[0]?.remedy ?? "none"
  const summary =
    defects.length === 0
      ? hasStructure
        ? "No extraction defect detected."
        : "No defect detected in the text, but the file itself was not examined."
      : defects.map((defect) => defect.kind).join(", ")

  return { defects, remedy, summary, notMeasured }
}
