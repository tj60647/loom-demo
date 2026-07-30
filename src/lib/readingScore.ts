/**
 * Extraction-quality scoring for library readings.
 *
 * The question this answers is not "is this a good reading?" but "did this PDF
 * survive text extraction well enough to be usable inside Loom?" — can students
 * quote from it, and will their highlight offsets anchor? A scanned photocopy
 * with no text layer looks identical to a clean digital PDF on the library
 * card; it is useless the moment someone tries to capture a byte from it.
 *
 * Two passes, mirroring the guide's eval runner in the Colloquy repo:
 *
 *   1. Deterministic. Computed at upload time from the pages already in hand,
 *      so it costs nothing and is stable across runs. Produces `coverage`,
 *      `legibility`, and `anchorability`.
 *   2. LLM judge (optional). Reads a handful of sampled pages and answers the
 *      two questions no heuristic can: is this legible prose or confident-
 *      looking garbage, and did extraction preserve reading order? Refines
 *      `legibility` and fills in `structure`.
 *
 * The judge is best-effort by design. No key, a network error, or unparseable
 * output leaves the row at `status: "heuristic"` with `structure` null, rather
 * than folding a guess in as a real score.
 */
import { db } from "@/db"
import { sourcePages, sourceScores } from "@/db/schema"
import { asc, eq } from "drizzle-orm"
import type { ExtractionMetrics } from "@/lib/types"
import { isJudgeConfigured, judgeModelName, requestChatCompletion } from "@/lib/openrouter"

/**
 * Characters on a page below which there is nothing worth quoting. Chosen to
 * clear a running header and folio (~40 chars) by a wide margin while still
 * counting a sparse page — a section title page, a figure with a caption.
 */
const PAGE_TEXT_FLOOR = 120

/**
 * Characters a page needs before highlight offsets are meaningful. Higher than
 * the floor above: a page can have real text and still be too thin for offset
 * anchoring to survive a re-extraction.
 */
const ANCHOR_TEXT_FLOOR = 300

/** Pages sampled for the judge, and how much of each to send. */
const JUDGE_SAMPLE_PAGES = 4
const JUDGE_SAMPLE_CHARS = 1200

// U+FFFD replacement, C0/C1 control codes (minus tab/newline/CR), and the BMP
// private use area — the three signatures of a PDF whose fonts carry no usable
// ToUnicode map, where extraction returns glyph indices dressed up as text.
const JUNK_CHAR = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uE000-\uF8FF]/g

type ScorablePage = { pageNumber: number; textContent: string }

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

/** Maps a 0–1 ratio onto the 1–5 band scale the scores are reported in. */
function bandFromRatio(ratio: number) {
  if (ratio >= 0.98) return 5
  if (ratio >= 0.9) return 4
  if (ratio >= 0.75) return 3
  if (ratio >= 0.5) return 2
  return 1
}

export function computeExtractionMetrics(
  pages: ScorablePage[],
  { coverRendered }: { coverRendered: boolean }
): ExtractionMetrics {
  const lengths = pages.map((page) => page.textContent.length)
  const totalChars = lengths.reduce((sum, length) => sum + length, 0)
  const junkChars = pages.reduce(
    (sum, page) => sum + (page.textContent.match(JUNK_CHAR)?.length ?? 0),
    0
  )

  return {
    pageCount: pages.length,
    pagesWithText: pages.filter((page) => page.textContent.length >= PAGE_TEXT_FLOOR).length,
    totalChars,
    medianCharsPerPage: median(lengths),
    junkCharRatio: totalChars > 0 ? junkChars / totalChars : 0,
    coverRendered,
  }
}

type HeuristicScores = {
  coverage: number | null
  legibility: number | null
  anchorability: number | null
  notes: string
}

export function scoreFromMetrics(metrics: ExtractionMetrics, pages: ScorablePage[]): HeuristicScores {
  // No pages at all means extraction produced nothing to judge — every
  // dimension abstains rather than reporting a confident 1.
  if (metrics.pageCount === 0) {
    return {
      coverage: null,
      legibility: null,
      anchorability: null,
      notes: "No page text was extracted — the PDF is likely scanned images with no text layer.",
    }
  }

  const coverage = bandFromRatio(metrics.pagesWithText / metrics.pageCount)

  let legibility: number
  if (metrics.totalChars === 0) legibility = 1
  else if (metrics.junkCharRatio <= 0.001) legibility = 5
  else if (metrics.junkCharRatio <= 0.005) legibility = 4
  else if (metrics.junkCharRatio <= 0.02) legibility = 3
  else if (metrics.junkCharRatio <= 0.05) legibility = 2
  else legibility = 1

  // A document whose pages carry only a header's worth of text extracts
  // "cleanly" by the junk measure while being useless to read. Cap it.
  if (metrics.medianCharsPerPage < 200) legibility = Math.min(legibility, 3)

  const anchorablePages = pages.filter(
    (page) => page.textContent.length >= ANCHOR_TEXT_FLOOR
  ).length
  const anchorability =
    metrics.totalChars === 0 ? 1 : bandFromRatio(anchorablePages / metrics.pageCount)

  const parts = [
    `${metrics.pagesWithText}/${metrics.pageCount} pages have extractable text`,
    `median ${metrics.medianCharsPerPage.toLocaleString()} chars/page`,
  ]
  if (metrics.junkCharRatio > 0.005) {
    parts.push(`${(metrics.junkCharRatio * 100).toFixed(1)}% unreadable characters`)
  }
  if (!metrics.coverRendered) parts.push("cover preview failed to render")

  return { coverage, legibility, anchorability, notes: `${parts.join("; ")}.` }
}

type Dimensions = {
  coverage: number | null
  legibility: number | null
  anchorability: number | null
  structure: number | null
}

/**
 * Mean of the dimensions that actually have a value. An unscored dimension
 * abstains — folding it in as a zero would make "we didn't check" look like
 * "we checked and it failed".
 */
export function overallFromDimensions(dimensions: Dimensions) {
  // Read the four dimensions by name rather than via Object.values: callers
  // build this object by spreading the heuristic result, which also carries a
  // `notes` string, and a value-wise filter would happily sum it into NaN.
  const scored = [
    dimensions.coverage,
    dimensions.legibility,
    dimensions.anchorability,
    dimensions.structure,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value))

  if (scored.length === 0) return null
  const mean = scored.reduce((sum, value) => sum + value, 0) / scored.length
  return Math.round(mean * 10) / 10
}

/**
 * Is this reading usable in Loom?
 *
 * Every scored dimension must clear the bar, not just the mean. The dimensions
 * are not compensatory: a PDF whose fonts have no ToUnicode map scores 5 on
 * coverage and anchorability (every page is full of characters, and offsets
 * anchor to them fine) while being pure mojibake — averaging to 3.7 and calling
 * it usable is exactly the failure this score exists to catch.
 */
export function passFromDimensions(dimensions: Dimensions) {
  const overall = overallFromDimensions(dimensions)
  if (overall == null || dimensions.coverage == null) return null

  const scored = [
    dimensions.coverage,
    dimensions.legibility,
    dimensions.anchorability,
    dimensions.structure,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value))

  return overall >= 3 && Math.min(...scored) >= 3
}

// --- LLM JUDGE ---

/** Pages spread evenly through the document, skipping ones with nothing to read. */
function sampleForJudge(pages: ScorablePage[]) {
  const usable = pages.filter((page) => page.textContent.length >= PAGE_TEXT_FLOOR)
  if (usable.length === 0) return []

  const step = Math.max(1, Math.floor(usable.length / JUDGE_SAMPLE_PAGES))
  const sampled: ScorablePage[] = []
  for (let index = 0; index < usable.length && sampled.length < JUDGE_SAMPLE_PAGES; index += step) {
    sampled.push(usable[index])
  }
  return sampled
}

export function buildJudgePrompt(sample: ScorablePage[]) {
  const excerpts = sample
    .map((page) => `--- PAGE ${page.pageNumber} ---\n${page.textContent.slice(0, JUDGE_SAMPLE_CHARS)}`)
    .join("\n\n")

  return (
    `The text below was extracted from a PDF by pdf.js. Judge the QUALITY OF THE ` +
    `EXTRACTION, not the quality of the writing — a brilliant essay that extracted ` +
    `as mojibake scores 1, and a dull memo that extracted perfectly scores 5.\n\n` +
    `Note that the extractor joins text runs without inserting spaces, so missing ` +
    `spaces between words are expected and must NOT be penalised.\n\n` +
    `legibility: are these real, readable words in a real script? 5 = clean text. ` +
    `1 = mojibake, glyph soup, or character substitution making it unreadable.\n\n` +
    `structure: did extraction preserve reading order? 5 = paragraphs follow in the ` +
    `order a human would read them. 1 = columns interleaved line by line, footnotes ` +
    `spliced mid-sentence, or headers/page furniture scattered through the body.\n\n` +
    `EXTRACTED TEXT:\n${excerpts}\n\n` +
    `Respond with ONLY a JSON object, no prose, no code fence:\n` +
    `{"legibility": 1-5, "structure": 1-5, "notes": "one sentence"}`
  )
}

export type JudgeVerdict = { legibility: number; structure: number; notes: string }

/**
 * Tolerant JSON extraction: the judge is told "JSON only" but models drift, so
 * pull the outermost braces rather than trusting the whole string to parse.
 * Returns null when the output cannot be trusted — the caller records that as
 * unscored rather than substituting a default.
 */
export function parseJudgeVerdict(text: string): JudgeVerdict | null {
  const raw = String(text ?? "")
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null

  const obj = parsed as Record<string, unknown>
  const clamp = (value: unknown) => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : null
  }

  const legibility = clamp(obj.legibility)
  const structure = clamp(obj.structure)
  if (legibility == null || structure == null) return null

  return {
    legibility,
    structure,
    notes: typeof obj.notes === "string" ? obj.notes.slice(0, 500) : "",
  }
}

async function judgeExtraction(sample: ScorablePage[]): Promise<JudgeVerdict | null> {
  // One retry: the failure mode being retried is prose leaking around the JSON,
  // which a second sample usually clears.
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await requestChatCompletion({
      system: "You are a strict, terse evaluator of PDF text extraction. Output only the requested JSON object.",
      message: buildJudgePrompt(sample),
    })
    const verdict = parseJudgeVerdict(answer)
    if (verdict) return verdict
  }
  return null
}

// --- PERSISTENCE ---

type ScoreRow = typeof sourceScores.$inferInsert

async function upsertScore(row: ScoreRow) {
  await db
    .insert(sourceScores)
    .values(row)
    .onConflictDoUpdate({ target: sourceScores.sourceId, set: { ...row, scoredAt: new Date() } })
}

/**
 * Deterministic pass. Called inline from createSource with the pages already in
 * memory, so it adds no queries and no latency worth measuring.
 */
export async function recordHeuristicScore(
  sourceId: string,
  pages: ScorablePage[],
  { coverRendered }: { coverRendered: boolean }
) {
  const metrics = computeExtractionMetrics(pages, { coverRendered })
  const heuristic = scoreFromMetrics(metrics, pages)
  const dimensions: Dimensions = {
    coverage: heuristic.coverage,
    legibility: heuristic.legibility,
    anchorability: heuristic.anchorability,
    // Reading order needs the judge; null until it runs.
    structure: null,
  }

  await upsertScore({
    sourceId,
    status: metrics.pageCount === 0 ? "unscorable" : "heuristic",
    coverage: heuristic.coverage,
    legibility: heuristic.legibility,
    anchorability: heuristic.anchorability,
    structure: null,
    overall: overallFromDimensions(dimensions),
    pass: passFromDimensions(dimensions),
    notes: heuristic.notes,
    judgeNotes: "",
    judgeModel: null,
    metrics,
  })
}

/**
 * Judge pass. Safe to call for any source: it re-reads the stored pages, and
 * returns without touching the row when there is nothing to judge or no judge
 * configured. Never throws — a scoring failure must not surface as an upload
 * failure, since by the time this runs the upload has already succeeded.
 */
export async function judgeSourceScore(sourceId: string) {
  if (!isJudgeConfigured()) return

  try {
    const rows = await db
      .select()
      .from(sourceScores)
      .where(eq(sourceScores.sourceId, sourceId))
      .limit(1)
    const existing = rows[0]
    if (!existing || existing.status === "unscorable") return

    const pages = await db
      .select({ pageNumber: sourcePages.pageNumber, textContent: sourcePages.textContent })
      .from(sourcePages)
      .where(eq(sourcePages.sourceId, sourceId))
      .orderBy(asc(sourcePages.pageNumber))

    const sample = sampleForJudge(pages)
    if (sample.length === 0) return

    const verdict = await judgeExtraction(sample)
    if (!verdict) return

    // The judge overrides legibility — it read the words, the heuristic only
    // counted bytes. Coverage and anchorability stay as computed: those are
    // measurements, and a model's opinion of them is worth less.
    const dimensions = {
      coverage: existing.coverage,
      legibility: verdict.legibility,
      anchorability: existing.anchorability,
      structure: verdict.structure,
    }

    await db
      .update(sourceScores)
      .set({
        status: "judged",
        legibility: verdict.legibility,
        structure: verdict.structure,
        overall: overallFromDimensions(dimensions),
        pass: passFromDimensions(dimensions),
        judgeNotes: verdict.notes,
        judgeModel: judgeModelName(),
        scoredAt: new Date(),
      })
      .where(eq(sourceScores.sourceId, sourceId))
  } catch (error) {
    console.warn(`[Loom] Extraction judge failed for source ${sourceId}`, error)
  }
}

/** Re-runs both passes for an existing reading, e.g. after the rubric changes. */
export async function rescoreSource(sourceId: string) {
  const pages = await db
    .select({ pageNumber: sourcePages.pageNumber, textContent: sourcePages.textContent })
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, sourceId))
    .orderBy(asc(sourcePages.pageNumber))

  const rows = await db
    .select({ metrics: sourceScores.metrics })
    .from(sourceScores)
    .where(eq(sourceScores.sourceId, sourceId))
    .limit(1)

  // Cover rendering is decided at upload time and not re-tested here; carry the
  // previous verdict forward rather than silently reporting a failure as a pass.
  await recordHeuristicScore(sourceId, pages, {
    coverRendered: rows[0]?.metrics?.coverRendered ?? true,
  })
  await judgeSourceScore(sourceId)
}
