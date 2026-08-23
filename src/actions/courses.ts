"use server"

import { db } from "@/db"
import { viewingAsStudent } from "@/lib/viewAsServer"
import { resolveViewTarget } from "@/lib/viewUserServer"
import { courseMemberships, courses, sections } from "@/db/schema"
import { and, asc, eq, isNull } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { ensureFacultySection, getCourse, listEnrolledCourses, resolveCourseIdForUser, slugify } from "@/lib/courses"

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

  // Open Loom (src/lib/viewUser.ts): inside a student's loom the active
  // course is the STUDENT's, and the staff flags mask to false exactly as
  // the student lens masks them — every staff surface goes quiet together,
  // and the floating Teaching menu is the one staff control left standing.
  // `viewingUser` rides along so the chrome can say whose loom this is.
  const viewing = await resolveViewTarget(session.user.id)

  const courseId = viewing
    ? viewing.courseId
    : await resolveCourseIdForUser(session.user.id)
  if (!courseId) return null

  const course = await getCourse(courseId)
  if (!course) return null

  // `isStaff` rides along because every learner surface already reads this, and
  // the Overlays are a faculty/admin capability (TJ, 2026-08-08) whose CONTROLS
  // must not render for a student. It decides what is drawn, never what may be
  // read — `overlayViewer()` re-checks server-side, so a tampered client gets
  // an empty overlay, not someone else's marks.
  const membership = await db
    .select({ role: courseMemberships.role })
    .from(courseMemberships)
    .where(and(
      eq(courseMemberships.courseId, courseId),
      eq(courseMemberships.userId, session.user.id),
      isNull(courseMemberships.removedAt)
    ))
    .limit(1)
  // Two grades, not one (TJ, 2026-08-09: "admin role has even more tabs").
  // Faculty hold the read-side of their own courses; the library and course
  // managers are write surfaces and stay admin's. Same rule the /admin layout
  // and AdminNav already enforce — this only carries it to the journey bar.
  const adminTruly = isAdminUser(session.user)
  const staffTruly = adminTruly || membership[0]?.role === "FACULTY"

  // The student lens (TJ, 2026-08-09). Masked HERE, once, so that every client
  // surface gated on isStaff/isAdmin goes quiet together and no consumer has to
  // know the lens exists. The unmasked truth rides along as `staffTruly`, for
  // exactly one purpose: drawing the control that takes the lens off again.
  // Without it a staff member could put the lens on and have no way back.
  const asStudent = staffTruly && (await viewingAsStudent())
  const isAdmin = adminTruly && !asStudent && !viewing
  const isStaff = staffTruly && !asStudent && !viewing

  // The sections a staff viewer may overlay. Empty for a student — they see no
  // Overlay control at all, so the list would only be a leak of names.
  const courseSections = isStaff
    ? await db
        .select({ id: sections.id, name: sections.name })
        .from(sections)
        .where(eq(sections.courseId, courseId))
        .orderBy(asc(sections.name))
    : []

  // Every enrolment this person could make the working course — their own
  // active memberships in unarchived courses. Empty while Open Loom viewing
  // is on (the course above is the STUDENT's, and setActiveCourse refuses
  // then too); empty-by-construction for an admin with no membership
  // (listEnrolledCourses returns only real enrolments — AdminNav's ?course=
  // picker is their switcher). Display order is stable (createdAt, then id)
  // so the menu's rows do not jump after a switch: the resolver's selectedAt
  // ordering decides WHICH course wins, never where it sits in this list.
  // Deliberately NOT masked by the student lens — these are the wearer's own
  // enrolments, which is exactly what a real two-course student sees.
  const enrolments = viewing ? [] : await listEnrolledCourses(session.user.id)
  const switchable = [...enrolments]
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
    )
    .map(({ id, name, term }) => ({ id, name, term }))

  return {
    id: course.id, name: course.name, term: course.term,
    isStaff, isAdmin, sections: courseSections,
    staffTruly, viewingAsStudent: asStudent,
    viewingUser: viewing ? { id: viewing.userId, name: viewing.name ?? viewing.email } : null,
    courses: switchable,
  }
}

/**
 * Stamps the chosen membership as the working course — the only writer of
 * course_membership.selectedAt. The resolver (resolveCourseIdForUser) then
 * prefers it everywhere, so this is the whole server side of the header's
 * course switch. Validates an ACTIVE membership in an UNARCHIVED course —
 * the same filters listEnrolledCourses applies — so the stamp can never
 * point the resolver at a course it would refuse to resolve. Refused while
 * Open Loom viewing is on: every read is scoped to the student then, and a
 * stamp mid-view would silently re-aim the viewer's own surfaces for later.
 */
export async function setActiveCourse(courseId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new Error("Unauthorized")

  if (await resolveViewTarget(session.user.id)) {
    throw new Error("Leave the student's loom before switching your own course")
  }

  const membership = await db
    .select({ courseId: courseMemberships.courseId })
    .from(courseMemberships)
    .innerJoin(courses, eq(courses.id, courseMemberships.courseId))
    .where(
      and(
        eq(courseMemberships.userId, session.user.id),
        eq(courseMemberships.courseId, courseId),
        isNull(courseMemberships.removedAt),
        eq(courses.isArchived, false)
      )
    )
    .limit(1)
  if (membership.length === 0) throw new Error("Not one of your courses")

  await db
    .update(courseMemberships)
    .set({ selectedAt: new Date() })
    .where(
      and(
        eq(courseMemberships.courseId, courseId),
        eq(courseMemberships.userId, session.user.id)
      )
    )
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
 * the shared library, nor to student concepts/passages/edges, whose courseId is
 * set null so the work survives.
 */
export async function deleteCourse(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  if (!courseId) return

  // Typed confirmation, nothing more: a hard course delete must not happen on
  // a mis-click. (Student work survives it regardless — courseId set-null,
  // per the docstring above; nothing here inspects whether work exists.)
  if (readText(formData, "confirm") !== "delete") return

  await db.delete(courses).where(eq(courses.id, courseId))

  revalidateAdmin()
}

/**
 * Validates a lead choice the way assignMemberSection validates a section:
 * the id must name an ACTIVE FACULTY membership of THIS course, else null —
 * a direct POST cannot install an outsider as a section's lead. Returns null
 * for the empty choice ("no lead") too.
 */
async function resolveLeadUserId(courseId: string, raw: string): Promise<string | null> {
  if (!raw) return null
  const rows = await db
    .select({ userId: courseMemberships.userId })
    .from(courseMemberships)
    .where(
      and(
        eq(courseMemberships.courseId, courseId),
        eq(courseMemberships.userId, raw),
        eq(courseMemberships.role, "FACULTY"),
        isNull(courseMemberships.removedAt)
      )
    )
    .limit(1)
  return rows[0]?.userId ?? null
}

export async function createSection(formData: FormData) {
  await requireAdmin()

  const courseId = readText(formData, "courseId")
  const name = readText(formData, "name")
  if (!courseId || !name) return

  const slug = await uniqueSectionSlug(courseId, slugify(readText(formData, "slug") || name))

  // The lead is a reference to a course FACULTY member since migration 0028;
  // the legacy free-text `lead` is never written for a new section.
  await db.insert(sections).values({
    courseId,
    slug,
    name,
    leadUserId: await resolveLeadUserId(courseId, readText(formData, "leadUserId")),
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

  // Three lead choices, one of them easy to miss. "__keep__" is the edit
  // form's default for a pre-0028 row that still shows its free-text lead:
  // it touches neither column, so renaming such a section cannot silently
  // wipe the legacy name. Any other value decides the lead outright — a
  // validated FACULTY reference, or none — and clears the legacy text with
  // it, so the two columns can never disagree about who leads.
  const leadChoice = readText(formData, "leadUserId")
  const set: Partial<typeof sections.$inferInsert> = { name, slug }
  if (leadChoice !== "__keep__") {
    set.leadUserId = await resolveLeadUserId(courseId, leadChoice)
    set.lead = ""
  }

  await db
    .update(sections)
    .set(set)
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
