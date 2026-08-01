"use server"

import { db } from "@/db"
import { users, concepts, bytes, edges, courseMemberships, courseAllowedEmails, sections, sessions } from "@/db/schema"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions, emailHasAppAccess, isAdminUser } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { resolveCourseId, resolveSectionId } from "@/lib/courses"

import { redirect } from "next/navigation"

export async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !isAdminUser(session.user)) {
    redirect("/")
  }

  return session
}

/**
 * Member ids for a course, optionally narrowed to one section.
 *
 * Note this no longer auto-enrols every user on first touch, as the old
 * ensureCourseContext did. That was a one-course migration convenience; with
 * several sections it would sweep the entire roster into each new one.
 * Enrolment now happens on sign-in from the course allowlist.
 */
async function getMemberIds(courseId: string, sectionId?: string | null) {
  const rows = await db
    .select({ userId: courseMemberships.userId })
    .from(courseMemberships)
    .where(
      and(
        eq(courseMemberships.courseId, courseId),
        isNull(courseMemberships.removedAt),
        sectionId ? eq(courseMemberships.sectionId, sectionId) : undefined
      )
    )

  return rows.map((row) => row.userId)
}

export async function getClassData(courseIdRaw?: string | null, sectionIdRaw?: string | null) {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []

  const sectionId = await resolveSectionId(courseId, sectionIdRaw)

  const memberships = await db
    .select({ userId: courseMemberships.userId, sectionId: courseMemberships.sectionId })
    .from(courseMemberships)
    .where(
      and(
        eq(courseMemberships.courseId, courseId),
        isNull(courseMemberships.removedAt),
        sectionId ? eq(courseMemberships.sectionId, sectionId) : undefined
      )
    )

  if (memberships.length === 0) {
    return []
  }

  const userIds = memberships.map((membership) => membership.userId)
  const allUsers = await db.select().from(users).where(inArray(users.id, userIds))
  const allConcepts = await db.select().from(concepts).where(inArray(concepts.userId, userIds))
  const allEdges = await db.select().from(edges).where(inArray(edges.userId, userIds))
  const sectionById = new Map(
    (await db.select().from(sections).where(eq(sections.courseId, courseId))).map((s) => [s.id, s])
  )

  return allUsers.map((u) => {
    const membership = memberships.find((m) => m.userId === u.id)
    return {
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      sectionId: membership?.sectionId ?? null,
      sectionName: membership?.sectionId
        ? sectionById.get(membership.sectionId)?.name ?? null
        : null,
      conceptsCount: allConcepts.filter((c) => c.userId === u.id).length,
      edgesCount: allEdges.filter((e) => e.userId === u.id).length,
    }
  })
}

/** One person on the course roster, invited or enrolled. */
export type RosterRow = {
  email: string
  /** Their display name once they have signed in; null while pending. */
  name: string | null
  userId: string | null
  /** `pending` = invited, has not signed in yet, so has no loom. */
  status: "enrolled" | "pending"
  sectionId: string | null
  sectionName: string | null
  conceptsCount: number
  edgesCount: number
  /** False for someone enrolled via the site-wide allowlist rather than this course's. */
  invited: boolean
}

/**
 * The course roster as one list: everyone invited, plus everyone enrolled,
 * matched on email.
 *
 * These were two separate cards, so "who hasn't signed in yet" — the question
 * asked in week 2 — had to be eyeballed across them. A pending row is an
 * invitation that has not been taken up; enrolment happens on first sign-in
 * (see the signIn callback in lib/auth.ts).
 */
export async function getRoster(
  courseIdRaw?: string | null,
  sectionIdRaw?: string | null
): Promise<RosterRow[]> {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []
  const sectionId = await resolveSectionId(courseId, sectionIdRaw)

  const [enrolled, invited, courseSections] = await Promise.all([
    getClassData(courseId, sectionId),
    db
      .select({ email: courseAllowedEmails.email, sectionId: courseAllowedEmails.sectionId })
      .from(courseAllowedEmails)
      .where(eq(courseAllowedEmails.courseId, courseId)),
    db.select().from(sections).where(eq(sections.courseId, courseId)),
  ])

  const sectionById = new Map(courseSections.map((s) => [s.id, s.name]))
  const invitedByEmail = new Map(invited.map((row) => [row.email.toLowerCase(), row]))

  const rows: RosterRow[] = enrolled.map((u) => ({
    email: u.email,
    name: u.name,
    userId: u.id,
    status: "enrolled",
    sectionId: u.sectionId,
    sectionName: u.sectionName,
    conceptsCount: u.conceptsCount,
    edgesCount: u.edgesCount,
    invited: invitedByEmail.has(u.email.toLowerCase()),
  }))

  const enrolledEmails = new Set(enrolled.map((u) => u.email.toLowerCase()))
  invited.forEach((row) => {
    if (enrolledEmails.has(row.email.toLowerCase())) return
    // A pending invitation is filtered by the section it was addressed to,
    // since that is the only section it has yet.
    if (sectionId && row.sectionId !== sectionId) return
    rows.push({
      email: row.email,
      name: null,
      userId: null,
      status: "pending",
      sectionId: row.sectionId,
      sectionName: row.sectionId ? sectionById.get(row.sectionId) ?? null : null,
      conceptsCount: 0,
      edgesCount: 0,
      invited: true,
    })
  })

  // Pending first — they are the ones needing action — then alphabetically.
  return rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1
    return (a.name ?? a.email).localeCompare(b.name ?? b.email, undefined, { sensitivity: "base" })
  })
}

export async function getAllowedEmails(courseIdRaw?: string | null) {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []

  return db
    .select({ email: courseAllowedEmails.email, sectionId: courseAllowedEmails.sectionId })
    .from(courseAllowedEmails)
    .where(eq(courseAllowedEmails.courseId, courseId))
    .orderBy(courseAllowedEmails.email)
}

export async function addAllowedEmail(formData: FormData) {
  await checkAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await resolveCourseId(typeof courseIdRaw === "string" ? courseIdRaw : null)
  if (!courseId) return

  const rawEmail = formData.get("email")
  if (typeof rawEmail !== "string") {
    return
  }

  const email = rawEmail.toLowerCase().trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return
  }

  const rawSectionId = formData.get("sectionId")
  const sectionId = await resolveSectionId(
    courseId,
    typeof rawSectionId === "string" ? rawSectionId : null
  )

  await db
    .insert(courseAllowedEmails)
    .values({ courseId, email, sectionId })
    .onConflictDoUpdate({
      target: [courseAllowedEmails.courseId, courseAllowedEmails.email],
      set: { sectionId },
    })

  revalidatePath("/admin")
}

export type InviteResult = {
  added: string[]
  already: string[]
  invalid: string[]
  /** Section names named in the paste that this course does not have. */
  unknownSections: string[]
} | null

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Invite a whole roster at once.
 *
 * A course is ~65 people across 5 sections, which one email at a time is 65
 * round trips. Accepts one per line, optionally `email, section` so a paste
 * can carry the section split with it:
 *
 *   ada@example.edu
 *   grace@example.edu, Section 2
 *
 * Reports what happened per address rather than silently succeeding: a typo in
 * a roster paste is invisible otherwise, and the person simply never gets in.
 */
export async function inviteLearners(
  _prev: InviteResult,
  formData: FormData
): Promise<InviteResult> {
  await checkAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await resolveCourseId(typeof courseIdRaw === "string" ? courseIdRaw : null)
  if (!courseId) return { added: [], already: [], invalid: [], unknownSections: [] }

  const raw = formData.get("emails")
  if (typeof raw !== "string") return { added: [], already: [], invalid: [], unknownSections: [] }

  const defaultSectionRaw = formData.get("sectionId")
  const defaultSectionId = await resolveSectionId(
    courseId,
    typeof defaultSectionRaw === "string" ? defaultSectionRaw : null
  )

  const courseSections = await db.select().from(sections).where(eq(sections.courseId, courseId))
  const sectionByName = new Map<string, string>()
  courseSections.forEach((s) => {
    sectionByName.set(s.name.toLowerCase().trim(), s.id)
    sectionByName.set(s.slug.toLowerCase().trim(), s.id)
  })

  const existing = new Set(
    (
      await db
        .select({ email: courseAllowedEmails.email })
        .from(courseAllowedEmails)
        .where(eq(courseAllowedEmails.courseId, courseId))
    ).map((row) => row.email.toLowerCase())
  )

  const added: string[] = []
  const already: string[] = []
  const invalid: string[] = []
  const unknownSections = new Set<string>()
  const seen = new Set<string>()
  const toInsert: { courseId: string; email: string; sectionId: string | null }[] = []

  // Commas, tabs and semicolons all appear in pasted rosters; treat any of them
  // as the field separator.
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const [emailRaw, sectionRaw] = trimmed.split(/[,;\t]/, 2).map((part) => part?.trim() ?? "")
    const email = emailRaw.toLowerCase()

    if (!EMAIL.test(email)) {
      invalid.push(trimmed)
      return
    }
    // A duplicate inside one paste is not an error, but it must not become two
    // rows racing the same conflict target.
    if (seen.has(email)) return
    seen.add(email)

    let sectionId = defaultSectionId
    if (sectionRaw) {
      const matched = sectionByName.get(sectionRaw.toLowerCase())
      if (matched) sectionId = matched
      else unknownSections.add(sectionRaw)
    }

    if (existing.has(email)) already.push(email)
    else added.push(email)
    toInsert.push({ courseId, email, sectionId })
  })

  if (toInsert.length) {
    await db
      .insert(courseAllowedEmails)
      .values(toInsert)
      .onConflictDoUpdate({
        target: [courseAllowedEmails.courseId, courseAllowedEmails.email],
        set: { sectionId: sql`excluded."sectionId"` },
      })
  }

  revalidatePath("/admin")
  return { added, already, invalid, unknownSections: [...unknownSections] }
}

export async function removeAllowedEmail(formData: FormData) {
  await checkAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await resolveCourseId(typeof courseIdRaw === "string" ? courseIdRaw : null)
  if (!courseId) return

  const rawEmail = formData.get("email")
  if (typeof rawEmail !== "string") {
    return
  }

  const email = rawEmail.toLowerCase().trim()
  if (!email) {
    return
  }

  await db
    .delete(courseAllowedEmails)
    .where(and(eq(courseAllowedEmails.courseId, courseId), eq(courseAllowedEmails.email, email)))
  revalidatePath("/admin")
}

/**
 * Remove an enrolled person from one course.
 *
 * Ends the membership (soft — removedAt, so their work survives and a
 * re-invitation reinstates them with it) and withdraws the invitation so they
 * cannot re-enrol themselves. Scoped to this course by design: their access to
 * other courses is untouched. Only when this was their last source of access
 * anywhere do we also revoke live sessions, so that losing all authorization
 * takes effect now rather than at session expiry.
 */
export async function removeFromRoster(formData: FormData) {
  await checkAdmin()

  const courseIdRaw = formData.get("courseId")
  const courseId = await resolveCourseId(typeof courseIdRaw === "string" ? courseIdRaw : null)
  if (!courseId) return

  const userIdRaw = formData.get("userId")
  if (typeof userIdRaw !== "string" || !userIdRaw) return

  const user = await db.select().from(users).where(eq(users.id, userIdRaw)).limit(1)
  if (user.length === 0) return
  const email = user[0].email.toLowerCase().trim()

  await db
    .update(courseMemberships)
    .set({ removedAt: new Date() })
    .where(and(eq(courseMemberships.courseId, courseId), eq(courseMemberships.userId, userIdRaw)))
  await db
    .delete(courseAllowedEmails)
    .where(and(eq(courseAllowedEmails.courseId, courseId), eq(courseAllowedEmails.email, email)))

  if (!(await emailHasAppAccess(email))) {
    await db.delete(sessions).where(eq(sessions.userId, userIdRaw))
  }

  revalidatePath("/admin")
}

export async function getUserLoomDataAsAdmin(targetUserId: string, courseIdRaw?: string | null) {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return { concepts: [], bytes: [], edges: [] }

  const userConcepts = await db.select().from(concepts).where(and(eq(concepts.userId, targetUserId), eq(concepts.courseId, courseId)))
  const userBytes = await db.select().from(bytes).where(and(eq(bytes.userId, targetUserId), eq(bytes.courseId, courseId)))
  const userEdges = await db.select().from(edges).where(and(eq(edges.userId, targetUserId), eq(edges.courseId, courseId)))

  return { concepts: userConcepts, bytes: userBytes, edges: userEdges }
}

export async function getAggregateLoomData(
  courseIdRaw?: string | null,
  sectionIdRaw?: string | null
) {
  await checkAdmin()

  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) {
    return { concepts: [], bytes: [], edges: [], bytesUnavailable: false }
  }

  const sectionId = await resolveSectionId(courseId, sectionIdRaw)
  const userIds = await getMemberIds(courseId, sectionId)

  if (userIds.length === 0) {
    return { concepts: [], bytes: [], edges: [], bytesUnavailable: false }
  }

  const allConcepts = await db
    .select()
    .from(concepts)
    .where(and(eq(concepts.courseId, courseId), inArray(concepts.userId, userIds)))
  const allEdges = await db
    .select()
    .from(edges)
    .where(and(eq(edges.courseId, courseId), inArray(edges.userId, userIds)))

  try {
    const allBytes = await db
      .select()
      .from(bytes)
      .where(and(eq(bytes.courseId, courseId), inArray(bytes.userId, userIds)))
    return { concepts: allConcepts, bytes: allBytes, edges: allEdges, bytesUnavailable: false }
  } catch (error) {
    // Fail soft so aggregate map still renders if byte schema/data is temporarily inconsistent.
    console.error("[getAggregateLoomData] Failed to load bytes for aggregate view", error)
    return { concepts: allConcepts, bytes: [], edges: allEdges, bytesUnavailable: true }
  }
}
