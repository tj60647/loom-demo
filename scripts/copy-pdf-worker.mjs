/**
 * Copies pdf.js's worker into public/ so the PDF viewer serves it same-origin.
 *
 * It used to come from unpkg at runtime, which made every reading in the course
 * depend on a third party being reachable: block unpkg (an extension, a campus
 * proxy, an offline room, a CDN outage) and 01 · Reading shows "Failed to load
 * PDF" for every text, blaming the file.
 *
 * The copy MUST come from react-pdf's own nested pdfjs-dist, not the top-level
 * one. This repo has two: react-pdf pins 5.4.296 for the browser, while the
 * top-level 6.1.200 is what src/lib/pdfText.ts and pdfCover.ts use on the
 * server. The worker has to match the API that loads it, so taking the
 * top-level copy would swap a CDN outage for a version mismatch.
 *
 * Runs from prebuild and predev, so the file is always present and always in
 * step with whatever npm actually installed.
 */
import { copyFileSync, mkdirSync, existsSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)

// Resolve through react-pdf so we always land on ITS pdfjs-dist, whether npm
// nested the copy or hoisted it.
const reactPdfEntry = require.resolve("react-pdf")
const pdfjsPkg = require.resolve("pdfjs-dist/package.json", { paths: [path.dirname(reactPdfEntry)] })
const pdfjsDir = path.dirname(pdfjsPkg)
const version = require(pdfjsPkg).version

const source = path.join(pdfjsDir, "build", "pdf.worker.min.mjs")
const destDir = path.join(process.cwd(), "public")
const dest = path.join(destDir, "pdf.worker.min.mjs")

if (!existsSync(source)) {
  console.error(`[pdf-worker] not found at ${source} — is pdfjs-dist installed?`)
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })
copyFileSync(source, dest)
console.log(`[pdf-worker] public/pdf.worker.min.mjs <- pdfjs-dist@${version} (react-pdf's copy)`)

// The worker alone is not the whole engine. pdf.js decodes JPX (JPEG2000) and
// ICC color through WASM codecs it fetches at runtime from `wasmUrl` — and a
// scanned reading is nothing but such images (an Internet Archive scan is
// JPX + JBIG2 page after page). Without these files the text layer still
// renders, so the failure reads as "I can select text on a blank page": every
// page image silently missing while the reading looks merely broken, not
// unconfigured. Same origin, same reasoning as the worker; the codecs MUST
// come from the same pdfjs-dist the worker came from, or versions skew.
const wasmSrcDir = path.join(pdfjsDir, "wasm")
const wasmDestDir = path.join(destDir, "pdf-wasm")
mkdirSync(wasmDestDir, { recursive: true })
for (const file of readdirSync(wasmSrcDir)) {
  copyFileSync(path.join(wasmSrcDir, file), path.join(wasmDestDir, file))
}
console.log(`[pdf-worker] public/pdf-wasm/ <- pdfjs-dist@${version} wasm codecs (${readdirSync(wasmSrcDir).length} files)`)
