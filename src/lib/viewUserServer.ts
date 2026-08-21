import { cookies } from "next/headers"
import { db } from "@/db"
import { courseMemberships, courses, users } from "@/db/schema"
import { isAdminUser } from "@/lib/auth"
import { VIEW_USER_COOKIE } from "@/lib/viewUser"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"

export type ViewTarget = {
  userId: string
  name: string | null
  email: string | null
  /** The course the view is PINNED to: the roster's course when the enter
   * link named one, else the first authorized course by a deterministic
   * order — always a LIVE course the target actively belongs to, which is
   * what lets the guarantee hold: every read in the mode passes this id as
   * the resolver's requested course, and the resolver matches requests
   * against live enrolments only, so an archived pin would silently fall
   * back to the student's own selection and show one course's work under
   * another's name. Every read scopes to this id (loom, shelf, search,
   * header), so what the viewer reads cannot flip when the student switches
   * their own working course (selectedAt). */
  courseId: string
}

/**
 * May `viewerId` read `targetId`'s loom? The one authorization for Open Loom
 * (src/lib/viewUser.ts) — same gate shape as getUserLoomDataAsAdmin: an
 * admin, or active FACULTY membership in a course the target ACTIVELY
 * belongs to. The target-membership half is not optional — course-scoping a
 * query is a filter, not a gate (the open-work 0.3 lesson), and a removed
 * member's loom must go dark for faculty the moment they are removed.
 *
 * Refusal is silent (null), never a redirect: the callers are reads, and a
 * read whose cookie names something unauthorized falls back to the viewer's
 * own loom — exactly what a student forging the cookie already had.
 */
export async function authorizeViewTarget(
  viewerId: string | null | undefined,
  targetId: string | null | undefined,
  requestedCourseId?: string | null
): Promise<ViewTarget | null> {
  if (!viewerId || !targetId || viewerId === targetId) return null

  // Deterministic and LIVE courses only. The pick used to be raw row order —
  // undefined in Postgres — so which loom opened depended on the plan, and
  // under selectedAt it would have drifted with the student's own switching.
  // Archived courses are excluded outright, not sorted last: every read in
  // the mode passes the pin through resolveCourseIdForUser, whose enrolment
  // list is live-only — an archived pin would never match there, so the
  // header would name the archived course while the loom silently showed
  // whichever live course the student's own selection resolves to. A view
  // whose course is archived mid-session falls to another shared live
  // course at the next per-read re-check, or ends silently (the same
  // fallback as any unauthorized cookie: the viewer's own loom).
  const targetMemberships = await db
    .select({ courseId: courseMemberships.courseId })
    .from(courseMemberships)
    .innerJoin(courses, eq(courses.id, courseMemberships.courseId))
    .where(and(
      eq(courseMemberships.userId, targetId),
      isNull(courseMemberships.removedAt),
      eq(courses.isArchived, false)
    ))
    .orderBy(asc(courses.createdAt), asc(courses.id))
  if (targetMemberships.length === 0) return null
  const targetCourseIds = targetMemberships.map((m) => m.courseId)

  const [viewer] = await db
    .select({ role: users.role, email: users.email })
    .from(users)
    .where(eq(users.id, viewerId))
    .limit(1)
  if (!viewer) return null

  // The requested course (the roster the link was clicked on) is honored
  // when it is among the courses this viewer may see this target through —
  // the same requested-if-valid-else-fallback shape resolveCourseIdForUser
  // keeps. It gates nothing extra and never errors: an invalid request just
  // falls back to the deterministic first.
  let authorizedCourseId: string | null = null
  if (isAdminUser(viewer)) {
    const requested = requestedCourseId
      ? targetCourseIds.find((id) => id === requestedCourseId)
      : undefined
    authorizedCourseId = requested ?? targetCourseIds[0]
  } else {
    const shared = await db
      .select({ courseId: courseMemberships.courseId })
      .from(courseMemberships)
      .innerJoin(courses, eq(courses.id, courseMemberships.courseId))
      .where(and(
        eq(courseMemberships.userId, viewerId),
        eq(courseMemberships.role, "FACULTY"),
        isNull(courseMemberships.removedAt),
        // Live courses only — the same rule listFacultyCourseIds applies to
        // the faculty read-side everywhere else ("FACULTY on a live course?").
        eq(courses.isArchived, false),
        inArray(courseMemberships.courseId, targetCourseIds)
      ))
      .orderBy(asc(courses.createdAt), asc(courses.id))
    const sharedIds = shared.map((row) => row.courseId)
    const requested = requestedCourseId
      ? sharedIds.find((id) => id === requestedCourseId)
      : undefined
    authorizedCourseId = requested ?? sharedIds[0] ?? null
  }
  if (!authorizedCourseId) return null

  const [target] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1)
  if (!target) return null

  return { userId: targetId, name: target.name, email: target.email, courseId: authorizedCourseId }
}

/**
 * The cookie read + the gate, together: whose loom is the viewer looking at?
 * Null when the cookie is absent, names the viewer, or names someone the
 * gate refuses — in every one of those cases the caller reads its own loom,
 * unchanged. Server only (next/headers); the cookie NAME lives in
 * src/lib/viewUser.ts for the client half of the split.
 */
export async function resolveViewTarget(
  viewerId: string | null | undefined
): Promise<ViewTarget | null> {
  if (!viewerId) return null
  const jar = await cookies()
  const raw = jar.get(VIEW_USER_COOKIE)?.value
  if (!raw) return null
  // "userId" or "userId:courseId" — the course half pins the mode to the
  // roster it was entered from (set by the enter route, re-validated here on
  // every read like the rest of the cookie). A pre-pin cookie has no colon
  // and parses to an undefined course, which falls back deterministically.
  const [targetId, requestedCourseId] = raw.split(":")
  if (!targetId) return null
  return authorizeViewTarget(viewerId, targetId, requestedCourseId ?? null)
}
