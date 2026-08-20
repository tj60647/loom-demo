/**
 * Triage the library: score every reading's text extraction, name the defect
 * behind a bad one, and say which repair it needs.
 *
 * Strictly read-only. It writes no files, no blobs and no rows — the point of
 * this pass is to decide what SHOULD be done before anything is done, because
 * the repairs are not interchangeable and the wrong one destroys a good text
 * layer (see src/lib/extractionDiagnosis.ts).
 *
 * Timing matters more than it looks. A student's highlight is anchored to the
 * text layer of the PDF as it was when they made it, so replacing a reading's
 * passages after a cohort has worked on it breaks their anchors. Run this before a
 * course opens, not during it.
 *
 * Usage:
 *   npx tsx scripts/diagnose-readings.ts                      # the shared library, from the DB
 *   npx tsx scripts/diagnose-readings.ts --own                # include student-uploaded readings
 *   npx tsx scripts/diagnose-readings.ts path/to/a.pdf ...    # local files, no DB or blob needed
 *   npx tsx scripts/diagnose-readings.ts --json out.json      # machine-readable alongside the report
 *
 * The DB mode requires DATABASE_URL and blob credentials (.env.local); the local
 * file mode requires neither, which makes it the way to try this on a PDF that
 * is not in the library yet.
 */
import { readFileSync } from "fs"
import path from "path"
import { eq } from "drizzle-orm"
import { extractPdfPageText } from "../src/lib/pdfText"
import { probePdfStructure } from "../src/lib/pdfStructure"
import {
  computeExtractionMetrics,
  overallFromDimensions,
  passFromDimensions,
  scoreFromMetrics,
} from "../src/lib/readingScore"
import { diagnoseExtraction, type Diagnosis } from "../src/lib/extractionDiagnosis"
import type { ExtractionMetrics } from "../src/lib/types"

type Reading = { id: string; title: string; load: () => Promise<Buffer> }

type Report = {
  id: string
  title: string
  pageCount: number
  overall: number | null
  pass: boolean | null
  remedy: string
  metrics: ExtractionMetrics
  diagnosis: Diagnosis
  fonts: { name: string; glyphCount: number; unmappedGlyphs: number }[]
  error?: string
}

const args = process.argv.slice(2)
const jsonFlag = args.indexOf("--json")
const jsonPath = jsonFlag === -1 ? null : args[jsonFlag + 1]
const includeOwn = args.includes("--own")
// Guard the "no --json" case explicitly: jsonFlag is then -1, and skipping
// index jsonFlag + 1 would silently drop the FIRST file off the command line.
const jsonValueIndex = jsonFlag === -1 ? -1 : jsonFlag + 1
const localFiles = args.filter(
  (arg, index) => !arg.startsWith("--") && index !== jsonValueIndex
)

async function readingsFromDatabase(): Promise<Reading[]> {
  // Imported lazily so the local-file mode does not need DATABASE_URL just to
  // load this module.
  const { db, databaseLabel } = await import("../src/db")
  const { sources } = await import("../src/db/schema")
  const { readingStorage } = await import("../src/lib/storage")

  // Say which database this is before reporting a word about its contents. The
  // library looks much the same in every environment, so a report from the
  // wrong one is not obviously wrong.
  console.log(`[diagnose] database: ${databaseLabel()}`)

  const rows = await db
    .select({
      id: sources.id,
      title: sources.title,
      storageKey: sources.storageKey,
      isOwn: sources.isOwn,
    })
    .from(sources)
    .where(includeOwn ? undefined : eq(sources.isOwn, false))

  return rows
    .filter((row) => row.storageKey)
    .map((row) => ({
      id: row.id,
      title: row.title,
      load: () => readingStorage.get(row.storageKey!),
    }))
}

function readingsFromFiles(files: string[]): Reading[] {
  return files.map((file) => ({
    id: file,
    title: path.basename(file),
    load: async () => readFileSync(file),
  }))
}

async function diagnose(reading: Reading): Promise<Report> {
  const buffer = await reading.load()

  // Both passes over the same passages: the canonical text the app itself stores,
  // and the structural probe that can see what the text cannot.
  const pages = await extractPdfPageText(buffer)
  const structure = await probePdfStructure(buffer)

  // coverRendered is a fact about a separate pipeline and is not re-tested here;
  // this pass makes no claim about it either way.
  const metrics = computeExtractionMetrics(pages, { coverRendered: true, structure })
  const heuristic = scoreFromMetrics(metrics, pages)
  const dimensions = {
    coverage: heuristic.coverage,
    legibility: heuristic.legibility,
    anchorability: heuristic.anchorability,
    // The judge is a separate, optional pass; this report does not call it.
    structure: null,
  }

  return {
    id: reading.id,
    title: reading.title,
    pageCount: metrics.pageCount,
    overall: overallFromDimensions(dimensions),
    pass: passFromDimensions(dimensions),
    remedy: "",
    metrics,
    diagnosis: diagnoseExtraction(metrics, structure.fonts),
    fonts: structure.fonts,
  }
}

function formatReport(report: Report) {
  const lines: string[] = []
  const score = report.overall == null ? "unscored" : report.overall.toFixed(1)
  const verdict = report.pass === false ? "NEEDS REVIEW" : report.pass === true ? "ok" : "unscored"

  lines.push(`\n${report.title}`)
  if (report.error) {
    lines.push(`  could not be read: ${report.error}`)
    return lines.join("\n")
  }

  lines.push(`  ${report.pageCount} pages · extraction ${score} · ${verdict}`)

  const { metrics: m } = report
  const facts = [
    `${m.pagesWithText}/${m.pageCount} pages with text`,
    `median ${m.medianCharsPerPage} chars/page`,
  ]
  if (m.glyphCount != null) facts.push(`${m.glyphCount.toLocaleString()} glyphs`)
  if (m.unmappedGlyphRatio) facts.push(`${(m.unmappedGlyphRatio * 100).toFixed(1)}% unmapped`)
  if (m.glyphNameLeaks) facts.push(`${m.glyphNameLeaks} glyph-name leaks`)
  if (m.punctuationInWord) facts.push(`${m.punctuationInWord} punct-in-word`)
  if (m.spreadPages) facts.push(`${m.spreadPages} spread pages`)
  lines.push(`  ${facts.join(" · ")}`)

  for (const defect of report.diagnosis.defects) {
    lines.push(`  [${defect.kind}] (${defect.confidence}) → ${defect.remedy}`)
    for (const line of defect.evidence) lines.push(`      ${line}`)
  }
  if (report.diagnosis.defects.length === 0) {
    lines.push(`  ${report.diagnosis.summary}`)
  }
  for (const gap of report.diagnosis.notMeasured) {
    lines.push(`  not measured: ${gap}`)
  }

  // Only worth printing when a font is actually implicated — otherwise it is
  // noise on every clean reading.
  const broken = report.fonts.filter((font) => font.unmappedGlyphs > 0)
  if (broken.length > 0) {
    lines.push(`  fonts with unmapped glyphs:`)
    for (const font of broken.slice(0, 5)) {
      const share = ((font.unmappedGlyphs / font.glyphCount) * 100).toFixed(1)
      lines.push(`      ${font.name}: ${font.unmappedGlyphs}/${font.glyphCount} (${share}%)`)
    }
  }

  return lines.join("\n")
}

async function main() {
  const readings =
    localFiles.length > 0 ? readingsFromFiles(localFiles) : await readingsFromDatabase()

  if (readings.length === 0) {
    console.log("[diagnose] no readings found")
    return
  }

  console.log(`[diagnose] examining ${readings.length} reading${readings.length === 1 ? "" : "s"}`)

  const reports: Report[] = []
  for (const reading of readings) {
    try {
      const report = await diagnose(reading)
      report.remedy = report.diagnosis.remedy
      reports.push(report)
    } catch (error) {
      reports.push({
        id: reading.id,
        title: reading.title,
        pageCount: 0,
        overall: null,
        pass: null,
        remedy: "manual-review",
        metrics: {} as ExtractionMetrics,
        diagnosis: { defects: [], remedy: "manual-review", summary: "unreadable", notMeasured: [] },
        fonts: [],
        error: error instanceof Error ? error.message : String(error),
      })
    }
    console.log(formatReport(reports[reports.length - 1]))
  }

  // The summary is the actual deliverable: what needs doing, in what volume.
  const byRemedy = new Map<string, number>()
  for (const report of reports) {
    byRemedy.set(report.remedy, (byRemedy.get(report.remedy) ?? 0) + 1)
  }
  console.log(`\n[diagnose] ${reports.length} readings examined`)
  for (const [remedy, count] of [...byRemedy].sort((a, b) => b[1] - a[1])) {
    console.log(`[diagnose]   ${remedy}: ${count}`)
  }

  if (jsonPath) {
    const { writeFileSync } = await import("fs")
    writeFileSync(jsonPath, JSON.stringify(reports, null, 2))
    console.log(`[diagnose] wrote ${jsonPath}`)
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("[diagnose] failed:", error instanceof Error ? error.message : error)
    process.exit(1)
  }
)
