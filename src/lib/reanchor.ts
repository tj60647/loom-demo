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

export type AnchoredByte = {
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
export function planReanchor(
  anchored: AnchoredByte[],
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
