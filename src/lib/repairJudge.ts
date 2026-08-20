/**
 * The judge for a split panel — chooses among the readings, never writes one.
 *
 * The five-reader vote settles most pages, but a genuinely damaged page splits
 * it: on this library's first full run, every transcribed page came back with
 * sentence-level disagreements, which under the unanimity policy meant every
 * page landed on a person. TJ's publishing plan (§6) names the remedy and its
 * boundary in the same breath: a judge model may be used for disputed passages
 * only, and "should not be asked to produce a new unconstrained transcription
 * — it should select among supported candidates or mark the passage as
 * ambiguous."
 *
 * So this judge is shown the crop and the complete candidate transcriptions,
 * and returns a READER NUMBER or "ambiguous". Its choice is a whole reading a
 * panelist actually wrote — the same constraint computeConsensus lives under,
 * for the same reason: the one repair this pipeline ever shipped that was
 * fluent, plausible and wrong was a model's own composition, not a reader's.
 * An ambiguous verdict (or a judge error) leaves the repair exactly where it
 * was: proposed, for a person.
 *
 * The judge is deliberately OFF the panel. A panelist judging its own reading
 * against four rivals is not an arbiter, so the model here is one whose
 * readings are not among the candidates — GPT-5.6 Sol Pro, which was removed
 * from the panel for drawing 79% of a region's spend, a profile that does not
 * matter for a handful of disputed pages.
 */
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { sourceRepairs, sourceRepairReadings } from "@/db/schema"
import { readingStorage } from "@/lib/storage"
import { requestVisionCompletion } from "@/lib/openrouter"

export const REPAIR_JUDGE_MODEL = "openai/gpt-5.6-sol-pro"

/** Disagreements shown to the judge — enough to focus it, not the whole list. */
const MAX_DISPUTES_SHOWN = 8

const JUDGE_SYSTEM =
  "You compare candidate transcriptions of a document image against the image itself. " +
  "You never write your own transcription. Your only outputs are a verdict about which " +
  "candidate is most faithful, or the honest admission that the image does not decide it."

function judgePrompt(
  candidates: { reader: number; model: string; text: string }[],
  disputes: { passage: string; readings: string[] }[]
) {
  const listing = candidates
    .map(
      (candidate) =>
        `--- CANDIDATE ${candidate.reader} ---\n${candidate.text}`
    )
    .join("\n\n")
  const disputeLines = disputes
    .slice(0, MAX_DISPUTES_SHOWN)
    .map((dispute) => `- ${JSON.stringify(dispute.readings.slice(0, 4))}`)
    .join("\n")

  return (
    `The image is a region of a scanned course reading. ${candidates.length} independent readers ` +
    `transcribed it and disagreed in places. The candidates:\n\n${listing}\n\n` +
    `Places they differ (variants side by side):\n${disputeLines}\n\n` +
    `Compare the candidates against what is actually VISIBLE in the image and pick the one that ` +
    `transcribes it most faithfully — original spelling, punctuation and reading order included.\n\n` +
    `Rules:\n` +
    `- You may NOT compose your own transcription or merge candidates. The verdict is one candidate, whole.\n` +
    `- Faithfulness to the image outranks fluency. A candidate that reproduces the page's oddities beats ` +
    `one that silently corrects them.\n` +
    `- If the image genuinely cannot settle the differences — too blurred, too small, cropped — say ` +
    `"ambiguous" rather than guessing. That is a useful verdict, not a failure.\n\n` +
    `Reply with ONLY a JSON object, no prose and no code fence:\n` +
    `{"choice": <candidate number or "ambiguous">, "confidence": "high"|"low", "why": "one sentence naming the decisive evidence"}`
  )
}

export type JudgeVerdictResult =
  | { outcome: "chosen"; reader: number; model: string; text: string; why: string; costUsd: number | null }
  | { outcome: "ambiguous"; why: string; costUsd: number | null }

/**
 * Ask the judge to arbitrate one disputed repair. Throws on transport/parse
 * failure — the caller records the repair as still held, which is also what an
 * "ambiguous" verdict means; the difference is only in the reporting.
 */
export async function arbitrateRepair(repairId: string): Promise<JudgeVerdictResult> {
  const rows = await db.select().from(sourceRepairs).where(eq(sourceRepairs.id, repairId)).limit(1)
  const repair = rows[0]
  if (!repair) throw new Error("Repair not found")
  if (!repair.votes) throw new Error("Nothing to arbitrate — the panel has not read this region")

  const readings = await db
    .select()
    .from(sourceRepairReadings)
    .where(eq(sourceRepairReadings.repairId, repairId))

  // Same rule the vote applies: a truncated reader stopped early rather than
  // disagreeing, and a partial transcription must not win the whole page.
  const candidates = readings
    .filter((reading) => !reading.truncated && reading.text.trim())
    .map((reading) => ({ reader: reading.reader, model: reading.model, text: reading.text }))
  if (candidates.length < 2) {
    throw new Error("Fewer than two complete candidates — nothing for a judge to choose between")
  }

  const crop = await readingStorage.get(repair.cropKey)
  const { text, usage } = await requestVisionCompletion({
    system: JUDGE_SYSTEM,
    message: judgePrompt(candidates, repair.disagreements),
    imageBase64: crop.toString("base64"),
    model: REPAIR_JUDGE_MODEL,
    tokenParam: "max_completion_tokens",
    maxTokens: 16000,
  })

  // Same tolerant parse as the readers: braces out of whatever came back.
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error(`Judge returned no JSON (${text.slice(0, 80)}…)`)
  const parsed = JSON.parse(text.slice(start, end + 1)) as {
    choice?: unknown
    confidence?: unknown
    why?: unknown
  }
  const why = typeof parsed.why === "string" ? parsed.why.slice(0, 400) : ""

  if (parsed.choice === "ambiguous" || parsed.confidence === "low") {
    return { outcome: "ambiguous", why: why || "the judge could not settle it from the image", costUsd: usage.costUsd }
  }

  const chosen = candidates.find((candidate) => candidate.reader === Number(parsed.choice))
  if (!chosen) {
    // A choice outside the candidate list is a judge error, not a verdict.
    throw new Error(`Judge chose "${String(parsed.choice)}", which is not a candidate`)
  }

  return {
    outcome: "chosen",
    reader: chosen.reader,
    model: chosen.model,
    text: chosen.text,
    why,
    costUsd: usage.costUsd,
  }
}
