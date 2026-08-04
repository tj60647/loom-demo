/**
 * Guarding what an admin accepts before it is written into a reading.
 *
 * The rest of this file used to render a review page to disk. That was wrong
 * for a deployed app — review happens in the admin UI behind sign-in, with the
 * proposals in Postgres and the crops in blob storage — so only the check
 * survives, and it lives here because it belongs to the moment of acceptance
 * rather than to any particular screen.
 */
export type RegionReading = {
  reader: number
  text: string
  uncertain: string[]
  illegibleShare: "none" | "some" | "much" | "most" | null
}

/**
 * Does the accepted text actually come from the page, or from somewhere else?
 *
 * The gibberish measure cannot answer that. Measured, on this library: an
 * adjudicator asked for "the text all readers agree on" returned a paragraph
 * *describing* their agreement instead, that paragraph was written into the
 * page, and the damage score fell from 34.4% to 0.3% — because commentary is
 * fluent English. The gate designed to catch garbage passed prose that had
 * nothing to do with the page.
 *
 * So accepted text is checked against the readings it claims to summarise. It
 * has to be made of their words. This will not catch a subtly wrong
 * transcription — nothing automatic will, which is what the reviewer is for —
 * but it catches wholesale substitution, which is the failure that actually
 * happened.
 */
export function acceptedTextMatchesReadings(accepted: string, readings: RegionReading[]) {
  const wordsOf = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z'’]+/)
        .filter((word) => word.length >= 4)
    )

  const acceptedWords = wordsOf(accepted)
  if (acceptedWords.size === 0) {
    return { ok: false, overlap: 0, reason: "the accepted text contains no words" }
  }

  // Against the most generous reader: agreement between readers is judged
  // elsewhere, and the question here is only whether this text came off the page
  // at all.
  const best = readings.reduce((highest, reading) => {
    const readingWords = wordsOf(reading.text)
    let shared = 0
    for (const word of acceptedWords) if (readingWords.has(word)) shared += 1
    return Math.max(highest, shared / acceptedWords.size)
  }, 0)

  return {
    ok: best >= ACCEPTED_OVERLAP_FLOOR,
    overlap: Math.round(best * 1000) / 1000,
    reason:
      best >= ACCEPTED_OVERLAP_FLOOR
        ? ""
        : `only ${(best * 100).toFixed(0)}% of the accepted text's words appear in any reader's transcription — ` +
          `this does not look like a transcription of the page`,
  }
}

/**
 * Share of the accepted text's words that must appear in some reader's
 * transcription. Deliberately not near 1: a reviewer is expected to correct
 * words, join hyphenated fragments and fix punctuation, and all of that should
 * pass. The commentary that prompted this check scored far below it.
 */
const ACCEPTED_OVERLAP_FLOOR = 0.6
