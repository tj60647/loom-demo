/**
 * Assertions for the canonical-text join in src/lib/pdfText.ts.
 *
 * `extractPdfPageText` records the line boundaries pdf.js marks, so that stored
 * page text tokenises into words for search. But every stored highlight offset
 * indexes into a DIFFERENT string — the browser's text layer, which is the same
 * items concatenated with nothing between them, because pdf.js renders line ends
 * as <br> elements and a <br> contributes nothing to `textContent`.
 *
 * So the one property that must hold is REVERSIBILITY: stripping the separators
 * back out has to reproduce the browser's string exactly. If it ever does not,
 * every offset in the database is measured against a string that no longer
 * exists, silently.
 *
 * Run against real PDFs, since the failure mode is document-dependent — a board
 * export with a literal newline inside a text item is the case that breaks it:
 *
 *   npx tsx scripts/check-text-layer-projection.ts storage/readings/*.pdf
 */
import { readFileSync } from "fs"
import path from "path"
import { extractPdfPageText, textLayerProjection } from "../src/lib/pdfText"
import { loadPdfjs, destroyPdf, pdfjsWasmUrl } from "../src/lib/pdfjs"
import { hashText } from "../src/lib/hash"

let failures = 0

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`)
}

/** The browser's string, built the way pdf.js builds the DOM text layer. */
async function browserString(buffer: Buffer, pageNumber: number) {
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
    const content = await page.getTextContent()
    // pdf.js appends one <span> per item with textContent = item.str, and a bare
    // <br> for each end-of-line item. <br> contributes nothing to textContent.
    return (content.items as { str?: string }[]).map((item) => item.str ?? "").join("")
  } finally {
    await destroyPdf(doc, loadingTask)
  }
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error("[check-text-layer-projection] pass at least one PDF path")
    process.exit(1)
  }

  for (const file of files) {
    const buffer = readFileSync(file)
    const pages = await extractPdfPageText(buffer)
    console.log(`\n${path.basename(file)} — ${pages.length} pages`)

    let separated = 0
    for (const page of pages) {
      const expected = await browserString(buffer, page.pageNumber)
      const projected = textLayerProjection(page.textContent)
      if (page.textContent !== projected) separated += 1

      if (projected !== expected) {
        check(
          `page ${page.pageNumber}: projection reproduces the browser string`,
          false,
          `projected ${projected.length} chars, browser ${expected.length} chars`
        )
      }
      if (hashText(projected) !== hashText(expected)) {
        check(`page ${page.pageNumber}: projected hash matches browser hash`, false)
      }
    }

    check(
      `all ${pages.length} pages project back to the browser string exactly`,
      failures === 0
    )
    console.log(`         ${separated}/${pages.length} pages carry recorded line boundaries`)

    // The point of the exercise: words that used to fuse across a line end are
    // now separate tokens, which is what Postgres needs to index them.
    const before = pages.map((p) => textLayerProjection(p.textContent)).join(" ")
    const after = pages.map((p) => p.textContent).join(" ")
    const longBefore = before.split(/\s+/).filter((t) => t.length > 28).length
    const longAfter = after.split(/\s+/).filter((t) => t.length > 28).length
    console.log(`         run-together tokens: ${longBefore} before → ${longAfter} after`)
  }

  console.log(
    failures === 0
      ? "\n[check-text-layer-projection] all assertions passed\n"
      : `\n[check-text-layer-projection] ${failures} FAILED\n`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error("[check-text-layer-projection] failed:", error)
  process.exit(1)
})
