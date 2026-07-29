"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type AdminNavCourse = {
  id: string
  slug: string
  name: string
  term: string
  sections: { id: string; name: string }[]
}

function withParams(basePath: string, courseId: string | null, sectionId: string | null) {
  const params = new URLSearchParams()
  if (courseId) params.set("course", courseId)
  if (sectionId) params.set("section", sectionId)
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

// Layouts don't receive searchParams, so the nav resolves the active course and
// section from the URL itself. This mirrors resolveCourseId/resolveSectionId on
// the server: an unknown course falls back to the first, an unknown section
// falls back to "all sections".
export default function AdminNav({ courses }: { courses: AdminNavCourse[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const courseParam = searchParams.get("course")
  const activeCourse =
    courses.find((course) => course.id === courseParam || course.slug === courseParam) ??
    courses[0] ??
    null

  const sectionParam = searchParams.get("section")
  const activeSection =
    activeCourse?.sections.find((section) => section.id === sectionParam) ?? null

  const activeCourseId = activeCourse?.id ?? null
  const activeSectionId = activeSection?.id ?? null

  const navigate = (courseId: string | null, sectionId: string | null) => {
    const next = new URLSearchParams(searchParams.toString())
    if (courseId) next.set("course", courseId)
    else next.delete("course")
    if (sectionId) next.set("section", sectionId)
    else next.delete("section")
    const query = next.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <nav style={{ marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
      <Link href={withParams("/", activeCourseId, null)} className="btn ghost mini">← My Loom</Link>
      <Link href={withParams("/admin", activeCourseId, activeSectionId)} className="btn mini">Learners</Link>
      <Link href={withParams("/admin/aggregate", activeCourseId, activeSectionId)} className="btn mini">Cohort Map</Link>
      <Link href={withParams("/admin/library", activeCourseId, null)} className="btn mini">Readings</Link>
      <Link href={withParams("/admin/courses", activeCourseId, null)} className="btn mini">Courses</Link>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {courses.length === 0 ? (
          <span className="hint" style={{ fontSize: "13px" }}>No courses yet</span>
        ) : (
          <>
            <span className="label">Course</span>
            <select
              className="tinput"
              value={activeCourseId ?? ""}
              aria-label="Select active course"
              style={{ minWidth: "220px" }}
              // Changing course clears the section: section ids are scoped to a
              // course, so carrying one across would silently resolve to null.
              onChange={(event) => navigate(event.target.value, null)}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.term ? `${course.name} · ${course.term}` : course.name}
                </option>
              ))}
            </select>

            {activeCourse && activeCourse.sections.length > 0 && (
              <>
                <span className="label">Section</span>
                <select
                  className="tinput"
                  value={activeSectionId ?? ""}
                  aria-label="Select active section"
                  style={{ minWidth: "160px" }}
                  onChange={(event) => navigate(activeCourseId, event.target.value || null)}
                >
                  <option value="">All sections</option>
                  {activeCourse.sections.map((section) => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
              </>
            )}
          </>
        )}
      </div>
    </nav>
  )
}
