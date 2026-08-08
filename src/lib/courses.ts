import { db } from "@/db"
import { courseMemberships, courses, sections, users } from "@/db/schema"
import { and, asc, eq, isNull } from "drizzle-orm"
import { isAdminUser } from "@/lib/auth"

export type CourseRecord = typeof courses.$inferSelect
export type SectionRecord = typeof sections.$inferSelect

/**
 * Turns a display name into a url-safe slug. Slugs are unique per course
 * (globally for courses, per-course for sections), so callers must handle the
 * collision case rather than assuming this is injective.
 */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

export async function listCourses({ includeArchived = false } = {}) {
  const rows = await db.select().from(courses).orderBy(asc(courses.createdAt))
  return includeArchived ? rows : rows.filter((course) => !course.isArchived)
}

export async function getCourse(courseId: string) {
  const rows = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1)
  return rows[0] ?? null
}

/**
 * Resolves a course id coming from a query string.
 *
 * Returns null when the id is unknown and there is no course to fall back to.
 * Callers must handle null — the previous hardcoded-array version silently
 * coerced unknown ids to a default course, which routed writes (allowlist
 * entries, uploads) into the wrong course with no error.
 */
export async function resolveCourseId(raw?: string | null): Promise<string | null> {
  const available = await listCourses()
  if (available.length === 0) return null

  if (raw) {
    const match = available.find((course) => course.id === raw || course.slug === raw)
    if (match) return match.id
  }

  return available[0].id
}

/**
 * The course a learner is looking at: the requested one when they actively
 * belong to it, otherwise their first active enrolment, otherwise nothing —
 * membership is the authorization boundary, so a learner is never dropped
 * into a course that has not enrolled them (their work stays unscoped
 * instead). Admins keep the site-wide fallback: they are global staff here
 * (every /admin page already works that way), and it lets them walk the
 * learner surfaces of any course without being on its roster.
 */
export async function resolveCourseIdForUser(
  userId: string,
  raw?: string | null
): Promise<string | null> {
  const memberships = await db
    .select({ courseId: courseMemberships.courseId })
    .from(courseMemberships)
    .innerJoin(courses, eq(courses.id, courseMemberships.courseId))
    .where(
      and(
        eq(courseMemberships.userId, userId),
        isNull(courseMemberships.removedAt),
        eq(courses.isArchived, false)
      )
    )
    .orderBy(asc(courses.createdAt))

  if (raw) {
    const match = memberships.find((row) => row.courseId === raw)
    if (match) return match.courseId
  }

  if (memberships.length > 0) return memberships[0].courseId

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (isAdminUser(user[0])) return resolveCourseId(raw)

  return null
}

/**
 * Every course carries a Faculty Section (ruling 18) — the faculty's
 * data-model home; pedagogically they rotate among the discussion sections.
 * Idempotent: created with the course and ensured on promotion, so
 * pre-ruling courses grow one the first time it is needed. Not a server
 * action — callers gate access themselves.
 */
export async function ensureFacultySection(courseId: string): Promise<string> {
  const existing = await db.select({ id: sections.id }).from(sections)
    .where(and(eq(sections.courseId, courseId), eq(sections.slug, "faculty")))
    .limit(1)
  if (existing.length) return existing[0].id
  const [row] = await db.insert(sections).values({
    courseId,
    slug: "faculty",
    name: "Faculty Section",
  }).returning({ id: sections.id })
  return row.id
}

export async function listSections(courseId: string) {
  return db
    .select()
    .from(sections)
    .where(eq(sections.courseId, courseId))
    .orderBy(asc(sections.name))
}

/**
 * Resolves a section id within a course. Unlike courses there is no fallback:
 * an unrecognised or absent section means "the whole course", which is a
 * meaningful view rather than an error.
 */
export async function resolveSectionId(
  courseId: string,
  raw?: string | null
): Promise<string | null> {
  if (!raw) return null

  const rows = await db
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.courseId, courseId), eq(sections.id, raw)))
    .limit(1)

  return rows[0]?.id ?? null
}

/** Reads a `?course=` / `?section=` style param that may arrive as an array. */
export function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value
}
