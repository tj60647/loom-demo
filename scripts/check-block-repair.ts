/**
 * The block-repair contract, asserted end to end on a generated fixture.
 *
 * Three promises are load-bearing enough to check with real PDF bytes rather
 * than unit fixtures, because each one lives in the seam between libraries
 * (pdf-lib writing, pdf.js reading) where a version bump can move it:
 *
 *   1. DETECTION — a page carrying angled text is flagged odd-format, by its
 *      item transforms (probePdfStructure) and by its ink alone
 *      (measureAngledInk on a render); a page of horizontal prose is not.
 *   2. ORDER — a block-mode repair writes body before notes in the content
 *      stream, so extraction (and therefore a student's copy) never splices a
 *      margin note into the middle of a body sentence.
 *   3. GEOMETRY — a note's invisible glyphs land inside the note's own box,
 *      rotated to the note's own angle, so selecting the note follows the
 *      note; and the canonical-text contract (textLayerProjection strips only
 *      the \n separators) survives the rewrite.
 *
 * The fixture is generated, not committed — same reasoning as
 * check-text-parity: pdf-lib output is deterministic and a binary fixture
 * would rot unseen.
 *
 *   npx tsx scripts/check-block-repair.ts
 */
import { PDFDocument, StandardFonts, degrees } from "pdf-lib"
import { createCanvas } from "@napi-rs/canvas"
import { destroyPdf, loadPdfjs, pdfjsWasmUrl } from "../src/lib/pdfjs"
import { extractPdfPageText, textLayerProjection } from "../src/lib/pdfText"
import { measureAngledInk, probePdfStructure } from "../src/lib/pdfStructure"
import { cropBoxToPagePoints, repairPageTextLayers } from "../src/lib/textLayerRepair"

let failures = 0
function ok(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok    ${name}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const BODY_TEXT =
  "Two heads are better than one is the basis for this method, which simply suggests that " +
  "definitions come easier when you sit with a friend and talk it out. Saying the same thing " +
  "many ways is a proven technique for expanding familiarity and gaining insight into the " +
  "problem you believed you already understood completely."
const NOTE_LINES = [
  "It's time for a break.",
  "I am making too",
  "many mistakes!!!",
  "The secret to solving",
  "problems is to find",
  "the bridge between.",
]
const NOTE_ANGLE = 25
/** A run of body set sideways — the scanned-sideways sheet, in miniature. */
const SIDEWAYS_TEXT = "turned on its side and read bottom to top"

/**
 * Page 1: horizontal body on the right two-thirds, a visible note angled
 * across the left third — the Universal Traveler's page 67, in Times Roman.
 * Page 2: the same body alone, as the horizontal control.
 */
async function buildFixture(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const page1 = doc.addPage([612, 792])
  page1.drawText(BODY_TEXT, { x: 230, y: 700, size: 12, font, lineHeight: 16, maxWidth: 340 })
  const radians = (NOTE_ANGLE * Math.PI) / 180
  NOTE_LINES.forEach((line, index) => {
    page1.drawText(line, {
      x: 30 + index * 16 * Math.sin(radians),
      y: 520 - index * 16 * Math.cos(radians),
      size: 11,
      font,
      rotate: degrees(NOTE_ANGLE),
    })
  })
  // A FULL page of prose, filled to every third, because that is what
  // "horizontal control" means. A zone that catches only a handful of lines
  // genuinely bands at 90° — its letter- and word-gaps align into vertical
  // channels — and a sparse page wearing the block brief is a harmless
  // outcome, not the failure this check guards. Every line starts at a
  // different point of the text so no gap column repeats down the page.
  const page2 = doc.addPage([612, 792])
  for (let line = 0; line < 39; line++) {
    const start = (line * 53) % BODY_TEXT.length
    page2.drawText((BODY_TEXT.slice(start) + " " + BODY_TEXT).slice(0, 88), {
      x: 72, y: 712 - line * 16, size: 12, font,
    })
  }
  return Buffer.from(await doc.save())
}

/**
 * A scanned page as this library's readings actually are: one image XObject
 * carrying the page, and a separate invisible text layer over it — the shape
 * `stripPageText` has to separate. Drawn at 400dpi so a re-render at anything
 * less is visible as a number, not as an opinion.
 */
const SCAN_DPI = 400
async function buildScannedFixture(): Promise<Buffer> {
  // The "scan": a page-sized raster with some marks on it.
  const width = Math.round((612 / 72) * SCAN_DPI)
  const height = Math.round((792 / 72) * SCAN_DPI)
  const canvas = createCanvas(width, height)
  const context = canvas.getContext("2d")
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, width, height)
  context.fillStyle = "#111111"
  context.font = `${Math.round(SCAN_DPI / 6)}px sans-serif`
  for (let line = 0; line < 24; line++) {
    context.fillText("the scanned page carries its own words as ink", SCAN_DPI, SCAN_DPI + line * SCAN_DPI * 0.34)
  }
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const page = doc.addPage([612, 792])
  page.drawImage(await doc.embedPng(canvas.toBuffer("image/png")), { x: 0, y: 0, width: 612, height: 792 })
  // The bad OCR layer this repair is meant to replace.
  page.drawText("scannedd tvon garbge whit no reall wrods on it", {
    x: 72, y: 700, size: 11, font, opacity: 0,
  })
  return Buffer.from(await doc.save())
}

/** The resolution of the largest image the page paints, at page size. */
async function pageImageDpi(buffer: Buffer, pageNumber: number): Promise<number> {
  const pdfjsLib = await loadPdfjs()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    wasmUrl: pdfjsWasmUrl(),
    useWasm: false,
  })
  const doc = await loadingTask.promise
  try {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const ops = await page.getOperatorList()
    let best = 0
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== pdfjsLib.OPS.paintImageXObject) continue
      const image = (await new Promise<unknown>((resolve) => {
        try {
          page.objs.get(String(ops.argsArray[i][0]), resolve)
        } catch {
          resolve(null)
        }
      })) as { width?: number } | null
      if (image?.width) best = Math.max(best, (image.width / viewport.width) * 72)
    }
    return Math.round(best)
  } finally {
    await destroyPdf(doc, loadingTask)
  }
}

async function renderPage(buffer: Buffer, pageNumber: number, dpi: number) {
  const pdfjsLib = await loadPdfjs()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    wasmUrl: pdfjsWasmUrl(),
    useWasm: false,
  })
  const doc = await loadingTask.promise
  try {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: dpi / 72 })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext("2d")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport }).promise
    return context.getImageData(0, 0, canvas.width, canvas.height)
  } finally {
    await destroyPdf(doc, loadingTask)
  }
}

type TextItem = { str?: string; transform?: number[] }

async function pageItems(buffer: Buffer, pageNumber: number): Promise<TextItem[]> {
  const pdfjsLib = await loadPdfjs()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const doc = await loadingTask.promise
  try {
    const page = await doc.getPage(pageNumber)
    const textContent = await page.getTextContent()
    return textContent.items as TextItem[]
  } finally {
    await destroyPdf(doc, loadingTask)
  }
}

async function main() {
  const fixture = await buildFixture()

  console.log("\ndetection — angled text is flagged, horizontal prose is not")

  const structure = await probePdfStructure(fixture)
  ok(
    "the angled page is odd-format by its item transforms alone",
    structure.pages[0].oddFormat && structure.pages[0].angledTextItems >= 3,
    `angledTextItems=${structure.pages[0].angledTextItems}`
  )
  ok("the horizontal page is not", !structure.pages[1].oddFormat)

  const angledRender = await renderPage(fixture, 1, 150)
  const angledZones = measureAngledInk(angledRender.data, angledRender.width, angledRender.height, 150)
  ok(
    "the angled page is odd-format by its ink alone",
    angledZones.length > 0,
    "measureAngledInk found no angled zone on the note page"
  )
  const controlRender = await renderPage(fixture, 2, 150)
  const controlZones = measureAngledInk(controlRender.data, controlRender.width, controlRender.height, 150)
  ok(
    "the horizontal page's ink is not",
    controlZones.length === 0,
    `flagged: ${controlZones.map((zone) => `${zone.zone}@${zone.angle}`).join(", ")}`
  )

  console.log("\nplacement — body before notes, notes inside their boxes at their angle")

  const NOTE_TEXT = NOTE_LINES.join("\n")
  // The note's box in the repair's own convention: PDF points from the page's
  // top-left. The drawn note occupies roughly x 20-180, y-from-top 240-420.
  const NOTE_BOX = { x: 15, yTop: 235, width: 175, height: 195 }
  const repaired = await repairPageTextLayers(fixture, [
    {
      pageNumber: 1,
      text: `${BODY_TEXT}\n${NOTE_TEXT}\nsquare root: √2`,
      blocks: [
        { role: "body", text: BODY_TEXT, angleDegrees: 0, box: { x: 220, yTop: 60, width: 360, height: 400 } },
        // A sideways body run: role decides the order, angle decides the
        // geometry, so this is drawn before the notes AND at 90°.
        { role: "body", text: SIDEWAYS_TEXT, angleDegrees: 90, box: { x: 225, yTop: 480, width: 60, height: 240 } },
        { role: "margin", text: NOTE_TEXT, angleDegrees: NOTE_ANGLE, box: NOTE_BOX },
        { role: "caption", text: "square root: √2", angleDegrees: 0, box: { x: 300, yTop: 500, width: 200, height: 30 } },
      ],
    },
  ])

  const pages = await extractPdfPageText(repaired.bytes)
  const page1Text = pages[0].textContent
  ok("the body survives the rewrite", page1Text.includes("definitions come easier"), page1Text.slice(0, 120))
  ok("the note survives the rewrite", page1Text.includes("many mistakes!!!"))
  ok(
    "content order is body first, then the note — a copy never splices them",
    page1Text.indexOf("definitions come easier") < page1Text.indexOf("It's time for a break"),
    `body at ${page1Text.indexOf("definitions come easier")}, note at ${page1Text.indexOf("It's time for a break")}`
  )
  ok(
    "an unencodable glyph became a space, not a veto",
    page1Text.includes("square root:") && !page1Text.includes("√")
  )
  ok(
    "the projection contract survives: stripping \\n is the whole projection",
    textLayerProjection(page1Text) === page1Text.split("\n").join("")
  )
  const page2Before = (await extractPdfPageText(fixture))[1].textContent
  ok("the untouched page carries identical text through the rewrite", pages[1].textContent === page2Before)

  const items = await pageItems(repaired.bytes, 1)
  const originOf = (needle: string) => {
    const item = items.find((entry) => entry.str?.includes(needle))
    if (!item?.transform) return null
    const [a, b, , , x, y] = item.transform
    return { x, y, angle: (Math.atan2(b, a) * 180) / Math.PI }
  }

  // The body's own box, in pdf-lib space: the glyphs must land in it. Without
  // this, deleting drawBoxedBody's y-flip outright still passes every other
  // assertion here — extraction finds the text wherever on the sheet it sits.
  const BODY_BOX = { x: 220, yTop: 60, width: 360, height: 400 }
  const bodyFirst = originOf("Two heads are better")
  // The last word, whatever line the wrap put it on.
  const bodyLast = originOf("completely")
  ok("the body's first line is placed", bodyFirst != null)
  ok("the body's last line is placed", bodyLast != null)
  if (bodyFirst && bodyLast) {
    const bodyBottom = 792 - BODY_BOX.yTop - BODY_BOX.height
    const bodyTop = 792 - BODY_BOX.yTop
    ok(
      "the body's glyphs sit inside the body's box",
      bodyFirst.x >= BODY_BOX.x - 2 &&
        bodyFirst.x <= BODY_BOX.x + BODY_BOX.width + 2 &&
        bodyFirst.y >= bodyBottom - 2 &&
        bodyFirst.y <= bodyTop + 2,
      `first line at (${bodyFirst.x.toFixed(0)}, ${bodyFirst.y.toFixed(0)}); box x ${BODY_BOX.x}..${BODY_BOX.x + BODY_BOX.width}, y ${bodyBottom}..${bodyTop}`
    )
    ok(
      "  and they run DOWN the page — the first line is above the last",
      bodyFirst.y > bodyLast.y,
      `first at y ${bodyFirst.y.toFixed(0)}, last at y ${bodyLast.y.toFixed(0)}`
    )
    ok(
      "  clear of the note's third, which is where the note's glyphs go",
      bodyFirst.x > NOTE_BOX.x + NOTE_BOX.width,
      `body x ${bodyFirst.x.toFixed(0)} vs note box right edge ${NOTE_BOX.x + NOTE_BOX.width}`
    )
  }

  const sideways = originOf("turned on its side")
  ok("a sideways body run is placed", sideways != null)
  if (sideways) {
    ok(
      "  at 90°, not flattened to the page's own horizontal",
      Math.abs(sideways.angle - 90) < 2,
      `item angle ${sideways.angle.toFixed(1)}°`
    )
    ok(
      "  and still ahead of the notes in content order",
      page1Text.indexOf(SIDEWAYS_TEXT.slice(0, 20)) < page1Text.indexOf("It's time for a break"),
      `sideways at ${page1Text.indexOf(SIDEWAYS_TEXT.slice(0, 20))}, note at ${page1Text.indexOf("It's time for a break")}`
    )
  }

  const noteFirst = originOf("It's time for a break")
  const noteLast = originOf("the bridge between")
  ok("the note's glyphs exist as their own text item", noteFirst != null)
  ok("  every line of it", noteLast != null)
  if (noteFirst && noteLast) {
    ok(
      `the note's glyphs are rotated to the note's own angle (${NOTE_ANGLE}°)`,
      Math.abs(noteFirst.angle - NOTE_ANGLE) < 2,
      `item angle ${noteFirst.angle.toFixed(1)}°`
    )
    // The box, converted to pdf-lib's bottom-left space: y from 792-235-195 to 792-235.
    const yBottom = 792 - NOTE_BOX.yTop - NOTE_BOX.height
    const yTop = 792 - NOTE_BOX.yTop
    ok(
      "and they sit inside the note's box, not over the body",
      noteFirst.x >= NOTE_BOX.x - 5 &&
        noteFirst.x <= NOTE_BOX.x + NOTE_BOX.width + 5 &&
        noteFirst.y >= yBottom - 5 &&
        noteFirst.y <= yTop + 5,
      `item origin (${noteFirst.x.toFixed(0)}, ${noteFirst.y.toFixed(0)}) vs box x ${NOTE_BOX.x}..${NOTE_BOX.x + NOTE_BOX.width}, y ${yBottom.toFixed(0)}..${yTop.toFixed(0)}`
    )
    /**
     * The note's lines advance the way its reader's eye does: rotate the page
     * by −angle and the first line must sit above the last. Without this, a
     * negated across-vector — every note stacked in reverse — passes
     * unnoticed, because a reversed stack still lands inside the same box.
     */
    const radians = (NOTE_ANGLE * Math.PI) / 180
    const acrossOf = (point: { x: number; y: number }) =>
      point.x * Math.sin(radians) - point.y * Math.cos(radians)
    ok(
      "  and its lines stack in reading order along its own slope",
      acrossOf(noteFirst) < acrossOf(noteLast),
      `first across ${acrossOf(noteFirst).toFixed(1)}, last across ${acrossOf(noteLast).toFixed(1)}`
    )
  }

  console.log("\na note reported as one long line — the case that lost its own opening")

  /**
   * Readers report a note however they please, and the panel that read page 67
   * of *The Universal Traveler* returned each hand-lettered note as a single
   * 245-character line. Shrinking the type to fit that on one baseline put the
   * note's first thirty words off the edge of the sheet, where they were
   * clipped out of the text layer altogether — the tail selected and the
   * opening did not exist. Every word has to survive, wrapped inside the box.
   */
  const ONE_LINE_NOTE =
    "The secret to solving problems is to find the bridge between the way things are and the way you " +
    "want them to become. That bridge is your definition, the link between the situation as already " +
    "solved and its resolution as you envision it to be."
  const wrapped = await repairPageTextLayers(fixture, [
    {
      pageNumber: 1,
      text: ONE_LINE_NOTE,
      blocks: [{ role: "margin", text: ONE_LINE_NOTE, angleDegrees: NOTE_ANGLE, box: NOTE_BOX }],
    },
  ])
  const wrappedText = (await extractPdfPageText(wrapped.bytes))[0].textContent
  const missing = ONE_LINE_NOTE.split(/\s+/).filter((word) => !wrappedText.includes(word))
  ok(
    "every word of a one-line note reaches the text layer",
    missing.length === 0,
    `${missing.length} missing: ${missing.slice(0, 12).join(" ")}`
  )
  ok(
    "  including its opening words",
    wrappedText.includes("The secret to solving"),
    `text starts: ${JSON.stringify(wrappedText.slice(0, 80))}`
  )
  const wrappedItems = await pageItems(wrapped.bytes, 1)
  const noteItems = wrappedItems.filter((item) => item.str?.trim())
  ok(
    "  wrapped across several lines rather than one run off the page",
    noteItems.length >= 3,
    `${noteItems.length} text item(s)`
  )
  ok(
    "  every one of them inside the page box",
    noteItems.every((item) => {
      const [, , , , x, y] = item.transform!
      return x >= -2 && x <= 614 && y >= -2 && y <= 794
    }),
    noteItems
      .map((item) => `(${item.transform![4].toFixed(0)},${item.transform![5].toFixed(0)})`)
      .join(" ")
  )

  console.log("\nfidelity — a repair takes the text and leaves the page alone")

  /**
   * The regression this check exists for, and the one every other assertion
   * here missed. A repair used to rasterise the page at a fixed 200dpi and
   * embed that: measured afterwards, this library's scans are 350-400dpi, so
   * every repaired page silently lost half its linear resolution and the file
   * grew. Nothing caught it because every gate and every test in this pipeline
   * reads TEXT — and the text was fine. So this asserts the page's own
   * artwork, in pixels, and it fails on the old behaviour.
   */
  const scan = await buildScannedFixture()
  const beforeDpi = await pageImageDpi(scan, 1)
  ok("the fixture is a scan at a real resolution", beforeDpi >= 300, `${beforeDpi} dpi`)

  const kept = await repairPageTextLayers(scan, [
    { pageNumber: 1, text: "A corrected transcription of the scanned page." },
  ])
  const afterDpi = await pageImageDpi(kept.bytes, 1)
  ok(
    "the repaired page keeps its scan at full resolution",
    afterDpi === beforeDpi,
    `${beforeDpi} dpi before, ${afterDpi} dpi after — a repair must not re-render the page`
  )
  ok(
    "no page was rasterised",
    kept.pagesRasterised.length === 0,
    `rasterised: ${JSON.stringify(kept.pagesRasterised)}`
  )
  ok(
    "and the file did not balloon",
    kept.bytes.length <= scan.length * 1.1,
    `${(scan.length / 1024).toFixed(0)}KB before, ${(kept.bytes.length / 1024).toFixed(0)}KB after`
  )
  const keptText = (await extractPdfPageText(kept.bytes))[0].textContent
  ok("the corrected text is there", keptText.includes("A corrected transcription"))
  ok("and the old text layer is gone", !keptText.includes("scannedd tvon garbge"), JSON.stringify(keptText.slice(0, 90)))

  console.log("\ncrop fractions — the one place a reader's coordinates meet the page's")

  // A quarter-page crop at 2x scale, offset 100px right and 50px down. A note
  // covering the crop's left half from a fifth down: fractions x .0 y .2 w .5
  // h .3 → page points x 50, yTop 55, width 75, height 45.
  const REGION = { x: 100, y: 50, width: 300, height: 300, scale: 2 }
  const converts = (
    name: string,
    region: { x: number; y: number; width: number; height: number; scale: number },
    box: { x: number; y: number; w: number; h: number },
    want: { x: number; yTop: number; width: number; height: number }
  ) => {
    const got = cropBoxToPagePoints(region, box)
    ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
  }
  converts(
    "a fraction box converts to page points through the crop's own region",
    REGION,
    { x: 0, y: 0.2, w: 0.5, h: 0.3 },
    { x: 50, yTop: 55, width: 75, height: 45 }
  )
  converts(
    "  a whole-crop box covers the whole region",
    REGION,
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 50, yTop: 25, width: 150, height: 150 }
  )
  converts(
    "  and a full-page region at scale 1 places by fraction alone",
    { x: 0, y: 0, width: 612, height: 792, scale: 1 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    { x: 306, yTop: 396, width: 306, height: 396 }
  )

  if (failures > 0) {
    console.error(`\n[check-block-repair] ${failures} FAILED`)
    process.exit(1)
  }
  console.log(`\n[check-block-repair] all assertions passed`)
}

main().catch((error) => {
  console.error("[check-block-repair] failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
