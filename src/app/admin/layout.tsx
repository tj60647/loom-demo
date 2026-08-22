import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminNav, { type AdminNavCourse } from "@/components/ui/AdminNav"
import Identity from "@/components/ui/Identity"
import JourneyNav from "@/components/ui/JourneyNav"
import { db } from "@/db"
import { sections } from "@/db/schema"
import { asc } from "drizzle-orm"
import { listCourses, listFacultyCourseIds } from "@/lib/courses"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect("/")
  }

  // Two ways in (rulings 17/18): site ADMIN sees everything; a course FACULTY
  // member sees the read-side of their courses only. Every action behind these
  // pages re-checks for itself, so this gate shapes the shell, not the
  // authorization.
  const admin = isAdminUser(session.user)
  const facultyCourseIds = admin ? [] : await listFacultyCourseIds(session.user.id)
  if (!admin && facultyCourseIds.length === 0) {
    redirect("/")
  }

  // The nav needs every course's sections up front because layouts can't read
  // searchParams — it resolves the active course/section on the client.
  const [allCourseRows, sectionRows] = await Promise.all([
    listCourses(),
    db.select().from(sections).orderBy(asc(sections.name)),
  ])
  const courseRows = admin
    ? allCourseRows
    : allCourseRows.filter((course) => facultyCourseIds.includes(course.id))

  const navCourses: AdminNavCourse[] = courseRows.map((course) => ({
    id: course.id,
    slug: course.slug,
    name: course.name,
    term: course.term,
    sections: sectionRows
      .filter((section) => section.courseId === course.id)
      .map((section) => ({ id: section.id, name: section.name })),
  }))

  return (
    // The shell itself no longer scrolls: AdminNav is the pinned header panel
    // and `adminbody` below it owns the overflow, so the course and section
    // picker stay put while the page scrolls under them (see globals.css; the
    // tabs left AdminNav for the journey bar's staff group on 2026-08-09).
    // Bottom padding lives on the pages' <main>, not the shell — padding here
    // would put a dead strip under the scroll area.
    <>
      {/* The same journey bar as every learner surface, carrying the staff
          group on its right (TJ, 2026-08-09) — so a faculty member moves
          between their reading and their roster without changing shell, which
          is what "capabilities are additive" means in navigation. No station
          is active here: /admin is not a step on the student's arc. */}
      <JourneyNav active={null} />
      {/* No padding on the shell: it was what inset the course strip from
          both edges and dropped it below the journey bar (TJ, 2026-08-21:
          "why the gap?"). The strip is a full-bleed bar like the journey
          bar above it — the global nav rule already dresses it so — and
          the content's inset lives on the scrolling body instead. */}
      <div className="adminshell">
        <AdminNav courses={navCourses} />
        <div className="adminbody" style={{ padding: "20px 20px 0" }}>{children}</div>
      </div>
      {/* The workbench footer's identity half (TJ, 2026-08-21: the courses
          page "doesn't tell me who I am"), on every admin page for the same
          reason it is on the workbench: who is signed in, and the way out.
          The <footer> rule is a fixed full-width strip with pointer-events
          off — only .footid inside Identity takes clicks back — and the
          pages' own <main> already ends in the base rule's 86px bottom
          padding, which is what scrolled content clears it by (globals.css,
          the `footer` and `main` rules). No right half: the workbench's
          names the open reading, and no admin page has one. */}
      <footer>
        <Identity />
      </footer>
    </>
  )
}
