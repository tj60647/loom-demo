import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { courseMemberships } from "@/db/schema"
import { authOptions, isAdminUser } from "@/lib/auth"
import { resolveCourseIdForUser } from "@/lib/courses"
import RoleMatrix from "@/components/admin/RoleMatrix"
import MetaPage from "@/components/ui/MetaPage"

/**
 * Access — who can reach what, its own tab (TJ, 2026-08-09).
 *
 * It briefly sat under the workflow diagrams, which was the wrong shape: the
 * flows are a picture of movement and this is a table of permission, and a
 * reader looking for one had to scroll past the other.
 *
 * **Staff only**, unlike Workflows. Not because the contents are secret — they
 * describe gates, not data — but because the table cites the source file and
 * line that enforces each row, which is a thing for whoever maintains Loom, not
 * for someone reading Bucciarelli. A student asking "why can't I see the
 * overlays?" is answered in the surfaces themselves, not here.
 *
 * The gate deliberately does NOT consult the student lens, for the same reason
 * `/admin` does not: the lens hides the tab, and a lens is not a lock. Turning
 * it on should not eject a reader from a page they are in the middle of.
 */
export default async function Page() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")

  let isStaff = isAdminUser(session.user)
  if (!isStaff) {
    const courseId = await resolveCourseIdForUser(session.user.id)
    if (courseId) {
      const membership = await db
        .select({ role: courseMemberships.role })
        .from(courseMemberships)
        .where(and(
          eq(courseMemberships.courseId, courseId),
          eq(courseMemberships.userId, session.user.id),
          isNull(courseMemberships.removedAt)
        ))
        .limit(1)
      isStaff = membership[0]?.role === "FACULTY"
    }
  }
  if (!isStaff) redirect("/")

  return (
    <MetaPage
      title="Access"
      meta="who can reach what, read off the code that enforces it"
    >
      <RoleMatrix />
    </MetaPage>
  )
}
