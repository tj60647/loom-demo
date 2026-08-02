"use server"

import { db } from "@/db"
import {
  courseMemberships,
  courseSources,
  courses,
  sources,
  sourcePages,
  sourceScores,
  users,
} from "@/db/schema"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { after } from "next/server"
import { authOptions, isAdminUser } from "@/lib/auth"
import { readingStorage } from "@/lib/storage"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"
import { extractPdfPageText } from "@/lib/pdfText"
import { hashText } from "@/lib/hash"
import { judgeSourceScore, recordHeuristicScore, rescoreSource } from "@/lib/readingScore"
import { isJudgeConfigured } from "@/lib/openrouter"
import { draftMetadataFromPages, type MetadataDraft } from "@/lib/metadataDraft"
import { MAX_READING_BYTES, MAX_READING_LABEL, READING_UPLOAD_PREFIX, formatBytes } from "@/lib/readingUpload"
import { revalidatePath } from "next/cache"
import { resolveCourseId, resolveCourseIdForUser } from "@/lib/courses"

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  if (!isAdminUser(session.user)) {
    const dbUser = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
    if (dbUser[0]?.role !== "ADMIN") throw new Error("Unauthorized")
  }

  return session
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function readInt(formData: FormData, key: string) {
  const raw = readText(formData, key)
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function revalidateLibrary() {
  revalidatePath("/admin/library")
  // Course reading lists render on the Courses tab, so every membership or
  // schedule change has to invalidate it too — otherwise a reading added from
  // the Readings tab doesn't appear in its course until something else evicts
  // the cache.
  revalidatePath("/admin/courses")
  revalidatePath("/")
}

/**
 * The whole shared library, independent of any course. This is the set an
 * instructor picks from when building a course reading list.
 */
export async function getLibrarySources({ includeArchived = false } = {}) {
  await requireAdmin()

  const rows = await db.select().from(sources).orderBy(asc(sources.title))
  return includeArchived ? rows : rows.filter((source) => !source.isArchived)
}

/**
 * The whole library, course-agnostic, with everything the Readings page needs
 * to render a reading on its own terms: its extraction score, and which
 * courses currently include it.
 *
 * Deliberately one query per table rather than a join — a reading can be in
 * many courses, and a join would fan the library out into duplicate rows that
 * the page would only have to regroup.
 */
export async function getLibraryOverview({ includeArchived = true } = {}) {
  await requireAdmin()

  const [library, scores, memberships, allCourses] = await Promise.all([
    db.select().from(sources).orderBy(asc(sources.title)),
    db.select().from(sourceScores),
    db
      .select({
        sourceId: courseSources.sourceId,
        courseId: courseSources.courseId,
        isVisible: courseSources.isVisible,
        week: courseSources.week,
        isCore: courseSources.isCore,
      })
      .from(courseSources),
    db.select().from(courses).orderBy(asc(courses.createdAt)),
  ])

  const scoreBySource = new Map(scores.map((score) => [score.sourceId, score]))
  const courseById = new Map(allCourses.map((course) => [course.id, course]))

  const rows = library
    .filter((source) => includeArchived || !source.isArchived)
    .map((source) => ({
      ...source,
      score: scoreBySource.get(source.id) ?? null,
      courses: memberships
        .filter((row) => row.sourceId === source.id)
        .flatMap((row) => {
          const course = courseById.get(row.courseId)
          return course
            ? [{ id: course.id, name: course.name, term: course.term, ...row }]
            : []
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))

  // Courses a reading can still be added to are computed per-row in the page;
  // the full list is returned once so the page doesn't re-query it.
  return { readings: rows, courses: allCourses.filter((course) => !course.isArchived) }
}

/**
 * Every reading in every course, keyed by course id — what the Courses page
 * needs to show a course's full reading list inline.
 */
export async function getReadingsByCourse() {
  await requireAdmin()

  const rows = await db
    .select({ source: sources, link: courseSources })
    .from(courseSources)
    .innerJoin(sources, eq(sources.id, courseSources.sourceId))

  const byCourse = new Map<string, (typeof sources.$inferSelect & { link: typeof courseSources.$inferSelect })[]>()
  for (const row of rows) {
    const list = byCourse.get(row.link.courseId) ?? []
    list.push({ ...row.source, link: row.link })
    byCourse.set(row.link.courseId, list)
  }

  // Syllabus order: by week, then explicit position, then title.
  for (const list of byCourse.values()) {
    list.sort((a, b) => {
      const aWeek = a.link.week ?? Number.MAX_SAFE_INTEGER
      const bWeek = b.link.week ?? Number.MAX_SAFE_INTEGER
      if (aWeek !== bWeek) return aWeek - bWeek
      if (a.link.position !== b.link.position) return a.link.position - b.link.position
      return a.title.localeCompare(b.title)
    })
  }

  return byCourse
}

/**
 * Readings included in one course, with the per-course facts from the join.
 * Ordered the way a syllabus reads: by week, then explicit position, then title.
 */
export async function getCourseSources(courseIdRaw?: string | null) {
  await requireAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []

  const rows = await db
    .select({ source: sources, link: courseSources })
    .from(courseSources)
    .innerJoin(sources, eq(sources.id, courseSources.sourceId))
    .where(eq(courseSources.courseId, courseId))

  return rows
    .map((row) => ({ ...row.source, link: row.link }))
    .sort((a, b) => {
      const aWeek = a.link.week ?? Number.MAX_SAFE_INTEGER
      const bWeek = b.link.week ?? Number.MAX_SAFE_INTEGER
      if (aWeek !== bWeek) return aWeek - bWeek
      if (a.link.position !== b.link.position) return a.link.position - b.link.position
      return a.title.localeCompare(b.title)
    })
}

/**
 * The learner-facing shelf: readings published to the course this user is
 * working in, plus any reference-only readings they added for themselves.
 *
 * Their own readings carry no `course_source` row, so they appear here and on
 * nobody else's shelf. They exist because reading-first needs every byte to
 * belong to a reading — a passage from something the library does not hold
 * still needs a door (docs/reading-scope-and-map-passes.md §A.6).
 */
export async function getSources(courseIdRaw?: string | null) {
  const session = await getServerSession(authOptions)

  const courseId = session?.user?.id
    ? await resolveCourseIdForUser(session.user.id, courseIdRaw)
    : await resolveCourseId(courseIdRaw)

  const admin = isAdminUser(session?.user)

  const rows = courseId
    ? await db
        .select({ source: sources, link: courseSources })
        .from(courseSources)
        .innerJoin(sources, eq(sources.id, courseSources.sourceId))
        .where(
          admin
            ? eq(courseSources.courseId, courseId)
            : and(eq(courseSources.courseId, courseId), eq(courseSources.isVisible, true))
        )
    : []

  const mine = session?.user?.id
    ? await db
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.isOwn, true),
            eq(sources.createdByUserId, session.user.id),
            eq(sources.isArchived, false)
          )
        )
    : []

  const courseIds = new Set(rows.map((row) => row.source.id))

  return [
    ...rows.map((row) => ({ ...row.source, isVisible: row.link.isVisible, week: row.link.week })),
    // A reading of the student's own that an instructor has since added to the
    // course is the course's copy — don't list it twice.
    ...mine
      .filter((source) => !courseIds.has(source.id))
      .map((source) => ({ ...source, isVisible: true, week: null as number | null })),
  ].sort((a, b) => {
    const aWeek = a.week ?? Number.MAX_SAFE_INTEGER
    const bWeek = b.week ?? Number.MAX_SAFE_INTEGER
    if (aWeek !== bWeek) return aWeek - bWeek
    return a.title.localeCompare(b.title)
  })
}

/**
 * A student mints a card for something they are coding that the library does
 * not hold — a self-found paper, a book, a lecture. Title and author only:
 * this records WHERE a passage came from, and nothing about the student's
 * reading of it.
 *
 * Deliberately not admin-gated, and deliberately not added to the course: the
 * deployment notes (§9) ratified students adding papers, and this is the
 * bounded version of that — visible to its author, invisible to everyone else.
 */
export async function createOwnReading(data: {
  title: string
  author?: string
  sourceReference?: string
}) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) throw new Error("Unauthorized")

  const title = data.title.trim()
  if (!title) throw new Error("A reading needs a title.")

  const [source] = await db
    .insert(sources)
    .values({
      title,
      author: data.author?.trim() || "",
      sourceReference: data.sourceReference?.trim() || "",
      description: "",
      isDescriptionVisible: false,
      isOwn: true,
      storageKey: null,
      createdByUserId: userId,
    })
    .returning()

  revalidatePath("/")
  return { id: source.id, title: source.title }
}

/**
 * Registers a new reading in the shared library: stores the uploaded PDF bytes
 * in backend-managed storage (not /public, so it's only reachable via the
 * authenticated /api/readings/[sourceId] route) and extracts + persists the
 * canonical per-page text used to anchor highlight offsets.
 *
 * When `courseId` is given the reading is also included in that course, so the
 * common "upload straight into the course I'm building" path stays one step.
 */
export async function createSource(data: {
  courseId?: string | null
  title?: string
  author?: string
  sourceReference?: string
  description?: string
  isDescriptionVisible?: boolean
  metadataProvenance?: string
  file: File
}) {
  const arrayBuffer = await data.file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const storageKey = `${crypto.randomUUID()}.pdf`
  await readingStorage.put(storageKey, buffer)

  return ingestReading({ ...data, buffer, storageKey, filename: data.file.name })
}

/**
 * Everything that happens once a reading's bytes are in storage, wherever they
 * came from: validate, record the row, extract the canonical page text, render
 * a cover.
 *
 * Shared by the two upload paths — the server-side `createSource` (used by
 * seed scripts) and `registerUploadedReading` (the browser → Blob path) — so
 * neither can drift into ingesting a reading differently from the other.
 */
async function ingestReading(data: {
  courseId?: string | null
  title?: string
  author?: string
  sourceReference?: string
  description?: string
  isDescriptionVisible?: boolean
  metadataProvenance?: string
  buffer: Buffer
  storageKey: string
  filename: string
}) {
  const session = await requireAdmin()
  const userId = session.user.id
  const buffer = data.buffer

  // Verify this is actually a PDF (magic bytes: "%PDF-") before storing it
  // and serving it back with a `Content-Type: application/pdf` header —
  // don't trust the client-supplied MIME type or file extension alone.
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Uploaded file is not a valid PDF")
  }

  const fallbackTitle = data.filename.replace(/\.pdf$/i, "").trim() || "Untitled Reading"
  const title = data.title?.trim() || fallbackTitle
  const storageKey = data.storageKey

  const [source] = await db
    .insert(sources)
    .values({
      title,
      author: data.author || "",
      sourceReference: data.sourceReference || "",
      description: data.description || "",
      isDescriptionVisible: data.isDescriptionVisible ?? true,
      metadataProvenance: data.metadataProvenance || "",
      storageKey,
      createdByUserId: userId,
    })
    .returning()

  if (data.courseId) {
    const courseId = await resolveCourseId(data.courseId)
    if (courseId) {
      await db
        .insert(courseSources)
        .values({ courseId, sourceId: source.id })
        .onConflictDoNothing()
    }
  }

  const pages = await extractPdfPageText(buffer)
  if (pages.length > 0) {
    await db.insert(sourcePages).values(
      pages.map((p) => ({
        sourceId: source.id,
        pageNumber: p.pageNumber,
        textContent: p.textContent,
        contentHash: hashText(p.textContent),
      }))
    )
  }

  let coverRendered = false
  try {
    const coverBuffer = await renderPdfCoverImage(buffer)
    await readingStorage.put(getSourceCoverKey(source.id), coverBuffer)
    coverRendered = true
  } catch (error) {
    console.warn("[Loom] Failed to generate PDF cover image", error)
  }

  // Deterministic score, computed from the pages already in memory — no extra
  // queries, no network. The judge pass runs afterwards, off the request path.
  try {
    await recordHeuristicScore(source.id, pages, { coverRendered })
  } catch (error) {
    console.warn("[Loom] Failed to score extraction quality", error)
  }

  return source
}

/**
 * Second half of the browser → Blob upload: the bytes are already in storage,
 * so this records the reading and runs the same ingest as any other upload.
 *
 * `storageKey` is the pathname the Blob SDK returned to the browser. It is
 * treated as untrusted input — the prefix is checked, the blob is fetched
 * server-side, and its real size and PDF magic bytes are verified here rather
 * than taken on the client's word.
 */
export async function registerUploadedReading(data: {
  storageKey: string
  filename: string
  title?: string
  courseId?: string | null
}) {
  await requireAdmin()

  if (!data.storageKey.startsWith(`${READING_UPLOAD_PREFIX}/`)) {
    throw new Error("That upload is not in the readings area.")
  }

  const buffer = await readingStorage.get(data.storageKey)

  // The token route caps this too, but a cap enforced only where the token is
  // minted is a cap on the polite path; re-check what actually landed.
  if (buffer.byteLength > MAX_READING_BYTES) {
    await readingStorage.delete(data.storageKey).catch(() => {})
    throw new Error(`That file is ${formatBytes(buffer.byteLength)} — the limit is ${MAX_READING_LABEL}.`)
  }

  try {
    const source = await ingestReading({
      buffer,
      storageKey: data.storageKey,
      filename: data.filename,
      title: data.title,
      courseId: data.courseId,
      metadataProvenance: "Pending review",
    })

    revalidateLibrary()
    if (isJudgeConfigured()) {
      after(async () => {
        await judgeSourceScore(source.id)
        revalidateLibrary()
      })
    }
    return { id: source.id, title: source.title }
  } catch (error) {
    // Nothing references the blob yet, so a failed ingest should not leave it
    // sitting in storage costing money and confusing later audits.
    await readingStorage.delete(data.storageKey).catch(() => {})
    throw error
  }
}

/** Re-runs both scoring passes, e.g. after a reading was re-uploaded. */
export async function rescoreSourceAction(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) return

  // Rebuild the cover too, not just the scores. Cover rendering used to be
  // treated as decided once at upload, but the renderer itself changes — it
  // now targets a fixed width and skips blank opening pages — so readings
  // uploaded before those changes keep a stale, undersized or empty thumbnail
  // with no way to refresh it. Re-rendering here gives every existing reading
  // a route back to a correct cover.
  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (source?.storageKey) {
    try {
      const pdf = await readingStorage.get(source.storageKey)
      const cover = await renderPdfCoverImage(pdf)
      await readingStorage.put(getSourceCoverKey(sourceId), cover)
    } catch (error) {
      // A reading whose opening pages are genuinely blank has no cover to
      // rebuild; that is recorded by the score, not a reason to fail a rescore.
      console.warn("[Loom] Cover rebuild failed during rescore", error)
    }
  }

  await rescoreSource(sourceId)
  revalidateLibrary()
}

/** Library-wide metadata. Not scoped to a course — the record is shared. */
/**
 * Draft this reading's metadata from its own extracted pages, for an
 * instructor to review.
 *
 * Ratified against red line #6 (TJ, 30 July 2026) and bounded by the same
 * shape as the extraction judge, plus one condition the judge did not need:
 * this returns a draft and writes NOTHING. The instructor edits and saves via
 * updateSourceMetadata, so no model-written text reaches a student unread.
 * Admin-only, like everything else in this file.
 */
export async function draftMetadataForSource(sourceId: string): Promise<MetadataDraft> {
  await requireAdmin()
  if (!sourceId) throw new Error("Source id is required")

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) throw new Error("Reading not found")

  const pages = await db
    .select({ pageNumber: sourcePages.pageNumber, textContent: sourcePages.textContent })
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, sourceId))
    .orderBy(asc(sourcePages.pageNumber))

  return draftMetadataFromPages(pages, source.title)
}

export async function updateSourceMetadata(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) throw new Error("Source id is required")

  await db
    .update(sources)
    .set({
      title: readText(formData, "title") || "Untitled Reading",
      author: readText(formData, "author"),
      sourceReference: readText(formData, "sourceReference"),
      description: readText(formData, "description"),
      isDescriptionVisible: formData.get("isDescriptionVisible") === "on",
      metadataProvenance: readText(formData, "metadataProvenance"),
    })
    .where(eq(sources.id, sourceId))

  revalidateLibrary()
}

/**
 * Resolves a course id that the user picked explicitly.
 *
 * Unlike resolveCourseId, this never falls back to "the first course": the
 * caller named a specific course, so an unknown id is a mistake, and quietly
 * filing the reading somewhere else would be worse than doing nothing.
 */
async function exactCourseId(raw: string) {
  if (!raw) return null
  const rows = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, raw)).limit(1)
  return rows[0]?.id ?? null
}

export async function addSourceToCourse(formData: FormData) {
  await requireAdmin()

  const courseId = await exactCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  await db
    .insert(courseSources)
    .values({
      courseId,
      sourceId,
      week: readInt(formData, "week"),
      isCore: formData.get("isCore") !== "false",
    })
    .onConflictDoNothing()

  revalidateLibrary()
}

/** Removes the reading from this course only. The library keeps the file. */
export async function removeSourceFromCourse(formData: FormData) {
  await requireAdmin()

  const courseId = await exactCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  await db
    .delete(courseSources)
    .where(and(eq(courseSources.courseId, courseId), eq(courseSources.sourceId, sourceId)))

  revalidateLibrary()
}

export async function setCourseSourceVisibility(formData: FormData) {
  await requireAdmin()

  const courseId = await exactCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  await db
    .update(courseSources)
    .set({ isVisible: formData.get("isVisible") === "true" })
    .where(and(eq(courseSources.courseId, courseId), eq(courseSources.sourceId, sourceId)))

  revalidateLibrary()
}

/**
 * When a reading is due in this course, and in what order that week.
 *
 * Named "schedule", not "placement": placement already means putting a
 * LEARNER in a section (see assignMemberSection), and one word for two
 * unrelated moves is how a roster edit gets mistaken for a syllabus edit.
 */
export async function updateCourseSourceSchedule(formData: FormData) {
  await requireAdmin()

  const courseId = await exactCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  await db
    .update(courseSources)
    .set({
      week: readInt(formData, "week"),
      position: readInt(formData, "position") ?? 0,
      isCore: formData.get("isCore") === "on",
    })
    .where(and(eq(courseSources.courseId, courseId), eq(courseSources.sourceId, sourceId)))

  revalidateLibrary()
}

export async function setSourceArchived(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) return

  await db
    .update(sources)
    .set({ isArchived: formData.get("isArchived") === "true" })
    .where(eq(sources.id, sourceId))

  revalidateLibrary()
}

/**
 * Deletes a reading from the shared library entirely, including its stored PDF
 * and cover. Course inclusions cascade away. Use setSourceArchived to retire a
 * reading without destroying it.
 */
export async function deleteSource(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) throw new Error("Source id is required")

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) return

  await db.delete(sources).where(eq(sources.id, sourceId))
  // A reference-only reading has no file and no cover to remove.
  if (source.storageKey) await readingStorage.delete(source.storageKey)
  await readingStorage.delete(getSourceCoverKey(source.id))

  revalidateLibrary()
}

/**
 * Fetches the stored PDF. Admins can read anything; a learner may read a
 * reading only if it is published in a course they belong to. Visibility now
 * lives on the join, so this is a membership question rather than a flag on
 * the source.
 */
async function authorizeSourceFile(sourceId: string) {
  const session = await getServerSession(authOptions)
  const admin = isAdminUser(session?.user)

  if (!session?.user?.id && process.env.NODE_ENV === "production") {
    throw new Error("Unauthorized")
  }

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) throw new Error("Not found")
  // A reference-only reading is a citation, not a file. Nothing to serve.
  if (!source.storageKey) throw new Error("Not found")

  // A student's own reading is theirs to read; it was never published to a
  // course, so the membership check below cannot admit it.
  if (source.isOwn && source.createdByUserId === session?.user?.id) {
    return { source, storageKey: source.storageKey }
  }

  if (!admin && session?.user?.id) {
    const memberships = await db
      .select({ courseId: courseMemberships.courseId })
      .from(courseMemberships)
      .where(
        and(eq(courseMemberships.userId, session.user.id), isNull(courseMemberships.removedAt))
      )

    if (memberships.length === 0) throw new Error("Not found")

    const published = await db
      .select({ sourceId: courseSources.sourceId })
      .from(courseSources)
      .where(
        and(
          eq(courseSources.sourceId, sourceId),
          eq(courseSources.isVisible, true),
          inArray(
            courseSources.courseId,
            memberships.map((row) => row.courseId)
          )
        )
      )
      .limit(1)

    if (published.length === 0) throw new Error("Not found")
  }

  return { source, storageKey: source.storageKey }
}

/**
 * Authorization and the source row, WITHOUT the file's bytes. The cover route
 * serves a small cached PNG on the happy path; fetching the whole PDF just to
 * prove the caller may see its thumbnail made every library page view
 * download the entire shelf — up to 20MB × every card (the CI stall of
 * 2026-08-02). Callers that go on to render fetch the bytes themselves from
 * `source.storageKey`, which authorization has already vouched for.
 */
export async function getSourceForCover(sourceId: string) {
  const { source } = await authorizeSourceFile(sourceId)
  return { source }
}

/**
 * The reading's bytes in memory. For callers that genuinely need the whole
 * file — cover rendering, text extraction. To send it to a browser, use
 * `getSourceFileStream`: buffering a reading larger than 4.5MB is fine here
 * and fatal in a Vercel Function response.
 */
export async function getSourceFile(sourceId: string) {
  const { source, storageKey } = await authorizeSourceFile(sourceId)
  return { source, buffer: await readingStorage.get(storageKey) }
}

/** The same reading, streamed — the form the PDF route serves. */
export async function getSourceFileStream(sourceId: string) {
  const { source, storageKey } = await authorizeSourceFile(sourceId)
  return { source, stream: await readingStorage.getStream(storageKey) }
}
