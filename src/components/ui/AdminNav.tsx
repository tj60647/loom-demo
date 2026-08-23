"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type AdminNavCourse = {
  id: string
  slug: string
  name: string
  term: string
  isArchived: boolean
  sections: { id: string; name: string }[]
  /** The course's readings, syllabus order — the READING picker's options.
   *  `week` is null for an unscheduled one, which sorts last. */
  readings: { id: string; title: string; week: number | null }[]
  /** Its learners, name order, each with the section they sit in. */
  students: { id: string; name: string; sectionId: string | null }[]
}

/**
 * WHICH SCOPES A PAGE ACTUALLY READS.
 *
 * The strip is one control set shared by every Teaching surface, and a picker
 * that scopes nothing on the page under it is exactly the incongruity this
 * strip was fixed for once already (TJ, 2026-08-21, the Courses catalog). So
 * each page declares what it reads, and the strip draws only that.
 */
const SCOPES: Record<
  string,
  {
    section: boolean
    reading: boolean
    student: boolean
    oneReading?: boolean
    /** Does the page redraw for `?graph=individual`? Only the one that reads it. */
    emphasis?: boolean
  }
> = {
  // The catalog's panels always show every section, and a course is the whole
  // subject of the page.
  "/admin/courses": { section: false, reading: false, student: false },
  // The cohort map narrows by all four (TJ, 2026-08-22), and is the only page
  // that reads ?graph — see `emphasis` below.
  "/admin/aggregate": { section: true, reading: true, student: true, emphasis: true },
  /**
   * Heatmaps takes the same four, and its reading picker has no "All
   * readings": heat is laid on the PAGES of one text, and there is no page to
   * draw for all of them.
   *
   * IT TAKES NO EMPHASIS TOGGLE. src/app/admin/heatmaps/page.tsx reads course,
   * section, source and student and never `graph`, so the control did nothing
   * there but cost the strip 5px of height the moment a name was chosen —
   * which pushed the whole reading surface down (TJ, 2026-08-22: "the 'course'
   * toolbar changes size when i select a student, why?"). Choosing a student
   * here already switches the overlay to that person's band; there is no
   * second rendering of them to toggle between.
   *
   * The student picker itself is a deliberate change to ruling 28, which had
   * put overlays at Section · Cohort and forbidden anything resolving to one
   * person. TJ added it on 2026-08-22 and docs/loom-model-build.md §Overlays
   * records the change. (An older comment here still said the student was
   * "absent by RULING" long after the picker shipped — it is removed rather
   * than corrected, because it described a strip that no longer exists.)
   */
  "/admin/heatmaps": { section: true, reading: true, student: true, oneReading: true },
}
const DEFAULT_SCOPE = { section: true, reading: false, student: false }

// Layouts don't receive searchParams, so the nav resolves the active course and
// section from the URL itself. This mirrors resolveCourseId/resolveSectionId on
// the server: an unknown course falls back to the first, an unknown section
// falls back to "all sections".
export default function AdminNav({ courses }: { courses: AdminNavCourse[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Archived courses resolve on /admin/courses ONLY — the catalog there lists
  // them and its detail is how they are reached at all (its own comment says
  // why). Every other admin page resolves live courses, exactly as before:
  // the roster's server side (getStaffViewer → resolveCourseId) falls back to
  // a live course for an archived id, and if the nav accepted the id here the
  // select would name a course the page is not showing. Excluding it instead
  // lets the healing effect below correct the URL to what is on screen.
  const onCatalog = pathname === "/admin/courses"
  const scope = SCOPES[pathname] ?? DEFAULT_SCOPE
  const candidates = onCatalog ? courses : courses.filter((course) => !course.isArchived)
  const liveCourses = courses.filter((course) => !course.isArchived)

  const courseParam = searchParams.get("course")
  const activeCourse =
    candidates.find((course) => course.id === courseParam || course.slug === courseParam) ??
    // First LIVE course, not candidates[0]: on the catalog page the oldest
    // course may be archived, and the page's own bare-URL fallback (see
    // admin/courses/page.tsx) prefers the first live one too.
    liveCourses[0] ??
    candidates[0] ??
    null

  const sectionParam = searchParams.get("section")
  const activeSection =
    activeCourse?.sections.find((section) => section.id === sectionParam) ?? null

  const activeCourseId = activeCourse?.id ?? null
  const activeSectionId = activeSection?.id ?? null

  const sourceParam = searchParams.get("source")
  const activeSource = activeCourse?.readings.find((r) => r.id === sourceParam) ?? null
  const studentParam = searchParams.get("student")
  // The student list follows the SECTION picker: narrowing to a section and
  // then being offered someone from another one would be a control arguing
  // with the control beside it.
  const studentsHere = (activeCourse?.students ?? []).filter(
    (st) => !activeSectionId || st.sectionId === activeSectionId
  )
  const activeStudent = studentsHere.find((st) => st.id === studentParam) ?? null

  /**
   * WHAT THE STUDENT PICKER MEANS (TJ, 2026-08-22: "let there be a small
   * toggle for 'individual/cohort graph' and student becomes emphasis in
   * cohort mode").
   *
   * Two different questions, and they want opposite treatments of the same
   * map. COHORT asks "where does this student sit in the whole?" — the map
   * keeps its full shape and their work lights against everyone else's.
   * INDIVIDUAL asks "what has this student woven?" — the map is redrawn from
   * their rows alone, so the warp is theirs and nothing else is on it.
   *
   * Cohort is the resting state: this is the Cohort Graph, and a filter that
   * silently shrank the whole map the moment a name was chosen was the
   * behaviour this toggle exists to make deliberate.
   */
  const individual = searchParams.get("graph") === "individual"

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
  const sourceParamResolves = sourceParam === null || activeSource !== null
  const studentParamResolves = studentParam === null || activeStudent !== null
  useEffect(() => {
    if (courseParamResolves && sectionParamResolves && sourceParamResolves && studentParamResolves) {
      return
    }
    const next = new URLSearchParams(searchParams.toString())
    if (!courseParamResolves) {
      if (activeCourseId) next.set("course", activeCourseId)
      else next.delete("course")
    }
    if (!sectionParamResolves) next.delete("section")
    if (!sourceParamResolves) next.delete("source")
    if (!studentParamResolves) next.delete("student")
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [
    courseParamResolves,
    sectionParamResolves,
    sourceParamResolves,
    studentParamResolves,
    activeCourseId,
    pathname,
    router,
    searchParams,
  ])

  const push = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const query = next.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  /**
   * Changing course clears everything under it: section ids are scoped to a
   * course, a reading belongs to one course's list, and a student is enrolled
   * in one. Carrying any of them across would silently resolve to nothing.
   * Changing SECTION clears only the student, for the same reason the student
   * list is filtered by section above.
   */
  const navigate = (courseId: string | null, sectionId: string | null) =>
    push({ course: courseId, section: sectionId, source: null, student: null, graph: null })

  return (
    // Which course, and which section — and nothing else. The tabs that used to
    // lead this row (My Loom · Roster · Cohort Graph · Readings · Courses) moved
    // to the journey bar's staff group on 2026-08-09 (TJ), so a faculty member
    // holds one navigation rather than swapping between two. What is left is
    // not a menu: it is the scope every page below reads, and it belongs beside
    // them rather than in a bar about where you can go.
    // No marginBottom: the strip runs flush under the journey bar now, and
    // the gap to the content below is .adminbody's own padding (2026-08-21).
    // minHeight: the strip must not change size when a control appears in it.
    // A `btn mini` is taller than a `tinput inline`, so the emphasis toggle
    // arriving on the Cohort Graph took the row from 33px to 38px and pushed
    // everything below it down by 5 — measured on the running app at 1920 the
    // day it was reported (TJ, 2026-08-22: "the 'course' toolbar changes size
    // when i select a student, why?"). 38 is that taller state, so the row is
    // already the size it will need and nothing reflows. It is a floor, not a
    // height: the strip still grows when it wraps at narrow widths.
    <nav style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", minHeight: "38px" }}>
      {/* Left, not right: with the tabs gone this row holds only the scope, and
          a lone pair of pickers pushed to the far edge of an empty bar read as
          leftovers. They line up with the page heading underneath instead. */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {candidates.length === 0 ? (
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
              {/* Live courses always; an archived one only while it is the
                  active selection (reached from the catalog's rows), so the
                  select can display it without offering the archive as a
                  destination. */}
              {liveCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.term ? `${course.name} · ${course.term}` : course.name}
                </option>
              ))}
              {activeCourse?.isArchived && (
                <option key={activeCourse.id} value={activeCourse.id}>
                  {activeCourse.term
                    ? `${activeCourse.name} · ${activeCourse.term} · archived`
                    : `${activeCourse.name} · archived`}
                </option>
              )}
            </select>

            {/* No section picker on the catalog: /admin/courses reads the
                course scope only — its panels always show every section —
                and a control that scopes nothing on the page below it is
                exactly the incongruity this strip is for (TJ, 2026-08-21). */}
            {scope.section && activeCourse && activeCourse.sections.length > 0 && (
              <>
                <span className="label">Section</span>
                <select
                  className="tinput inline"
                  value={activeSectionId ?? ""}
                  aria-label="Select active section"
                  style={{ minWidth: "160px" }}
                  onChange={(event) =>
                    push({ section: event.target.value || null, student: null, graph: null })
                  }
                >
                  <option value="">All sections</option>
                  {activeCourse.sections.map((section) => (
                    <option key={section.id} value={section.id}>{section.name}</option>
                  ))}
                </select>
              </>
            )}

            {/* READING, to the right of Section (TJ, 2026-08-22), with an
                "All readings" the way the section picker has "All sections":
                the whole course is the resting state and one reading is the
                narrowing, never the other way round. */}
            {scope.reading && activeCourse && activeCourse.readings.length > 0 && (
              <>
                <span className="label">Reading</span>
                <select
                  className="tinput inline"
                  value={activeSource?.id ?? ""}
                  aria-label="Select active reading"
                  style={{ minWidth: "180px", maxWidth: "280px" }}
                  onChange={(event) => push({ source: event.target.value || null })}
                >
                  {!scope.oneReading && <option value="">All readings</option>}
                  {activeCourse.readings.map((reading) => (
                    <option key={reading.id} value={reading.id}>
                      {reading.week != null ? `W${reading.week} · ` : ""}
                      {reading.title}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* STUDENT, defaulting to all of them (TJ, 2026-08-22). The list
                follows the section picker, so the two cannot disagree about
                whose work is in view. */}
            {scope.student && activeCourse && studentsHere.length > 0 && (
              <>
                <span className="label">Student</span>
                <select
                  className="tinput inline"
                  value={activeStudent?.id ?? ""}
                  aria-label="Select active student"
                  style={{ minWidth: "160px" }}
                  onChange={(event) =>
                    push({
                      student: event.target.value || null,
                      graph: event.target.value ? searchParams.get("graph") : null,
                    })
                  }
                >
                  <option value="">All students</option>
                  {studentsHere.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
                {/* Only on a page that redraws for it, and only once a name is
                    chosen: with "All students" the two modes draw the same
                    map, and a control whose two states look identical teaches
                    nothing. */}
                {scope.emphasis && activeStudent && (
                  <span className="segmented navseg" role="group" aria-label="How the student is shown">
                    <button
                      type="button"
                      className={`btn mini ${individual ? "ghost" : ""}`}
                      aria-pressed={!individual}
                      data-tip="their work lit against the whole cohort's"
                      onClick={() => push({ graph: null })}
                    >Cohort</button>
                    <button
                      type="button"
                      className={`btn mini ${individual ? "" : "ghost"}`}
                      aria-pressed={individual}
                      data-tip="the map redrawn from their work alone"
                      onClick={() => push({ graph: "individual" })}
                    >Individual</button>
                  </span>
                )}
              </>
            )}
          </>
        )}
      </div>
    </nav>
  )
}
