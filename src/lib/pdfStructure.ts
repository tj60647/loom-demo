/**
 * What the text alone cannot tell you about a PDF.
 *
 * The extraction score in readingScore.ts reads one thing: the string that came
 * out of the extractor. That is the right substrate for "can a student quote
 * this?", but it is blind to *why* a bad reading is bad, and blind in two ways
 * that matter enough to route the whole remediation decision:
 *
 *   - A two-page spread scanned as one landscape sheet extracts a full page of
 *     clean, well-distributed English. It scores 5/5/5 and passes, while reading
 *     across the gutter and interleaving two pages of prose. No text metric can
 *     see it; the page box can.
 *   - A font whose /ToUnicode map is missing resolves its codes to nothing, or
 *     to the wrong character. By the time that reaches the extracted string it is
 *     either invisible (clean ASCII, wrong letters) or indistinguishable from a
 *     bad scan. At the glyph level it is unambiguous, and attributable to a
 *     specific font, which is what makes a surgical repair possible.
 *
 * So this module reads the file, not the text. It is strictly read-only and
 * produces nothing canonical — deliberately, because that freedom is what lets
 * it use APIs that extractPdfPageText must not risk (see the note there).
 *
 * Two findings from measuring the course's own readings are baked in below and
 * are worth not re-learning the hard way:
 *
 *   1. Page geometry MUST be read from the rotation-adjusted viewport, never
 *      from the raw page box. Bucciarelli's scan has view [0,0,792,612] — wider
 *      than it is tall, the textbook spread signature — and /Rotate 270, so it
 *      actually renders as a 612x792 portrait page. The naive box test calls it
 *      a spread and would split a perfectly ordinary page down the middle.
 *   2. `isInFont: false` is NOT a defect. It means the glyph is not in the
 *      embedded font program, which is routine: 617 of 3,624 glyphs on the first
 *      page of the *clean* Wenger PDF report it, with every one of them mapping
 *      to correct Unicode. Gate on the resolved character, not on this.
 */
import { createCanvas } from "@napi-rs/canvas"
import { destroyPdf, loadPdfjs, pdfjsWasmUrl, type PdfPageProxy } from "@/lib/pdfjs"

/**
 * How much wider than tall a rendered page must be before it is a candidate
 * two-page spread. A single page is portrait or nearly square; a book opening
 * scanned as one sheet is close to 2:1. 1.25 sits well clear of both.
 */
const SPREAD_ASPECT_RATIO = 1.25

/**
 * A glyph resolved to nothing usable: no character at all, the replacement
 * character, a private-use codepoint, or a control code. Each is a font whose
 * code-to-Unicode mapping failed outright. The subtler failure — a map that
 * resolves to a valid but *wrong* character — is invisible here by construction
 * and is what the language-likeness checks in readingScore.ts exist to catch.
 */
function isUnmapped(unicode: unknown) {
  if (typeof unicode !== "string" || unicode.length === 0) return true
  const code = unicode.codePointAt(0)!
  return (
    code === 0xfffd ||
    (code >= 0xe000 && code <= 0xf8ff) ||
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f)
  )
}

/**
 * Every way pdf.js can be told to paint an image. Watched so that a page with no
 * text can say WHICH kind of no-text page it is: one carrying a scanned image is
 * a candidate for OCR, and one carrying nothing at all is a blank leaf — a
 * section divider, the back of a plate, the empty verso a chapter opens on.
 *
 * The distinction is the difference between a useful report and a noisy one.
 * Without it, a 235-page book with a single blank divider reads as "needs OCR"
 * exactly as loudly as a book with 19 scanned pages.
 */
/**
 * Resolution and ink threshold for deciding whether a page that carries an image
 * and no text actually has anything on it.
 *
 * This check earns its cost. Without it "an image and no text" reads as "a
 * scanned page needing OCR", and measured across this library that was wrong
 * almost every time: of the nineteen such pages in one 163-page book, eighteen
 * rendered at 0.00% ink — blank leaves scanned along with the rest of the
 * volume — and the nineteenth was the cover. A whole remediation programme was
 * pointed at pages with nothing on them.
 *
 * 150dpi is plenty to tell ink from paper, and only pages that already have no
 * text are rendered, so a long book costs a handful of raster passes rather than
 * one per page.
 */
const INK_RENDER_DPI = 150
const PDF_POINTS_PER_INCH = 72
/** Below this share of non-white pixels the page is paper, not content. */
const INK_FLOOR = 0.002

/**
 * Alternations between inked and blank rows, per 100 rows, above which a page
 * is laid out as lines of type rather than as a picture.
 *
 * This is what tells a scanned page of prose — which OCR could rescue, and which
 * should count against a reading's score — from a photograph or a diagram, which
 * should not count at all. Lines of text leave a striped horizontal profile; an
 * image is one continuous block.
 *
 * Measured on a real reading: its eight text pages band at 5.0-8.9, its two
 * photographs and its diagram at 0.0-0.8. Nothing lands between, so 2.0 sits in
 * a wide gap rather than on a cliff.
 */
const TEXT_BAND_FLOOR = 2.0

/** A row counts as inked once this share of its pixels are. Ignores speckle. */
const ROW_INK_FLOOR = 0.01

/**
 * The angles the ink-band measure is repeated at when asking whether a page
 * carries text that does not run horizontally. 0 and 90 are the axes; the rest
 * are where hand-lettered marginalia actually sit. Finer steps buy nothing:
 * banding is a broad signal, strong within ±10° of the text's true angle.
 */
const BAND_ANGLES = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90]

/**
 * The floor and the margin an off-axis band rate must clear, in alternations
 * PER INCH — not per 100 rows, because this measure runs on whatever render
 * is already in hand (the probe's 150dpi appearance pass, the pipeline's
 * ~250dpi crop) and a per-row rate halves every time the resolution doubles.
 * 3.0/inch is TEXT_BAND_FLOOR's own bar restated in inches (2.0 per 100 rows
 * at 150dpi).
 *
 * The factor keeps ordinary prose out: a page of horizontal lines still bands
 * a little off-axis, because a tilted scanline crosses several line-heights of
 * ink and blank — but far below its own horizontal rhythm.
 *
 * Measured on this library (2026-08-14, ~235-300dpi renders): the Universal
 * Traveler's hand-lettered notes band at 5.1-6.3/inch off-axis, 2.6-7.6x
 * their zone's horizontal rate; Learning How to Learn's sideways concept maps
 * at 3.3-18.6/inch, mostly at 90°/±75°. Typed prose in the same books and in
 * two others (Object Worlds, Plans and Situated Actions) never cleared both
 * bars in any zone — its off-axis rates sit under its own horizontal rhythm.
 */
const ANGLED_BAND_FLOOR_PER_INCH = 3.0
const ANGLED_BAND_FACTOR = 1.5

/**
 * Text items whose transform is rotated off every axis before a page is
 * flagged. One or two angled items are ornament — a single rotated word in a
 * figure; a run of them is angled OCR, the free half of odd-format detection.
 */
const ANGLED_TEXT_ITEM_FLOOR = 3

/** How far off every 90° axis an item's rotation must be to count as angled. */
const ANGLED_ITEM_TOLERANCE_DEG = 4

/**
 * The zones of a page measured separately for angled ink: a grid of thirds,
 * plus the whole sheet. Page-level banding alone would never see a margin
 * note — the body's horizontal rhythm dominates the whole-page profile, and
 * the note lives in a third the body never enters. Thirds rather than thin
 * margin strips because the marginalia this exists for are not thin: the
 * Universal Traveler's hand-lettered notes run to a third of the page's
 * width, and a strip that clips a note keeps only a corner of its rhythm.
 */
const ANGLED_ZONES: { name: string; x: number; y: number; w: number; h: number }[] = [
  ...[0, 1, 2].flatMap((row) =>
    [0, 1, 2].map((column) => ({
      name: `r${row + 1}c${column + 1}`,
      x: column / 3,
      y: row / 3,
      w: 1 / 3,
      h: 1 / 3,
    }))
  ),
  { name: "page", x: 0, y: 0, w: 1, h: 1 },
]

export type AngledInkZone = {
  /** Which zone of the page — a cell of the thirds grid, or "page". */
  zone: string
  /** The angle its ink bands hardest at, degrees counterclockwise. */
  angle: number
  /** The band rate at that angle, alternations per inch. */
  rate: number
  /** The rate at 0° for comparison — what horizontal text would show. */
  horizontalRate: number
}

/**
 * Luminance the eye would report, cheap enough per pixel to run millions of
 * times. The channel-wise near-white test the page-kind pass uses is wrong
 * here and measurably so: this library's aged scans photograph cream-yellow —
 * blue channel under 200 across the whole sheet — so against a white
 * reference every pixel of paper reads as ink and a page bands at nothing.
 * Ink has to mean "darker than THIS page's own paper", which needs a
 * luminance and a background to compare it to.
 */
function lumaAt(data: Uint8ClampedArray, index: number) {
  if (data[index + 3] === 0) return 255
  return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
}

/**
 * A zone's own paper, read off its median luminance, and the darkness a pixel
 * must fall to below it to count as ink. Two forms because paper comes in two
 * kinds: on light paper (cream scans, luma 215-233 across this library) a
 * fixed offset below the median reads lettering cleanly; on a mid-tone ground
 * the offset swallows the ink — the Universal Traveler's orange cover has
 * median luma 72, its black title ~35, and 72−55 leaves nothing to find — so
 * there the bar is a share of the background instead. The larger of the two
 * governs; below it, ink.
 */
const INK_BELOW_BACKGROUND = 55
const INK_BACKGROUND_SHARE = 0.55

function zoneBackgroundLuma(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  zone: { x: number; y: number; w: number; h: number }
) {
  const x0 = Math.floor(zone.x * width)
  const y0 = Math.floor(zone.y * height)
  const x1 = Math.min(width, x0 + Math.floor(zone.w * width))
  const y1 = Math.min(height, y0 + Math.floor(zone.h * height))
  const histogram = new Array(256).fill(0)
  let sampled = 0
  for (let y = y0; y < y1; y += 4) {
    for (let x = x0; x < x1; x += 4) {
      histogram[Math.round(lumaAt(data, (y * width + x) * 4))] += 1
      sampled += 1
    }
  }
  let seen = 0
  for (let luma = 0; luma < 256; luma++) {
    seen += histogram[luma]
    if (seen >= sampled / 2) return luma
  }
  return 255
}

/**
 * The ink-band measure, generalised to a zone and an angle.
 *
 * Scanlines run along the text direction — for angle θ as a reader sees it
 * (counterclockwise, canvas y pointing down) that is (cos θ, −sin θ) — and
 * sweep across it. Lines of type at θ leave the same striped profile across
 * these scanlines that horizontal type leaves across rows.
 */
function bandRateAtAngle(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  zone: { x: number; y: number; w: number; h: number },
  angleDeg: number,
  inkBelowLuma: number,
  dpi: number
) {
  const x0 = Math.floor(zone.x * width)
  const y0 = Math.floor(zone.y * height)
  const zoneWidth = Math.floor(zone.w * width)
  const zoneHeight = Math.floor(zone.h * height)
  if (zoneWidth < 8 || zoneHeight < 8) return 0

  const radians = (angleDeg * Math.PI) / 180
  const alongX = Math.cos(radians)
  const alongY = -Math.sin(radians)
  const acrossX = Math.sin(radians)
  const acrossY = Math.cos(radians)

  const centerX = x0 + zoneWidth / 2
  const centerY = y0 + zoneHeight / 2
  const halfAlong = (zoneWidth * Math.abs(alongX) + zoneHeight * Math.abs(alongY)) / 2
  const halfAcross = (zoneWidth * Math.abs(acrossX) + zoneHeight * Math.abs(acrossY)) / 2

  // Every second pixel along a line and every second line: plenty to find a
  // stripe a text line wide, at a quarter of the work.
  const STEP = 2
  /** A scanline mostly outside the zone says nothing about its rhythm. */
  const MIN_LINE_SAMPLES = 24

  let lines = 0
  let transitions = 0
  let previousInked: boolean | null = null
  for (let across = -halfAcross; across <= halfAcross; across += STEP) {
    let sampled = 0
    let inked = 0
    for (let along = -halfAlong; along <= halfAlong; along += STEP) {
      const x = Math.round(centerX + along * alongX + across * acrossX)
      const y = Math.round(centerY + along * alongY + across * acrossY)
      if (x < x0 || x >= x0 + zoneWidth || y < y0 || y >= y0 + zoneHeight) continue
      sampled += 1
      if (lumaAt(data, (y * width + x) * 4) < inkBelowLuma) inked += 1
    }
    if (sampled < MIN_LINE_SAMPLES) continue
    const lineInked = inked > sampled * ROW_INK_FLOOR
    if (previousInked !== null && lineInked !== previousInked) transitions += 1
    previousInked = lineInked
    lines += 1
  }

  // Alternations per inch of sweep, so the same text measures the same at any
  // render resolution. lines * STEP is the sweep's extent in pixels.
  return lines > 0 ? (transitions / ((lines * STEP) / dpi)) : 0
}

/**
 * Find the zones of a rendered page whose ink bands hardest OFF the
 * horizontal — where angled or sideways text lives.
 *
 * Exported for the repair pipeline, which has to ask this question about pages
 * the probe will not render: a page repaired by the single-stream pipeline
 * carries a clean horizontal text layer over the same angled picture, so
 * neither its glyphs nor its probe appearance betray it. The pipeline already
 * renders every candidate page for its crop, and this measure reads that
 * render.
 *
 * `dpi` is the resolution the pixels were rendered at — rates are normalised
 * per inch so every caller measures against the same bar.
 */
export function measureAngledInk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  dpi: number
): AngledInkZone[] {
  const angled: AngledInkZone[] = []
  for (const zone of ANGLED_ZONES) {
    const background = zoneBackgroundLuma(data, width, height, zone)
    const inkBelow = Math.max(
      background - INK_BELOW_BACKGROUND,
      background * INK_BACKGROUND_SHARE
    )
    // A zone whose paper is already near-black holds a solid picture, not
    // text on paper; there is no rhythm to find below it.
    if (inkBelow <= 20) continue
    const horizontalRate = bandRateAtAngle(data, width, height, zone, 0, inkBelow, dpi)
    let bestAngle = 0
    let bestRate = horizontalRate
    for (const angle of BAND_ANGLES) {
      if (angle === 0) continue
      const rate = bandRateAtAngle(data, width, height, zone, angle, inkBelow, dpi)
      if (rate > bestRate) {
        bestRate = rate
        bestAngle = angle
      }
    }
    if (
      bestAngle !== 0 &&
      bestRate >= ANGLED_BAND_FLOOR_PER_INCH &&
      bestRate >= horizontalRate * ANGLED_BAND_FACTOR
    ) {
      angled.push({
        zone: zone.name,
        angle: bestAngle,
        rate: Math.round(bestRate * 10) / 10,
        horizontalRate: Math.round(horizontalRate * 10) / 10,
      })
    }
  }
  return angled
}

const IMAGE_OPS = [
  "paintImageXObject",
  "paintImageXObjectRepeat",
  "paintInlineImageXObject",
  "paintInlineImageXObjectGroup",
  "paintImageMaskXObject",
  "paintImageMaskXObjectGroup",
  "paintImageMaskXObjectRepeat",
  "paintSolidColorImageMask",
] as const

export type PageStructure = {
  pageNumber: number
  /** Page box as actually rendered, with /Rotate applied. */
  width: number
  height: number
  rotation: number
  /** True when the rendered page is wide enough to be a two-page spread. */
  isSpreadCandidate: boolean
  /** Glyphs drawn on this page. Zero means no text layer at all. */
  glyphCount: number
  /** Of those, how many resolved to no usable character. */
  unmappedGlyphs: number
  /** Whether anything was painted as an image on this page. */
  hasImage: boolean
  /**
   * Share of non-white pixels, for pages with no text layer. Null when the page
   * has text (nothing to decide) or could not be rendered.
   */
  inkShare: number | null
  /**
   * What this page IS, which decides whether its lack of text is a defect:
   *
   * - `text`     — carries extractable characters.
   * - `scanned`  — laid out as lines of type, but none of them extractable.
   *                A reader can see prose here and cannot quote it. A defect,
   *                and the only kind OCR helps.
   * - `picture`  — a photograph, plate or diagram. Has no text because it is
   *                not text. NOT a defect, and must not count against a
   *                reading's coverage: a thesis full of figures is a thesis
   *                full of figures, not a badly extracted document.
   * - `blank`    — no ink at all.
   */
  kind: "text" | "scanned" | "picture" | "blank"
  /**
   * No text, an image, and ink actually on it. Kept as the OCR trigger; equal
   * to `kind === "scanned"`.
   */
  isScannedPage: boolean
  /**
   * Text items whose transform is rotated off every 90° axis — OCR that was
   * written at an angle, the free half of odd-format detection. Zero on a page
   * with no text layer.
   */
  angledTextItems: number
  /**
   * Zones of the rendered page whose ink bands hardest off the horizontal.
   * Null when the page has a text layer and was therefore never rendered —
   * a null is "not measured", never "not angled". The repair pipeline asks
   * again on its own render (measureAngledInk) for exactly those pages.
   */
  angledInk: AngledInkZone[] | null
  /**
   * The block-mode trigger: this page carries text that does not run in one
   * horizontal stream — angled OCR items, or ink banding off-axis. A page
   * flagged here is transcribed as blocks (role, angle, box) rather than as a
   * single stream, which is the difference between a margin note the eye reads
   * beside the body and one spliced into the middle of its sentences.
   */
  oddFormat: boolean
}

export type FontStructure = {
  /** The page resource name, e.g. "g_d0_f1" — enough to tell fonts apart. */
  name: string
  glyphCount: number
  unmappedGlyphs: number
}

export type PdfStructure = {
  pageCount: number
  pages: PageStructure[]
  /** Pages carrying any text layer at all. */
  pagesWithGlyphs: number
  /** Pages showing an image with no text over it — what OCR would act on. */
  scannedPages: number
  /** Pages with neither text nor image. Blank leaves, not a defect. */
  blankPages: number
  /** Photographs, plates and diagrams. Not defects — see PageStructure.kind. */
  picturePages: number
  /** Pages whose rendered box looks like a two-page spread. */
  spreadPages: number
  glyphCount: number
  unmappedGlyphs: number
  /** Share of glyphs that resolved to nothing. 0 when there are no glyphs. */
  unmappedGlyphRatio: number
  /** Fonts that drew text, worst-mapped first. Localises a broken map. */
  fonts: FontStructure[]
}

type Tally = { glyphCount: number; unmappedGlyphs: number }

/**
 * Render a page and report the share of pixels that are not paper-white.
 *
 * Samples every eighth pixel: the question is "is there anything here at all",
 * for which a coarse sample is as good as a full one and eight times cheaper.
 * Returns null if the page will not render, which is reported as unknown rather
 * than as blank — refusing to guess in the direction that hides a defect.
 */
type PageAppearance = {
  /** Share of non-white pixels. */
  inkShare: number
  /**
   * Alternations between inked and blank rows per 100 rows. High on lines of
   * type, near zero on a picture. See TEXT_BAND_FLOOR.
   */
  bandRate: number
  /** Zones whose ink bands hardest off the horizontal. See measureAngledInk. */
  angledInk: AngledInkZone[]
}

async function measurePageAppearance(page: PdfPageProxy): Promise<PageAppearance | null> {
  try {
    const viewport = page.getViewport({ scale: INK_RENDER_DPI / PDF_POINTS_PER_INCH })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext("2d")
    // Paint the page white first: a transparent scan over a transparent canvas
    // would otherwise read as ink.
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport }).promise

    const { width, height } = canvas
    const { data } = context.getImageData(0, 0, width, height)

    let inked = 0
    let sampled = 0
    // Row-wise, because the vertical rhythm of text lines is the whole signal.
    // Every second pixel across is plenty to find it and halves the work.
    const rowInked: boolean[] = new Array(height)
    for (let y = 0; y < height; y++) {
      let rowCount = 0
      let rowSampled = 0
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4
        rowSampled += 1
        if (
          data[index + 3] > 0 &&
          (data[index] < 200 || data[index + 1] < 200 || data[index + 2] < 200)
        ) {
          rowCount += 1
        }
      }
      inked += rowCount
      sampled += rowSampled
      rowInked[y] = rowCount > rowSampled * ROW_INK_FLOOR
    }

    let transitions = 0
    for (let y = 1; y < height; y++) {
      if (rowInked[y] !== rowInked[y - 1]) transitions += 1
    }

    return {
      inkShare: sampled > 0 ? inked / sampled : 0,
      bandRate: height > 0 ? (transitions / height) * 100 : 0,
      angledInk: measureAngledInk(data, width, height, INK_RENDER_DPI),
    }
  } catch {
    return null
  }
}

/**
 * Walk one page's operator list, tallying glyphs by the font that drew them.
 *
 * The operator list is the only place the mapping is still visible: by the time
 * text reaches getTextContent it has been reduced to a string, and an unmapped
 * glyph is indistinguishable from a missing one. Here each glyph still carries
 * its `originalCharCode` alongside the `unicode` it resolved to.
 */
async function tallyPageGlyphs(page: PdfPageProxy, ops: Record<string, number>) {
  const byFont = new Map<string, Tally>()
  const total: Tally = { glyphCount: 0, unmappedGlyphs: 0 }
  const imageOps = new Set(IMAGE_OPS.map((name) => ops[name]).filter((op) => op != null))
  let hasImage = false

  let operatorList: { fnArray: number[]; argsArray: unknown[][] }
  try {
    operatorList = await page.getOperatorList()
  } catch {
    // A page whose content stream will not parse has no glyphs to report. That
    // is itself a finding — it surfaces as a page with no text layer — and not
    // a reason to fail the whole document.
    return { byFont, total, hasImage }
  }

  // setFont precedes the text-showing operators it applies to, so tracking the
  // most recent one attributes each glyph to the font that drew it.
  let currentFont = "(none)"

  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const fn = operatorList.fnArray[index]
    const args = operatorList.argsArray[index]

    if (imageOps.has(fn)) {
      hasImage = true
      continue
    }

    if (fn === ops.setFont) {
      const name = args?.[0]
      currentFont = typeof name === "string" ? name : "(none)"
      continue
    }

    if (fn !== ops.showText && fn !== ops.showSpacedText) continue

    const glyphs = args?.[0]
    if (!Array.isArray(glyphs)) continue

    let tally = byFont.get(currentFont)
    if (!tally) {
      tally = { glyphCount: 0, unmappedGlyphs: 0 }
      byFont.set(currentFont, tally)
    }

    for (const glyph of glyphs) {
      // Bare numbers in the array are kerning adjustments, not glyphs.
      if (glyph === null || typeof glyph !== "object") continue
      const { unicode, isSpace } = glyph as { unicode?: unknown; isSpace?: boolean }
      // A space carries no mapping worth judging and would dilute the ratio.
      if (isSpace) continue

      tally.glyphCount += 1
      total.glyphCount += 1
      if (isUnmapped(unicode)) {
        tally.unmappedGlyphs += 1
        total.unmappedGlyphs += 1
      }
    }
  }

  return { byFont, total, hasImage }
}

/**
 * Probe a PDF's structure. Read-only: nothing here writes, and nothing here
 * feeds canonical page text.
 */
export async function probePdfStructure(data: Buffer): Promise<PdfStructure> {
  const pdfjsLib = await loadPdfjs()

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    // Scanned readings decode their page images through these codecs. Without
    // the URL pdf.js warns and abandons the image, which for an image-only page
    // is the difference between "no text layer" and a parse failure.
    wasmUrl: pdfjsWasmUrl(),
    useWasm: false,
  })
  const doc = await loadingTask.promise

  try {
    const pages: PageStructure[] = []
    const fontTotals = new Map<string, Tally>()

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      // Rotation-adjusted on purpose — see the note at the top of this file.
      const viewport = page.getViewport({ scale: 1 })
      const { byFont, total, hasImage } = await tallyPageGlyphs(page, pdfjsLib.OPS)

      // Only pages with no text layer need the raster pass — everywhere else the
      // question does not arise, and rendering every page of a 235-page book to
      // learn nothing would make this probe unusable.
      const appearance = total.glyphCount === 0 ? await measurePageAppearance(page) : null
      const inkShare = appearance?.inkShare ?? null

      // Angled OCR shows in the text items' own transforms, which the glyph
      // tally cannot see — the operator list attributes glyphs to fonts, not to
      // matrices. Only pages that have text can have angled text.
      let angledTextItems = 0
      if (total.glyphCount > 0) {
        try {
          const textContent = await page.getTextContent()
          for (const item of textContent.items as { str?: string; transform?: number[] }[]) {
            if (!item.str?.trim() || !Array.isArray(item.transform)) continue
            const [a, b] = item.transform
            const angle = (Math.atan2(b, a) * 180) / Math.PI
            const offAxis = Math.abs(angle % 90)
            if (Math.min(offAxis, 90 - offAxis) > ANGLED_ITEM_TOLERANCE_DEG) angledTextItems += 1
          }
        } catch {
          // A page whose text will not parse twice reports no angled items —
          // the glyph tally already carried what could be carried.
        }
      }

      // A page with no extractable text is only a defect if it was SUPPOSED to
      // carry text. Lines of type leave a striped row profile; a photograph or a
      // diagram does not. Where the render failed, `appearance` is null and the
      // page is called scanned — an unknown page should surface for review
      // rather than be quietly excused.
      const kind: PageStructure["kind"] =
        total.glyphCount > 0
          ? "text"
          : appearance == null
            ? "scanned"
            : appearance.inkShare < INK_FLOOR
              ? "blank"
              : appearance.bandRate >= TEXT_BAND_FLOOR
                ? "scanned"
                : "picture"

      for (const [name, tally] of byFont) {
        const running = fontTotals.get(name) ?? { glyphCount: 0, unmappedGlyphs: 0 }
        running.glyphCount += tally.glyphCount
        running.unmappedGlyphs += tally.unmappedGlyphs
        fontTotals.set(name, running)
      }

      pages.push({
        pageNumber,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        rotation: viewport.rotation,
        isSpreadCandidate: viewport.width > viewport.height * SPREAD_ASPECT_RATIO,
        glyphCount: total.glyphCount,
        unmappedGlyphs: total.unmappedGlyphs,
        hasImage,
        inkShare,
        kind,
        isScannedPage: kind === "scanned",
        angledTextItems,
        angledInk: appearance?.angledInk ?? null,
        oddFormat:
          angledTextItems >= ANGLED_TEXT_ITEM_FLOOR ||
          (appearance?.angledInk.length ?? 0) > 0,
      })
    }

    const glyphCount = pages.reduce((sum, page) => sum + page.glyphCount, 0)
    const unmappedGlyphs = pages.reduce((sum, page) => sum + page.unmappedGlyphs, 0)

    return {
      pageCount: doc.numPages,
      pages,
      pagesWithGlyphs: pages.filter((page) => page.kind === "text").length,
      scannedPages: pages.filter((page) => page.kind === "scanned").length,
      blankPages: pages.filter((page) => page.kind === "blank").length,
      picturePages: pages.filter((page) => page.kind === "picture").length,
      spreadPages: pages.filter((page) => page.isSpreadCandidate).length,
      glyphCount,
      unmappedGlyphs,
      unmappedGlyphRatio: glyphCount > 0 ? unmappedGlyphs / glyphCount : 0,
      fonts: [...fontTotals.entries()]
        .map(([name, tally]) => ({ name, ...tally }))
        .sort((a, b) => {
          const aRatio = a.glyphCount > 0 ? a.unmappedGlyphs / a.glyphCount : 0
          const bRatio = b.glyphCount > 0 ? b.unmappedGlyphs / b.glyphCount : 0
          return bRatio - aRatio || b.glyphCount - a.glyphCount
        }),
    }
  } finally {
    await destroyPdf(doc, loadingTask)
  }
}
