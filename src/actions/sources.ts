"use server"

import { db } from "@/db"
import { courseMemberships, courseSources, sources, sourcePages, users } from "@/db/schema"
import { and, asc, eq, inArray } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { readingStorage } from "@/lib/storage"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"
import { extractPdfPageText } from "@/lib/pdfText"
import { hashText } from "@/lib/hash"
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

  try {
    const coverBuffer = await renderPdfCoverImage(buffer)
    await readingStorage.put(getSourceCoverKey(source.id), coverBuffer)
  } catch (error) {
    console.warn("[Loom] Failed to generate PDF cover image", error)
  }

  return source
}

export async function createSourceFromForm(formData: FormData) {
  const courseId = readText(formData, "courseId")

  await createSource({
    courseId: formData.get("addToCourse") === "on" ? courseId || null : null,
    title: readText(formData, "title"),
    file: (() => {
      const file = formData.get("file")
      if (!(file instanceof File)) throw new Error("PDF file is required")
      return file
    })(),
    metadataProvenance: "Pending review",
  })

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

export async function addSourceToCourse(formData: FormData) {
  await requireAdmin()

  const courseId = await resolveCourseId(readText(formData, "courseId"))
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

  const courseId = await resolveCourseId(readText(formData, "courseId"))
  const sourceId = readText(formData, "sourceId")
  if (!courseId || !sourceId) return

  await db
    .delete(courseSources)
    .where(and(eq(courseSources.courseId, courseId), eq(courseSources.sourceId, sourceId)))

  revalidateLibrary()
}

export async function setCourseSourceVisibility(formData: FormData) {
  await requireAdmin()

  const courseId = await resolveCourseId(readText(formData, "courseId"))
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

  const courseId = await resolveCourseId(readText(formData, "courseId"))
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
