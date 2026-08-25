import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  real,
  jsonb,
  boolean,
  unique,
  index,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import type { AdapterAccount } from "@auth/core/adapters"
import type { ExtractionMetrics } from "@/lib/types"

// --- NEXTAUTH TABLES ---

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: text("role").default("USER").notNull(),
})

export const allowedEmails = pgTable("allowed_email", {
  email: text("email").primaryKey(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

export const courses = pgTable("course", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // Free-text run label, e.g. "Fall 2026". Lets the same course be offered
  // again without cloning the reading library (see courseSources).
  term: text("term").default("").notNull(),
  description: text("description").default("").notNull(),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

// A course runs as several sections (~14 students each). Quilting and cohort
// views scope to a section; the reading library scopes to the course.
export const sections = pgTable(
  "section",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // Legacy free-text "Instructor of record" (migration 0006). Since
    // migration 0028 the lead is leadUserId below; this column is read only
    // as a display fallback for rows written before the reference existed,
    // and the actions stop writing it (a set reference clears it, so the
    // two can never disagree).
    lead: text("lead").default("").notNull(),
    // The section's lead, chosen from the course's FACULTY members (TJ,
    // 2026-08-21: "the lead should be a dropdown of course faculty").
    // set-null like courseMemberships.sectionId: deleting the user unsets
    // the lead rather than deleting the section.
    leadUserId: text("leadUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (section) => ({
    slugPerCourse: unique().on(section.courseId, section.slug),
  })
)

export const courseMemberships = pgTable(
  "course_membership",
  {
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null until an instructor assigns the learner to a section.
    sectionId: text("sectionId").references(() => sections.id, {
      onDelete: "set null",
    }),
    // Per-course role (ruling 18): "FACULTY" grants this course's read-side
    // admin view (checkCourseFaculty); set by setMemberRole or by enrolling
    // from an invitation addressed to the Faculty Section. Site-wide
    // authorization stays users.role.
    role: text("role").default("LEARNER").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    // The moment this membership was last chosen as the working course —
    // written only by setActiveCourse (src/actions/courses.ts), read only by
    // listEnrolledCourses' ordering (src/lib/courses.ts). Null for anyone who
    // never switched, so the oldest-course fallback is unchanged for them.
    // Survives soft-remove on purpose: reinstatement (enrolInvitedCourses'
    // conflict branch clears removedAt only) returns the person to the course
    // they were working in.
    selectedAt: timestamp("selectedAt"),
    // Soft-remove: set when an instructor removes the person from the course.
    // The row (and all their work) survives so re-inviting reinstates them;
    // rosters, aggregates and the sign-in gate treat the membership as ended.
    removedAt: timestamp("removedAt"),
  },
  (membership) => ({
    compoundKey: primaryKey({ columns: [membership.courseId, membership.userId] }),
  })
)

export const courseAllowedEmails = pgTable(
  "course_allowed_email",
  {
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // Optional pre-assignment: the learner lands in this section on first
    // sign-in instead of needing to be placed by hand afterwards.
    sectionId: text("sectionId").references(() => sections.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (row) => ({
    compoundKey: primaryKey({ columns: [row.courseId, row.email] }),
  })
)

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
)

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)

// --- SOURCE (PDF LIBRARY) TABLES ---

// A reading/document available in the library. The underlying file lives in
// backend-managed storage (see src/lib/storage.ts), not in /public, so access
// can be gated behind authentication.
// A reading in the shared library. Deliberately course-agnostic: the same PDF
// is uploaded, OCR'd, and stored once, then included in any number of courses
// via courseSources. Per-course facts (published? which week? core or
// supplemental?) live on the join, not here.
export const sources = pgTable(
  "source",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /**
     * Stable identity for a reading that `seed-sources.ts` owns. Null for
     * everything else, which is almost every row.
     *
     * The seed script used to find its readings by matching `title`, and title
     * is metadata an admin edits — Edit Entry offers it, and metadata drafting
     * rewrites it. Two of the three seed titles on the dev database had already
     * drifted to full bibliographic form ("Communities of practice and social
     * learning systems: the career of a concept" against the script's
     * "Communities of Practice"), and since nothing constrains `title` to be
     * unique, the next seeding run would not have failed — it would have
     * silently inserted a second row for a reading already present.
     *
     * A hash of the file would not fix this: the bytes legitimately change when
     * a repair is applied, so a repaired reading would stop matching itself.
     * Identity here has to be provenance, not content.
     */
    seedKey: text("seedKey").unique(),
    title: text("title").notNull(),
    author: text("author").default(""),
    sourceReference: text("sourceReference").default(""),
    description: text("description").default(""),
    isDescriptionVisible: boolean("isDescriptionVisible").default(true).notNull(),
    // Which kind of text this is — a history or a theory reading. Part of the
    // shared card, like author and description: the same reading is not history
    // in one course and theory in another. '' = not yet categorised.
    category: text("category").$type<"" | "history" | "theory">().default("").notNull(),
    metadataProvenance: text("metadataProvenance").default(""),
    // Retires a reading from the shared library without deleting the file or
    // disturbing courses that already include it.
    isArchived: boolean("isArchived").default(false).notNull(),
    // Key used to locate the file in the storage backend (see src/lib/storage.ts).
    // Null for a REFERENCE-ONLY reading: a card a student minted for something
    // they are coding that has no PDF here. Reading-first makes every passage belong
    // to a reading, so a source the library does not hold still needs a row —
    // otherwise its passages have no door and fall out of every lens.
    storageKey: text("storageKey"),
    // Size of the stored file in bytes, recorded at ingest and refreshed
    // wherever the file changes: reingestSource on every re-ingest (4363c0e),
    // repairApply atomically with the storageKey rotation (2026-08-20), and
    // the seed script when it re-stores a file. (A note here on 08-19 — and
    // commit 91e69b2 — claimed repaired readings served a pre-repair
    // Content-Length; that was false since 08-14, reingest rewrote it moments
    // after each rotation.) Serving-time metadata, not identity —
    // the identity argument above still holds. It exists so the reading route
    // can send Content-Length on a streamed body: without it pdf.js cannot
    // show download progress against a total, and the 4.5MB-cap comment on
    // that route explains why buffering to measure is not an option. Null on
    // rows ingested before the column existed.
    byteLength: integer("byteLength"),
    // A reading a student added for themselves. It sits on their shelf only: it
    // has no course_source row, so it never reaches anyone else's.
    isOwn: boolean("isOwn").default(false).notNull(),
    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (source) => ({
    // Weighted full-text search over the reading's card: the title outranks
    // the author, which outranks the citation and blurb. The query side
    // (src/actions/search.ts) must repeat this expression verbatim — an
    // expression index only serves queries that match it exactly.
    searchIdx: index("source_search_idx").using(
      "gin",
      sql`(setweight(to_tsvector('english', coalesce(${source.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${source.author}, '')), 'B') || setweight(to_tsvector('english', coalesce(${source.sourceReference}, '')), 'C') || setweight(to_tsvector('english', coalesce(${source.description}, '')), 'C'))`
    ),
  })
)

// Inclusion of a library reading in one course, plus the facts that are true
// only in that course's context.
export const courseSources = pgTable(
  "course_source",
  {
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    sourceId: text("sourceId")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    // Published to learners in this course. A reading can be visible in one
    // course and staged-but-hidden in another.
    isVisible: boolean("isVisible").default(true).notNull(),
    // Course week the reading is assigned to; null means unscheduled.
    week: integer("week"),
    // Core readings are the instrumented set students must graph; supplemental
    // readings are available but not required.
    isCore: boolean("isCore").default(true).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (row) => ({
    compoundKey: primaryKey({ columns: [row.courseId, row.sourceId] }),
  })
)

// Canonical, server-extracted plain text for each page of a source. This is
// the stable anchor used to compute and validate highlight offsets, since the
// client-side pdf.js text layer is not guaranteed to be byte-stable across
// renders/versions.
export const sourcePages = pgTable(
  "source_page",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceId: text("sourceId")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    pageNumber: integer("pageNumber").notNull(),
    textContent: text("textContent").notNull(),
    // Hash of textLayerProjection(textContent) — the browser's offset substrate,
    // not the stored string (see sources.ts / reingest.ts, the two writers) —
    // duplicated onto passages.pageContentHash at capture time so we can
    // cheaply detect drift without re-fetching this row.
    contentHash: text("contentHash").notNull(),
    // The page's own size in PDF points, from the same extraction pass that
    // produced textContent. A document fact, like the text — NOT display
    // geometry (red line 7 is about student gestures). The viewer needs it
    // BEFORE any page has rendered: scanned books vary a few percent page to
    // page, and a viewer that guesses one shared aspect re-lays its grid and
    // re-renders every mounted page each time a differently-sized page
    // corrects the guess. Null on rows extracted before this column existed;
    // scripts/backfill-page-assets.ts fills them in.
    width: real("width"),
    height: real("height"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (page) => ({
    // Full-text search across the canonical page text. Same contract as the
    // source index above: search queries must use this exact expression.
    searchIdx: index("source_page_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${page.textContent})`
    ),
  })
)

// How well a reading survived PDF text extraction: one row per source, holding
// 1–5 scores on the dimensions that decide whether the PDF is actually usable
// inside Loom (can students quote it? will highlights anchor?).
//
// Scoring runs in two passes. The deterministic pass runs at upload time from
// the pages already in hand, and is what `status: "heuristic"` means. An
// optional LLM judge then reads sampled pages and refines `legibility` while
// filling in `structure`, giving `status: "judged"`. A judge that is not
// configured, errors, or returns unparseable output leaves the row heuristic
// with its dimension null rather than folding a guess in as a real score.
export const sourceScores = pgTable("source_score", {
  sourceId: text("sourceId")
    .primaryKey()
    .references(() => sources.id, { onDelete: "cascade" }),
  status: text("status").$type<"heuristic" | "judged" | "unscorable">().default("heuristic").notNull(),
  coverage: integer("coverage"),
  legibility: integer("legibility"),
  anchorability: integer("anchorability"),
  // Judge-only: no heuristic can tell scrambled column order from prose.
  structure: integer("structure"),
  // Mean of whichever dimensions are non-null, so an unscored dimension
  // abstains instead of dragging the average down as a zero.
  overall: real("overall"),
  pass: boolean("pass"),
  notes: text("notes").default("").notNull(),
  judgeNotes: text("judgeNotes").default("").notNull(),
  judgeModel: text("judgeModel"),
  metrics: jsonb("metrics").$type<ExtractionMetrics>(),
  scoredAt: timestamp("scoredAt").defaultNow().notNull(),
})

/**
 * A damaged region of a reading, and the proposals for repairing it.
 *
 * Scan damage is local — a mis-read column, a sideways caption — so the unit is
 * a region on a page, not the reading. Each row is a PROPOSAL until an admin
 * accepts it: the pipeline that produces them writes nothing to the reading
 * itself, and `appliedAt` is the only thing that says a repair reached a student.
 *
 * Transcription is the one step here that cannot be reproduced. The same crop
 * read again gives a different reading, so the record is what makes the process
 * accountable rather than the ability to re-derive it — which is why the
 * accepted text, who accepted it, and the readings it came from are all stored
 * rather than recomputed.
 */
export const sourceRepairs = pgTable("source_repair", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceId: text("sourceId")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  pageNumber: integer("pageNumber").notNull(),
  /**
   * The storageKey this damage was measured against. A decision is only valid
   * for the file it was made about — if the reading's PDF is replaced, older
   * proposals no longer describe it.
   */
  measuredAgainstKey: text("measuredAgainstKey").notNull(),
  /** Region box in rendered pixels, with the scale it was measured at. */
  region: jsonb("region").$type<{ x: number; y: number; width: number; height: number; scale: number }>().notNull(),
  /** Blob key of the cropped image an admin reviews. */
  cropKey: text("cropKey").notNull(),
  /** What the PDF extracts here now, and the words that are not words. */
  currentText: text("currentText").default("").notNull(),
  garbledWords: jsonb("garbledWords").$type<string[]>().default([]).notNull(),
  garbleRate: real("garbleRate"),
  /**
   * proposed  — readings gathered, awaiting an admin
   * accepted  — an admin approved text; not yet written into a PDF
   * rejected  — an admin declined; kept so it is not re-proposed forever
   * applied   — written into a new revision of the reading
   */
  status: text("status").$type<"proposed" | "accepted" | "rejected" | "applied">().default("proposed").notNull(),
  /** Text every reader agreed on, before any human edit. */
  agreedText: text("agreedText").default("").notNull(),
  /** Passages the readers differed on — where a reviewer's attention belongs. */
  disagreements: jsonb("disagreements").$type<{ passage: string; readings: string[] }[]>().default([]).notNull(),
  /**
   * How the vote went: how many readers, what carried a sentence, how the
   * backing was distributed, and how often each reader was with the majority.
   *
   * Kept because it is the only way to tell a panel that is working from one
   * that is expensive. A reader consistently outvoted is a reader to replace,
   * and that is invisible in the accepted text.
   */
  votes: jsonb("votes").$type<{
    readers: number
    majority: number
    distinctSentences: number
    distribution: number[]
    perReader: { reader: number; withMajority: number; outvoted: number; solo: number; agreementRate: number }[]
  }>(),
  /** What the admin actually approved, which may be their own correction. */
  acceptedText: text("acceptedText"),
  acceptedByUserId: text("acceptedByUserId").references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp("acceptedAt"),
  /** Why, when an admin rejects or overrides — the record is the point. */
  reviewNote: text("reviewNote").default("").notNull(),
  appliedAt: timestamp("appliedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

/**
 * One model's independent reading of a damaged region.
 *
 * Kept per reader rather than merged, because agreement is the signal and
 * agreement cannot be recovered from an average. Measured on a real page: three
 * readers transcribed a truncated caption as "from Sadda" and refused to guess
 * while a fourth completed it to "from Saddam" — a merged result would have
 * hidden exactly the disagreement worth seeing.
 */
export const sourceRepairReadings = pgTable("source_repair_reading", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  repairId: text("repairId")
    .notNull()
    .references(() => sourceRepairs.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  /** Which of the independent readers this was, 1-based. */
  reader: integer("reader").notNull(),
  text: text("text").default("").notNull(),
  /** Passages the reader itself flagged as unsure — honesty, recorded. */
  uncertain: jsonb("uncertain").$type<string[]>().default([]).notNull(),
  illegibleShare: text("illegibleShare").$type<"none" | "some" | "much" | "most">(),
  /**
   * What this reading actually cost, as OpenRouter reported it — not derived
   * from a price table, which would go stale silently. Null when the API did
   * not report a figure, which is not the same as free.
   */
  promptTokens: integer("promptTokens"),
  completionTokens: integer("completionTokens"),
  costUsd: real("costUsd"),
  /** How long the model took. Slow readers are worth seeing next to their cost. */
  durationMs: integer("durationMs"),
  /** The model ran out of room; kept as a record, excluded from the vote. */
  truncated: boolean("truncated").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

/**
 * One revision event of a reading's stored file — the lineage the blob store
 * has always had and the database could not see.
 *
 * Applying a repair rotates `sources.storageKey` to a new blob and keeps the
 * old one "retrievable" — but until this table, retrievable meant "present in
 * the store with nothing addressing it": `measuredAgainstKey` on pending
 * proposals was the only record of a prior key, deleteSource stranded every
 * superseded blob forever, and "which file did students read in week 3?" had
 * no answer. A row here per rotation makes the chain walkable: the library
 * audit reads it, and deleteSource walks it on the way out (since 2026-08-20;
 * before that superseded blobs stranded). Rollback is still to come.
 *
 * Append-only by convention: rows record what happened and are never edited.
 */
export const sourceRevisions = pgTable(
  "source_revision",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sourceId: text("sourceId")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** The key this revision made current. */
    storageKey: text("storageKey").notNull(),
    /** The key it superseded — the file a student saw the day before. */
    predecessorKey: text("predecessorKey"),
    /** Why, in a sentence: which repairs, applied by whom. The record is the point. */
    reason: text("reason").default("").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (row) => ({
    bySource: index("source_revision_source_idx").on(row.sourceId),
  })
)

// --- LOOM TABLES ---

export const concepts = pgTable(
  "concept",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId").references(() => courses.id, {
      onDelete: "set null",
    }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    def: text("def").default(""),
    note: text("note").default(""),
    // No tier here: Concept Tiers are per-map (`maps.tiers`). The concept.tier
    // mirror was dropped in 0021 (docs/loom-refactor-spec.md P0.5).
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (concept) => ({
    // Unified search, scope 3 (ruling 34): label outranks gloss outranks
    // note. The query in src/actions/search.ts repeats this expression
    // verbatim — an expression index only serves exact matches.
    searchIdx: index("concept_search_idx").using(
      "gin",
      sql`(setweight(to_tsvector('english', coalesce(${concept.label}, '')), 'A') || setweight(to_tsvector('english', coalesce(${concept.def}, '')), 'B') || setweight(to_tsvector('english', coalesce(${concept.note}, '')), 'C'))`
    ),
  })
)

// A passage — one captured passage. Concepts attach via `passage_concept` (0..n):
// a passage with zero rows there is an Unlabeled Passage, a legal first-class
// state (docs/loom-model-build.md §2 Passage). Deleting a concept never
// deletes a passage — the passage survives its labels.
/**
 * Passages.
 *
 * Called `byte` until migration 0023 (2026-08-09), which renamed the table,
 * its join, their indexes and constraints, and the `graph_event.kind` values
 * that had already been written as "passage.capture" and friends. Nothing in this
 * repo calls a Passage a byte any more.
 *
 * Where you still meet the word, it is FILE DATA and never a Passage:
 * `formatBytes`, `byteLength`, `maximumSizeInBytes`, textLayerRepair's
 * `bytes: Buffer`, `src/lib/storage.ts`. Those are octets.
 */
export const passages = pgTable("passage", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  courseId: text("courseId").references(() => courses.id, {
    onDelete: "set null",
  }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Free-text label, kept for manually-captured passages (e.g. from OpenTab)
  // that aren't tied to a library PDF.
  source: text("source").default(""),
  // Set when the passage was captured from a library PDF via PdfViewer.
  sourceId: text("sourceId").references(() => sources.id, {
    onDelete: "set null",
  }),
  location: text("location").default(""),
  content: text("content").notNull(),
  pageNumber: integer("pageNumber"),
  startOffset: integer("startOffset"),
  endOffset: integer("endOffset"),
  // Hash of the page text string these offsets were computed against. Usually
  // this is sourcePages.textContent; when the browser pdf.js layer differs, it
  // can be the live client text layer hash so markRanges remains precise.
  pageContentHash: text("pageContentHash"),
  // The student's own margin, riding the passage itself (P0.2).
  note: text("note").default("").notNull(),
  question: text("question").default("").notNull(),
  isPullQuote: boolean("isPullQuote").default(false).notNull(),
  // Passage Tier — ordinal on the passage ('' unranked · p/s/t), distinct
  // from the per-map Concept Tiers in `maps.tiers`.
  tier: text("tier").$type<"" | "p" | "s" | "t">().default("").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
},
(passage) => ({
  // Unified search over the student's own captures: the passage text
  // outranks their margin. Query side repeats this expression verbatim.
  searchIdx: index("passage_search_idx").using(
    "gin",
    sql`(setweight(to_tsvector('english', ${passage.content}), 'B') || setweight(to_tsvector('english', coalesce(${passage.note}, '')), 'C') || setweight(to_tsvector('english', coalesce(${passage.question}, '')), 'C'))`
  ),
}))

// Which concepts a passage evidences — the passage↔concept pointers of ruling 37.
// Zero rows = an Unlabeled Passage; several rows = one passage filed under
// several concepts (refile adds a pointer, never copies the passage). Cascades
// both ways: losing either end removes the pointer, never the other end.
export const passageConcepts = pgTable(
  "passage_concept",
  {
    passageId: text("passageId")
      .notNull()
      .references(() => passages.id, { onDelete: "cascade" }),
    conceptId: text("conceptId")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (row) => ({
    pk: primaryKey({ columns: [row.passageId, row.conceptId] }),
    byConcept: index("passage_concept_concept_idx").on(row.conceptId),
  })
)

// A cloth — the per-scope workspace identity: the student's own title for
// their engagement with a reading (or the whole weave, scopeKey ''), plus a
// short interpretation (docs/loom-model-build.md §2 Cloth). Absorbed the old
// `read` table in 0021: the whole-weave row's text became the whole-weave
// cloth's description. One row per scope for now; several cloths per reading
// (and maps keyed by clothId) are future work.
export const cloths = pgTable(
  "cloth",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId").references(() => courses.id, {
      onDelete: "set null",
    }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopeKey: text("scopeKey").default("").notNull(),
    title: text("title").default("").notNull(),
    description: text("description").default("").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (row) => ({
    // NULLS NOT DISTINCT so the pre-course (courseId null) row is unique too —
    // the same guard the old `read` table carried against concurrent saves
    // minting duplicates and the student's text flapping between them.
    onePerScope: unique().on(row.userId, row.courseId, row.scopeKey).nullsNotDistinct(),
  })
)

// A map — one named, per-scope sorting of the student's concepts, plus its
// interpretive paragraph and one-line essence. Maps are PARALLEL SIBLINGS
// (freely created / renamed / deleted), not sealed passes — ratified 2026-07-31,
// superseding the linear model of docs/archive/reading-scope-and-map-passes.md §B.2.
// Meaning lives here (spec §6 graph side); the card-table geometry for map <id>
// lives in the `view` row keyed `map:<id>`. scopeKey '' = the whole weave,
// otherwise the sorted comma-joined sourceIds of src/lib/scope.ts — a reading
// today, a set of readings when subsets ship.
//
// 0021 dropped the expand-phase mirrors (`concept.tier`, the `read` table):
// tiers live only here, per map, and the whole-weave paragraph lives on the
// whole-weave cloth (docs/loom-refactor-spec.md P0.5).
export const maps = pgTable(
  "map",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId").references(() => courses.id, {
      onDelete: "set null",
    }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopeKey: text("scopeKey").default("").notNull(),
    name: text("name").notNull(),
    read: text("read").default("").notNull(),
    essence: text("essence").default("").notNull(),
    // { [conceptId]: 'p' | 's' | 't' | 'x' } — absent key = unsorted ('').
    tiers: jsonb("tiers")
      .$type<Record<string, "p" | "s" | "t" | "x">>()
      .default({})
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (row) => ({
    // Non-unique: several maps per scope is the point. No unique constraint at
    // all, so orphan-adoption can be a blind UPDATE like concepts'.
    byScope: index("map_user_course_scope_idx").on(row.userId, row.courseId, row.scopeKey),
  })
)

// Per-view, student-authored display geometry — a projection of the graph,
// never part of it. Spec §6: adding a view adds a row here (a key under
// `views`), never a field on a concept or edge; only student gestures write
// rows (red line #7 — derived layout is computed for display and discarded).
// key: 'cardTable' first; data: { positions: {conceptId:{x,y}}, bends: {edgeId:{dx,dy}} }.
export const views = pgTable(
  "view",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId").references(() => courses.id, {
      onDelete: "set null",
    }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (row) => ({
    onePerView: unique().on(row.userId, row.courseId, row.key).nullsNotDistinct(),
  })
)

// Append-only record of the student's own graph acts (create / rename / throw
// / coin / delete / reset). This is the development history of
// the knowledge graph — provenance the student can explore ("the cloth, over
// time"), never a surface that grades or advises (red line #7: counted, not
// judged). Deliberately survives reset: reset clears the cloth, not
// the loom's memory of weaving. Import was deleted 2026-08-11; its kinds
// (graph.import, map.import, graph.example) live on only as historical rows.
// Best-effort writes (neon-http has no
// transactions): the graph tables stay the source of truth.
export const graphEvents = pgTable("graph_event", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  courseId: text("courseId").references(() => courses.id, {
    onDelete: "set null",
  }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // '<entity>.<act>', e.g. 'concept.create', 'concept.retier', 'edge.coin',
  // 'passage.capture', 'cloth.update', 'graph.import', 'graph.reset',
  // 'graph.example'.
  kind: text("kind").notNull(),
  // "reading" joined the seven on 2026-08-17, when removing a reading of your
  // own became an act a student can take. Free text in the column, like
  // `kind` — the union is the vocabulary, not a constraint, so no migration.
  entityType: text("entityType")
    .$type<"concept" | "passage" | "edge" | "link" | "graph" | "map" | "cloth" | "reading">()
    .notNull(),
  entityId: text("entityId"),
  // Enough of the entity to replay the graph at any point in the timeline.
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  at: timestamp("at").defaultNow().notNull(),
})

/**
 * A Link — the reusable relationship the student owns (5.1, migration 0024;
 * "links are user-level", TJ 2026-08-10).
 *
 * USER-LEVEL, like a Concept: the student can write their own gloss on "leads
 * to", which a shared read-only vocabulary could not offer. The Link holds the
 * Label and its Description; a Thread (`edge`) holds the two Concepts and its
 * own per-pair sentence. That split is what lets a Link exist BEFORE any
 * thread uses it — TJ's case, and unrepresentable while the label was a
 * string on the edge.
 *
 * No unique on label: homonyms are warned, never forbidden (ruling 36), the
 * same rule Concepts live under. `mergeLinks` is the repair, and is still to
 * come.
 */
export const links = pgTable(
  "link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId").references(() => courses.id, {
      onDelete: "set null",
    }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").default("").notNull(),
    /** The Link's own gloss — one meaning, shared by every thread using it. */
    description: text("description").default("").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (link) => ({
    byUser: index("link_user_course_idx").on(link.userId, link.courseId),
    // Label outranks gloss, as the handle did. Query side repeats verbatim.
    searchIdx: index("link_search_idx").using(
      "gin",
      sql`(setweight(to_tsvector('english', coalesce(${link.label}, '')), 'A') || setweight(to_tsvector('english', coalesce(${link.description}, '')), 'B'))`
    ),
  })
)

export const edges = pgTable(
  "edge",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId").references(() => courses.id, {
      onDelete: "set null",
    }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromId: text("fromId")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    toId: text("toId")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    /**
     * LEGACY, kept through the expand phase of 5.1 (migration 0024). The Link
     * Label lives on `link` now; this column is still written and still read
     * as a fallback so that nothing breaks while the code changes over, and
     * so an unmigrated reader keeps working. Its drop is a later migration.
     */
    handle: text("handle").default(""),
    /** The Link this thread uses. Null = thrown but not yet labelled (P0.3). */
    linkId: text("linkId").references(() => links.id, { onDelete: "set null" }),
    // The link description — optional at throw (golden path: connect first,
    // describe when ready). Default '' rather than nullable so render code
    // never branches (P0.3).
    sentence: text("sentence").default("").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (edge) => ({
    // Unified search over the student's links: the coined term outranks the
    // sentence. Query side repeats this expression verbatim.
    searchIdx: index("edge_search_idx").using(
      "gin",
      sql`(setweight(to_tsvector('english', coalesce(${edge.handle}, '')), 'A') || setweight(to_tsvector('english', coalesce(${edge.sentence}, '')), 'B'))`
    ),
  })
)

/**
 * EVERY SIGN-IN DECISION, KEPT.
 *
 * TJ, 2026-08-24, after a student wrote to say he could not get in and nothing
 * on the server could say which address he had presented: "we need better
 * logging then, correct?"
 *
 * The gate had no memory. `decideSignIn` returned an allow or a redirect and
 * recorded neither, so the only trace of a refusal was a `/auth/error` request
 * in Vercel's log — which keeps the timestamp and DROPS the query string, so
 * not even the address survived. Checked against production on 2026-08-24: 20
 * refusals over two days, twelve of them in two bursts of five and six minutes
 * apart, and not one of them attributable to a person.
 *
 * BOTH OUTCOMES, not only refusals (TJ, same day). "When did Cheng last get
 * in?" is as much the question as "why can't he", and a table that only
 * remembers failures cannot answer the first — nor tell you that a burst of
 * refusals ended in a success, which is the shape of somebody solving it.
 *
 * WHAT IT DELIBERATELY DOES NOT KEEP is the candidate list. GitHub hands Loom
 * every confirmed address on the account, and storing them would hoard a
 * person's other identities to answer a question the outcome already answers.
 * The COUNT would have been worth keeping and there is no clean way to get it
 * here: the GitHub provider's own `profile()` maps four fields and drops
 * anything the userinfo override adds, so a `candidates` column would have
 * read 0 forever. It goes to the operational log instead, where the count is
 * known — the `auth.identity` line in src/lib/auth.ts.
 *
 * PRUNED AT 180 DAYS (TJ, same day). A row per attempt grows without bound,
 * and an audit trail nobody bounds becomes a liability rather than a record —
 * see pruneAuthEvents.
 */
export const authEvents = pgTable(
  "auth_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    at: timestamp("at").defaultNow().notNull(),
    /**
     * The address the gate was ASKED ABOUT — the one `decideSignIn` tested and
     * allowed or refused. On a first GitHub sign-in that is the identity
     * resolver's pick; on a returning one it is the address Loom stored; on
     * the guest door it is what was typed. Lowercased by normalizeEmail
     * before it ever reaches here.
     */
    email: text("email").notNull(),
    /** `allowed` | `not-on-roster` | `no-verified-email`. The union is the
     *  vocabulary, not a constraint — the same choice graph_event.kind makes. */
    outcome: text("outcome").notNull(),
    /** `github` | `email` — which door was tried. */
    provider: text("provider").default("").notNull(),
    /**
     * WHO, WHERE THERE IS NO ADDRESS TO NAME.
     *
     * A `no-verified-email` refusal means GitHub confirmed no address at all,
     * so `email` above is empty and the row names nobody — six such refusals
     * cannot be told from one person retrying six times. The provider does
     * hand over a display name (GitHub's `name`, falling back to the login),
     * and that is a public handle rather than a private address, so keeping it
     * does not cross the line the identity resolver draws in src/lib/auth.ts.
     *
     * Empty wherever the address is enough, which is every other outcome.
     */
    handle: text("handle").default("").notNull(),
  },
  (row) => ({
    // Reading is always "the recent ones", and pruning is always "the old
    // ones" — one descending index serves both.
    recent: index("auth_event_at_idx").on(row.at),
    // "Has this person ever got in?" is the question a professor actually
    // asks, and it is asked by address.
    byEmail: index("auth_event_email_idx").on(row.email),
  })
)
