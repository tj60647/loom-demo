import path from "path"
import { pathToFileURL } from "url"
import { createCanvas } from "@napi-rs/canvas"

const COVER_SCALE = 0.38

export function getSourceCoverKey(sourceId: string) {
  return `covers/${sourceId}.png`
}

export async function renderPdfCoverImage(data: Buffer): Promise<Buffer> {
  const pdfjsPath = path.join(
    process.cwd(),
    "node_modules/pdfjs-dist/legacy/build/pdf.mjs"
  )
  const pdfjsUrl = pathToFileURL(pdfjsPath).href
  const pdfjsLib = await import(/* webpackIgnore: true */ pdfjsUrl)

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const doc = await loadingTask.promise

  try {
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: COVER_SCALE })
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext("2d")

    context.fillStyle = "#f8f6ef"
    context.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: context, viewport }).promise
    return canvas.toBuffer("image/png")
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