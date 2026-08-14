/**
 * Carrying a student's highlight across a repair.
 *
 * Replacing a page's text layer moves the substrate every offset on that page
 * was measured against, so the standing rule has been to refuse the repair
 * outright while any highlight exists — repair before a cohort arrives, not
 * during one. That rule is right in spirit and far too broad in practice, in
 * three separate ways, all of them measured against this library:
 *
 *   - Most highlights are not on the page being repaired. Of the 23 anchored
 *     highlights here, NONE sit on a page any repair has ever been proposed for.
 *   - Many "highlights" have no offsets at all: 20 of 43 passages were typed or
 *     pasted rather than selected, and carry a human-written location like
 *     "p. 387 (abstract)". Replacing a text layer cannot disturb a passage that was
 *     never measured against one.
 *   - A quote is findable. All 23 anchored quotes occur EXACTLY ONCE on their
 *     own page — none ambiguous, none missing — so the span can simply be
 *     located again in the new text.
 *
 * So a highlight is carried rather than mourned, and the repair is refused only
 * when one genuinely cannot be carried.
 *
 * Matching ignores whitespace, which is not a convenience. A passage's `content`
 * comes from the browser's selection, and `Selection.toString()` renders the
 * `<br>` pdf.js puts after each end-of-line item as a newline — while the
 * offsets index `textContent`, where that same `<br>` contributes nothing. The
 * two strings therefore differ by whitespace for any quote spanning a line
 * break, which is most of the long ones: comparing them literally matches 12 of
 * 23, and ignoring whitespace matches all 23. See the "Two strings" section of
 * docs/reading-quality.md; this is that hazard one level further down.
 */

/** The text with whitespace removed, plus each kept character's real index. */
function withoutWhitespace(text: string) {
  const kept: string[] = []
  const at: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (!/\s/.test(text[index])) {
      kept.push(text[index])
      at.push(index)
    }
  }
  return { bare: kept.join(""), at }
}

export type QuoteLocation =
  | { found: true; startOffset: number; endOffset: number }
  | { found: false; why: "empty" | "missing" | "ambiguous" }

/**
 * Where a quote sits in a page's text-layer string.
 *
 * Ambiguity is a refusal rather than a guess: two identical passages on one page
 * means the wrong one could be marked, and a highlight silently pointing at the
 * wrong sentence is worse than one that visibly needs attention.
 */
export function locateQuote(projection: string, quote: string): QuoteLocation {
  const haystack = withoutWhitespace(projection)
  const needle = withoutWhitespace(quote).bare
  if (needle.length === 0) return { found: false, why: "empty" }

  const first = haystack.bare.indexOf(needle)
  if (first === -1) return { found: false, why: "missing" }
  if (haystack.bare.indexOf(needle, first + 1) !== -1) return { found: false, why: "ambiguous" }

  return {
    found: true,
    startOffset: haystack.at[first],
    // The character after the last kept one, so the span is half-open like every
    // other offset pair here.
    endOffset: haystack.at[first + needle.length - 1] + 1,
  }
}

export type AnchoredPassage = {
  id: string
  content: string
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
}

export type ReanchorPlan = {
  /** Highlights whose offsets must be rewritten, with their new span. */
  moves: { id: string; pageNumber: number; startOffset: number; endOffset: number }[]
  /** Highlights that survived untouched — nothing to write. */
  unchanged: number
  /** Highlights that cannot be carried, and why. Any of these refuses the repair. */
  lost: { id: string; pageNumber: number; why: string; quote: string }[]
}

/**
 * Decide, before anything is written, whether every highlight survives.
 *
 * `pageTextAfter` is the reading as it WOULD be — the repair is built in memory
 * and re-extracted before this runs — so a repair that would strand a highlight
 * is refused without ever having touched the stored reading.
 *
 * Highlights on untouched pages are verified rather than assumed. The pages a
 * repair does not name come through pdf-lib's save passage-identical in extraction
 * on every document measured here, but "measured on the documents we had" is not
 * the same as "true of every PDF", and the check costs a string comparison.
 */
/**
 * Best-effort recovery of a highlight whose quoted text no longer exists —
 * because the quote WAS the damage. Ruled by TJ, 2026-08-14: testers'
 * captures of garbled OCR must not block the correction; find what they
 * highlighted and recreate it on the corrected text, otherwise remove the
 * passage and keep the concept.
 *
 * The match is word-by-word and tolerant of exactly the change a repair
 * makes: most words survive correction untouched, the garbled ones move a
 * character or two ("Concert" → "Concept"). A sliding window over the
 * corrected page maximises per-word similarity; a window that clears the
 * floor becomes the passage's new anchor AND its new content — the student's
 * note, question, tier and concepts ride along untouched, only the quoted
 * substrate updates to what the page now actually says. Below the floor, the
 * quote cannot honestly be said to exist any more, and pretending otherwise
 * would anchor their name to a sentence they never chose.
 */
const RECOVERY_FLOOR = 0.72

function editDistance(a: string, b: string) {
  const previous = new Array(b.length + 1).fill(0).map((_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      diagonal = saved
    }
  }
  return previous[b.length]
}

function wordSimilarity(a: string, b: string) {
  if (a === b) return 1
  const longer = Math.max(a.length, b.length)
  if (longer === 0) return 1
  return 1 - editDistance(a.toLowerCase(), b.toLowerCase()) / longer
}

/** The quote as comparable words: de-hyphenated at line breaks, whitespace collapsed. */
function comparableWords(text: string) {
  return text
    .replace(/-\s*\n\s*/g, "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
}

export type StrandedRecovery = {
  /** Re-created on the corrected text: new span and new content. */
  recovered: { id: string; pageNumber: number; startOffset: number; endOffset: number; content: string; was: string }[]
  /** No honest equivalent exists; the passage should be removed, concepts kept. */
  unrecoverable: { id: string; pageNumber: number; quote: string }[]
}

export function recoverStrandedPassages(
  anchored: AnchoredPassage[],
  lostIds: Set<string>,
  pageTextAfter: Map<number, string>
): StrandedRecovery {
  const outcome: StrandedRecovery = { recovered: [], unrecoverable: [] }

  for (const passage of anchored) {
    if (!lostIds.has(passage.id) || passage.pageNumber == null) continue
    const stored = pageTextAfter.get(passage.pageNumber) ?? ""
    const quoteWords = comparableWords(passage.content)

    /**
     * Match against the STORED page text, not the projection. The projection
     * (the offset space) concatenates line ends with nothing between them, so
     * "are⏎intended" reads as one token "areintended" — one fused token
     * shifts a fixed-length window off every following word and a quote that
     * is plainly on the page scores as absent. Measured, not hypothetical:
     * that is exactly how a tester's capture of the chapter-opening sentence
     * of Learning How to Learn was wrongly removed. The stored text keeps the
     * line boundaries, so tokens split correctly; a token's offsets convert
     * to projection space by subtracting the newlines before it. Tokens that
     * end with a hyphen at a line break merge with their successor, the same
     * flattening the quote side gets.
     */
    const rawTokens = [...stored.matchAll(/\S+/g)].map((match) => ({
      word: match[0],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }))
    const pageTokens: { word: string; start: number; end: number }[] = []
    for (let index = 0; index < rawTokens.length; index += 1) {
      const token = rawTokens[index]
      if (token.word.endsWith("-") && index + 1 < rawTokens.length) {
        const next = rawTokens[index + 1]
        pageTokens.push({ word: token.word.slice(0, -1) + next.word, start: token.start, end: next.end })
        index += 1
      } else {
        pageTokens.push(token)
      }
    }
    const newlinesBefore = (position: number) => {
      let count = 0
      for (let index = 0; index < position; index += 1) if (stored[index] === "\n") count += 1
      return count
    }

    let best: { score: number; start: number; end: number } | null = null
    if (quoteWords.length >= 2 && pageTokens.length >= quoteWords.length) {
      for (let index = 0; index + quoteWords.length <= pageTokens.length; index += 1) {
        let total = 0
        for (let offset = 0; offset < quoteWords.length; offset += 1) {
          total += wordSimilarity(quoteWords[offset], pageTokens[index + offset].word)
        }
        const score = total / quoteWords.length
        if (!best || score > best.score) {
          best = { score, start: pageTokens[index].start, end: pageTokens[index + quoteWords.length - 1].end }
        }
      }
    }

    if (best && best.score >= RECOVERY_FLOOR) {
      outcome.recovered.push({
        id: passage.id,
        pageNumber: passage.pageNumber,
        // Projection space — the space every stored offset indexes.
        startOffset: best.start - newlinesBefore(best.start),
        endOffset: best.end - newlinesBefore(best.end),
        content: stored.slice(best.start, best.end).replace(/-\n/g, "").split("\n").join(" "),
        was: passage.content.slice(0, 80),
      })
    } else {
      outcome.unrecoverable.push({
        id: passage.id,
        pageNumber: passage.pageNumber,
        quote: passage.content.slice(0, 80),
      })
    }
  }

  return outcome
}

export function planReanchor(
  anchored: AnchoredPassage[],
  pageTextAfter: Map<number, string>,
  replacedPages: number[]
): ReanchorPlan {
  const replaced = new Set(replacedPages)
  const plan: ReanchorPlan = { moves: [], unchanged: 0, lost: [] }

  for (const passage of anchored) {
    if (passage.pageNumber == null || passage.startOffset == null || passage.endOffset == null) continue
    const projection = pageTextAfter.get(passage.pageNumber)
    if (projection === undefined) {
      plan.lost.push({
        id: passage.id,
        pageNumber: passage.pageNumber,
        why: "the repaired reading has no such page",
        quote: passage.content.slice(0, 80),
      })
      continue
    }

    // Still exactly where it was? Then there is nothing to do, whether or not
    // this page was rewritten.
    const bareAt = withoutWhitespace(projection.slice(passage.startOffset, passage.endOffset)).bare
    if (bareAt === withoutWhitespace(passage.content).bare) {
      plan.unchanged += 1
      continue
    }

    const located = locateQuote(projection, passage.content)
    if (!located.found) {
      plan.lost.push({
        id: passage.id,
        pageNumber: passage.pageNumber,
        why:
          located.why === "ambiguous"
            ? "this passage appears more than once on the page, so the highlight cannot be placed without guessing"
            : located.why === "empty"
              ? "the highlight has no quoted text to find"
              : replaced.has(passage.pageNumber)
                ? "the transcription of this page does not contain the quoted passage"
                : "the quoted passage is no longer on this page",
        quote: passage.content.slice(0, 80),
      })
      continue
    }

    plan.moves.push({
      id: passage.id,
      pageNumber: passage.pageNumber,
      startOffset: located.startOffset,
      endOffset: located.endOffset,
    })
  }

  return plan
}
