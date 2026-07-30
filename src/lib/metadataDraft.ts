/**
 * Drafts bibliographic metadata for a library reading from its own extracted
 * text.
 *
 * RED LINE #6 — read this before touching anything here.
 *
 * "No AI runs inside the tool" is absolute, with narrowly ratified exceptions.
 * This is the second one (TJ, 30 July 2026), and it is bounded differently from
 * the first (extraction scoring), because it does something the first was
 * forbidden to do: it produces text a student can read.
 *
 * What keeps it inside the line:
 *   - It reads the instructor's uploaded PDF, never a student's work. It must
 *     not read or write a concept, byte, edge, or read.
 *   - It only ever returns a DRAFT. Nothing here writes to the database. The
 *     instructor sees every field, edits what they like, and saves — so no
 *     model-written sentence reaches a student that an instructor has not read
 *     and accepted. That approval step is the exception, not a nicety: remove
 *     it and this becomes an unratified in-tool model call.
 *   - Every draft stamps `metadataProvenance`, so which fields were drafted
 *     rather than typed stays visible to instructors afterwards.
 *
 * It stays optional in the same way the judge is: with no key configured the
 * button reports that and the instructor types the metadata by hand.
 */

import { isJudgeConfigured, judgeModelName, requestChatCompletion } from "./openrouter"

/** Opening pages carry the title page, author, and abstract. */
const DRAFT_PAGE_COUNT = 4
const DRAFT_CHARS_PER_PAGE = 2_500

export type MetadataDraft = {
  title: string
  author: string
  sourceReference: string
  description: string
  provenance: string
}

const SYSTEM = [
  "You extract bibliographic metadata from the opening pages of an academic reading.",
  "Reply with JSON only, no prose and no code fence, using exactly these keys:",
  '{"title":"","author":"","sourceReference":"","description":""}',
  "",
  "title: the work's own title, as printed. Not the filename.",
  "author: author(s) as printed, e.g. \"Star, S. L. & Griesemer, J. R.\". Empty string if not stated.",
  "sourceReference: a citation line — journal or publisher, volume, year, pages — if the pages state it.",
  "description: two or three plain sentences saying what the reading argues, for an instructor",
  "  choosing readings. Describe the text; do not evaluate it or address the reader.",
  "",
  "Report only what the pages actually state. Leave a field as an empty string rather than",
  "guessing or inferring from general knowledge — an empty field is corrected in seconds,",
  "a plausible wrong citation can survive unnoticed.",
].join("\n")

function parseDraft(raw: string): Omit<MetadataDraft, "provenance"> {
  // Models sometimes fence JSON despite instruction; take the outermost object.
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error("The model did not return usable JSON.")

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error("The model did not return usable JSON.")
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  return {
    title: str(parsed.title),
    author: str(parsed.author),
    sourceReference: str(parsed.sourceReference),
    description: str(parsed.description),
  }
}

/**
 * Returns a draft for review. Never persists — see the red-line note above.
 * `pages` are the reading's already-extracted pages, so this costs no extra
 * PDF work and reads exactly what the library already holds.
 */
export async function draftMetadataFromPages(
  pages: { pageNumber: number; textContent: string }[],
  filenameHint: string
): Promise<MetadataDraft> {
  if (!isJudgeConfigured()) {
    throw new Error("No OPENROUTER_API_KEY is configured, so drafting is unavailable. Type the metadata by hand.")
  }

  const usable = pages
    .filter((p) => p.textContent.trim().length > 40)
    .slice(0, DRAFT_PAGE_COUNT)

  if (!usable.length) {
    throw new Error(
      "This PDF has no extractable text on its opening pages — it is probably a scan. Check its extraction score, or type the metadata by hand."
    )
  }

  const body = usable
    .map((p) => `--- page ${p.pageNumber} ---\n${p.textContent.slice(0, DRAFT_CHARS_PER_PAGE)}`)
    .join("\n\n")

  const model = judgeModelName()
  const raw = await requestChatCompletion({
    system: SYSTEM,
    message: `Filename (may be wrong or abbreviated): ${filenameHint}\n\n${body}`,
    model,
    maxTokens: 700,
  })

  const draft = parseDraft(raw)
  const today = new Date().toISOString().slice(0, 10)
  return {
    ...draft,
    provenance: `Drafted from the PDF's opening pages by ${model} on ${today}; reviewed and saved by an instructor.`,
  }
}
