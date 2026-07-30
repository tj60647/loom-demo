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
} from "drizzle-orm/pg-core"
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
    lead: text("lead").default("").notNull(),
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
    role: text("role").default("LEARNER").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
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
export const sources = pgTable("source", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  author: text("author").default(""),
  sourceReference: text("sourceReference").default(""),
  description: text("description").default(""),
  isDescriptionVisible: boolean("isDescriptionVisible").default(true).notNull(),
  metadataProvenance: text("metadataProvenance").default(""),
  // Retires a reading from the shared library without deleting the file or
  // disturbing courses that already include it.
  isArchived: boolean("isArchived").default(false).notNull(),
  // Key used to locate the file in the storage backend (see src/lib/storage.ts).
  storageKey: text("storageKey").notNull(),
  createdByUserId: text("createdByUserId").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

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
export const sourcePages = pgTable("source_page", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sourceId: text("sourceId")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  pageNumber: integer("pageNumber").notNull(),
  textContent: text("textContent").notNull(),
  // Hash of textContent, duplicated onto bytes.pageContentHash at capture
  // time so we can cheaply detect drift without re-fetching this row.
  contentHash: text("contentHash").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

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

// --- LOOM TABLES ---

export const concepts = pgTable("concept", {
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
  // Map-tab sort: '' unsorted · p/s/t tiers · x left off the map. Tier lives on
  // the concept — it is the *meaning* of placement, extracted into the graph
  // (spec §6); the residual x/y stays in `views`, never here.
  tier: text("tier").$type<"" | "p" | "s" | "t" | "x">().default("").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

export const bytes = pgTable("byte", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  courseId: text("courseId").references(() => courses.id, {
    onDelete: "set null",
  }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  conceptId: text("conceptId")
    .notNull()
    .references(() => concepts.id, { onDelete: "cascade" }),
  // Free-text label, kept for manually-captured bytes (e.g. from OpenTab)
  // that aren't tied to a library PDF.
  source: text("source").default(""),
  // Set when the byte was captured from a library PDF via PdfViewer.
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

// "Your read" — the student's one-paragraph synthesis. Part of the graph
// artifact (spec §6 graph.read), not a view, so it gets a real table: losing it
// on refresh would make the student's work inaccessible (red line #5).
export const reads = pgTable(
  "read",
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
    text: text("text").default("").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (row) => ({
    // NULLS NOT DISTINCT so the pre-course (courseId null) row is unique too —
    // without it, concurrent saves could mint duplicates and the student's
    // read would flap between them.
    onePerCourse: unique().on(row.userId, row.courseId).nullsNotDistinct(),
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

// Append-only record of the student's own graph acts (create / rename / re-tier
// / throw / coin / delete / import / reset). This is the development history of
// the knowledge graph — provenance the student can explore ("the cloth, over
// time"), never a surface that grades or advises (red line #7: counted, not
// judged). Deliberately survives reset and import: reset clears the cloth, not
// the loom's memory of weaving. Best-effort writes (neon-http has no
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
  // 'graph.import', 'graph.reset', 'graph.example'.
  kind: text("kind").notNull(),
  entityType: text("entityType").$type<"concept" | "byte" | "edge" | "graph">().notNull(),
  entityId: text("entityId"),
  // Enough of the entity to replay the graph at any point in the timeline.
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  at: timestamp("at").defaultNow().notNull(),
})

export const edges = pgTable("edge", {
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
  handle: text("handle").default(""),
  sentence: text("sentence").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})
