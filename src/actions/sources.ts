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
import { and, asc, eq, inArray } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { after } from "next/server"
import { authOptions, isAdminUser } from "@/lib/auth"
import { readingStorage } from "@/lib/storage"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"
import { extractPdfPageText } from "@/lib/pdfText"
import { hashText } from "@/lib/hash"
import { judgeSourceScore, recordHeuristicScore, rescoreSource } from "@/lib/readingScore"
import { isJudgeConfigured } from "@/lib/openrouter"
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
  // placement change has to invalidate it too — otherwise a reading added from
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
 * The learner-facing reading list: readings published to the course this user
 * is working in.
 */
export async function getSources(courseIdRaw?: string | null) {
  const session = await getServerSession(authOptions)

  const courseId = session?.user?.id
    ? await resolveCourseIdForUser(session.user.id, courseIdRaw)
    : await resolveCourseId(courseIdRaw)

  if (!courseId) return []

  const admin = isAdminUser(session?.user)

  const rows = await db
    .select({ source: sources, link: courseSources })
    .from(courseSources)
    .innerJoin(sources, eq(sources.id, courseSources.sourceId))
    .where(
      admin
        ? eq(courseSources.courseId, courseId)
        : and(eq(courseSources.courseId, courseId), eq(courseSources.isVisible, true))
    )

  return rows
    .map((row) => ({ ...row.source, isVisible: row.link.isVisible, week: row.link.week }))
    .sort((a, b) => {
      const aWeek = a.week ?? Number.MAX_SAFE_INTEGER
      const bWeek = b.week ?? Number.MAX_SAFE_INTEGER
      if (aWeek !== bWeek) return aWeek - bWeek
      return a.title.localeCompare(b.title)
    })
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
  const session = await requireAdmin()
  const userId = session.user.id

  const arrayBuffer = await data.file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Verify this is actually a PDF (magic bytes: "%PDF-") before storing it
  // and serving it back with a `Content-Type: application/pdf` header —
  // don't trust the client-supplied MIME type or file extension alone.
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Uploaded file is not a valid PDF")
  }

  const fallbackTitle = data.file.name.replace(/\.pdf$/i, "").trim() || "Untitled Reading"
  const title = data.title?.trim() || fallbackTitle

  const storageKey = `${crypto.randomUUID()}.pdf`
  await readingStorage.put(storageKey, buffer)

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

export type UploadOutcome = {
  uploaded: number
  failures: { filename: string; message: string }[]
}

/**
 * Uploads one or more PDFs into the library in a single submission.
 *
 * Files are processed sequentially and independently: a corrupt or
 * password-protected PDF in the middle of a 20-file batch fails on its own and
 * is reported by name, rather than aborting the files behind it. Returning the
 * outcome (instead of throwing on the first failure) is what makes a partial
 * batch recoverable — the instructor re-uploads the two that failed, not all 20.
 */
export async function createSourcesFromForm(
  _previous: UploadOutcome | null,
  formData: FormData
): Promise<UploadOutcome> {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  const addToCourse = formData.get("addToCourse") === "on" ? courseId || null : null

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File)
  // A title override only makes sense for a single file; with a batch, each
  // reading takes its own filename.
  const titleOverride = files.length === 1 ? readText(formData, "title") : ""

  const failures: UploadOutcome["failures"] = []
  const createdIds: string[] = []

  for (const file of files) {
    if (file.size === 0) continue
    try {
      const source = await createSource({
        courseId: addToCourse,
        title: titleOverride,
        file,
        metadataProvenance: "Pending review",
      })
      createdIds.push(source.id)
    } catch (error) {
      failures.push({
        filename: file.name,
        message: error instanceof Error ? error.message : "Upload failed",
      })
    }
  }

  revalidateLibrary()

  // The judge is a network call per reading; running it here would make a
  // 20-file upload wait on 20 round trips. `after` runs it once the response
  // is sent, so the page returns with heuristic scores and fills in the judged
  // ones on the next load.
  if (createdIds.length > 0 && isJudgeConfigured()) {
    after(async () => {
      for (const sourceId of createdIds) {
        await judgeSourceScore(sourceId)
      }
      revalidateLibrary()
    })
  }

  return { uploaded: createdIds.length, failures }
}

/** Re-runs both scoring passes, e.g. after a reading was re-uploaded. */
export async function rescoreSourceAction(formData: FormData) {
  await requireAdmin()

  const sourceId = readText(formData, "sourceId")
  if (!sourceId) return

  await rescoreSource(sourceId)
  revalidateLibrary()
}

/** Library-wide metadata. Not scoped to a course — the record is shared. */
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

export async function updateCourseSourcePlacement(formData: FormData) {
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
  await readingStorage.delete(source.storageKey)
  await readingStorage.delete(getSourceCoverKey(source.id))

  revalidateLibrary()
}

/**
 * Fetches the stored PDF. Admins can read anything; a learner may read a
 * reading only if it is published in a course they belong to. Visibility now
 * lives on the join, so this is a membership question rather than a flag on
 * the source.
 */
export async function getSourceFile(sourceId: string) {
  const session = await getServerSession(authOptions)
  const admin = isAdminUser(session?.user)

  if (!session?.user?.id && process.env.NODE_ENV === "production") {
    throw new Error("Unauthorized")
  }

  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) throw new Error("Not found")

  if (!admin && session?.user?.id) {
    const memberships = await db
      .select({ courseId: courseMemberships.courseId })
      .from(courseMemberships)
      .where(eq(courseMemberships.userId, session.user.id))

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

  const buffer = await readingStorage.get(source.storageKey)
  return { source, buffer }
}
