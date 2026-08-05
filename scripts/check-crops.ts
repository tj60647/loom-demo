/**
 * Assertions for the picture a reader is actually sent.
 *
 * Everything else in `npm run check` is a pure function over strings, which is
 * why none of it noticed the failure that prompted this file: a reviewer was
 * shown a blank image for a page that renders perfectly, five models were sent
 * that blank image, and the only feedback was "No reader returned a usable
 * transcription". Nothing in the suite rendered a pixel, so nothing could have
 * caught it — not a wrong region box, not a rotation the box ignored, not a
 * page that renders empty in one environment and not another.
 *
 * So this asserts the three things that make a crop worth sending, against real
 * PDFs rather than fixtures:
 *
 *   1. the located box lies inside the rendered page
 *   2. the crop's pixels are the box's dimensions
 *   3. the crop has ink in it
 *
 * Like `check:textlayer`, it needs real files and is therefore not part of the
 * default `check` run. It reads whatever PDFs are in `storage/readings/`, and
 * says so plainly when there are none rather than passing on an empty set — a
 * check that silently examines nothing is worse than no check.
 *
 *   npx tsx scripts/check-crops.ts
 *   npx tsx scripts/check-crops.ts path/to/one.pdf
 */
import { readFile, readdir } from "fs/promises"
import path from "path"
import { createCanvas } from "@napi-rs/canvas"
import { destroyPdf, loadPdfjs, pdfjsWasmUrl } from "../src/lib/pdfjs"
import { locatePageRepairRegion } from "../src/lib/garbleRegion"

const CROP_DPI = 300
const PDF_POINTS_PER_INCH = 72
const MAX_CROP_EDGE = 2560
/** Matches repairPipeline's floor; a crop below it is refused there too. */
const MIN_CROP_INK = 0.002

let failures = 0
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok || !detail ? "" : `  — ${detail}`}`)
}

async function pdfPaths() {
  const fromArgs = process.argv.slice(2).filter((arg) => arg.endsWith(".pdf"))
  if (fromArgs.length > 0) return fromArgs
  const dir = path.join(process.cwd(), "storage", "readings")
  const entries = await readdir(dir).catch(() => [] as string[])
  return entries.filter((name) => name.endsWith(".pdf")).map((name) => path.join(dir, name))
}

async function run() {
  const paths = await pdfPaths()
  if (paths.length === 0) {
    console.log(
      "\n[check-crops] No PDFs to examine.\n" +
        "  This check needs real files: put some in storage/readings/ (they are gitignored)\n" +
        "  or pass a path. Reporting this rather than passing on an empty set.\n"
    )
    process.exit(1)
  }

  const pdfjsLib = await loadPdfjs()

  for (const file of paths) {
    console.log(`\n${path.basename(file)}`)
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(await readFile(file)),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      wasmUrl: pdfjsWasmUrl(),
      useWasm: false,
    })
    const doc = await task.promise
    let examined = 0
    let located = 0

    try {
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber)
        const unscaled = page.getViewport({ scale: 1 })
        const scale = Math.min(
          CROP_DPI / PDF_POINTS_PER_INCH,
          MAX_CROP_EDGE / Math.max(unscaled.width, unscaled.height)
        )
        const region = await locatePageRepairRegion(page, pageNumber, scale)
        examined += 1
        if (!region) continue
        located += 1

        const viewport = page.getViewport({ scale })
        const width = Math.ceil(viewport.width)
        const height = Math.ceil(viewport.height)

        check(
          `p${pageNumber}: box sits inside the page`,
          region.x >= 0 &&
            region.y >= 0 &&
            region.width > 0 &&
            region.height > 0 &&
            region.x + region.width <= width &&
            region.y + region.height <= height,
          `box ${region.x},${region.y} ${region.width}x${region.height} in ${width}x${height}`
        )

        const canvas = createCanvas(width, height)
        const context = canvas.getContext("2d")
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, width, height)
        await page.render({ canvasContext: context, viewport }).promise

        const crop = createCanvas(region.width, region.height)
        const cropContext = crop.getContext("2d")
        cropContext.drawImage(
          canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height
        )

        check(
          `p${pageNumber}: crop is the size of its box`,
          crop.width === region.width && crop.height === region.height,
          `${crop.width}x${crop.height} vs ${region.width}x${region.height}`
        )

        const { data } = cropContext.getImageData(0, 0, region.width, region.height)
        let marked = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 10 && (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245)) marked += 1
        }
        const ink = marked / (region.width * region.height)
        check(
          `p${pageNumber}: crop has something in it`,
          ink >= MIN_CROP_INK,
          `${(ink * 100).toFixed(3)}% ink — a reader sent this would see a blank page`
        )
      }
    } finally {
      await destroyPdf(doc, task)
    }

    console.log(`  ${examined} page(s) examined, ${located} proposed for repair`)
  }

  console.log(
    failures === 0 ? "\n[check-crops] all assertions passed\n" : `\n[check-crops] ${failures} FAILED\n`
  )
  process.exit(failures === 0 ? 0 : 1)
}

run()
