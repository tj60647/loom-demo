/**
 * Assertions for the font source the SERVER renders with — the wiring that
 * decides whether a PDF whose fonts are not embedded draws glyphs or draws
 * nothing at all.
 *
 *   npx tsx scripts/check-pdf-fonts.ts
 *
 * It earns a place in `npm run check` because the failure it guards is silent
 * and machine-shaped: with the parameter missing (or given in the wrong form)
 * pdf.js warns once and renders a white page, and on any developer machine
 * that owns a matching font the page looks fine anyway. Measured 2026-09-06
 * against c22aff33-…pdf ("As We May Think"), whose 19 stored page images came
 * out identical at 4,330 B each and pure white — 1280x1657, one distinct
 * colour, not one non-white pixel.
 *
 * The fixture is built here rather than checked in: a four-object PDF that
 * names Times-Roman and embeds nothing is the whole test case, and generating
 * it keeps the assertion legible and free of a binary nobody can read.
 */
import { existsSync, readFileSync } from "fs"
import path from "path"
import {
  destroyPdf,
  loadPdfjs,
  pdfjsStandardFontsUrl,
  pdfjsWasmUrl,
  renderFontOptions,
} from "../src/lib/pdfjs"

let failures = 0

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok && detail) console.log(`          ${detail}`)
}

/** A PDF that draws text in a font it does not carry. */
function minimalPdfWithNonEmbeddedFont(): Buffer {
  const stream = "BT /F1 24 Tf 20 100 Td (Hello Loom) Tj ET"
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Times-Roman>>",
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

// Wrapped rather than top-level await: these scripts compile as CJS under tsx,
// where a top-level await is a build error, and every other check-*.ts here
// has the same shape.
async function main() {
  console.log("\nthe font directory is addressable in the form pdf.js accepts")
  const fontsUrl = pdfjsStandardFontsUrl()
  check("ends with a trailing slash", fontsUrl.endsWith("/"), `got ${JSON.stringify(fontsUrl)}`)
  check(
    "no backslashes — pdf.js throws 'Invalid factory url' on them",
    !fontsUrl.includes("\\"),
    `got ${JSON.stringify(fontsUrl)}`
  )
  check(
    "not a file:// URL — Node's fetch cannot open one",
    !fontsUrl.startsWith("file:"),
    `got ${JSON.stringify(fontsUrl)}`
  )
  check("FoxitSerif.pfb is actually there", existsSync(path.join(fontsUrl, "FoxitSerif.pfb")))

  console.log("\nthe font files ship to the Lambda")
  const nextConfig = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8")
  check(
    "next.config.ts traces standard_fonts into the output",
    /standard_fonts/.test(nextConfig),
    "outputFileTracingIncludes must list ./node_modules/pdfjs-dist/standard_fonts/**, or the path above points at nothing once deployed"
  )

  console.log("\na PDF that embeds no font draws its glyphs with no help from the host")
  const pdfjsLib = await loadPdfjs()
  const warnings: string[] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "))
  }
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(minimalPdfWithNonEmbeddedFont()),
    useWorkerFetch: false,
    isEvalSupported: false,
    wasmUrl: pdfjsWasmUrl(),
    useWasm: false,
    ...renderFontOptions(),
  })
  const doc = await loadingTask.promise
  const page = await doc.getPage(1)
  await page.getOperatorList()
  console.warn = originalWarn
  await destroyPdf(doc, loadingTask)

  const fontWarning = warnings.find((w) => /font data|standardFontDataUrl/i.test(w))
  check("pdf.js raises no font-data warning", !fontWarning, fontWarning ?? "")
  check(
    "renderFontOptions does not fall back to the host's fonts",
    renderFontOptions().useSystemFonts === false
  )

  console.log(failures === 0 ? "\nall ok\n" : `\n${failures} failed\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
