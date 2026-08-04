/**
 * Finding damaged regions of a reading, and asking several models to read them.
 *
 * The two halves are deliberately separate acts. Detection is cheap, pure and
 * repeatable — it reads stored page text and the file's own geometry, and can be
 * run over a whole library without consequence. Transcription costs money, takes
 * a minute, and produces something a person then has to accept, so it happens
 * one region at a time and writes a proposal rather than a change.
 *
 * Nothing here modifies a reading. `source_repair.appliedAt` is the only thing
 * that says a repair reached a student, and it is written elsewhere.
 */
import { and, eq } from "drizzle-orm"
import { createCanvas } from "@napi-rs/canvas"
import { db } from "@/db"
import { sourcePages, sourceRepairs, sourceRepairReadings } from "@/db/schema"
import { destroyPdf, loadPdfjs, pdfjsWasmUrl } from "@/lib/pdfjs"
import { locateGarbleRegions } from "@/lib/garbleRegion"
import { reportGarble } from "@/lib/garble"
import { computeConsensus } from "@/lib/repairConsensus"
import { readingStorage } from "@/lib/storage"
import { VISION_READERS, requestVisionCompletion } from "@/lib/openrouter"

/**
 * Render scale for the crops a model reads and a person reviews. Higher than
 * the probe's, because small type in a photographed newspaper is the case this
 * exists for and it is exactly where resolution decides whether a word is
 * legible at all.
 */
const CROP_DPI = 300
const PDF_POINTS_PER_INCH = 72

/** Regions per source per run. A reading with more damage than this needs a
 * different remedy than transcription, and should be re-sourced instead. */
const MAX_REGIONS_PER_SOURCE = 12

export function repairCropKey(sourceId: string, pageNumber: number, index: number) {
  return `repairs/${sourceId}/p${pageNumber}-${index}.png`
}

/**
 * Find the damaged regions of a reading and record them as proposals.
 *
 * Replaces any proposals that have not yet been accepted: detection is
 * repeatable, so re-running should refresh what has not been decided while
 * leaving decisions alone. An accepted or applied row is never touched.
 */
export async function detectRepairsForSource(
  sourceId: string,
  buffer: Buffer,
  storageKey: string
) {
  const pages = await db
    .select({ pageNumber: sourcePages.pageNumber, textContent: sourcePages.textContent })
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, sourceId))

  const garble = reportGarble(pages)
  const damagedPages = new Set(
    garble.worst.filter((page) => page.rate > 0).map((page) => page.pageNumber)
  )
  if (damagedPages.size === 0) return { regions: 0, pagesExamined: garble.pagesMeasured }

  await db
    .delete(sourceRepairs)
    .where(and(eq(sourceRepairs.sourceId, sourceId), eq(sourceRepairs.status, "proposed")))

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
  const scale = CROP_DPI / PDF_POINTS_PER_INCH
  let created = 0

  try {
    for (const pageNumber of [...damagedPages].sort((a, b) => a - b)) {
      if (created >= MAX_REGIONS_PER_SOURCE) break
      const page = await doc.getPage(pageNumber)
      const regions = await locateGarbleRegions(page, scale)
      if (regions.length === 0) continue

      const viewport = page.getViewport({ scale })
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = canvas.getContext("2d")
      context.fillStyle = "#ffffff"
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport }).promise

      const pageText = pages.find((p) => p.pageNumber === pageNumber)?.textContent ?? ""

      for (const [index, region] of regions.entries()) {
        if (created >= MAX_REGIONS_PER_SOURCE) break
        const crop = createCanvas(region.width, region.height)
        crop
          .getContext("2d")
          .drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)

        const cropKey = repairCropKey(sourceId, pageNumber, index)
        await readingStorage.put(cropKey, crop.toBuffer("image/png"))

        await db.insert(sourceRepairs).values({
          sourceId,
          pageNumber,
          measuredAgainstKey: storageKey,
          region: { ...region, scale },
          cropKey,
          currentText: pageText.slice(0, 4000),
          garbledWords: region.words,
          garbleRate: garble.worst.find((p) => p.pageNumber === pageNumber)?.rate ?? null,
        })
        created += 1
      }
    }
  } finally {
    await destroyPdf(doc, loadingTask)
  }

  return { regions: created, pagesExamined: garble.pagesMeasured }
}

const TRANSCRIBE_SYSTEM =
  "You transcribe text from images of printed and handwritten documents. You report exactly what is " +
  "on the page and nothing else. You would rather return a short honest transcription than a complete " +
  "invented one."

function transcribePrompt(garbledWords: string[]) {
  return (
    `Transcribe ALL text visible in this image, VERBATIM and in reading order.\n\n` +
    `This is a region of a course reading whose extracted text is corrupted. What the PDF currently ` +
    `believes is here reads: ${JSON.stringify(garbledWords.slice(0, 12))}. That is the damage — do not ` +
    `reproduce it, and do not let it steer your reading.\n\n` +
    `Rules that matter more than completeness:\n` +
    `- Transcribe what is ON THE PAGE, not what you think it should say. Keep the original's own ` +
    `spelling, typos and archaisms.\n` +
    `- Do NOT use outside knowledge to fill a gap. If you recognise the document, that must not change ` +
    `a single character of what you report — recognising it is when invention is most likely.\n` +
    `- If you cannot read something, list it in "uncertain" rather than guessing.\n` +
    `- Some text may be rotated; say so in "orientation".\n\n` +
    `Several readers are transcribing this independently. Your value is an honest reading, not a ` +
    `confident one — where you are unsure, saying so is the useful answer.\n\n` +
    `Reply with ONLY a JSON object, no prose and no code fence:\n` +
    `{"orientation":"...","text":"...","uncertain":["..."],"illegibleShare":"none|some|much|most"}`
  )
}

type ParsedReading = {
  text: string
  uncertain: string[]
  illegibleShare: "none" | "some" | "much" | "most" | null
  /**
   * The model ran out of room mid-transcription. The text it did produce is
   * real, but it is not a reading of the WHOLE region — so it is kept as a
   * record and excluded from the vote, because its missing passages would
   * otherwise register as disagreement with the readers who finished.
   */
  truncated: boolean
}

/**
 * Tolerant parse: models are told JSON only and drift anyway, so pull the
 * outermost braces rather than trusting the whole string. A reading that cannot
 * be parsed is dropped rather than guessed at — one fewer reader is a weaker
 * vote, which is honest; a fabricated reader is a false one.
 */
export function parseReading(raw: string): ParsedReading | null {
  const start = raw.indexOf("{")
  if (start === -1) return null
  const end = raw.lastIndexOf("}")

  let parsed: unknown = null
  if (end > start) {
    try {
      parsed = JSON.parse(raw.slice(start, end + 1))
    } catch {
      parsed = null
    }
  }

  // Truncated output has no closing brace, or has one that does not close valid
  // JSON. The transcription inside is still real and worth recording, so pull
  // the text field out by hand rather than discarding the call.
  if (parsed === null) {
    const match = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/)
    if (!match) return null
    let salvaged: string
    try {
      salvaged = JSON.parse(`"${match[1]}"`)
    } catch {
      return null
    }
    if (!salvaged.trim()) return null
    return { text: salvaged, uncertain: [], illegibleShare: null, truncated: true }
  }

  if (typeof parsed !== "object") return null
  const object = parsed as Record<string, unknown>
  const text = typeof object.text === "string" ? object.text : ""
  if (!text.trim()) return null
  const share = object.illegibleShare
  return {
    text,
    uncertain: Array.isArray(object.uncertain)
      ? object.uncertain.filter((item): item is string => typeof item === "string").slice(0, 40)
      : [],
    illegibleShare:
      share === "none" || share === "some" || share === "much" || share === "most" ? share : null,
    truncated: false,
  }
}

/**
 * Have the panel read one region, and record what they agreed and where they
 * differed.
 *
 * Readers run concurrently — they are independent by design, so there is
 * nothing to serialise — and a reader that errors or returns unparseable output
 * is simply absent. Consensus is computed from whoever answered.
 */
export async function transcribeRepairRegion(repairId: string) {
  const rows = await db.select().from(sourceRepairs).where(eq(sourceRepairs.id, repairId)).limit(1)
  const repair = rows[0]
  if (!repair) throw new Error("Repair not found")

  const crop = await readingStorage.get(repair.cropKey)
  const imageBase64 = crop.toString("base64")
  const message = transcribePrompt(repair.garbledWords)

  const results = await Promise.all(
    VISION_READERS.map(async (reader, index) => {
      const startedAt = Date.now()
      try {
        const { text, usage } = await requestVisionCompletion({
          system: TRANSCRIBE_SYSTEM,
          message,
          imageBase64,
          model: reader.model,
          tokenParam: reader.tokenParam,
        })
        const parsed = parseReading(text)
        return parsed
          ? {
              ...parsed,
              model: reader.model,
              reader: index + 1,
              usage,
              durationMs: Date.now() - startedAt,
            }
          : null
      } catch (error) {
        console.warn(`[repair] ${reader.model} failed on ${repairId}`, error)
        return null
      }
    })
  )

  const readings = results.filter((result): result is NonNullable<typeof result> => result !== null)
  if (readings.length === 0) throw new Error("No reader returned a usable transcription")

  await db.delete(sourceRepairReadings).where(eq(sourceRepairReadings.repairId, repairId))
  await db.insert(sourceRepairReadings).values(
    readings.map((reading) => ({
      repairId,
      model: reading.model,
      reader: reading.reader,
      text: reading.text,
      uncertain: reading.uncertain,
      illegibleShare: reading.illegibleShare,
      promptTokens: reading.usage.promptTokens,
      completionTokens: reading.usage.completionTokens,
      costUsd: reading.usage.costUsd,
      durationMs: reading.durationMs,
      truncated: reading.truncated,
    }))
  )

  // Truncated readers are stored but kept out of the vote: they stopped early
  // rather than disagreeing, and counting their silence as dissent would send a
  // reviewer to passages nobody actually read differently.
  const complete = readings.filter((reading) => !reading.truncated)
  const consensus = computeConsensus(
    (complete.length >= 2 ? complete : readings).map((r) => ({ reader: r.reader, text: r.text }))
  )
  await db
    .update(sourceRepairs)
    .set({
      agreedText: consensus.agreedText,
      disagreements: consensus.disagreements,
      votes: consensus.votes,
    })
    .where(eq(sourceRepairs.id, repairId))

  // Null when any reader did not report — an unknown total, not a free one.
  const costs = readings.map((reading) => reading.usage.costUsd)
  const costUsd = costs.some((cost) => cost == null)
    ? null
    : costs.reduce((total: number, cost) => total + (cost ?? 0), 0)

  return { readers: readings.length, complete: complete.length, costUsd, ...consensus }
}
