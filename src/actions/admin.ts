"use server"

import { db } from "@/db"
import { users, concepts, passages, passageConcepts, edges, links, cloths, sources, courseMemberships, courseAllowedEmails, sections, sessions } from "@/db/schema"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { getServerSession } from "next-auth/next"
import { authOptions, emailHasAppAccess, isAdminUser } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { ensureFacultySection, listFacultyCourseIds, resolveCourseId, resolveSectionId } from "@/lib/courses"

import { redirect } from "next/navigation"

export async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !isAdminUser(session.user)) {
    redirect("/")
  }

  return session
}

/**
 * Who is looking at the admin shell, and which course they may look at.
 *
 * An ADMIN resolves like before — any course, site-first fallback. A course
 * FACULTY member resolves only within the courses their membership grants
 * (their first when the query string names another), so /admin entered bare
 * lands on THEIR course rather than redirecting home off someone else's.
 * Everyone else is turned away. Pages use this; the read actions keep their
 * own checkCourseFaculty gate, so a page bug never widens access.
 */
export async function getStaffViewer(
  courseIdRaw?: string | null
): Promise<{ courseId: string | null; isAdmin: boolean }> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")
  if (isAdminUser(session.user)) {
    return { courseId: await resolveCourseId(courseIdRaw), isAdmin: true }
  }
  const facultyIds = await listFacultyCourseIds(session.user.id)
  if (facultyIds.length === 0) redirect("/")
  const requested = await resolveCourseId(courseIdRaw)
  return {
    courseId: requested && facultyIds.includes(requested) ? requested : facultyIds[0],
    isAdmin: false,
  }
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

/**
 * The faculty view's read gate (rulings 17/18): a site ADMIN sees any course;
 * a member whose membership.role is FACULTY sees THIS course's read-side
 * (roster, per-student view, cohort aggregate). Capabilities are additive —
 * faculty keep their own student workspace untouched. Write-side admin
 * actions stay behind checkAdmin.
 */
async function checkCourseFaculty(courseId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")
  if (isAdminUser(session.user)) return
  const membership = await db
    .select({ role: courseMemberships.role })
    .from(courseMemberships)
    .where(and(
      eq(courseMemberships.courseId, courseId),
      eq(courseMemberships.userId, session.user.id),
      isNull(courseMemberships.removedAt)
    ))
    .limit(1)
  if (membership[0]?.role !== "FACULTY") redirect("/")
}

/**
 * Promote or demote a member's per-course role (ruling 18). Promotion homes
 * them in the Faculty Section; demotion returns them to unassigned so an
 * instructor places them deliberately.
 */
export async function setMemberRole(formData: FormData) {
  await checkAdmin()

  const courseId = String(formData.get("courseId") ?? "")
  const userId = String(formData.get("userId") ?? "")
  const role = String(formData.get("role") ?? "")
  if (!courseId || !userId || (role !== "LEARNER" && role !== "FACULTY")) return

  const sectionId = role === "FACULTY" ? await ensureFacultySection(courseId) : null
  await db
    .update(courseMemberships)
    .set({ role, sectionId })
    .where(and(
      eq(courseMemberships.courseId, courseId),
      eq(courseMemberships.userId, userId),
      isNull(courseMemberships.removedAt)
    ))

  revalidatePath("/admin")
}

export async function getClassData(courseIdRaw?: string | null, sectionIdRaw?: string | null) {
  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []
  await checkCourseFaculty(courseId)

  const sectionId = await resolveSectionId(courseId, sectionIdRaw)

  const memberships = await db
    .select({
      userId: courseMemberships.userId,
      sectionId: courseMemberships.sectionId,
      role: courseMemberships.role,
      // WHEN THEY ACCEPTED. The membership row is written by
      // enrolInvitedCourses the first time they sign in (src/lib/auth.ts), so
      // its createdAt is the moment the invitation was taken up. It survives a
      // soft-remove and reinstatement — that branch clears removedAt only —
      // which is right: the date is when they first joined, not when somebody
      // last changed their mind.
      createdAt: courseMemberships.createdAt,
    })
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
  // A cloth is one reading's work, so its count says how many readings this
  // person has actually woven — the stat the roster was missing (TJ,
  // 2026-08-22: "the roster list needs a stat for 'cloths'"). Scoped by user
  // like the two beside it; see the note on RosterRow about course scope.
  const allCloths = await db
    .select({ userId: cloths.userId, title: cloths.title, scopeKey: cloths.scopeKey })
    .from(cloths)
    .where(inArray(cloths.userId, userIds))
  // Which concepts carry at least one passage — the breakdown behind the
  // concepts pill. A concept with no passage is coined but not yet evidenced,
  // which is a real state in the model, not a defect.
  const evidenced = await db
    .select({ userId: passages.userId, conceptId: passageConcepts.conceptId })
    .from(passageConcepts)
    .innerJoin(passages, eq(passages.id, passageConcepts.passageId))
    .where(inArray(passages.userId, userIds))
  const sourceTitle = new Map(
    (await db.select({ id: sources.id, title: sources.title }).from(sources)).map((s) => [s.id, s.title])
  )
  const sectionById = new Map(
    (await db.select().from(sections).where(eq(sections.courseId, courseId))).map((s) => [s.id, s])
  )

  return allUsers.map((u) => {
    const membership = memberships.find((m) => m.userId === u.id)
    const mine = allCloths.filter((c) => c.userId === u.id)
    const evidencedIds = new Set(
      evidenced.filter((row) => row.userId === u.id).map((row) => row.conceptId)
    )
    const myConcepts = allConcepts.filter((c) => c.userId === u.id)
    const myEdges = allEdges.filter((e) => e.userId === u.id)
    return {
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      sectionId: membership?.sectionId ?? null,
      sectionName: membership?.sectionId
        ? sectionById.get(membership.sectionId)?.name ?? null
        : null,
      role: membership?.role ?? "LEARNER",
      acceptedAt: membership?.createdAt ?? null,
      conceptsCount: myConcepts.length,
      // Of those concepts, how many a passage stands behind.
      conceptsEvidenced: myConcepts.filter((c) => evidencedIds.has(c.id)).length,
      edgesCount: myEdges.length,
      // A thread whose sentence is written says what the link MEANS; one
      // without is drawn but unsaid.
      edgesDescribed: myEdges.filter((e) => (e.sentence ?? "").trim() !== "").length,
      clothsCount: mine.length,
      /** The readings woven, named — the cloth's own title, else its reading's. */
      clothNames: mine.map(
        (c) =>
          c.title.trim() ||
          c.scopeKey
            .split(",")
            .map((id) => sourceTitle.get(id) ?? "a reading")
            .join(" + ") ||
          "no reading"
      ),
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
  /** The per-course role — "FACULTY" gets this course's read-side (ruling 18); "LEARNER" while pending. */
  role: string
  /**
   * WHEN THEY WERE ASKED, and WHEN THEY ANSWERED (TJ, 2026-08-24: "the roster
   * needs an invited date and an accepted date").
   *
   * Both already existed as columns and neither needed a migration: `invited`
   * is `course_allowed_email.createdAt`, `accepted` is
   * `course_membership.createdAt`.
   *
   * Either may be null, and the pair is the useful part. No invitation and an
   * acceptance means somebody enrolled by a route that left no invitation
   * behind, or the invitation was withdrawn after they joined. An invitation
   * and no acceptance is the silence the Invited tab is about — and the gap
   * between the two dates is how long that silence has lasted.
   */
  invitedAt: Date | null
  acceptedAt: Date | null
  /**
   * The three work counts, each with the breakdown its pill discloses on
   * hover (TJ, 2026-08-22: "the stat pills need mouseover with break down").
   *
   * SCOPE, stated because the number does not say it: these count the
   * person's whole loom, not their work in THIS course. concepts, edges and
   * cloths all carry a courseId, but getClassData has always filtered on
   * userId alone, so a student enrolled in two courses shows the same totals
   * on both rosters. `clothsCount` follows the two beside it rather than
   * introducing a second meaning of "count" in one row — one scope for the
   * row, whichever it is. Narrowing all three to the course is a decision,
   * not a fix, and it is TJ's.
   */
  conceptsCount: number
  /** Of those, how many a passage stands behind. */
  conceptsEvidenced: number
  edgesCount: number
  /** Of those, how many carry a written Thread Description. */
  edgesDescribed: number
  clothsCount: number
  /** The woven readings by name, for the cloths pill's breakdown. */
  clothNames: string[]
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
  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return []
  await checkCourseFaculty(courseId)
  const sectionId = await resolveSectionId(courseId, sectionIdRaw)

  const [enrolled, invited, courseSections] = await Promise.all([
    getClassData(courseId, sectionId),
    db
      .select({
        email: courseAllowedEmails.email,
        sectionId: courseAllowedEmails.sectionId,
        // WHEN THEY WERE ASKED.
        createdAt: courseAllowedEmails.createdAt,
      })
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
    role: u.role,
    conceptsCount: u.conceptsCount,
    conceptsEvidenced: u.conceptsEvidenced,
    edgesCount: u.edgesCount,
    edgesDescribed: u.edgesDescribed,
    clothsCount: u.clothsCount,
    clothNames: u.clothNames,
    invited: invitedByEmail.has(u.email.toLowerCase()),
    // Null where no invitation stands: enrolled by another route, or invited
    // and then withdrawn after they had already joined.
    invitedAt: invitedByEmail.get(u.email.toLowerCase())?.createdAt ?? null,
    acceptedAt: u.acceptedAt,
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
      role: "LEARNER",
      // A pending invitation has no loom yet, so every count is a true zero.
      conceptsCount: 0,
      conceptsEvidenced: 0,
      edgesCount: 0,
      edgesDescribed: 0,
      clothsCount: 0,
      clothNames: [],
      invited: true,
      invitedAt: row.createdAt,
      // Nobody has signed in on this invitation — that is what pending means.
      acceptedAt: null,
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
  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) return { concepts: [], passages: [], edges: [] }
  await checkCourseFaculty(courseId)

  // The TARGET must be on this roster, not merely the viewer's course. This
  // gated the course and then took targetUserId unchecked; what stopped it
  // being worse was that the queries below are courseId-scoped — a filter, not
  // a gate. The gap it left was real: removal is soft (`removedAt`), and every
  // other surface honours it — sign-in, course resolution, the faculty list,
  // file access and both overlay bands all check `isNull(removedAt)` — so a
  // removed member's whole loom stayed readable here alone. Nothing links to
  // it any more either: `getRoster` omits them, so this closes a door that no
  // longer has a handle on it.
  const onRoster = await db
    .select({ userId: courseMemberships.userId })
    .from(courseMemberships)
    .where(and(
      eq(courseMemberships.courseId, courseId),
      eq(courseMemberships.userId, targetUserId),
      isNull(courseMemberships.removedAt)
    ))
    .limit(1)
  if (!onRoster.length) return { concepts: [], passages: [], edges: [] }

  const userConcepts = await db.select().from(concepts).where(and(eq(concepts.userId, targetUserId), eq(concepts.courseId, courseId)))
  const passageRows = await db.select().from(passages).where(and(eq(passages.userId, targetUserId), eq(passages.courseId, courseId)))
  const userEdges = await db.select().from(edges).where(and(eq(edges.userId, targetUserId), eq(edges.courseId, courseId)))

  return { concepts: userConcepts, passages: await foldConceptIds(passageRows), edges: userEdges }
}

/** Fold passage_concept pointers onto passage rows as `conceptIds` (capture order). */
async function foldConceptIds<T extends { id: string }>(passageRows: T[]): Promise<(T & { conceptIds: string[] })[]> {
  if (!passageRows.length) return []
  const junction = await db
    .select({ passageId: passageConcepts.passageId, conceptId: passageConcepts.conceptId })
    .from(passageConcepts)
    .where(inArray(passageConcepts.passageId, passageRows.map((b) => b.id)))
    .orderBy(asc(passageConcepts.createdAt), asc(passageConcepts.conceptId))
  const byPassage = new Map<string, string[]>()
  junction.forEach((row) => {
    const list = byPassage.get(row.passageId) ?? []
    list.push(row.conceptId)
    byPassage.set(row.passageId, list)
  })
  return passageRows.map((b) => ({ ...b, conceptIds: byPassage.get(b.id) ?? [] }))
}

export async function getAggregateLoomData(
  courseIdRaw?: string | null,
  sectionIdRaw?: string | null,
  /**
   * Narrow to ONE reading, and/or to ONE student (TJ, 2026-08-22). Both are
   * "all" when absent, the way the section picker's "All sections" is.
   *
   * A student is filtered where a section already is — on the member set, so
   * every later query narrows with it and nothing has to be re-checked. A
   * READING has no column on a concept or a thread to filter by: only a
   * passage carries `sourceId`. So the reading narrows the passages, and the
   * concepts are the ones those passages evidence, and the threads are the
   * ones running between concepts that survive. That is the honest reading of
   * "this reading's part of the weave" — a concept coined against another text
   * is not in this one merely because its owner also read this one.
   */
  sourceIdRaw?: string | null,
  studentIdRaw?: string | null
) {
  const courseId = await resolveCourseId(courseIdRaw)
  if (!courseId) {
    return { concepts: [], passages: [], edges: [], links: [], members: [], passagesUnavailable: false }
  }
  await checkCourseFaculty(courseId)

  const sectionId = await resolveSectionId(courseId, sectionIdRaw)
  const memberIds = await getMemberIds(courseId, sectionId)
  // An unknown student id narrows to nobody rather than silently widening to
  // everybody — the same discipline resolveSectionId keeps for a dead section.
  const studentId = studentIdRaw?.trim() || null
  const userIds = studentId ? memberIds.filter((id) => id === studentId) : memberIds

  if (userIds.length === 0) {
    return { concepts: [], passages: [], edges: [], links: [], members: [], passagesUnavailable: false }
  }

  const allConcepts = await db
    .select()
    .from(concepts)
    .where(and(eq(concepts.courseId, courseId), inArray(concepts.userId, userIds)))
  const allEdges = await db
    .select()
    .from(edges)
    .where(and(eq(edges.courseId, courseId), inArray(edges.userId, userIds)))
  /**
   * THE LINKS THE THREADS POINT AT, because a thread's label is a Link now
   * (migration 0024) and `labelOf` cannot resolve `edge.linkId` without them.
   *
   * This page passed `links: []` and got away with it: `edges.handle` is a
   * dual-written copy of the Link Label, still written on every label write
   * (actions/loom.ts), so `labelOf` fell through to the handle and read the
   * right word. The day that copy stops being written — it is legacy and
   * AGENTS.md says so — every thread on the cohort graph would have quietly
   * read as unlabelled. Caught in review on #34.
   */
  const allLinks = await db
    .select()
    .from(links)
    .where(and(eq(links.courseId, courseId), inArray(links.userId, userIds)))

  // Who wove what: the aggregate pools every student's rows, so the same
  // label can appear once per student — attribution is what tells them apart.
  const memberRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, userIds))
  const members = memberRows.map((u) => ({ id: u.id, name: u.name || u.email }))

  try {
    const sourceId = sourceIdRaw?.trim() || null
    const allPassages = await db
      .select()
      .from(passages)
      .where(
        and(
          eq(passages.courseId, courseId),
          inArray(passages.userId, userIds),
          sourceId ? eq(passages.sourceId, sourceId) : undefined
        )
      )
    const folded = await foldConceptIds(allPassages)
    if (!sourceId) {
      return { concepts: allConcepts, passages: folded, edges: allEdges, links: allLinks, members, passagesUnavailable: false }
    }
    // Evidenced HERE: the concepts these passages point at, and the threads
    // whose ends both survive that. A thread with one end outside the reading
    // is not a thread within it.
    const here = new Set(folded.flatMap((b) => b.conceptIds))
    const scopedConcepts = allConcepts.filter((c) => here.has(c.id))
    const scopedEdges = allEdges.filter((e) => here.has(e.fromId) && here.has(e.toId))
    return {
      concepts: scopedConcepts,
      passages: folded,
      edges: scopedEdges,
      links: allLinks,
      members,
      passagesUnavailable: false,
    }
  } catch (error) {
    // Fail soft so aggregate map still renders if passage schema/data is temporarily inconsistent.
    console.error("[getAggregateLoomData] Failed to load passages for aggregate view", error)
    return { concepts: allConcepts, passages: [], edges: allEdges, links: allLinks, members, passagesUnavailable: true }
  }
}
