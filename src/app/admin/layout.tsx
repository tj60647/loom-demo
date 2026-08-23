import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminNav, { type AdminNavCourse } from "@/components/ui/AdminNav"
import Identity from "@/components/ui/Identity"
import JourneyNav from "@/components/ui/JourneyNav"
import { db } from "@/db"
import { courseMemberships, courseSources, sections, sources, users } from "@/db/schema"
import { and, asc, eq, isNull } from "drizzle-orm"
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
  // Archived courses ride along for an admin, marked: AdminNav lets them
  // resolve on /admin/courses (the catalog page selects them by ?course=)
  // and filters them out everywhere else. Faculty stay live-only, as
  // listFacultyCourseIds already scopes them.
  // Readings and students ride along for the same reason sections do: the
  // strip's pickers are the scope every page below reads, and a layout cannot
  // see searchParams to know which course is active. One query each, for
  // every course at once, indexed by course on the client.
  const [allCourseRows, sectionRows, readingRows, memberRows] = await Promise.all([
    listCourses({ includeArchived: true }),
    db.select().from(sections).orderBy(asc(sections.name)),
    // Queried here rather than through getReadingsByCourse(): that action is
    // requireAdmin-gated, and THIS LAYOUT ALSO SERVES FACULTY — calling it
    // threw "Unauthorized" and took the whole Teaching shell down for them.
    // The rows are scoped by the courses this viewer already resolved below,
    // so the gate it would have applied is the gate that is already here.
    db
      .select({
        courseId: courseSources.courseId,
        sourceId: courseSources.sourceId,
        week: courseSources.week,
        position: courseSources.position,
        title: sources.title,
      })
      .from(courseSources)
      .innerJoin(sources, eq(sources.id, courseSources.sourceId)),
    db
      .select({
        courseId: courseMemberships.courseId,
        sectionId: courseMemberships.sectionId,
        userId: users.id,
        name: users.name,
        email: users.email,
      })
      .from(courseMemberships)
      .innerJoin(users, eq(users.id, courseMemberships.userId))
      .where(and(isNull(courseMemberships.removedAt), eq(courseMemberships.role, "LEARNER")))
      .orderBy(asc(users.name), asc(users.email)),
  ])
  const courseRows = admin
    ? allCourseRows
    : allCourseRows.filter(
        (course) => !course.isArchived && facultyCourseIds.includes(course.id)
      )

  const navCourses: AdminNavCourse[] = courseRows.map((course) => ({
    id: course.id,
    slug: course.slug,
    name: course.name,
    term: course.term,
    isArchived: course.isArchived,
    sections: sectionRows
      .filter((section) => section.courseId === course.id)
      .map((section) => ({ id: section.id, name: section.name })),
    // Syllabus order — week, then order within the week, then title, with
    // the unscheduled last. A reading names its WEEK in the picker (TJ,
    // 2026-08-22: "let readings have a week number in them"), because that is
    // how a syllabus is spoken about and 31 titles sorted alphabetically is
    // not a syllabus.
    readings: readingRows
      .filter((r) => r.courseId === course.id)
      .sort(
        (a, b) =>
          (a.week ?? Number.MAX_SAFE_INTEGER) - (b.week ?? Number.MAX_SAFE_INTEGER) ||
          a.position - b.position ||
          a.title.localeCompare(b.title)
      )
      .map((r) => ({ id: r.sourceId, title: r.title, week: r.week })),
    // LEARNERS only: the picker narrows a cohort view to one student's work,
    // and faculty have none of their own to look at here.
    students: memberRows
      .filter((m) => m.courseId === course.id)
      .map((m) => ({ id: m.userId, name: m.name || m.email, sectionId: m.sectionId })),
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
        {/* The inset lives in globals.css now, not here, so a page that must
            reach the window's own edges can opt out of it — the Cohort Graph
            is a map and cannot be inset (`.adminbody:has(> main.canvasfull)`).
            An inline style could not be overridden by any rule. */}
        <div className="adminbody">{children}</div>
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
