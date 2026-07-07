import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  boolean,
} from "drizzle-orm/pg-core"
import type { AdapterAccount } from "@auth/core/adapters"

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
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

export const courseMemberships = pgTable(
  "course_membership",
  {
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
export const sources = pgTable("source", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  courseId: text("courseId").references(() => courses.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  author: text("author").default(""),
  sourceReference: text("sourceReference").default(""),
  description: text("description").default(""),
  isDescriptionVisible: boolean("isDescriptionVisible").default(true).notNull(),
  metadataProvenance: text("metadataProvenance").default(""),
  isVisible: boolean("isVisible").default(true).notNull(),
  // Key used to locate the file in the storage backend (see src/lib/storage.ts).
  storageKey: text("storageKey").notNull(),
  createdByUserId: text("createdByUserId").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
})

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
