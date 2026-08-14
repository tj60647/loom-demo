/**
 * The reader's brief and the reader's reply — what the panel is asked, and how
 * its answers parse.
 *
 * Split out of repairPipeline.ts so the format can be asserted without a
 * database: the pipeline module initialises `db` at import, and the checks run
 * where no database exists. Everything here is pure — strings in, values out —
 * which is also what makes the reply format a contract rather than a habit.
 */
import { flattenBlocks, type BlockRole, type TranscriptBlock } from "@/lib/repairConsensus"

export const TRANSCRIBE_SYSTEM =
  "You transcribe text from images of printed and handwritten documents. You report exactly what is " +
  "on the page and nothing else. You would rather return a short honest transcription than a complete " +
  "invented one."

export function transcribePrompt(garbledWords: string[]) {
  // Two kinds of damage arrive here: text that extracted as garbage, and text
  // that never extracted at all (a scanned page with no OCR layer). The warning
  // about existing damage only makes sense when damage exists to warn about.
  const damage =
    garbledWords.length > 0
      ? `This is a region of a course reading whose extracted text is corrupted. What the PDF currently ` +
        `believes is here reads: ${JSON.stringify(garbledWords.slice(0, 12))}. That is the damage — do not ` +
        `reproduce it, and do not let it steer your reading.`
      : `This is a page of a course reading that has NO extractable text at all — a scan the OCR never ` +
        `reached. There is nothing to avoid reproducing; transcribe what you see.`
  return (
    `Transcribe ALL text visible in this image, VERBATIM and in reading order.\n\n` +
    `${damage}\n\n` +
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

/**
 * The brief for a page flagged as oddly formatted: same honesty rules, but the
 * reply is blocks rather than one stream. Asking every page for blocks was
 * considered and rejected — on an ordinary page the block structure is pure
 * overhead for the readers to disagree about, and the single-stream path is
 * measured and trusted. Only a page whose text demonstrably does not run in
 * one horizontal stream pays for structure.
 */
export function blockTranscribePrompt(garbledWords: string[]) {
  const damage =
    garbledWords.length > 0
      ? `This is a page of a course reading whose extracted text is corrupted. What the PDF currently ` +
        `believes is here reads: ${JSON.stringify(garbledWords.slice(0, 12))}. That is the damage — do not ` +
        `reproduce it, and do not let it steer your reading.`
      : `This is a page of a course reading whose extracted text does not match what the eye sees — ` +
        `either there is no text layer at all, or the text is in the wrong order. Transcribe what you see.`
  return (
    `Transcribe ALL text visible in this image, VERBATIM — as SEPARATE BLOCKS, not as one stream.\n\n` +
    `${damage}\n\n` +
    `This page carries text in more than one arrangement: angled or handwritten notes in a margin, ` +
    `labels inside a diagram, captions, possibly a page turned sideways. Read as one stream, those ` +
    `interleave into the body mid-sentence. Report each visually distinct run of text as its own block:\n` +
    `- "role": "body" for the main text in its normal reading order; "margin" for notes written beside ` +
    `or across it; "caption" for text belonging to a figure; "label" for words inside a diagram.\n` +
    `- "angle": degrees the text is rotated from horizontal, as you see it — 0 for upright text, ` +
    `positive when the text climbs to the right (counterclockwise), negative when it descends, 90 when ` +
    `it reads bottom-to-top.\n` +
    `- "box": the block's bounding box as FRACTIONS of this image's width and height, origin at the ` +
    `top-left: {"x":left,"y":top,"w":width,"h":height}, each between 0 and 1.\n` +
    `- "text": the block's words, verbatim, in the block's own reading order.\n\n` +
    `Rules that matter more than completeness:\n` +
    `- Transcribe what is ON THE PAGE, not what you think it should say. Keep the original's own ` +
    `spelling, typos and archaisms.\n` +
    `- Do NOT use outside knowledge to fill a gap. If you recognise the document, that must not change ` +
    `a single character of what you report — recognising it is when invention is most likely.\n` +
    `- If you cannot read something, list it in "uncertain" rather than guessing.\n\n` +
    `Several readers are transcribing this independently. Your value is an honest reading, not a ` +
    `confident one — where you are unsure, saying so is the useful answer.\n\n` +
    `Reply with ONLY a JSON object, no prose and no code fence:\n` +
    `{"orientation":"...","blocks":[{"role":"body|margin|caption|label","angle":0,` +
    `"box":{"x":0,"y":0,"w":1,"h":1},"text":"..."}],"uncertain":["..."],"illegibleShare":"none|some|much|most"}`
  )
}

export type ParsedReading = {
  text: string
  /**
   * The reader's blocks, when it answered in block form. `text` is then always
   * flattenBlocks(blocks) — the one string the blocks stand for — so every
   * consumer of a reading's text (the judge's candidates, the accepted-text
   * overlap check, the panel) keeps working without knowing blocks exist.
   */
  blocks: TranscriptBlock[] | null
  /** What the reader said about the page's orientation, kept verbatim. */
  orientation: string | null
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
 * A reader's box, tolerated into fractions. The brief says fractions of the
 * image; a model that answers in percentages anyway is answering the same
 * question in a dialect, and 55 out of 100 is not ambiguous. Pixel coordinates
 * ARE ambiguous — against a raster this side never sees — so they are dropped
 * rather than guessed at, and the block simply places by reading order.
 */
function parseBlockBox(value: unknown): TranscriptBlock["box"] {
  if (value === null || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const numbers = [raw.x, raw.y, raw.w, raw.h]
  if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) return null
  let [x, y, w, h] = numbers as number[]
  const largest = Math.max(x, y, w, h)
  if (largest > 1.5) {
    if (largest > 100) return null
    x /= 100
    y /= 100
    w /= 100
    h /= 100
  }
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  x = clamp(x)
  y = clamp(y)
  w = Math.min(clamp(w), 1 - x)
  h = Math.min(clamp(h), 1 - y)
  // A box with no area is no box.
  if (w < 0.005 || h < 0.005) return null
  return { x, y, w, h }
}

function parseBlocks(value: unknown): TranscriptBlock[] | null {
  if (!Array.isArray(value)) return null
  const blocks: TranscriptBlock[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue
    const raw = entry as Record<string, unknown>
    const text = typeof raw.text === "string" ? raw.text : ""
    if (!text.trim()) continue
    // An unknown role becomes "label": non-body, so a mislabeled block can
    // never pollute the body vote, and the text is never dropped.
    const role: BlockRole =
      raw.role === "body" || raw.role === "margin" || raw.role === "caption" || raw.role === "label"
        ? raw.role
        : "label"
    let angle = typeof raw.angle === "number" && Number.isFinite(raw.angle) ? raw.angle % 360 : 0
    if (angle > 180) angle -= 360
    if (angle <= -180) angle += 360
    blocks.push({ role, angle, box: parseBlockBox(raw.box), text })
  }
  return blocks.length > 0 ? blocks : null
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
  // the text fields out by hand rather than discarding the call. Fields plural
  // since block replies: a cut-off block reply holds every finished block's
  // text plus the one it stopped inside, and all of them are honest reading.
  if (parsed === null) {
    const pieces = [...raw.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1])
    const unterminated = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)$/)
    if (unterminated) pieces.push(unterminated[1])
    const decoded: string[] = []
    for (const piece of pieces) {
      try {
        decoded.push(JSON.parse(`"${piece}"`))
      } catch {
        // An escape cut mid-sequence: the pieces before it already carry the text.
      }
    }
    const salvaged = decoded.join("\n")
    if (!salvaged.trim()) return null
    return { text: salvaged, blocks: null, orientation: null, uncertain: [], illegibleShare: null, truncated: true }
  }

  if (typeof parsed !== "object") return null
  const object = parsed as Record<string, unknown>
  const blocks = parseBlocks(object.blocks)
  // With blocks, the flat text IS their flattening — never the model's own
  // "text" field, which nothing required to agree with the blocks it sits
  // beside. One of them has to be authoritative and the blocks are the answer
  // the block brief asked for.
  const text = blocks ? flattenBlocks(blocks) : typeof object.text === "string" ? object.text : ""
  if (!text.trim()) return null
  const orientation =
    typeof object.orientation === "string" && object.orientation.trim()
      ? object.orientation.trim().slice(0, 120)
      : null
  const share = object.illegibleShare
  return {
    text,
    blocks,
    orientation,
    uncertain: Array.isArray(object.uncertain)
      ? object.uncertain.filter((item): item is string => typeof item === "string").slice(0, 40)
      : [],
    illegibleShare:
      share === "none" || share === "some" || share === "much" || share === "most" ? share : null,
    truncated: false,
  }
}
