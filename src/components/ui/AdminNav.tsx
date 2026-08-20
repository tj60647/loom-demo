"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type AdminNavCourse = {
  id: string
  slug: string
  name: string
  term: string
  sections: { id: string; name: string }[]
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

  // A URL is a claim about what the page shows. When ?course= resolves to
  // nothing — a course deleted after the link was minted, or a typo — the
  // fallback above quietly shows the first course while the address keeps the
  // dead name; this effect corrects the URL to what is actually shown.
  // Replace, not push, so Back does not walk through the false address. A
  // param that resolves (the id, or a real course's slug) is a true claim
  // and is left alone — which is more common than it looks: ids outlive
  // renames, so ?course=course-foundations-studio names the course now
  // called Design Frameworks Test 0729, whose row kept its July 6 birth id
  // through every rename since (the question that prompted this effect —
  // TJ, 2026-08-20 — turned out to be exactly that, a true URL wearing an
  // old name; the healing below is for the genuinely dead ones).
  const courseParamResolves =
    courseParam === null ||
    (activeCourse !== null && (activeCourse.id === courseParam || activeCourse.slug === courseParam))
  const sectionParamResolves = sectionParam === null || activeSection !== null
  useEffect(() => {
    if (courseParamResolves && sectionParamResolves) return
    const next = new URLSearchParams(searchParams.toString())
    if (!courseParamResolves) {
      if (activeCourseId) next.set("course", activeCourseId)
      else next.delete("course")
    }
    if (!sectionParamResolves) next.delete("section")
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [courseParamResolves, sectionParamResolves, activeCourseId, pathname, router, searchParams])

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
    // Which course, and which section — and nothing else. The tabs that used to
    // lead this row (My Loom · Roster · Cohort Graph · Readings · Courses) moved
    // to the journey bar's staff group on 2026-08-09 (TJ), so a faculty member
    // holds one navigation rather than swapping between two. What is left is
    // not a menu: it is the scope every page below reads, and it belongs beside
    // them rather than in a bar about where you can go.
    <nav style={{ marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
      {/* Left, not right: with the tabs gone this row holds only the scope, and
          a lone pair of pickers pushed to the far edge of an empty bar read as
          leftovers. They line up with the page heading underneath instead. */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {courses.length === 0 ? (
          <span className="hint" style={{ fontSize: "13px" }}>No courses yet</span>
        ) : (
          <>
            <span className="label">Course</span>
            <select
              className="tinput inline"
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
                  className="tinput inline"
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
