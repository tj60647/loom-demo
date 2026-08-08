"use server"

import { db } from "@/db"
import { courseMemberships, courses, sections } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { ensureFacultySection, getCourse, resolveCourseIdForUser, slugify } from "@/lib/courses"

// Server Functions are reachable by direct POST, not only through the UI, so
// every mutation here re-checks admin rather than trusting the calling page.
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !isAdminUser(session.user)) {
    throw new Error("Unauthorized")
  }
  return session
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

/**
 * The course the signed-in person is working in — the header says whose
 * syllabus this is, since one account can carry several courses and every
 * count on screen belongs to exactly one of them.
 *
 * Learner-safe by construction: it reports the course resolveCourseIdForUser
 * already scopes their work to (their own enrolment), never an arbitrary one.
 */
export async function getActiveCourse() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null

  const courseId = await resolveCourseIdForUser(session.user.id)
  if (!courseId) return null

  const course = await getCourse(courseId)
  return course ? { id: course.id, name: course.name, term: course.term } : null
}

/** Appends -2, -3, … until the slug is free. */
async function uniqueCourseSlug(base: string, excludeCourseId?: string) {
  const taken = await db.select({ id: courses.id, slug: courses.slug }).from(courses)
  const used = new Set(
    taken.filter((row) => row.id !== excludeCourseId).map((row) => row.slug)
  )

  let candidate = base || "course"
  let n = 2
  while (used.has(candidate)) {
    candidate = `${base}-${n++}`
  }
  return candidate
}

async function uniqueSectionSlug(courseId: string, base: string, excludeSectionId?: string) {
  const taken = await db
    .select({ id: sections.id, slug: sections.slug })
    .from(sections)
    .where(eq(sections.courseId, courseId))
  const used = new Set(
    taken.filter((row) => row.id !== excludeSectionId).map((row) => row.slug)
  )

  let candidate = base || "section"
  let n = 2
  while (used.has(candidate)) {
    candidate = `${base}-${n++}`
  }
  return candidate
}

function revalidateAdmin() {
  revalidatePath("/admin/courses")
  revalidatePath("/admin")
  revalidatePath("/admin/library")
  revalidatePath("/admin/aggregate")
  revalidatePath("/")
}

export async function createCourse(formData: FormData) {
  await requireAdmin()

  const name = readText(formData, "name")
  if (!name) return

  const slug = await uniqueCourseSlug(slugify(readText(formData, "slug") || name))

  const [course] = await db.insert(courses).values({
    slug,
    name,
    term: readText(formData, "term"),
    description: readText(formData, "description"),
  }).returning({ id: courses.id })

  await ensureFacultySection(course.id)

  revalidateAdmin()
}

export async function updateCourse(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  const name = readText(formData, "name")
  if (!courseId || !name) return

  const slug = await uniqueCourseSlug(
    slugify(readText(formData, "slug") || name),
    courseId
  )

  await db
    .update(courses)
    .set({
      name,
      slug,
      term: readText(formData, "term"),
      description: readText(formData, "description"),
    })
    .where(eq(courses.id, courseId))

  revalidateAdmin()
}

export async function setCourseArchived(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  if (!courseId) return

  await db
    .update(courses)
    .set({ isArchived: formData.get("isArchived") === "true" })
    .where(eq(courses.id, courseId))

  revalidateAdmin()
}

/**
 * Hard-deletes a course. Cascades to sections, memberships, allowlist entries,
 * and course_source rows — but NOT to the readings themselves, which live in
 * the shared library, nor to student concepts/bytes/edges, whose courseId is
 * set null so the work survives.
 */
export async function deleteCourse(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  if (!courseId) return

  // Guard against deleting a course that still holds student work.
  if (readText(formData, "confirm") !== "delete") return

  await db.delete(courses).where(eq(courses.id, courseId))

  revalidateAdmin()
}

export async function createSection(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  const name = readText(formData, "name")
  if (!courseId || !name) return

  const slug = await uniqueSectionSlug(courseId, slugify(readText(formData, "slug") || name))

  await db.insert(sections).values({
    courseId,
    slug,
    name,
    lead: readText(formData, "lead"),
  })

  revalidateAdmin()
}

export async function updateSection(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  const sectionId = readText(formData, "sectionId")
  const name = readText(formData, "name")
  if (!courseId || !sectionId || !name) return

  const slug = await uniqueSectionSlug(
    courseId,
    slugify(readText(formData, "slug") || name),
    sectionId
  )

  await db
    .update(sections)
    .set({ name, slug, lead: readText(formData, "lead") })
    .where(and(eq(sections.id, sectionId), eq(sections.courseId, courseId)))

  revalidateAdmin()
}

/** Members of a deleted section fall back to unassigned (FK is set null). */
export async function deleteSection(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  const sectionId = readText(formData, "sectionId")
  if (!courseId || !sectionId) return

  await db
    .delete(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.courseId, courseId)))

  revalidateAdmin()
}

export async function assignMemberSection(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  const userId = readText(formData, "userId")
  if (!courseId || !userId) return

  const rawSectionId = readText(formData, "sectionId")
  let sectionId: string | null = null

  if (rawSectionId) {
    const rows = await db
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.id, rawSectionId), eq(sections.courseId, courseId)))
      .limit(1)
    sectionId = rows[0]?.id ?? null
  }

  await db
    .update(courseMemberships)
    .set({ sectionId })
    .where(
      and(eq(courseMemberships.courseId, courseId), eq(courseMemberships.userId, userId))
    )

  revalidateAdmin()
}
