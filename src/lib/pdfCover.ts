import path from "path"
import { pathToFileURL } from "url"
import { createCanvas } from "@napi-rs/canvas"

const COVER_SCALE = 0.38
/** How far to look for a page with ink on it before giving up on a cover. */
const COVER_PAGE_ATTEMPTS = 4

function isCanvasVisuallyBlank(context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height)
  let meaningfulPixels = 0
  const sampleStride = 16

  for (let index = 0; index < data.length; index += 4 * sampleStride) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const alpha = data[index + 3]

    if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
      meaningfulPixels += 1
      if (meaningfulPixels >= 24) {
        return false
      }
    }
  }

  return true
}

export function getSourceCoverKey(sourceId: string) {
  return `covers/${sourceId}.png`
}

export async function renderPdfCoverImage(data: Buffer): Promise<Buffer> {
  const pdfjsPath = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.mjs"
  )
  const pdfjsWasmPath = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/wasm/"
  )
  const pdfjsUrl = pathToFileURL(pdfjsPath).href
  const pdfjsWasmUrl = pathToFileURL(pdfjsWasmPath).href
  const pdfjsLib = await import(/* webpackIgnore: true */ pdfjsUrl)

  // See the note in pdfText.ts: pdf.js loads its worker module even in Node,
  // and the path it derives on its own is what fails once bundled.
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
    wasmUrl: pdfjsWasmUrl,
    useWasm: false,
  })
  const doc = await loadingTask.promise

  try {
    // Scanned books routinely open on a blank recto or an empty inside cover,
    // so page 1 being blank is normal rather than a failure. Walk forward to
    // the first page that actually has ink on it; only give up if the opening
    // pages are all empty.
    const lastPage = Math.min(COVER_PAGE_ATTEMPTS, doc.numPages)
    for (let pageNumber = 1; pageNumber <= lastPage; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: COVER_SCALE })
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = canvas.getContext("2d")

      context.fillStyle = "#f8f6ef"
      context.fillRect(0, 0, canvas.width, canvas.height)

      await page.render({ canvasContext: context, viewport }).promise

      if (!isCanvasVisuallyBlank(context, canvas.width, canvas.height)) {
        return canvas.toBuffer("image/png")
      }
    }

    throw new Error(
      `First ${lastPage} page${lastPage === 1 ? "" : "s"} rendered blank — no cover image`
    )
  } finally {
    if (typeof (doc as { destroy?: () => Promise<void> }).destroy === "function") {
      await (doc as { destroy: () => Promise<void> }).destroy()
    } else if (
      typeof (loadingTask as { destroy?: () => Promise<void> }).destroy === "function"
    ) {
      await (loadingTask as { destroy: () => Promise<void> }).destroy()
    }
  }
}