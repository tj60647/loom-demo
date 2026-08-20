/**
 * Server-side canonical text extraction for PDF pages, used to seed
 * `sourcePages` when a reading is added to the library, and to (re)validate
 * highlight offsets in `createPassage`.
 *
 * WHERE HIGHLIGHT OFFSETS ACTUALLY LIVE. Not here. pdf.js builds the browser
 * text layer as one <span> per item plus a bare <br> after each end-of-line
 * item, and a <br> contributes nothing to `textContent` — so the DOM string is
 * the item strings concatenated with nothing between them. That DOM string is
 * what PdfViewer hashes and what every startOffset/endOffset indexes into.
 * Nothing anywhere slices this module's output by a passage offset.
 *
 * That is why this file used to join with the empty string, and why the warning
 * that once stood here — "changing any of it silently moves every existing
 * anchor" — was wrong. It doesn't. But the empty join threw away every line
 * boundary pdf.js had already worked out, and that has one real cost:
 * Postgres tokenises `CraftBuilding` as `craftbuild`, which matches neither
 * "craft" nor "building". Measured on this library, 58-77% of line ends fuse
 * two words, so reading search silently misses them.
 *
 * So the text stored here keeps the line boundaries, and `textLayerProjection`
 * below gets the browser's string back. Anything reconciling a client capture
 * against stored page text must go through it.
 *
 * See src/lib/pdfStructure.ts for the read-only probe used to *diagnose* a PDF,
 * which is free to look at whatever it likes precisely because it never
 * produces canonical text.
 */
import { destroyPdf, loadPdfjs } from "@/lib/pdfjs"

export interface ExtractedPage {
  pageNumber: number
  textContent: string
  /** Page size in PDF points, rotation applied — what getViewport({scale: 1})
   *  reports, which is the box the browser viewer will actually lay out. */
  width: number
  height: number
}

type PdfTextItem = { str?: string; hasEOL?: boolean }

/**
 * The separator, and the reason it is a newline rather than the more obvious
 * space: it has to be removable again.
 *
 * A space would be indistinguishable from the spaces pdf.js emits itself — it
 * inserts them into item strings on geometry, and emits standalone " " items —
 * so the browser's string could never be recovered and every stored offset
 * would lose its substrate. A newline is one pdf.js does not normally produce.
 */
const LINE_SEPARATOR = "\n"

/**
 * Can this page's line boundaries be recorded and taken back out again?
 *
 * Usually yes: pdf.js does not emit newlines inside item strings. But it can —
 * its whitespace test only inspects the first character of a glyph's mapping,
 * so a literal newline in a font's ToUnicode entry passes straight through, and
 * board exports (Figma and similar) do produce them. On such a page a stored
 * newline would be ambiguous — ours or the document's — and the projection
 * below would strip one that belongs to the text, corrupting every offset after
 * it. Those pages keep the old join, which is always recoverable because it
 * adds nothing.
 */
function separatorIsRecoverable(items: PdfTextItem[]) {
  return !items.some((item) => item.str?.includes(LINE_SEPARATOR))
}

function joinPageItems(items: PdfTextItem[]) {
  const recoverable = separatorIsRecoverable(items)
  let text = ""
  items.forEach((item, index) => {
    text += item.str ?? ""
    // No separator after the final item: a trailing one would be a boundary
    // with nothing on the other side of it, and would still have to be stripped.
    if (recoverable && item.hasEOL && index < items.length - 1) {
      text += LINE_SEPARATOR
    }
  })
  return text
}

/**
 * The browser's text-layer string, recovered from stored page text.
 *
 * This is the string `passages.startOffset`/`endOffset` index into and the input
 * `passages.pageContentHash` is taken over, so anything comparing a client capture
 * against stored text has to come through here first — otherwise it is
 * searching a string the client has never seen.
 *
 * Safe on rows written before the separator existed: they contain no newlines,
 * so this is the identity on them.
 */
export function textLayerProjection(pageText: string) {
  return pageText.split(LINE_SEPARATOR).join("")
}

export async function extractPdfPageText(data: Buffer): Promise<ExtractedPage[]> {
  const pdfjsLib = await loadPdfjs()

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const doc = await loadingTask.promise

  const pages: ExtractedPage[] = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1 })
    pages.push({
      pageNumber,
      textContent: joinPageItems(textContent.items as PdfTextItem[]),
      width: viewport.width,
      height: viewport.height,
    })
  }

  await destroyPdf(doc, loadingTask)
  return pages
}
