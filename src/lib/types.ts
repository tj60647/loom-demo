/** Per-map concept sort: '' unsorted · p/s/t tiers · x set aside. */
export type Tier = "" | "p" | "s" | "t" | "x"

/** Passage tier — on the passage itself. '' unranked; no "set aside" for passages. */
export type PassageTier = "" | "p" | "s" | "t"

export type Concept = {
  id: string
  courseId: string | null
  userId: string
  label: string
  def: string | null
  note: string | null
  createdAt: Date
}

export type Passage = {
  id: string
  courseId: string | null
  userId: string
  /**
   * The concepts this passage evidences (byte_concept join, capture order).
   * Empty = an Unlabeled Passage — a legal, first-class state.
   */
  conceptIds: string[]
  source: string | null
  sourceId: string | null
  location: string | null
  content: string
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
  pageContentHash: string | null
  /** The student's own margin, on the passage itself. */
  note: string
  question: string
  isPullQuote: boolean
  tier: PassageTier
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
  /** Null for a reference-only reading — a card with no PDF behind it. */
  storageKey: string | null
  isOwn: boolean
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
  /**
   * Occurrences of PDF glyph names left in the text (`/f_i`, `/ffi`,
   * `/hyphen.cap`). A font whose /ToUnicode map is absent falls back to naming
   * its glyphs, and the names survive extraction as ordinary ASCII — invisible
   * to junkCharRatio, which is why this is counted separately.
   */
  glyphNameLeaks?: number
  /**
   * Punctuation marks sitting between two letters (`INTERAC$IVE`). The
   * signature of ligature codes resolving to the ASCII punctuation that happens
   * to share their passage value.
   */
  punctuationInWord?: number
  /**
   * Share of whitespace-delimited tokens long enough to mean lost word
   * boundaries. Biased upward — see LONG_TOKEN_CHARS.
   */
  longTokenRatio?: number
  /**
   * Structural facts read from the file rather than the text, by
   * src/lib/pdfStructure.ts. Absent on rows scored before the probe existed.
   *
   * `spreadPages` is the one no text measure can substitute for: a book opening
   * scanned as a single landscape sheet extracts as clean prose and passes
   * every other check while reading across the gutter.
   */
  spreadPages?: number
  pagesWithGlyphs?: number
  /**
   * Share of simulated captures that would anchor cleanly, and how many were
   * tried. This is what `anchorability` is scored from — a direct test of the
   * mechanism rather than a character count standing in for it.
   */
  anchorRate?: number
  anchorSpansTested?: number
  /**
   * Pages that are photographs, plates or diagrams. They have no text because
   * they are not text, so they are excluded from `coverage` rather than counted
   * against it.
   */
  picturePages?: number
  /** Pages showing an image with no text over it — the only pages OCR helps. */
  scannedPages?: number
  /** Pages with neither text nor image. Blank leaves, not a defect. */
  blankPages?: number
  glyphCount?: number
  /** Share of glyphs that resolved to no usable character at all. */
  unmappedGlyphRatio?: number
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

/**
 * Student-authored geometry for the card table. A projection of the graph,
 * never part of it (spec §6): stored per view key in the `view` table, written
 * only by student gestures (red line #7) — derived auto-layout is computed for
 * display and discarded.
 *
 * `positions[..].x` is stored PROPORTIONALLY (0..1, fraction of table width —
 * spec §5 "positions stored proportionally") so an arrangement survives a
 * narrower screen; `y` is absolute within the fixed-height table. Legacy or
 * v14-imported values > 1.5 are treated as pixels and converted on first
 * render; the next drag persists the fraction.
 */
export type CardTableView = {
  positions: Record<string, { x: number; y: number }>
  bends: Record<string, { dx: number; dy: number }>
  /**
   * Student-chosen order of the sort list (concept ids). A projection like the
   * rest of this view — it re-sequences the Map tab's list only, and never the
   * graph's own capture order, which the arc map reads as "reading order".
   * Concepts missing from the array fall back to capture order after it.
   */
  order?: string[]
  /**
   * Cards whose working definition the student pinned open on the table
   * (concept ids). Replaces the global "show definitions" toggle: that one
   * resized every card at once, on a table whose positions were arranged at
   * the other size. A pin is a student gesture, so it belongs here.
   */
  pins?: string[]
}

/**
 * A map — one named, per-scope sorting of the student's concepts, with its own
 * interpretive paragraph and one-line essence. Maps are parallel siblings
 * (freely created, renamed, deleted), not sealed versions. Meaning lives here
 * (spec §6 graph side); the card-table geometry for map `id` is the `views`
 * entry keyed `map:<id>`.
 */
export type LoomMap = {
  id: string
  courseId: string | null
  userId: string
  /** '' = the whole weave; else sorted comma-joined sourceIds (src/lib/scope.ts). */
  scopeKey: string
  name: string
  read: string
  essence: string
  /** Per-concept tier on THIS map. '' is never stored — absent = unsorted. */
  tiers: Record<string, Tier>
  createdAt: Date
  updatedAt: Date
}

export type LoomViews = {
  /** Legacy single table — kept for pre-maps geometry; maps carry their own. */
  cardTable: CardTableView
  /** `map:<id>` keys carry each map's own geometry. */
  [key: string]: CardTableView
}

/**
 * A cloth — the per-scope workspace identity: the student's own title for
 * their engagement with a reading (scopeKey as in maps; '' = whole weave)
 * plus a short interpretation. Absorbed the old `read` mirror in 0021.
 */
export type Cloth = {
  id: string
  courseId: string | null
  userId: string
  scopeKey: string
  title: string
  description: string
  createdAt: Date
  updatedAt: Date
}

/** One student act on the graph, as recorded in the append-only history. */
export type GraphEvent = {
  id: string
  courseId: string | null
  userId: string
  kind: string
  entityType: "concept" | "byte" | "edge" | "graph" | "map" | "cloth"
  entityId: string | null
  payload: Record<string, unknown> | null
  at: Date
}

export type LoomState = {
  concepts: Concept[]
  passages: Passage[]
  edges: Edge[]
  maps: LoomMap[]
  /** One per scope the student has titled or described ('' = whole weave). */
  cloths: Cloth[]
  views: LoomViews
}

// --- EXPORT CONTRACT (spec §6) ---
// `graph` is the artifact — view-agnostic, portable, the thing an agent or a
// future reader consumes. `views` round-trips so no arrangement work is lost,
// but no consumer of the graph is required to read it.

/**
 * Capture provenance for a passage taken from a library PDF. An extension to the
 * §6 passage shape (recorded in the spec changelog): part of the student's own
 * record, safe for consumers to ignore.
 */
export type ExportByteAnchor = {
  sourceId: string
  pageNumber: number | null
  startOffset: number | null
  endOffset: number | null
  pageContentHash: string | null
}

export type LoomExport = {
  graph: {
    student: string
    concepts: { id: string; label: string; def: string; note: string }[]
    passages: {
      id: string
      /** Empty array = an Unlabeled Passage. Legacy files carry `conceptId`. */
      conceptIds: string[]
      source: string
      location: string
      text: string
      /** The passage's margin — emitted only when set. */
      note?: string
      question?: string
      isPullQuote?: boolean
      tier?: PassageTier
      anchor?: ExportByteAnchor
    }[]
    edges: { id: string; fromId: string; toId: string; sentence: string; handle: string }[]
    /**
     * Cloth titles/descriptions per scope ('' = whole weave). Replaces the
     * legacy top-level `read` string, which import still accepts and folds
     * into the whole-weave cloth.
     */
    cloths?: { id: string; scopeKey: string; title: string; description: string }[]
    /**
     * The student's maps. Older files lack it (and carry `concepts[].tier` +
     * `read` instead); import synthesizes a whole-weave map from those.
     */
    maps?: {
      id: string
      scopeKey: string
      name: string
      essence: string
      read: string
      tiers: Record<string, Tier>
    }[]
  }
  views: {
    cardTable: {
      positions: Record<string, { x: number; y: number }>
      bends: Record<string, { dx: number; dy: number }>
      order?: string[]
      pins?: string[]
    }
    /** Per-map geometry, keyed by map id (symbolic on import). */
    maps?: Record<
      string,
      {
        positions: Record<string, { x: number; y: number }>
        bends: Record<string, { dx: number; dy: number }>
        order?: string[]
        pins?: string[]
      }
    >
  }
}
