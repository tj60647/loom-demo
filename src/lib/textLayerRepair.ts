/**
 * Writing a corrected transcription back into a PDF.
 *
 * The correction has to land in the PDF itself, not in `sourcePages`. A student
 * selects text from the browser's text layer, which pdf.js builds from the
 * file — so correcting only the stored rows would raise the extraction score
 * and change nothing the student experiences. That is the whole reason this
 * module is harder than it looks.
 *
 * WHAT IT DOES, AND WHAT IT COSTS. A damaged page is replaced wholesale: the
 * page is rendered to an image, and a fresh invisible text layer is laid over it
 * from the accepted transcription. The page looks identical and now selects
 * correctly.
 *
 * The cost is that the page's original vector text is gone. That is acceptable
 * *only* on a page whose text layer was garbage to begin with — which is the
 * only kind of page this is ever called for. On any other page it would be
 * vandalism, which is why the caller has to name the pages and why the diagnosis
 * that names them is a separate, conservative measure.
 *
 * Positions come from Tesseract, words come from the transcription. Tesseract
 * reliably reports WHERE a word sits even when it misreads WHAT the word is —
 * measured on this library's damaged pages, it returned confident boxes around
 * text it transcribed as noise. So the two are combined: the boxes give layout,
 * the reviewed transcription gives content. Where they cannot be aligned, the
 * text is laid out in reading order across the region rather than dropped, so a
 * student can still find and quote it even if the highlight rectangle is
 * approximate.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
  degrees,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"
import { createCanvas } from "@napi-rs/canvas"
import { destroyPdf, loadPdfjs, pdfjsWasmUrl } from "@/lib/pdfjs"

/**
 * Render resolution for the LAST-RESORT replacement page image.
 *
 * This constant used to be the whole story, and it was quietly destroying the
 * library. A repair rasterised the rendered page at 200dpi and embedded that;
 * measured afterwards, *Learning How to Learn*'s scans are 2200x3400px — 400dpi
 * at page size — and *The Universal Traveler*'s are 350dpi, so every repaired
 * page threw away half its linear resolution and three quarters of its pixels,
 * permanently, in exchange for fixing its text. The comment that stood here
 * claimed the page was "not visibly softer"; at 300dpi the difference is
 * unmistakable, and the viewer's deeper zoom now puts it under the reader's
 * eye. It compounded, too: a page repaired twice was a 200dpi resample of a
 * 200dpi resample.
 *
 * So rasterising is no longer what a repair does. `stripPageText` below keeps
 * the page's own artwork — the scan's image object, untouched and never
 * re-encoded — and removes only the text. This path remains for a page whose
 * content stream will not parse, and it now renders at the page's OWN
 * resolution rather than a fixed one; the constant is only a floor.
 */
const REPLACEMENT_DPI = 200
/** Never re-render above this, whatever the source claims. */
const MAX_REPLACEMENT_DPI = 600
const PDF_POINTS_PER_INCH = 72

/**
 * How far a block may lean and still be laid out as upright lines. Readers
 * report a degree or two of slope on ordinary body text — a scan is never
 * quite square — and rotating a paragraph by that is worse than ignoring it.
 */
const UPRIGHT_TOLERANCE_DEG = 5

export type PageTranscription = {
  pageNumber: number
  /**
   * The accepted text for this page, in reading order. Line breaks are
   * meaningful: they become the line boundaries extraction will record.
   */
  text: string
  /**
   * Word boxes in PDF points from the page's bottom-left, if a layout pass
   * produced them. Without these the text is laid out in reading order, which
   * still selects and quotes correctly but anchors approximately.
   */
  boxes?: { text: string; x: number; y: number; width: number; height: number }[]
  /**
   * Block-mode placement: the accepted blocks of an oddly-formatted page, with
   * boxes in PDF points measured from the page's TOP-left — render space, the
   * space the crop's fractions convert into; the flip to pdf-lib's bottom-left
   * happens at draw time, where the page height is in hand.
   *
   * Body blocks are drawn FIRST, in reading order, each inside its own box;
   * every other block follows as its own text run inside its box, rotated to
   * its angle. Content-stream order is therefore body-then-notes, which is why
   * a copied paragraph never has a margin note spliced into the middle of it —
   * while visually each note's invisible glyphs sit over the note itself, at
   * its own slope, so selecting the note follows the note.
   */
  blocks?: {
    role: "body" | "margin" | "caption" | "label"
    text: string
    /** Degrees counterclockwise from horizontal, as drawn on the page. */
    angleDegrees: number
    box: { x: number; yTop: number; width: number; height: number } | null
  }[]
}

/**
 * A reader's block box — fractions of the crop it read — in PDF points from
 * the page's top-left, which is the space `PageTranscription.blocks` speaks.
 *
 * The conversion is the crop's own making, run backwards: the repair's region
 * records where the crop sat on the rendered page and at what scale, so a
 * fraction of the crop is region-offset rendered pixels, and pixels over scale
 * are points. Pure, exported and asserted (scripts/check-block-repair.ts)
 * because it is the one place a reader's coordinates meet the page's, and a
 * factor dropped here would place every note plausibly and wrongly.
 */
export function cropBoxToPagePoints(
  region: { x: number; y: number; width: number; height: number; scale: number },
  box: { x: number; y: number; w: number; h: number }
) {
  return {
    x: (region.x + box.x * region.width) / region.scale,
    yTop: (region.y + box.y * region.height) / region.scale,
    width: (box.w * region.width) / region.scale,
    height: (box.h * region.height) / region.scale,
  }
}

/**
 * Take the TEXT out of a page and leave everything else exactly as it was.
 *
 * This is what a repair should always have done. A scanned page is an image
 * and a text layer, and the two are separate objects in the content stream —
 * measured on *Learning How to Learn*, page 57's whole stream is 101 bytes:
 *
 *     q 1 0 0 1 0 0 cm /OCR-nDHWHy5Fj6lRO77jjeOvEQ Do Q
 *     q 396 0 0 612 0 0 cm /Im0 Do Q
 *
 * The OCR text is a form XObject and the scan is an image XObject. Removing
 * the first invocation and keeping the second replaces the text layer without
 * touching a single pixel of the scan — no render, no re-encode, no loss, and
 * a smaller file than it started with, because nothing was recompressed.
 *
 * Two shapes of text are removed: an invocation of a form whose XObject holds
 * text, and inline `BT … ET` blocks. Returns false when the stream will not
 * parse or when text and artwork are too entangled to separate, and the caller
 * falls back to rasterising — losing fidelity, but never silently: the page is
 * reported so the operator knows which pages paid.
 */
function stripPageText(doc: PDFDocument, page: PDFPage): boolean {
  try {
    const context = doc.context
    const contents = page.node.get(PDFName.of("Contents"))
    const resolved = contents ? context.lookup(contents) : null
    const streams: PDFRawStream[] = []
    if (resolved instanceof PDFRawStream) streams.push(resolved)
    else if (resolved instanceof PDFArray) {
      for (const ref of resolved.asArray()) {
        const s = context.lookup(ref)
        if (s instanceof PDFRawStream) streams.push(s)
      }
    }
    if (streams.length === 0) return false

    // Which named XObjects on this page are text-bearing forms? A form whose
    // own stream contains text operators is a text layer, whatever it is
    // called; the `/OCR-…` naming is a convention, not a guarantee.
    const xobjects = page.node.Resources()?.get(PDFName.of("XObject"))
    const textForms = new Set<string>()
    const xobjectDict = xobjects ? context.lookup(xobjects) : null
    if (xobjectDict instanceof PDFDict) {
      for (const [key, ref] of xobjectDict.asMap()) {
        const name = key.asString().replace(/^\//, "")
        const target = context.lookup(ref)
        if (!(target instanceof PDFRawStream)) continue
        const subtype = target.dict.get(PDFName.of("Subtype"))
        if (String(subtype) !== "/Form") continue
        let inner = ""
        try {
          inner = Buffer.from(decodePDFRawStream(target).decode()).toString("latin1")
        } catch {
          continue
        }
        if (/\bBT\b/.test(inner)) textForms.add(name)
      }
    }

    let changed = false
    for (const stream of streams) {
      let source: string
      try {
        source = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1")
      } catch {
        return false
      }
      // Inline text blocks first, then the invocations of text-bearing forms.
      let next = source.replace(/\bBT\b[\s\S]*?\bET\b/g, "")
      for (const name of textForms) {
        next = next.replace(new RegExp(`/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+Do\\b`, "g"), "")
      }
      if (next === source) continue
      // A stream that still shows an image is a page that kept its artwork.
      context.assign(
        context.getObjectRef(stream) ?? context.register(stream),
        context.flateStream(next)
      )
      changed = true
    }
    return changed
  } catch {
    return false
  }
}

export type RepairResult = {
  /** The repaired PDF. */
  bytes: Buffer
  pagesReplaced: number[]
  /** Pages whose text was laid out without measured boxes. */
  pagesApproximate: number[]
  /**
   * Pages whose content stream would not give up its text, so the page was
   * re-rendered and its original artwork replaced. Lossy — reported so the
   * operator can see which pages paid, instead of the whole library paying
   * silently as it did before.
   */
  pagesRasterised: number[]
}

/**
 * What the embedded font can actually write.
 *
 * The invisible layer is drawn with a standard font, and standard fonts are
 * WinAnsi: the first accepted transcription of a diagram page carried a "√"
 * and pdf-lib refused the WHOLE apply with `WinAnsi cannot encode "√"`. A
 * character the font cannot carry must not veto a page of text it can, so
 * anything unencodable becomes a space — a word boundary, not a wrong glyph,
 * and honest about what the text layer holds: search will not find a root
 * sign either way.
 */
function winAnsiSafe(text: string, font: { getCharacterSet: () => number[] }) {
  const encodable = winAnsiSetOf(font)
  let dropped = 0
  const safe = [...text]
    .map((ch) => {
      if (ch === "\n" || ch === "\t" || encodable.has(ch.codePointAt(0) ?? -1)) return ch
      dropped += 1
      return " "
    })
    .join("")
  return { safe, dropped }
}

const winAnsiSets = new WeakMap<object, Set<number>>()
function winAnsiSetOf(font: { getCharacterSet: () => number[] }) {
  let set = winAnsiSets.get(font)
  if (!set) {
    set = new Set(font.getCharacterSet())
    winAnsiSets.set(font, set)
  }
  return set
}

/**
 * The no-geometry layout: text in reading order down the page. Selection and
 * search work; the highlight rectangle is approximate, which the review record
 * says plainly. Shared by the whole-page fallback and by any block that
 * arrived without a box.
 */
function drawFlowText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  width: number,
  height: number,
  pageNumber: number
) {
  const { safe, dropped } = winAnsiSafe(text, font)
  if (dropped > 0) console.warn(`[textLayerRepair] p${pageNumber}: ${dropped} unencodable character(s) became spaces`)
  const lines = safe.split("\n").filter((line) => line.trim())
  const lineHeight = Math.min(14, Math.max(8, (height - 72) / Math.max(1, lines.length)))
  lines.forEach((line, lineIndex) => {
    page.drawText(line, {
      x: 36,
      y: height - 36 - lineIndex * lineHeight,
      size: Math.max(4, lineHeight * 0.75),
      font,
      opacity: 0,
      // A long transcribed line must not silently vanish off the edge.
      maxWidth: width - 72,
      lineHeight,
    })
  })
}

type PlacedBlock = NonNullable<PageTranscription["blocks"]>[number]

/**
 * A body block inside its box: horizontal lines from the box's top, sized so
 * the block's lines fill its height. Keeping body glyphs inside the body's own
 * box — rather than flowed across the whole sheet — is half of what makes a
 * margin note selectable without grabbing body text: the other half is the
 * note's own placement, and this is what keeps the two from overlapping.
 */
function drawBoxedBody(
  page: PDFPage,
  font: PDFFont,
  block: PlacedBlock,
  pageHeight: number,
  pageNumber: number
) {
  const box = block.box!
  const { safe, dropped } = winAnsiSafe(block.text, font)
  if (dropped > 0) console.warn(`[textLayerRepair] p${pageNumber}: ${dropped} unencodable character(s) became spaces`)
  const lines = safe.split("\n").filter((line) => line.trim())
  if (lines.length === 0) return
  const lineHeight = Math.min(14, Math.max(4, box.height / lines.length))
  lines.forEach((line, lineIndex) => {
    page.drawText(line, {
      x: box.x,
      y: pageHeight - box.yTop - (lineIndex + 1) * lineHeight,
      size: Math.max(4, lineHeight * 0.75),
      font,
      opacity: 0,
      maxWidth: Math.max(36, box.width),
      lineHeight,
    })
  })
}

/** Break one run of words into lines no wider than `limit` at this size. */
function wrapToWidth(font: PDFFont, text: string, size: number, limit: number) {
  const lines: string[] = []
  let current = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(candidate, size) > limit) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * A non-body block inside its box, at its angle: lines centred on the box's
 * centre, baselines rotated by the block's own slope (pdf-lib rotates about
 * the text origin), so the invisible glyphs lie along the note they stand for
 * and a selection dragged across the note follows the note.
 *
 * The geometry is projection, not layout: the box's extent ALONG the baseline
 * direction bounds the line length, its extent ACROSS bounds the stack of
 * lines. Precision beyond that buys nothing — the glyphs are invisible, and
 * what matters is that they sit over the note at its slope rather than over
 * the body.
 *
 * WRAPPING IS NOT OPTIONAL, and shrinking the type is not a substitute for it.
 * Readers report a note's text however they please: the panel that read page
 * 67 of *The Universal Traveler* returned each hand-lettered note as a single
 * 245-character line. An earlier version shrank the font until that one line
 * fit the box's along-extent and drew it centred — which at the 4pt floor is
 * still ~490pt of type centred on a box 208pt wide, so the note's opening ran
 * off the left edge of the sheet and vanished from the text layer entirely.
 * The tail selected; the first thirty words did not exist. So the text is
 * wrapped to the box at a size the box can hold, and only then centred.
 */
function drawAngledBlock(
  page: PDFPage,
  font: PDFFont,
  block: PlacedBlock,
  pageHeight: number,
  pageNumber: number
) {
  const box = block.box!
  const { safe, dropped } = winAnsiSafe(block.text, font)
  if (dropped > 0) console.warn(`[textLayerRepair] p${pageNumber}: ${dropped} unencodable character(s) became spaces`)
  const paragraphs = safe.split("\n").map((line) => line.trim()).filter(Boolean)
  if (paragraphs.length === 0) return

  const radians = (block.angleDegrees * Math.PI) / 180
  // Baseline direction, and the direction successive lines advance — the
  // reader's "rightward" and "downward", rotated with the text. PDF y is up.
  const alongX = Math.cos(radians)
  const alongY = Math.sin(radians)
  const acrossX = Math.sin(radians)
  const acrossY = -Math.cos(radians)

  /**
   * How much room a line has INSIDE the box, along the baseline and across it.
   *
   * Inscribed, not circumscribed. The obvious formula — `w·|cos| + h·|sin|` —
   * measures the rotated box's own bounding extent, which is longer than any
   * line that actually fits through the centre: at 25° in a 175×195pt box it
   * says 241pt, and a 241pt line centred on the box overhangs 21pt at each
   * end. On a note in the left margin that overhang is off the sheet, which is
   * exactly the clipping the wrapping was added to prevent. A line through the
   * centre is bounded by whichever pair of box edges it reaches first.
   */
  const inscribed = (unitX: number, unitY: number) =>
    Math.min(
      Math.abs(unitX) > 1e-6 ? box.width / Math.abs(unitX) : Infinity,
      Math.abs(unitY) > 1e-6 ? box.height / Math.abs(unitY) : Infinity
    )
  const extentAlong = inscribed(alongX, alongY)
  const extentAcross = inscribed(acrossX, acrossY)

  /**
   * The largest size whose wrapped stack still fits the box, tried downwards
   * from ordinary body size. A note that will not fit even at the floor keeps
   * the floor and overflows a little across — better a note whose last line
   * sits slightly outside its box than a note with no beginning.
   */
  let size = 12
  let lines = paragraphs.flatMap((paragraph) => wrapToWidth(font, paragraph, size, extentAlong))
  while (size > 4 && lines.length * size * 1.2 > extentAcross) {
    size -= 1
    lines = paragraphs.flatMap((paragraph) => wrapToWidth(font, paragraph, size, extentAlong))
  }
  const lineHeight = Math.min(14, Math.max(size * 1.2, extentAcross / Math.max(1, lines.length)))

  const centerX = box.x + box.width / 2
  const centerY = pageHeight - box.yTop - box.height / 2
  lines.forEach((line, lineIndex) => {
    const offset = (lineIndex - (lines.length - 1) / 2) * lineHeight
    const lineWidth = font.widthOfTextAtSize(line, size)
    page.drawText(line, {
      x: centerX + acrossX * offset - (alongX * lineWidth) / 2,
      y: centerY + acrossY * offset - (alongY * lineWidth) / 2,
      size,
      font,
      opacity: 0,
      rotate: degrees(block.angleDegrees),
    })
  })
}

/**
 * Replace the text layer of the named pages with accepted transcriptions.
 *
 * Returns new bytes; the input is never mutated. The caller decides whether the
 * result is an improvement — this function does not judge, and deliberately so:
 * the same measurement that found the damage should decide whether it is gone,
 * and it can only do that after re-extraction.
 */
export async function repairPageTextLayers(
  original: Buffer,
  transcriptions: PageTranscription[]
): Promise<RepairResult> {
  if (transcriptions.length === 0) {
    return { bytes: original, pagesReplaced: [], pagesApproximate: [], pagesRasterised: [] }
  }

  const pdfjsLib = await loadPdfjs()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(original),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    wasmUrl: pdfjsWasmUrl(),
    useWasm: false,
  })
  const source = await loadingTask.promise

  const doc = await PDFDocument.load(new Uint8Array(original))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pagesReplaced: number[] = []
  const pagesApproximate: number[] = []
  /** Pages that lost their original artwork to a re-render. Named, never silent. */
  const pagesRasterised: number[] = []

  try {
    for (const transcription of transcriptions) {
      const index = transcription.pageNumber - 1
      if (index < 0 || index >= doc.getPageCount()) continue

      const existing = doc.getPage(index)
      const { width, height } = existing.getSize()

      /**
       * Keep the page and take only its text out. The page's own artwork —
       * the scan, at whatever resolution it was scanned — is never touched,
       * so a repair costs nothing in fidelity. Only when the content stream
       * resists does the old rasterising path run.
       */
      let replacement = existing
      if (!stripPageText(doc, existing)) {
        const page = await source.getPage(transcription.pageNumber)
        // The page's OWN resolution, not a constant: rendering a 400dpi scan
        // at 200 is what made the library soft. Derived from the largest image
        // the page paints, floored at the old constant and capped for sanity.
        let dpi = REPLACEMENT_DPI
        try {
          const ops = await page.getOperatorList()
          const viewportAt1 = page.getViewport({ scale: 1 })
          for (let op = 0; op < ops.fnArray.length; op++) {
            if (ops.fnArray[op] !== pdfjsLib.OPS.paintImageXObject) continue
            const name = String(ops.argsArray[op][0])
            const painted = (await new Promise<unknown>((resolve) => {
              try {
                page.objs.get(name, resolve)
              } catch {
                resolve(null)
              }
            })) as { width?: number } | null
            if (painted?.width && viewportAt1.width > 0) {
              dpi = Math.max(dpi, (painted.width / viewportAt1.width) * PDF_POINTS_PER_INCH)
            }
          }
        } catch {
          // No usable image measurement; the floor stands.
        }
        dpi = Math.min(dpi, MAX_REPLACEMENT_DPI)

        const viewport = page.getViewport({ scale: dpi / PDF_POINTS_PER_INCH })
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        const context = canvas.getContext("2d")
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: context, viewport }).promise

        // A fresh page carrying the image and nothing else. Inserting rather
        // than editing is what guarantees the old text operators are gone —
        // leaving them would give the page two overlapping text layers, and a
        // selection would pick up both the garbage and the correction.
        const image = await doc.embedPng(canvas.toBuffer("image/png"))
        replacement = doc.insertPage(index, [width, height])
        replacement.drawImage(image, { x: 0, y: 0, width, height })
        doc.removePage(index + 1)
        pagesRasterised.push(transcription.pageNumber)
        console.warn(
          `[textLayerRepair] p${transcription.pageNumber}: content stream would not yield its text; ` +
            `re-rendered at ${Math.round(dpi)}dpi (the page's own resolution)`
        )
      }

      // Invisible but selectable: opacity 0 keeps the glyphs out of the render
      // while leaving them in the text layer, which is what a text layer is.
      const boxes = transcription.boxes
      const blocks = transcription.blocks
      if (blocks && blocks.length > 0) {
        // Body first, then every other block — content-stream order is what a
        // selection walks, and this is the order that keeps a copied paragraph
        // whole. See the blocks field's own note.
        const bodyBlocks = blocks.filter((block) => block.role === "body")
        const noteBlocks = blocks.filter((block) => block.role !== "body")
        const unplaced: string[] = []
        for (const block of bodyBlocks) {
          if (!block.text.trim()) continue
          if (!block.box) {
            unplaced.push(block.text)
            continue
          }
          // Body is usually upright, and upright body is laid out as lines
          // that wrap — which reads better for a paragraph than a rotated
          // run. But body can be angled too: a sheet scanned sideways is all
          // body at 90°, and so is the arced display type on a title page.
          // Angle decides the GEOMETRY; role still decides the ORDER, so an
          // angled body block is drawn here, before any note.
          if (Math.abs(block.angleDegrees) >= UPRIGHT_TOLERANCE_DEG) {
            drawAngledBlock(replacement, font, block, height, transcription.pageNumber)
          } else {
            drawBoxedBody(replacement, font, block, height, transcription.pageNumber)
          }
        }
        for (const block of noteBlocks) {
          if (!block.text.trim() || block.box) continue
          unplaced.push(block.text)
        }
        if (unplaced.length > 0) {
          pagesApproximate.push(transcription.pageNumber)
          drawFlowText(replacement, font, unplaced.join("\n"), width, height, transcription.pageNumber)
        }
        for (const block of noteBlocks) {
          if (!block.text.trim() || !block.box) continue
          drawAngledBlock(replacement, font, block, height, transcription.pageNumber)
        }
      } else if (boxes && boxes.length > 0) {
        for (const box of boxes) {
          if (!box.text.trim()) continue
          const { safe, dropped } = winAnsiSafe(box.text, font)
          if (dropped > 0) console.warn(`[textLayerRepair] p${transcription.pageNumber}: ${dropped} unencodable character(s) became spaces`)
          if (!safe.trim()) continue
          replacement.drawText(safe, {
            x: box.x,
            y: box.y,
            size: Math.max(4, box.height * 0.8),
            font,
            opacity: 0,
          })
        }
      } else {
        pagesApproximate.push(transcription.pageNumber)
        drawFlowText(replacement, font, transcription.text, width, height, transcription.pageNumber)
      }

      pagesReplaced.push(transcription.pageNumber)
    }
  } finally {
    await destroyPdf(source, loadingTask)
  }

  return {
    bytes: Buffer.from(await doc.save()),
    pagesReplaced,
    pagesApproximate,
    pagesRasterised,
  }
}
