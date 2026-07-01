/**
 * Server-side canonical text extraction for PDF pages, used to seed
 * `sourcePages` when a reading is added to the library, and to (re)validate
 * highlight offsets in `createByte`.
 *
 * This intentionally uses the legacy Node build of pdfjs-dist (no DOM/worker
 * dependency) rather than the browser build used by the PdfViewer component.
 */
import path from "path"

export interface ExtractedPage {
  pageNumber: number
  textContent: string
}

export async function extractPdfPageText(data: Buffer): Promise<ExtractedPage[]> {
  // Loaded dynamically (and from the legacy Node entrypoint) so this module
  // stays safe to import from server actions without pulling in browser-only
  // code paths.
  const pdfjsPath = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.mjs"
  )
  const pdfjsLib = await import(/* webpackIgnore: true */ pdfjsPath)

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
    // Join items the same way the browser text layer concatenates spans, so
    // offsets computed against this string stay meaningful relative to what
    // a user actually selects in the rendered text layer.
    const text = textContent.items
      .map((item: { str?: string }) => item.str ?? "")
      .join("")
    pages.push({ pageNumber, textContent: text })
  }

  await doc.destroy()
  return pages
}
