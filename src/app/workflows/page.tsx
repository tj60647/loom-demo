import { getServerSession } from "next-auth/next"
import { redirect } from "next/navigation"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { courseMemberships } from "@/db/schema"
import { authOptions, isAdminUser } from "@/lib/auth"
import { resolveCourseIdForUser } from "@/lib/courses"
import { viewingAsStudent } from "@/lib/viewAsServer"
import WorkflowsBoard from "@/components/admin/WorkflowsBoard"
import RoleMatrix from "@/components/admin/RoleMatrix"

/**
 * Workflows — how each kind of person moves through Loom.
 *
 * Lives at `/workflows`, NOT under `/admin` (TJ, 2026-08-08): students may read
 * their own flow, and they can never enter the admin shell. Reached from the
 * header, beside About, on every page.
 *
 * Who sees what: a **student** sees the student flow only — the others describe
 * surfaces they cannot reach, and a flow chart of doors that are shut is a
 * puzzle, not a help. **Faculty and admins** see all three, because they work
 * the seam between them.
 *
 * The page holds no course data whatsoever — no roster, no graph, nothing
 * per-student — so nothing here needs a course-scoped gate. Signed in is the
 * whole requirement.
 */
export default async function WorkflowsPage() {
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
  // The student lens (TJ, 2026-08-09). Staff read all three flows and a student
  // reads their own, so without this "view as student" would still show three —
  // and this page is decided on the server, where a client mask cannot reach.
  if (isStaff && (await viewingAsStudent())) isStaff = false

  return (
    <main style={{ padding: "20px" }}>
      <h1>Workflows</h1>
      <p style={{ marginBottom: "20px" }}>
        {isStaff
          ? "What each person does, in order, and where each step happens. Kept beside the code rather than in a drawing tool, so it can be corrected in the same commit that changes the thing."
          : "What you do in Loom, in order, and where each step happens. Kept beside the code rather than in a drawing tool, so it stays true as the tool changes."}
      </p>
      <WorkflowsBoard showAll={isStaff} />
      {/* Beside the flows because it answers the question they raise: the
          diagrams show how each person MOVES, this shows what they may REACH
          (TJ, 2026-08-09). Shown to everyone — a student learning that the
          overlays are not theirs, and why, is the tool being honest rather
          than quiet. */}
      <RoleMatrix />
    </main>
  )
}
