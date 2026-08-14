/**
 * The hash contract between the two pdf.js builds, checked before it breaks.
 *
 * Two pdf.js versions read every reading: the top-level pdfjs-dist extracts
 * the canonical page text (src/lib/pdfText.ts), and react-pdf's own nested
 * pdfjs-dist renders the text layer the student actually selects from. Every
 * stored highlight offset assumes the two agree — precisely, that
 * `textLayerProjection(serverText)` equals the client DOM string, and that
 * their FNV hashes therefore match (`passages.pageContentHash`). Today they
 * do, on every page measured. Nothing enforces it: a react-pdf or pdfjs bump
 * that changes item segmentation or synthesized spacing flips every stored
 * hash at once — each highlight silently demotes to fuzzy matching, and the
 * peer overlay (hash-gated, no fallback, by design) stops shading entirely.
 *
 * This check extracts a generated fixture with BOTH installed builds and
 * fails when the strings drift, so the demotion happens in CI instead of in
 * class. The fixture is generated, not committed: pdf-lib output is
 * deterministic for fixed input, and a binary fixture would rot unseen.
 */
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { extractPdfPageText, textLayerProjection } from "../src/lib/pdfText"
import { hashText } from "../src/lib/hash"

let failures = 0
function ok(name: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok    ${name}`)
  } else {
    failures += 1
    console.error(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

/** Prose with the seams that have actually diverged between builds: wrapped
 *  lines, hyphenation, punctuation tight against words, and numerals. */
const FIXTURE_TEXT = [
  "The Universal Traveler proposes a soft-systems guide to creativity, problem-solving,",
  "and the process of reaching goals — a 1972 handbook, recoded and re-set.",
  "Design is more than a style option; corporate propaganda notwithstanding, the",
  "reader's own line-breaks (and em-dashes) survive extraction, or they do not.",
  "Page offsets are measured in characters: 1,234 of them, give or take none.",
].join("\n")

async function buildFixture(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  for (let pageIndex = 0; pageIndex < 2; pageIndex++) {
    const page = doc.addPage([612, 792])
    page.drawText(`Fixture page ${pageIndex + 1}.`, { x: 72, y: 720, size: 14, font })
    page.drawText(FIXTURE_TEXT, { x: 72, y: 680, size: 11, font, lineHeight: 16, maxWidth: 468 })
  }
  return Buffer.from(await doc.save())
}

/**
 * The client half runs in a child process (check-text-parity-client.mjs):
 * two pdf.js versions cannot share a process, because the Node fake worker
 * registers on globalThis and the second build finds the first one's worker.
 */
function extractWithClientBuild(fixture: Buffer): { version: string; pages: { pageNumber: number; text: string }[] } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "loom-parity-"))
  const fixturePath = path.join(dir, "fixture.pdf")
  try {
    writeFileSync(fixturePath, fixture)
    const stdout = execFileSync(
      process.execPath,
      [path.join(__dirname, "check-text-parity-client.mjs"), fixturePath],
      { encoding: "utf8" }
    )
    return JSON.parse(stdout.trim())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const fixture = await buildFixture()

  // Server side: the exact canonical path every reading goes through.
  const serverPages = await extractPdfPageText(fixture)

  const client = extractWithClientBuild(fixture)
  console.log(`[check-text-parity] client build: pdfjs-dist@${client.version}`)

  for (const serverPage of serverPages) {
    const clientString = client.pages.find((page) => page.pageNumber === serverPage.pageNumber)?.text ?? ""
    const projected = textLayerProjection(serverPage.textContent)

    ok(
      `page ${serverPage.pageNumber}: projection equals the client string`,
      projected === clientString,
      projected === clientString
        ? undefined
        : `server(projected) ${projected.length} chars vs client ${clientString.length} chars; ` +
            `first divergence at ${[...projected].findIndex((ch, i) => ch !== clientString[i])}`
    )
    ok(
      `page ${serverPage.pageNumber}: hashes agree`,
      hashText(projected) === hashText(clientString)
    )
    ok(
      `page ${serverPage.pageNumber}: projection round-trips the separator`,
      textLayerProjection(serverPage.textContent) === serverPage.textContent.split("\n").join("")
    )
  }

  if (failures > 0) {
    console.error(
      `\n[check-text-parity] ${failures} FAILED — the two pdf.js builds no longer agree on page text. ` +
        `Every stored pageContentHash breaks on the next render: do not ship this pair of versions ` +
        `without a re-anchoring plan.`
    )
    process.exit(1)
  }
  console.log(`\n[check-text-parity] all assertions passed`)
}

main().catch((error) => {
  console.error("[check-text-parity] failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
