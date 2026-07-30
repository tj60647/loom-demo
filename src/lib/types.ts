export type Concept = {
  id: string
  courseId: string | null
  userId: string
  label: string
  def: string | null
  note: string | null
  createdAt: Date
}

export type Byte = {
  id: string
  courseId: string | null
  userId: string
  conceptId: string
  source: string | null
  sourceId: string | null
  location: string | null
  content: string
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
  pageContentHash: string | null
  createdAt: Date
}

// A reading in the shared library. Course-specific facts (published? which
// week?) live on course_source, not here — see LibrarySource below for the
// shape the learner-facing library returns.
export type Source = {
  id: string
  title: string
  author: string | null
  sourceReference: string | null
  description: string | null
  isDescriptionVisible: boolean
  metadataProvenance: string | null
  isArchived: boolean
  storageKey: string
  createdByUserId: string | null
  createdAt: Date
}

/**
 * Raw, deterministic facts about how well a PDF's text came out of extraction.
 * Kept alongside the derived 1–5 scores so a low score can always be traced
 * back to the numbers that produced it.
 */
export type ExtractionMetrics = {
  pageCount: number
  /** Pages carrying enough text to quote from — see PAGE_TEXT_FLOOR. */
  pagesWithText: number
  totalChars: number
  medianCharsPerPage: number
  /**
   * Share of characters that are replacement chars, control codes, or
   * private-use glyphs — a font map that resolved to no character at all.
   * Catches only that: a map resolving to the *wrong* character is clean ASCII
   * and registers 0 here, which is what the two fields below are for.
   */
  junkCharRatio: number
  /**
   * Cosine similarity of the document's a–z profile against English prose
   * (~1 for real text, well below for a permuted character mapping), and
   * occurrences of common English words per 1,000 characters.
   *
   * Optional: absent on rows scored before the language check existed, and on
   * documents with too little text to judge honestly.
   */
  letterFreqSimilarity?: number
  functionWordsPerKChar?: number
  /**
   * Share of letters that are a–z. Set whenever the language check ran, and so
   * the flag for whether it ran at all — the two measures above are themselves
   * absent for a largely non-Latin document, where they cannot apply.
   */
  latinShare?: number
  /** Whether the first page rendered to a cover image. */
  coverRendered: boolean
}

/** Extraction-quality score for one reading. Dimensions are 1–5, or null when unscored. */
export type SourceScore = {
  sourceId: string
  status: "heuristic" | "judged" | "unscorable"
  /** How much of the document has extractable text at all. */
  coverage: number | null
  /** Whether the extracted characters are legible text rather than garble. */
  legibility: number | null
  /** Whether pages carry enough text for highlight offsets to anchor. */
  anchorability: number | null
  /** Reading order / paragraph structure. Judge-only — null until judged. */
  structure: number | null
  overall: number | null
  pass: boolean | null
  notes: string
  judgeNotes: string
  judgeModel: string | null
  metrics: ExtractionMetrics | null
  scoredAt: Date
}

/** A library reading as seen from inside one course. */
export type CourseSourceLink = {
  courseId: string
  sourceId: string
  isVisible: boolean
  week: number | null
  isCore: boolean
  position: number
  createdAt: Date
}

export type Edge = {
  id: string
  courseId: string | null
  userId: string
  fromId: string
  toId: string
  handle: string | null
  sentence: string
  createdAt: Date
}

export type LoomState = {
  concepts: Concept[]
  bytes: Byte[]
  edges: Edge[]
  read: string
}
