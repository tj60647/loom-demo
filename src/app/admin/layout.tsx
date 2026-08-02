import { getServerSession } from "next-auth/next"
import { authOptions, isAdminUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminNav, { type AdminNavCourse } from "@/components/ui/AdminNav"
import { db } from "@/db"
import { sections } from "@/db/schema"
import { asc } from "drizzle-orm"
import { listCourses } from "@/lib/courses"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/")
  }

  if (!isAdminUser(session.user)) {
    redirect("/")
  }

  // The nav needs every course's sections up front because layouts can't read
  // searchParams — it resolves the active course/section on the client.
  const [courseRows, sectionRows] = await Promise.all([
    listCourses(),
    db.select().from(sections).orderBy(asc(sections.name)),
  ])

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
    // `adminshell` is what scrolls here: admin pages put their nav and their
    // <main> inside this wrapper, so the wrapper is the flex child that has to
    // own the overflow (see globals.css).
    <div className="adminshell" style={{ padding: "20px" }}>
      <AdminNav courses={navCourses} />
      {children}
    </div>
  )
}
