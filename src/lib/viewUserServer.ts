import { cookies } from "next/headers"
import { db } from "@/db"
import { courseMemberships, users } from "@/db/schema"
import { isAdminUser } from "@/lib/auth"
import { VIEW_USER_COOKIE } from "@/lib/viewUser"
import { and, eq, inArray, isNull } from "drizzle-orm"

export type ViewTarget = {
  userId: string
  name: string | null
  email: string | null
  /** The course that authorized the view — the first shared course; every
   * read in the mode scopes to the TARGET's course resolution, this is for
   * the floating menu's Teaching links. */
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
  targetId: string | null | undefined
): Promise<ViewTarget | null> {
  if (!viewerId || !targetId || viewerId === targetId) return null

  const targetMemberships = await db
    .select({ courseId: courseMemberships.courseId })
    .from(courseMemberships)
    .where(and(eq(courseMemberships.userId, targetId), isNull(courseMemberships.removedAt)))
  if (targetMemberships.length === 0) return null
  const targetCourseIds = targetMemberships.map((m) => m.courseId)

  const [viewer] = await db
    .select({ role: users.role, email: users.email })
    .from(users)
    .where(eq(users.id, viewerId))
    .limit(1)
  if (!viewer) return null

  let authorizedCourseId: string | null = null
  if (isAdminUser(viewer)) {
    authorizedCourseId = targetCourseIds[0]
  } else {
    const [shared] = await db
      .select({ courseId: courseMemberships.courseId })
      .from(courseMemberships)
      .where(and(
        eq(courseMemberships.userId, viewerId),
        eq(courseMemberships.role, "FACULTY"),
        isNull(courseMemberships.removedAt),
        inArray(courseMemberships.courseId, targetCourseIds)
      ))
      .limit(1)
    authorizedCourseId = shared?.courseId ?? null
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
  const targetId = jar.get(VIEW_USER_COOKIE)?.value
  if (!targetId) return null
  return authorizeViewTarget(viewerId, targetId)
}
