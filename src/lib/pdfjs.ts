/**
 * Locating pdf.js, once.
 *
 * Three server-side modules need the library — canonical text extraction
 * (pdfText.ts), cover rendering (pdfCover.ts) and the structural probe
 * (pdfStructure.ts) — and the *path wiring* is the fragile part, not the usage.
 * It has caused two production failures on its own:
 *
 *   - The runtime import is marked `webpackIgnore`, which hides it from output
 *     file tracing, so the legacy build was left out of the Lambda entirely and
 *     extraction died with "Cannot find module .../pdf.worker.mjs".
 *   - pdf.js loads its worker module even in Node (a "fake worker"), and the
 *     path it derives for itself is the one that fails once bundled — so
 *     `workerSrc` has to be set explicitly.
 *
 * next.config.ts keeps all three paths in the traced output. Keeping the
 * resolution here means a fourth caller cannot get it subtly wrong, and there is
 * one place to change if the layout of the package moves.
 *
 * Deliberately NOT shared: the `getDocument` options. Each caller passes its
 * own. `extractPdfPageText`'s options in particular decide the exact text every
 * stored highlight offset was measured against, so they are not something a
 * shared helper should be free to "improve".
 */
import path from "path"
import { pathToFileURL } from "url"

/** Minimal shape of the bits of pdf.js these modules actually use. */
export type PdfjsLib = {
  getDocument: (options: Record<string, unknown>) => {
    promise: Promise<PdfDocumentProxy>
    destroy?: () => Promise<void>
  }
  GlobalWorkerOptions: { workerSrc: string }
  OPS: Record<string, number>
}

export type PdfDocumentProxy = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
  destroy?: () => Promise<void>
}

export type PdfPageProxy = {
  rotate: number
  view: number[]
  getViewport: (options: { scale: number }) => { width: number; height: number; rotation: number }
  getTextContent: () => Promise<{ items: unknown[] }>
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>
  render: (options: Record<string, unknown>) => { promise: Promise<void> }
}

function nodeModulePath(...segments: string[]) {
  return path.join(process.cwd(), "node_modules", ...segments)
}

/**
 * The legacy Node build, not the browser one: no DOM and no real worker, so it
 * is safe to import from a server action.
 */
export async function loadPdfjs(): Promise<PdfjsLib> {
  // Windows absolute paths (e.g. C:\...) must be imported via a file:// URL.
  const url = pathToFileURL(nodeModulePath("pdfjs-dist", "legacy", "build", "pdf.mjs")).href
  const pdfjsLib = (await import(/* webpackIgnore: true */ url)) as PdfjsLib

  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    nodeModulePath("pdfjs-dist", "legacy", "build", "pdf.worker.mjs")
  ).href

  return pdfjsLib
}

/**
 * Where pdf.js finds its WASM codecs. Needed by anything that decodes page
 * images — a scanned reading whose pages are JPX/JBIG2 will otherwise warn
 * "Ensure that the `wasmUrl` API parameter is provided" and render nothing.
 */
export function pdfjsWasmUrl() {
  return pathToFileURL(nodeModulePath("pdfjs-dist", "wasm/")).href
}

/**
 * Release a document. pdf.js legacy builds disagree on where `destroy` lives —
 * on the document in some versions, only on the loading task in others (the
 * installed build has it on neither in the Node path), so try both and tolerate
 * finding it nowhere.
 */
export async function destroyPdf(
  doc: { destroy?: () => Promise<void> },
  loadingTask: { destroy?: () => Promise<void> }
) {
  if (typeof doc.destroy === "function") {
    await doc.destroy()
  } else if (typeof loadingTask.destroy === "function") {
    await loadingTask.destroy()
  }
}
