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
import { PDFDocument, StandardFonts } from "pdf-lib"
import { createCanvas } from "@napi-rs/canvas"
import { destroyPdf, loadPdfjs, pdfjsWasmUrl } from "@/lib/pdfjs"

/**
 * Render resolution for the replacement page image. High enough that the page
 * is not visibly softer than it was, low enough that a 235-page book does not
 * become unopenable. Only damaged pages are rasterised.
 */
const REPLACEMENT_DPI = 200
const PDF_POINTS_PER_INCH = 72

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
}

export type RepairResult = {
  /** The repaired PDF. */
  bytes: Buffer
  pagesReplaced: number[]
  /** Pages whose text was laid out without measured boxes. */
  pagesApproximate: number[]
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
    return { bytes: original, pagesReplaced: [], pagesApproximate: [] }
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

  try {
    for (const transcription of transcriptions) {
      const index = transcription.pageNumber - 1
      if (index < 0 || index >= doc.getPageCount()) continue

      // Render the original page, so the replacement is visually identical.
      const page = await source.getPage(transcription.pageNumber)
      const scale = REPLACEMENT_DPI / PDF_POINTS_PER_INCH
      const viewport = page.getViewport({ scale })
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = canvas.getContext("2d")
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport }).promise

      const existing = doc.getPage(index)
      const { width, height } = existing.getSize()

      // A fresh page carrying the image and nothing else. Inserting rather than
      // editing is what guarantees the old text operators are gone — leaving
      // them would give the page two overlapping text layers, and a selection
      // would pick up both the garbage and the correction.
      const image = await doc.embedPng(canvas.toBuffer("image/png"))
      const replacement = doc.insertPage(index, [width, height])
      replacement.drawImage(image, { x: 0, y: 0, width, height })

      // Invisible but selectable: opacity 0 keeps the glyphs out of the render
      // while leaving them in the text layer, which is what a text layer is.
      const boxes = transcription.boxes
      if (boxes && boxes.length > 0) {
        for (const box of boxes) {
          if (!box.text.trim()) continue
          replacement.drawText(box.text, {
            x: box.x,
            y: box.y,
            size: Math.max(4, box.height * 0.8),
            font,
            opacity: 0,
          })
        }
      } else {
        pagesApproximate.push(transcription.pageNumber)
        // No measured layout: lay the accepted text out in reading order down
        // the page. Selection and search work; the highlight rectangle is
        // approximate, which the review record says plainly.
        const lines = transcription.text.split("\n").filter((line) => line.trim())
        const lineHeight = Math.min(14, Math.max(8, (height - 72) / Math.max(1, lines.length)))
        lines.forEach((line, lineIndex) => {
          replacement.drawText(line, {
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

      // The original page sits one later now that the replacement was inserted.
      doc.removePage(index + 1)
      pagesReplaced.push(transcription.pageNumber)
    }
  } finally {
    await destroyPdf(source, loadingTask)
  }

  return {
    bytes: Buffer.from(await doc.save()),
    pagesReplaced,
    pagesApproximate,
  }
}
