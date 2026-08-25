/**
 * Extraction-quality scoring for library readings.
 *
 * The question this answers is not "is this a good reading?" but "did this PDF
 * survive text extraction well enough to be usable inside Loom?" — can students
 * quote from it, and will their highlight offsets anchor? A scanned photocopy
 * with no text layer looks identical to a clean digital PDF on the library
 * card; it is useless the moment someone tries to capture a passage from it.
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
import { sourcePages, sourceScores, sources } from "@/db/schema"
import { asc, eq } from "drizzle-orm"
import type { ExtractionMetrics } from "@/lib/types"
import type { PdfStructure } from "@/lib/pdfStructure"
import { probePdfStructure } from "@/lib/pdfStructure"
import { probeHighlights } from "@/lib/highlightProbe"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"
import { readingStorage } from "@/lib/storage"
import { isJudgeConfigured, judgeModelName, requestChatCompletion } from "@/lib/openrouter"
import { logWarn } from "@/lib/log"

/**
 * Share of pages a line must appear on before it is page furniture rather than
 * content — a running header, a journal's download stamp, a copyright footer.
 *
 * This replaces a character floor that asked the wrong question. "Fewer than 120
 * characters" was standing in for "nothing here but a header and a folio", and
 * it was wrong in both directions: it excluded a page whose only text is a
 * photograph's caption or a three-word heading, which a student can and does
 * quote (the shortest capture in this library is 27 characters, a heading); and
 * it admitted the case it was written for, since the SAGE download stamp that
 * motivated it runs to ~159 characters a page.
 *
 * Repetition separates them cleanly and needs no threshold on length. A line
 * that appears on two thirds of the pages is not what anyone came to read.
 */
const FURNITURE_PAGE_SHARE = 0.66

/**
 * Pages below which repetition means nothing — three pages sharing a line is a
 * coincidence, not a running header.
 */
const FURNITURE_MIN_PAGES = 4

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
// private use area — the signatures of a font map that resolved to *no*
// character. Necessary but nowhere near sufficient: the more common break is a
// map that resolves to the *wrong* character, which is ordinary ASCII and looks
// perfectly clean here. That case is caught by languageLikeness below.
const JUNK_CHAR = /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uE000-\uF8FF]/g

/**
 * Relative frequency of a–z in English prose, used as a reference profile. A
 * wrong-but-valid character mapping permutes the distribution, so comparing
 * against this catches substitution-style breakage that passage inspection can't.
 */
const ENGLISH_LETTER_FREQ: Record<string, number> = {
  a: 0.08167, b: 0.01492, c: 0.02782, d: 0.04253, e: 0.12702, f: 0.02228,
  g: 0.02015, h: 0.06094, i: 0.06966, j: 0.00153, k: 0.00772, l: 0.04025,
  m: 0.02406, n: 0.06749, o: 0.07507, p: 0.01929, q: 0.00095, r: 0.05987,
  s: 0.06327, t: 0.09056, u: 0.02758, v: 0.00978, w: 0.02360, x: 0.00150,
  y: 0.01974, z: 0.00074,
}

/**
 * Common English words, three letters and up, matched as substrings rather than
 * tokens: extractPdfPageText joins text runs without inserting spaces, so word
 * boundaries are not reliable — but "the" occurring hundreds of times across a
 * page of real prose is. The three-letter minimum keeps chance hits rare, since
 * random letters produce a given trigram about once per 17,576 positions.
 */
const FUNCTION_WORDS = [
  "the", "and", "that", "for", "with", "was", "this", "are", "from", "which",
  "but", "not", "have", "has", "they", "their", "been", "would", "there",
  "when", "what", "will", "can", "all", "one", "our", "out", "more", "than",
  "into", "such", "only", "other", "some", "these", "also", "may", "its",
  "use", "between", "about", "through", "however", "where", "were", "each",
]

/**
 * Glyph names that leaked into the text instead of the characters they stand
 * for. A font with no usable /ToUnicode map falls back to naming its glyphs, and
 * because those names are ordinary ASCII they pass junkCharRatio untouched and
 * are stripped before the letter-frequency profile is built — so without this
 * they register nowhere at all.
 *
 * Restricted to the AGL names that actually occur, with composite forms limited
 * to single-letter components (`f_i`, `f_f_l`). The tempting general shape
 * `/[a-z]+_[a-z]+` is too broad: it matches ordinary URL paths, and did — a
 * footnote citing `lindahall.org/events_exhib/` was the library's only reported
 * "leak" until this was narrowed.
 */
const GLYPH_NAME_LEAK =
  /\/(?:[a-z](?:_[a-z])+|ffi|ffl|ff|fi|fl|hyphen|endash|emdash|quotesingle|quotedbl|bullet)(?:\.[a-z]+)?\b/g

/**
 * A punctuation mark between two letters — `INTERAC$IVE`. This is what a
 * ligature code looks like once it has resolved to the ASCII punctuation that
 * shares its byte value, which is the most common way a broken font map stays
 * invisible to every other check.
 *
 * Two exclusions, both learned from false positives on this library's own
 * readings rather than reasoned from the character table:
 *
 *   - `&` is dropped entirely. It is ordinary inside an acronym, and `AT&T` in
 *     a Bucciarelli footnote matched every time.
 *   - `!` and `?` count only when a LOWERCASE letter follows. extractPdfPageText
 *     joins text runs with no separator, so a sentence ending in `?` fuses with
 *     the capital that opens the next one; `works?A` and `WORKINGS?Seeking` are
 *     artefacts of the join, not of the font. Mid-word, before a lowercase
 *     letter, they are still the ligature signature.
 *
 * Note what it does *not* catch: a systematic letter-for-letter OCR confusion
 * such as `ct` read as `cf` produces `INTERACfIVE`, which is letters throughout.
 * That one is only visible to the language-likeness measures below.
 */
const PUNCT_IN_WORD = /[A-Za-z](?:[!?](?=[a-z])|["#$%*+<=>@^_`|~])[A-Za-z]/g

/**
 * Length at which a whitespace-delimited token means word boundaries were lost
 * rather than a genuinely long word.
 *
 * Known upward bias, measured on this library's own readings: extractPdfPageText
 * joins pdf.js items with no separator, and an end-of-line item carries an empty
 * string, so the last word of every line fuses with the first of the next. That
 * adds roughly +0.1 percentage points on ordinary prose and considerably more on
 * layout-heavy pages. The metric still separates the two clearly; read it as a
 * comparative signal, not an absolute error rate.
 */
const LONG_TOKEN_CHARS = 28

/** Below this there is too little signal to judge, and the check abstains. */
const LIKENESS_MIN_CHARS = 600

/** Cap on the text inspected — enough to be representative, cheap to scan. */
const LIKENESS_SAMPLE_CHARS = 40_000

type ScorablePage = { pageNumber: number; textContent: string }

export type LanguageLikeness = {
  /**
   * Cosine similarity of the a–z profile against English (~1 for real prose),
   * and occurrences of common English words per 1,000 characters.
   *
   * Both null when the document is largely non-Latin script: the measures are
   * Latin-alphabet-specific, and reporting a number computed from a handful of
   * stray ASCII characters would be worse than admitting they don't apply.
   */
  letterFreqSimilarity: number | null
  functionWordsPerKChar: number | null
  /** Share of letters (any script) that are a–z. Low means the two above abstain. */
  latinShare: number
}

/**
 * Does this read as natural language, or merely as characters?
 *
 * Two independent signals, because each alone has a blind spot. Letter
 * frequency catches a permuted mapping but is largely shared across Latin-script
 * languages; function words catch a permuted mapping *and* pin the language to
 * English, but drop on maths-heavy or tabular pages. Read together they
 * separate "wrong characters" from "unusual but real prose" — see
 * legibilityCeiling for how the two are combined.
 *
 * Returns null when there is too little text to say anything honest.
 */
export function computeLanguageLikeness(text: string): LanguageLikeness | null {
  const sample = text.slice(0, LIKENESS_SAMPLE_CHARS).toLowerCase()
  const allLetters = sample.match(/\p{L}/gu)?.length ?? 0
  const letters = sample.replace(/[^a-z]/g, "")

  // Too little text of any kind to say anything honest.
  if (allLetters < LIKENESS_MIN_CHARS) return null

  const latinShare = allLetters > 0 ? letters.length / allLetters : 0

  // Plenty of text, but not in the alphabet these measures are built for.
  // Report that rather than computing a similarity from the stray ASCII.
  if (letters.length < LIKENESS_MIN_CHARS) {
    return { letterFreqSimilarity: null, functionWordsPerKChar: null, latinShare }
  }

  const counts: Record<string, number> = {}
  for (const char of letters) counts[char] = (counts[char] ?? 0) + 1

  // Cosine similarity between the observed profile and English.
  let dot = 0
  let observedNorm = 0
  let referenceNorm = 0
  for (const letter of Object.keys(ENGLISH_LETTER_FREQ)) {
    const observed = (counts[letter] ?? 0) / letters.length
    const reference = ENGLISH_LETTER_FREQ[letter]
    dot += observed * reference
    observedNorm += observed * observed
    referenceNorm += reference * reference
  }
  const letterFreqSimilarity =
    observedNorm > 0 ? dot / (Math.sqrt(observedNorm) * Math.sqrt(referenceNorm)) : 0

  let hits = 0
  for (const word of FUNCTION_WORDS) {
    // Count overlapping-safe occurrences without a regex, so the word list
    // needs no escaping and long texts stay cheap.
    let index = sample.indexOf(word)
    while (index !== -1) {
      hits += 1
      index = sample.indexOf(word, index + word.length)
    }
  }

  return {
    letterFreqSimilarity: Math.round(letterFreqSimilarity * 1000) / 1000,
    functionWordsPerKChar: Math.round((hits / sample.length) * 1000 * 10) / 10,
    latinShare: Math.round(latinShare * 1000) / 1000,
  }
}

/**
 * The highest legibility a document may claim given how language-like it reads,
 * plus why — the reason is surfaced in the notes so a flagged reading explains
 * itself instead of just showing a low number.
 *
 * Asymmetric on purpose. A broken letter distribution is strong evidence of
 * wrong characters in any Latin-script language, so it caps hard. Missing
 * English function words alone is weak evidence — a French reading, a maths
 * paper, or a table of figures all look like that — so it only caps to
 * "borderline, look at it", and the judge can raise it back.
 */
function legibilityCeiling(likeness: LanguageLikeness | null): {
  /** Null means the check could not run — abstain rather than cap. */
  ceiling: number | null
  reason: string | null
} {
  // Too little text to say anything about whether it reads as language.
  //
  // This used to return a ceiling of 5, which quietly asserted the opposite of
  // what it knew: junkCharRatio can only see characters that failed to resolve,
  // so a short page of confident-looking nonsense — the exact output OCR
  // produces from a diagram — scored 5 on legibility because nothing had
  // contradicted it. Measured: 693 characters of OCR noise off a chart scored
  // 5/5/5 and passed. "Not checked" must not read as "checked and fine".
  if (!likeness) {
    return {
      ceiling: null,
      reason: "too little text to verify that it reads as language",
    }
  }

  // Plenty of text, but not in the Latin alphabet. That is either a genuinely
  // non-Latin reading or a mis-mapped codepage, and these measures cannot tell
  // the two apart — so flag it for a human rather than passing it silently.
  if (likeness.letterFreqSimilarity == null || likeness.functionWordsPerKChar == null) {
    return {
      ceiling: 3,
      reason: "largely non-Latin script — legibility could not be checked automatically",
    }
  }

  const distributionOff = likeness.letterFreqSimilarity < 0.85
  const wordsMissing = likeness.functionWordsPerKChar < 8

  if (distributionOff && wordsMissing) {
    return { ceiling: 1, reason: "extracted characters do not read as language — likely a broken font map" }
  }
  if (distributionOff) {
    return { ceiling: 2, reason: "letter distribution is unlike prose — characters may be mis-mapped" }
  }
  if (wordsMissing) {
    return {
      ceiling: 3,
      reason: "few common English words — may be non-English, heavily technical, or mis-mapped",
    }
  }
  return { ceiling: 5, reason: null }
}

/**
 * Pages carrying something a student could actually quote.
 *
 * A page counts if it has any text left once page furniture is removed —
 * ANY text, with no minimum. The line that decides it is repetition: a header,
 * a folio, a download stamp recur across the document, and what a reader came
 * for does not.
 *
 * Short documents skip the repetition test entirely, because with three pages
 * there is nothing to repeat against and the measure would fire on prose.
 */
export function countPagesWithContent(pages: ScorablePage[]) {
  const withText = pages.filter((page) => page.textContent.trim().length > 0)
  if (pages.length < FURNITURE_MIN_PAGES) return withText.length

  const lineCounts = new Map<string, number>()
  for (const page of pages) {
    // Same line twice on one page still only implicates that page once.
    for (const line of new Set(page.textContent.split("\n").map((l) => l.trim()).filter(Boolean))) {
      lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1)
    }
  }
  const furnitureFloor = pages.length * FURNITURE_PAGE_SHARE

  return pages.filter((page) => {
    const content = page.textContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && (lineCounts.get(line) ?? 0) < furnitureFloor)
      // A folio escapes the repetition test because every page's is different —
      // "47" appears once in the document, so it reads as unique content. It is
      // not; it is furniture of a kind rather than of a string. Requiring two
      // consecutive letters drops page numbers, rules and stray punctuation
      // while keeping anything with a word in it, which is the actual line: a
      // three-word heading stays, "47" does not, and no length is involved.
      .filter((line) => /\p{L}{2}/u.test(line))
    return content.join("").length > 0
  }).length
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0
}

/**
 * An even slice of the document for the language check, rather than its opening.
 *
 * computeLanguageLikeness caps its input at LIKENESS_SAMPLE_CHARS, and it used
 * to be handed every page joined together — so it read the first 40,000
 * characters and nothing else. On a 235-page book that is roughly the first ten
 * pages: front matter, a preface, and then silence. Damage anywhere later —
 * a font that breaks at chapter three, an OCR pass that writes noise into a
 * scanned plate on page 180 — was never looked at.
 *
 * Taking the same budget spread evenly across pages costs nothing and means
 * every part of the document is represented. Pages are joined with a space so
 * the trailing word of one is not fused to the leading word of the next.
 */
function sampleAcrossPages(pages: ScorablePage[]) {
  if (pages.length === 0) return ""

  const perPage = Math.max(1, Math.floor(LIKENESS_SAMPLE_CHARS / pages.length))
  // A short document does not need thinning — take it whole, up to the budget.
  if (perPage >= LIKENESS_SAMPLE_CHARS) {
    return pages.map((page) => page.textContent).join(" ")
  }

  return pages.map((page) => page.textContent.slice(0, perPage)).join(" ")
}

/**
 * Share of tokens long enough to mean the extractor lost word boundaries.
 * Returns 0 for text with no tokens at all rather than dividing by zero.
 */
export function computeLongTokenRatio(text: string) {
  const tokens = text.split(/\s+/).filter((token) => token.length > 0)
  if (tokens.length === 0) return 0
  const long = tokens.filter((token) => token.length > LONG_TOKEN_CHARS).length
  return Math.round((long / tokens.length) * 10000) / 10000
}

/**
 * The most legibility a document may claim given how many of its words have run
 * together. Shared by the heuristic pass and the judge pass so the two cannot
 * disagree about a number neither of them is entitled to argue with.
 *
 * Returns 5 — no cap — when the measure is absent, which is the case for score
 * rows written before it existed.
 */
function legibilityCeilingFromBoundaries(metrics: { longTokenRatio?: number } | null) {
  const ratio = metrics?.longTokenRatio
  if (ratio == null) return 5
  if (ratio >= 0.05) return 2
  if (ratio >= 0.02) return 3
  return 5
}

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
  {
    coverRendered,
    structure,
  }: {
    coverRendered: boolean
    /**
     * Optional: the file's structure, from probePdfStructure. Optional because
     * it needs the PDF passages, which a rescore over stored page rows does not
     * have. Absent means "not measured", never "measured as fine".
     */
    structure?: PdfStructure
  }
): ExtractionMetrics {
  const lengths = pages.map((page) => page.textContent.length)
  const totalChars = lengths.reduce((sum, length) => sum + length, 0)
  const junkChars = pages.reduce((sum, page) => sum + countMatches(page.textContent, JUNK_CHAR), 0)

  const allText = pages.map((page) => page.textContent).join(" ")
  const likeness = computeLanguageLikeness(sampleAcrossPages(pages))

  return {
    pageCount: pages.length,
    pagesWithText: countPagesWithContent(pages),
    totalChars,
    medianCharsPerPage: median(lengths),
    junkCharRatio: totalChars > 0 ? junkChars / totalChars : 0,
    coverRendered,
    letterFreqSimilarity: likeness?.letterFreqSimilarity ?? undefined,
    functionWordsPerKChar: likeness?.functionWordsPerKChar ?? undefined,
    latinShare: likeness?.latinShare,
    glyphNameLeaks: countMatches(allText, GLYPH_NAME_LEAK),
    punctuationInWord: countMatches(allText, PUNCT_IN_WORD),
    longTokenRatio: computeLongTokenRatio(allText),
    ...(() => {
      const probe = probeHighlights(pages)
      return {
        anchorRate: probe.anchorRate ?? undefined,
        anchorSpansTested: probe.spansTested,
      }
    })(),
    ...(structure
      ? {
          picturePages: structure.pages.filter((page) => page.kind === "picture").length,
          spreadPages: structure.spreadPages,
          pagesWithGlyphs: structure.pagesWithGlyphs,
          scannedPages: structure.scannedPages,
          blankPages: structure.blankPages,
          glyphCount: structure.glyphCount,
          unmappedGlyphRatio: Math.round(structure.unmappedGlyphRatio * 10000) / 10000,
        }
      : {}),
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

  // Coverage is over pages that were SUPPOSED to carry text. A photograph, a
  // plate or a diagram has no text because it is not text, and counting it as
  // missing text punishes a document for being illustrated — which on this
  // library dragged two perfectly usable readings below the bar. A page that IS
  // laid out as prose and yields nothing still counts against it; that is the
  // scanned case, and the distinction is drawn in pdfStructure.
  const textBearingPages =
    metrics.picturePages != null && metrics.blankPages != null
      ? Math.max(1, metrics.pageCount - metrics.picturePages - metrics.blankPages)
      : metrics.pageCount
  const coverage = bandFromRatio(metrics.pagesWithText / textBearingPages)

  let legibility: number | null
  if (metrics.totalChars === 0) legibility = 1
  else if (metrics.junkCharRatio <= 0.001) legibility = 5
  else if (metrics.junkCharRatio <= 0.005) legibility = 4
  else if (metrics.junkCharRatio <= 0.02) legibility = 3
  else if (metrics.junkCharRatio <= 0.05) legibility = 2
  else legibility = 1

  // A document whose pages carry only a header's worth of text extracts
  // "cleanly" by the junk measure while being useless to read. Cap it.
  if (metrics.medianCharsPerPage < 200) legibility = Math.min(legibility, 3)

  // Words run together. Every other measure here is blind to this — the
  // characters are correct, the letter distribution is perfect, the common words
  // are all present — and yet a student quoting a sentence gets
  // `designismore thanastyle`. For a tool whose whole purpose is capturing
  // passages, that is a legibility failure however clean the passages are.
  //
  // The floor of 0.5% is our own line-end join, measured across this library;
  // the thresholds sit well clear of it. See LONG_TOKEN_CHARS.
  legibility = Math.min(legibility, legibilityCeilingFromBoundaries(metrics))

  // The junk-character count only sees characters that failed to resolve. A
  // font map that resolves to the *wrong* character produces clean ASCII and
  // scores 5 here, so gate the result on whether the text reads as language.
  // `latinShare` is the presence flag: it is set whenever the check ran at all,
  // including the non-Latin case where the two similarity measures abstain.
  // Keying off those measures instead would silently re-admit that case.
  const likeness: LanguageLikeness | null =
    metrics.latinShare != null
      ? {
          letterFreqSimilarity: metrics.letterFreqSimilarity ?? null,
          functionWordsPerKChar: metrics.functionWordsPerKChar ?? null,
          latinShare: metrics.latinShare,
        }
      : null
  const { ceiling, reason } = legibilityCeiling(likeness)
  // A null ceiling means the language check could not run. Abstain outright
  // rather than reporting the junk-passage number alone as if it settled the
  // question — the judge can still fill this in, since it reads the words.
  legibility = ceiling == null ? null : Math.min(legibility, ceiling)

  // Anchorability is measured, not inferred. It used to be "pages carrying 300
  // characters", which is a proxy for whether a highlight will hold and not the
  // thing itself — and the proxy was wrong here twice: two readings failed on it
  // while every simulated capture in them anchored perfectly. probeHighlights
  // runs the real mechanism instead, so this dimension now answers the question
  // it is named after.
  //
  // Falls back to the old page count only when nothing could be simulated, which
  // means the document had no page with a capture's worth of text on it.
  const anchorablePages = pages.filter(
    (page) => page.textContent.length >= ANCHOR_TEXT_FLOOR
  ).length
  const anchorability =
    metrics.totalChars === 0
      ? 1
      : metrics.anchorRate != null
        ? bandFromRatio(metrics.anchorRate)
        : bandFromRatio(anchorablePages / textBearingPages)

  const parts = [
    `${metrics.pagesWithText}/${textBearingPages} text pages have extractable text` +
      (metrics.picturePages ? ` (${metrics.picturePages} pictures not counted)` : ""),
    `median ${metrics.medianCharsPerPage.toLocaleString()} chars/page`,
  ]
  if (metrics.junkCharRatio > 0.005) {
    parts.push(`${(metrics.junkCharRatio * 100).toFixed(1)}% unreadable characters`)
  }
  if (metrics.anchorRate != null && metrics.anchorSpansTested) {
    parts.push(
      `${(metrics.anchorRate * 100).toFixed(0)}% of ${metrics.anchorSpansTested} simulated highlights anchor cleanly`
    )
  }
  if (reason) parts.push(reason)
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
  // Legibility joins coverage as a dimension that must actually have a value.
  // Without it "can a student quote this?" has no answer: coverage and
  // anchorability both measure how MUCH text there is, and a page can be full
  // of characters that are not words. Returning null here reports the reading
  // as unverified rather than accusing it of a defect nothing measured.
  if (overall == null || dimensions.coverage == null || dimensions.legibility == null) {
    return null
  }

  const scored = [
    dimensions.coverage,
    dimensions.legibility,
    dimensions.anchorability,
    dimensions.structure,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value))

  return overall >= 3 && Math.min(...scored) >= 3
}

/**
 * The render gate over a text verdict.
 *
 * The four dimensions all measure extracted TEXT, and The Universal Traveler
 * proved text is not the reading: a scan whose every page image failed to
 * decode scored 4.0 and passed, because its OCR text extracts fine — the one
 * signal that correlates with "the pages are blank", the cover render failing
 * the same way the viewer fails, was a sentence in the notes. A reading whose
 * pages do not render is not usable in Loom whatever its text scores, so the
 * failure holds `pass` down rather than decorating it.
 *
 * `coverRendered` missing (old metrics rows) means "not measured", never
 * "measured as broken" — the gate only acts on a measured failure.
 */
export function gatePassOnRender(pass: boolean | null, coverRendered: boolean | undefined) {
  if (pass !== true) return pass
  return coverRendered === false ? false : true
}

// --- LLM JUDGE ---

/** Pages spread evenly through the document, skipping ones with nothing to read. */
function sampleForJudge(pages: ScorablePage[]) {
  const usable = pages.filter((page) => page.textContent.trim().length > 0)
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
    `HOW THIS SAMPLE WAS BUILT — these are artefacts of the sampling, not defects ` +
    `in the document, and must NOT be penalised:\n` +
    `- It is a SAMPLE of a few pages spread through a longer document, so the page ` +
    `numbers are non-contiguous and jump. No pages are missing from the PDF.\n` +
    `- Each page is truncated at a fixed character budget, so every excerpt ends ` +
    `mid-sentence. That is the budget, not a truncated extraction.\n` +
    `- Line breaks appear as newlines, one per line of the page. A line ending ` +
    `mid-sentence is the page's own line wrapping, not a broken extraction.\n` +
    `DO judge whether words run together WITHIN a line — ` +
    `"designismore thanastyle option,corporatePropaganda" is a defect in the ` +
    `document, and it makes the text unquotable. Older readings may still be ` +
    `stored without line breaks; on those, fusion exactly AT a line end is an ` +
    `artefact of how they were extracted and should not be penalised, while ` +
    `fusion running through the middle of a line still should.\n` +
    `Judge only what is visible WITHIN each excerpt.\n\n` +
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
  {
    coverRendered,
    structure,
  }: {
    coverRendered: boolean
    /**
     * The file's own structure, when the caller has the bytes. Carries the two
     * defects no amount of page text reveals — a spread scanned as one sheet,
     * and glyphs resolving to nothing — into the stored metrics, where
     * diagnoseExtraction can route them to a repair.
     */
    structure?: PdfStructure
  }
) {
  const metrics = computeExtractionMetrics(pages, { coverRendered, structure })
  const heuristic = scoreFromMetrics(metrics, pages)
  const dimensions: Dimensions = {
    coverage: heuristic.coverage,
    legibility: heuristic.legibility,
    anchorability: heuristic.anchorability,
    // Reading order needs the judge; null until it runs.
    structure: null,
  }

  const pass = gatePassOnRender(passFromDimensions(dimensions), metrics.coverRendered)

  await upsertScore({
    sourceId,
    status: metrics.pageCount === 0 ? "unscorable" : "heuristic",
    coverage: heuristic.coverage,
    legibility: heuristic.legibility,
    anchorability: heuristic.anchorability,
    structure: null,
    overall: overallFromDimensions(dimensions),
    pass,
    notes: heuristic.notes,
    judgeNotes: "",
    judgeModel: null,
    metrics,
  })

  return { pass }
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
    // counted passages. Coverage and anchorability stay as computed: those are
    // measurements, and a model's opinion of them is worth less.
    //
    // Run-together words are a measurement too, and one the judge is poorly
    // placed to weigh: it sees a few sampled pages, and it is explicitly told to
    // forgive line-end fusions, which sit right beside the real thing. So the
    // deterministic ceiling is re-applied over the judge's answer — the judge may
    // lower legibility here, never raise it past what was counted.
    const judged = Math.min(verdict.legibility, legibilityCeilingFromBoundaries(existing.metrics))
    const dimensions = {
      coverage: existing.coverage,
      legibility: judged,
      anchorability: existing.anchorability,
      structure: verdict.structure,
    }

    await db
      .update(sourceScores)
      .set({
        status: "judged",
        // The capped value, not the raw verdict — writing the judge's answer
        // here while deriving `overall` and `pass` from the capped one would
        // put a number on the card that contradicts the verdict beside it.
        legibility: judged,
        structure: verdict.structure,
        overall: overallFromDimensions(dimensions),
        // The judge reads text; it cannot un-fail a reading whose pages do
        // not render. Same gate the heuristic pass applies.
        pass: gatePassOnRender(passFromDimensions(dimensions), existing.metrics?.coverRendered),
        judgeNotes: verdict.notes,
        judgeModel: judgeModelName(),
        scoredAt: new Date(),
      })
      .where(eq(sourceScores.sourceId, sourceId))
  } catch (error) {
    logWarn("score.judge-failed", { sourceId, cause: error })
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

  /**
   * Re-test the render rather than carrying the upload-time verdict forward.
   *
   * The verdict goes stale in both directions: a cover that failed on a
   * runtime that couldn't decode the scan (Node < 22.7, see pdfCover) keeps
   * failing a reading that now renders fine, and the old `?? true` backfill
   * let "never measured" read as "measured as fine". Rescore has to fetch the
   * blob anyway to probe structure, and a working render refreshes the stored
   * cover for free. A reading with no stored file (reference-only) keeps the
   * previous verdict — there is nothing to re-test.
   */
  const sourceRows = await db
    .select({ storageKey: sources.storageKey })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1)

  let coverRendered = rows[0]?.metrics?.coverRendered ?? true
  let structure: PdfStructure | undefined
  if (sourceRows[0]?.storageKey) {
    try {
      const buffer = await readingStorage.get(sourceRows[0].storageKey)
      structure = await probePdfStructure(buffer)
      try {
        const coverBuffer = await renderPdfCoverImage(buffer)
        await readingStorage.put(getSourceCoverKey(sourceId), coverBuffer)
        coverRendered = true
      } catch (error) {
        logWarn("score.cover-rerender-failed", { sourceId, cause: error })
        coverRendered = false
      }
    } catch (error) {
      // The blob itself was unreachable: nothing was measured, so nothing
      // about the previous verdict changes.
      logWarn("score.file-unavailable", { sourceId, cause: error })
    }
  }

  await recordHeuristicScore(sourceId, pages, { coverRendered, structure })
  await judgeSourceScore(sourceId)
}
