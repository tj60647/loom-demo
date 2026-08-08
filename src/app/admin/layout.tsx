import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminNav, { type AdminNavCourse } from "@/components/ui/AdminNav"
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
    // and `adminbody` below it owns the overflow, so the tabs and the course
    // picker stay put while the page scrolls under them (see globals.css).
    // Bottom padding lives on the pages' <main>, not the shell — padding here
    // would put a dead strip under the scroll area.
    <div className="adminshell" style={{ padding: "20px 20px 0" }}>
      <AdminNav courses={navCourses} isAdmin={admin} />
      <div className="adminbody">{children}</div>
    </div>
  )
}
