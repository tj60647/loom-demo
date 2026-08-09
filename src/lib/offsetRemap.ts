/**
 * Can a repaired PDF keep the highlights made against the broken one?
 *
 * Repairing a font's /ToUnicode map changes the text a page extracts to, which
 * changes every character offset after the first repaired glyph. Students'
 * highlights are stored as offsets into that text, so a repair either carries
 * them forward or destroys them.
 *
 * The good news, measured rather than assumed: for a map-only repair the glyph
 * sequence in the content stream is untouched, so v1 and v2 differ only in what
 * each character code expands to. Item boundaries, item geometry, `hasEOL`
 * placement and pdf.js's own inserted spaces all come out bit-identical, which
 * means every old offset has an exactly computable new one. No fuzzy matching,
 * no guessing at what the student meant.
 *
 * The catch, also measured, is that this holds only while every changed
 * expansion stays in the same Unicode *category*. pdf.js does not merely
 * concatenate what a code maps to: before laying a glyph out it asks whether the
 * resolved string is whitespace, a combining mark, or a format character, and
 * each answer takes a different branch — whitespace is consumed as advance and
 * emits nothing, format characters are skipped entirely, combining marks get
 * zero width. Cross one of those boundaries and the glyph stream itself
 * diverges: a single one-character-for-one-character edit was measured moving a
 * page from 72 text items to 246 (mapping to a space), to 455 (a soft hyphen),
 * and to 455 (a combining acute). Length is irrelevant. Category is everything.
 *
 * That is not a hypothetical corner. In the one real subset font examined, 8 of
 * its 103 codes already resolved to category-special characters — soft hyphens,
 * a space, a tab, a newline, a no-break space.
 *
 * So this module is the precondition, not the migration: it answers "is an exact
 * remap available?" honestly, so that a repair which would silently shift every
 * highlight on the page is refused rather than attempted. A refusal here means
 * the repair is still fine to make — it just cannot carry existing highlights
 * with it, and needs the reading to have none, or the student to re-make them.
 */

/**
 * pdf.js's own category test, reproduced exactly.
 *
 * The three alternatives are deliberately anchored differently, and copying the
 * shape matters more than tidying it: whitespace only counts at the START of the
 * expansion, a format character only at the END, and a combining mark ANYWHERE
 * in it. Rewriting this as three anchored tests would change which strings match.
 */
const CATEGORY_SPECIAL = /^(\s)|(\p{Mn})|(\p{Cf})$/u

/**
 * Is this expansion one pdf.js will lay out specially rather than as ordinary
 * text? Empty strings are ordinary: an absent map entry does not produce an
 * empty expansion, it falls back to the character code itself (see
 * expandCharCode).
 */
export function isCategorySpecial(expansion: string) {
  return expansion.length > 0 && CATEGORY_SPECIAL.test(expansion)
}

/**
 * What a character code actually resolves to.
 *
 * pdf.js reads `toUnicode.get(charcode) || charcode`, and an empty string is
 * falsy — so a /ToUnicode entry that is present but blank does NOT yield an
 * empty expansion. It falls through to the code point itself, rendering passage
 * 0x50 as "P". Modelling a blank entry as "" instead was measured predicting a
 * page 222 characters shorter than it really was, diverging from the true text
 * at the first blank code.
 *
 * That fallback is also a diagnosis in its own right: a font whose map is
 * present but empty extracts as its own passage values read as Latin-1, which is
 * the distinctive mojibake signature of a stripped CMap.
 */
export function expandCharCode(map: Map<number, string>, charCode: number) {
  const mapped = map.get(charCode)
  return mapped ? mapped : String.fromCharCode(charCode)
}

export type RemapObstacle = {
  charCode: number
  from: string
  to: string
  reason: string
}

export type RemapVerdict = {
  /**
   * True when every changed code keeps its category, and an exact arithmetic
   * remap of existing offsets is therefore available.
   */
  exact: boolean
  /** Codes whose change would restructure the glyph stream. */
  obstacles: RemapObstacle[]
  /** Codes that change expansion but stay in category — the ordinary case. */
  changedCodes: number[]
}

function describe(expansion: string) {
  return JSON.stringify(expansion)
}

/**
 * Compare the map a PDF has against the map a repair would give it, and decide
 * whether existing highlight offsets can be carried across exactly.
 *
 * Both maps are code → expansion. A code absent from either is handled by
 * expandCharCode's fallback, so a repair that merely ADDS entries is compared
 * against what those codes already resolved to rather than against nothing.
 */
export function planOffsetRemap(
  before: Map<number, string>,
  after: Map<number, string>
): RemapVerdict {
  const obstacles: RemapObstacle[] = []
  const changedCodes: number[] = []

  for (const charCode of new Set([...before.keys(), ...after.keys()])) {
    const from = expandCharCode(before, charCode)
    const to = expandCharCode(after, charCode)
    if (from === to) continue

    changedCodes.push(charCode)

    // Either side being special is disqualifying, not just the new one: a glyph
    // that WAS whitespace and becomes a letter starts occupying space in the
    // text it previously only advanced past, which restructures items just as
    // thoroughly as the reverse.
    const fromSpecial = isCategorySpecial(from)
    const toSpecial = isCategorySpecial(to)
    if (fromSpecial || toSpecial) {
      obstacles.push({
        charCode,
        from,
        to,
        reason: fromSpecial
          ? `${describe(from)} is laid out as whitespace, a combining mark, or a format character`
          : `${describe(to)} would be laid out as whitespace, a combining mark, or a format character`,
      })
    }
  }

  return {
    exact: obstacles.length === 0,
    obstacles,
    changedCodes: changedCodes.sort((a, b) => a - b),
  }
}

/**
 * Remap one offset from the old text to the new one.
 *
 * Only meaningful when planOffsetRemap returned `exact`. `glyphExpansions` is
 * the page's glyph run in order, as (oldExpansion, newExpansion) pairs — the
 * sequence is identical between versions, which is precisely what makes this
 * arithmetic rather than a search.
 *
 * An offset landing INSIDE a multi-character expansion snaps to that glyph's
 * boundary. That is deterministic but lossy, and callers that care should treat
 * a snapped offset as a one-glyph widening of the student's selection rather
 * than as an exact carry-over.
 */
export function remapOffset(
  glyphExpansions: { from: string; to: string }[],
  offset: number
): { offset: number; snapped: boolean } {
  let oldPosition = 0
  let newPosition = 0

  for (const { from, to } of glyphExpansions) {
    if (oldPosition + from.length > offset) {
      // The offset falls within this glyph. Snap to its start.
      return { offset: newPosition, snapped: oldPosition !== offset }
    }
    oldPosition += from.length
    newPosition += to.length
  }

  return { offset: newPosition, snapped: oldPosition !== offset }
}
