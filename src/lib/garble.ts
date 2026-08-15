/**
 * Gibberish induced by a bad scan.
 *
 * This is the failure the rest of the scorer could not see. Every aggregate
 * measure it has — junk passages, letter distribution, common-word density — reads
 * clean on a page like this one, from a real reading in the library:
 *
 *     "reCa vsA;DEWIGNAwCRITIQUE"        for "DESIGN AS CRITIQUE"
 *     "ihe" "feacier" "refigian" "haa"   for "the" "teacher" "religion" "has"
 *
 * The characters are valid ASCII, the letter frequencies are ordinary English,
 * and "the" and "and" survive in the undamaged half of the page. The document
 * scored 5 on legibility while a third of one page was unreadable.
 *
 * Only a dictionary catches it, and a dictionary alone is not enough either: on
 * academic readings the unknown words are dominated by author surnames,
 * acronyms and foreign titles, and a bibliography page looks worse than a
 * genuinely broken one. Two restrictions make the measure honest:
 *
 *   1. Only LOWERCASE tokens count. A proper noun is capitalised in the source
 *      and a corrupted body word is not — `Spivak`, `Routledge` and `Cambridge`
 *      drop out, `oiscourse`, `innavation` and `cultiral` remain. This single
 *      restriction removed almost every false alarm.
 *   2. A page needs enough body words for the rate to mean anything. What was
 *      left after (1) was a handful of citation pages with a dozen words, where
 *      hyphenation fragments left by a line break — `edi-tions`, `infor-mation`,
 *      `Mas-sachusetts` — read as garbage at 46%. On a page of real prose those
 *      same fragments are a rounding error.
 *
 * A clean reading in this library measures 1-2%. A broken page measures 30-80%.
 */
import words from "an-array-of-english-words"

const DICTIONARY = new Set(words as string[])

/**
 * Share of a page's body words that are not words, above which the page reads
 * as damaged. Set well clear of both observed populations: clean pages here run
 * to 2.3%, damaged ones start around 30%.
 */
const GARBLED_PAGE_RATE = 0.15

/**
 * A rate this high is damage whatever the page size — the one page in this
 * library that is genuinely unreadable has only 21 body words on it, and a
 * denominator rule alone would have excused it.
 */
const GARBLED_PAGE_RATE_SEVERE = 0.5

/** Body words a page needs before the ordinary threshold is trusted. */
const MIN_BODY_WORDS = 40

/** Shortest token worth judging. Below this, fragments and initials dominate. */
const MIN_TOKEN_CHARS = 3

function isKnown(token: string) {
  return DICTIONARY.has(token) || DICTIONARY.has(token.replace(/['’]s$/, ""))
}

/**
 * Words from a run of text that are eligible to be judged: long enough to mean
 * something, and lowercase in the source. Case is the discriminator that keeps
 * a bibliography from reading as damage — see the note at the top of this file.
 */
export function lowercaseBodyTokens(text: string) {
  return text
    .split(/[^A-Za-z'’]+/)
    .filter((token) => token.length >= MIN_TOKEN_CHARS && token === token.toLowerCase())
}

/** Is this a word? Exported so a repair pass can point at the exact failures. */
export function isGarbledToken(token: string) {
  return !isKnown(token)
}

export type PageGarble = {
  pageNumber: number
  /** Share of lowercase body words not found in the dictionary. */
  rate: number
  bodyWords: number
  /** The unrecognised words themselves — what a low score actually looks like. */
  sample: string[]
}

export type GarbleReport = {
  /** Pages that could be judged: enough lowercase body text to measure. */
  pagesMeasured: number
  /** Pages reading as scan damage. */
  pagesGarbled: number
  /** Share of measured pages that are damaged. Null when nothing was measurable. */
  garbledPageRate: number | null
  /** Worst pages first — where to look, and what is wrong there. */
  worst: PageGarble[]
}

/**
 * Judge one run of text as a page.
 *
 * Exported because a repair pass has to ask this of two different strings and
 * compare the answers. The stored page text carries the line boundaries, so a
 * page whose damage is LOST SPACES reads as garbage there; the same page's
 * pdf.js items, joined with a space, read as clean prose, because every item is
 * still a real word and only the joins between them were lost. Measured on
 * page 2 of *Design as Critique*: 47 unknown words in the stored text, 1 in the
 * items. Nothing can be cropped for a model to re-read on such a page — the
 * glyphs are all correct — and a repair pass that does not distinguish the two
 * proposes a box around the one dictionary miss it found.
 */
export function measurePageGarble(pageNumber: number, text: string): PageGarble | null {
  const tokens = text.split(/[^A-Za-z'’]+/).filter((token) => token.length >= MIN_TOKEN_CHARS)
  // Lowercase in the source, so not a name, an acronym or a heading. Deduped:
  // one word repeated forty times is one piece of evidence, not forty.
  const body = [...new Set(tokens.filter((token) => token === token.toLowerCase()))]
  if (body.length < 10) return null

  const unknown = body.filter((token) => !isKnown(token))
  return {
    pageNumber,
    rate: unknown.length / body.length,
    bodyWords: body.length,
    sample: unknown.slice(0, 10),
  }
}

/** Does this measurement read as scan damage? Exported alongside the measure. */
export function isGarbled(page: PageGarble) {
  if (page.rate >= GARBLED_PAGE_RATE_SEVERE) return true
  return page.bodyWords >= MIN_BODY_WORDS && page.rate >= GARBLED_PAGE_RATE
}

/**
 * Judge each page separately and report the share that are damaged.
 *
 * Per page on purpose: scan damage is local. Three ruined pages in a
 * thirteen-page chapter is a reading a student will hit; averaged across the
 * document it disappears into noise, which is exactly how this went unnoticed.
 */
export function reportGarble(pages: { pageNumber: number; textContent: string }[]): GarbleReport {
  const measured = pages
    .map((page) => measurePageGarble(page.pageNumber, page.textContent))
    .filter((page): page is PageGarble => page !== null)

  const garbled = measured.filter(isGarbled)

  return {
    pagesMeasured: measured.length,
    pagesGarbled: garbled.length,
    garbledPageRate: measured.length > 0 ? garbled.length / measured.length : null,
    worst: [...measured].sort((a, b) => b.rate - a.rate).slice(0, 5),
  }
}
