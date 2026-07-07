"use server"

import { db } from "@/db"
import { courses, sources, sourcePages, users } from "@/db/schema"
import { and, asc, eq, isNull } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { readingStorage } from "@/lib/storage"
import { getSourceCoverKey, renderPdfCoverImage } from "@/lib/pdfCover"
import { extractPdfPageText } from "@/lib/pdfText"
import { hashText } from "@/lib/hash"
import { revalidatePath } from "next/cache"
import { DEFAULT_COURSE_ID, getCourseLabel, normalizeCourseId } from "@/lib/courseConfig"

async function ensureCourseExists(courseIdRaw: string) {
  const courseId = normalizeCourseId(courseIdRaw)
  await db
    .insert(courses)
    .values({ id: courseId, slug: courseId, name: getCourseLabel(courseId) })
    .onConflictDoNothing()

  // During migration, older readings have null courseId; assign them to the
  // default course so existing libraries remain visible.
  if (courseId === DEFAULT_COURSE_ID) {
    await db
      .update(sources)
      .set({ courseId })
      .where(isNull(sources.courseId))
  }

  return courseId
}

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

export async function getSources(courseIdRaw: string = DEFAULT_COURSE_ID) {
  const courseId = await ensureCourseExists(courseIdRaw)
  const session = await getServerSession(authOptions)
  const admin = isAdminUser(session?.user)

  if (admin) {
    return db
      .select()
      .from(sources)
      .where(eq(sources.courseId, courseId))
      .orderBy(asc(sources.createdAt))
  }

  return db
    .select()
    .from(sources)
    .where(and(eq(sources.isVisible, true), eq(sources.courseId, courseId)))
    .orderBy(asc(sources.createdAt))
}

export async function getManageableSources(courseIdRaw: string = DEFAULT_COURSE_ID) {
  await requireAdmin()
  const courseId = await ensureCourseExists(courseIdRaw)

  return db
    .select()
    .from(sources)
    .where(eq(sources.courseId, courseId))
    .orderBy(asc(sources.createdAt))
}

/**
 * Registers a new reading in the library: stores the uploaded PDF bytes in
 * backend-managed storage (not /public, so it's only reachable via the
 * authenticated /api/readings/[sourceId] route) and extracts + persists the
 * canonical per-page text used to anchor highlight offsets.
 */
export async function createSource(data: {
  courseId?: string
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
      courseId: await ensureCourseExists(data.courseId ?? DEFAULT_COURSE_ID),
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
  const courseIdRaw = formData.get("courseId")
  const courseId = typeof courseIdRaw === "string" ? courseIdRaw : DEFAULT_COURSE_ID
  const title = formData.get("title")
  const file = formData.get("file")

  if (!(file instanceof File)) {
    throw new Error("PDF file is required")
  }

  await createSource({
    courseId,
    title: typeof title === "string" ? title.trim() : "",
    file,
    metadataProvenance: "Pending review",
  })

  revalidatePath("/admin/library")
  revalidatePath("/")
}

export async function updateSourceMetadata(formData: FormData) {
  await requireAdmin()
  const courseIdRaw = formData.get("courseId")
  const courseId = await ensureCourseExists(typeof courseIdRaw === "string" ? courseIdRaw : DEFAULT_COURSE_ID)

  const sourceId = formData.get("sourceId")
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    throw new Error("Source id is required")
  }

  const title = formData.get("title")
  const author = formData.get("author")
  const sourceReference = formData.get("sourceReference")
  const description = formData.get("description")
  const metadataProvenance = formData.get("metadataProvenance")
  const isDescriptionVisible = formData.get("isDescriptionVisible") === "on"

  await db
    .update(sources)
    .set({
      title: typeof title === "string" && title.trim() ? title.trim() : "Untitled Reading",
      author: typeof author === "string" ? author.trim() : "",
      sourceReference: typeof sourceReference === "string" ? sourceReference.trim() : "",
      description: typeof description === "string" ? description.trim() : "",
      isDescriptionVisible,
      metadataProvenance: typeof metadataProvenance === "string" ? metadataProvenance.trim() : "",
    })
    .where(and(eq(sources.id, sourceId), eq(sources.courseId, courseId)))

  revalidatePath("/admin/library")
  revalidatePath("/")
}

export async function setSourceVisibility(formData: FormData) {
  await requireAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await ensureCourseExists(typeof courseIdRaw === "string" ? courseIdRaw : DEFAULT_COURSE_ID)
  const sourceIdRaw = formData.get("sourceId")
  const isVisibleRaw = formData.get("isVisible")

  if (typeof sourceIdRaw !== "string") {
    throw new Error("Source id is required")
  }

  const isVisible = isVisibleRaw === "true"

  await db
    .update(sources)
    .set({ isVisible })
    .where(and(eq(sources.id, sourceIdRaw), eq(sources.courseId, courseId)))

  revalidatePath("/admin/library")
  revalidatePath("/")
}

export async function deleteSource(formData: FormData) {
  await requireAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await ensureCourseExists(typeof courseIdRaw === "string" ? courseIdRaw : DEFAULT_COURSE_ID)
  const sourceIdRaw = formData.get("sourceId")

  if (typeof sourceIdRaw !== "string") {
    throw new Error("Source id is required")
  }

  const rows = await db
    .select()
    .from(sources)
    .where(and(eq(sources.id, sourceIdRaw), eq(sources.courseId, courseId)))
    .limit(1)
  const source = rows[0]
  if (!source) {
    return
  }

  await db.delete(sources).where(eq(sources.id, sourceIdRaw))
  await readingStorage.delete(source.storageKey)
  await readingStorage.delete(getSourceCoverKey(source.id))

  revalidatePath("/admin/library")
  revalidatePath("/")
}

export async function getSourceFile(sourceId: string) {
  const session = await getServerSession(authOptions)
  const admin = isAdminUser(session?.user)
  if (!session?.user?.id && process.env.NODE_ENV === "production") {
    throw new Error("Unauthorized")
  }

  const rows = await db
    .select()
    .from(sources)
    .where(
      admin
        ? eq(sources.id, sourceId)
        : and(eq(sources.id, sourceId), eq(sources.isVisible, true))
    )
    .limit(1)
  const source = rows[0]
  if (!source) throw new Error("Not found")

  const buffer = await readingStorage.get(source.storageKey)
  return { source, buffer }
}
