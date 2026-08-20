/**
 * The client half of scripts/check-text-parity.ts, in its own process.
 *
 * Two pdf.js versions cannot share a process: the Node "fake worker" registers
 * itself on globalThis, so whichever build loads second finds the first one's
 * worker and dies on the version handshake. This helper loads ONLY react-pdf's
 * nested pdfjs-dist, extracts the fixture's text items, and prints JSON.
 *
 * Usage: node scripts/check-text-parity-client.mjs <fixture.pdf>
 */
import path from "node:path"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)

const fixturePath = process.argv[2]
if (!fixturePath) {
  console.error("usage: node check-text-parity-client.mjs <fixture.pdf>")
  process.exit(2)
}

// Resolved through react-pdf, the same way copy-pdf-worker.mjs finds the
// worker — so a hoist or a nest cannot land us on the wrong copy.
const reactPdfEntry = require.resolve("react-pdf")
const pdfjsPkg = require.resolve("pdfjs-dist/package.json", { paths: [path.dirname(reactPdfEntry)] })
const pdfjsDir = path.dirname(pdfjsPkg)
const lib = await import(pathToFileURL(path.join(pdfjsDir, "legacy", "build", "pdf.mjs")).href)
lib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(pdfjsDir, "legacy", "build", "pdf.worker.mjs")
).href

const data = new Uint8Array(readFileSync(fixturePath))
const loadingTask = lib.getDocument({
  data,
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
})
const doc = await loadingTask.promise

const pages = []
for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
  const page = await doc.getPage(pageNumber)
  const content = await page.getTextContent()
  // The DOM text-layer string: item strings concatenated with nothing between
  // them (a <br> contributes nothing to textContent).
  pages.push({ pageNumber, text: content.items.map((item) => item.str ?? "").join("") })
}

if (typeof doc.destroy === "function") await doc.destroy()
else if (typeof loadingTask.destroy === "function") await loadingTask.destroy()

console.log(JSON.stringify({ version: require(pdfjsPkg).version, pages }))
