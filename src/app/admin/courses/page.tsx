import {
  createCourse,
  createSection,
  deleteCourse,
  deleteSection,
  setCourseArchived,
  updateCourse,
  updateSection,
} from "@/actions/courses"
import {
  getReadingsByCourse,
  removeSourceFromCourse,
  setCourseSourceVisibility,
  updateCourseSourceSchedule,
} from "@/actions/sources"
import { checkAdmin } from "@/actions/admin"
import { db } from "@/db"
import { courseMemberships, sections } from "@/db/schema"
import { asc, isNull } from "drizzle-orm"
import { listCourses, firstParam } from "@/lib/courses"

type CoursesPageSearchParams = {
  course?: string | string[]
}

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<CoursesPageSearchParams>
}) {
  await checkAdmin()

  const resolved = await searchParams
  const focusedCourseId = firstParam(resolved.course) ?? null

  const [allCourses, allSections, allMemberships, readingsByCourse] = await Promise.all([
    listCourses({ includeArchived: true }),
    db.select().from(sections).orderBy(asc(sections.name)),
    db
      .select({ courseId: courseMemberships.courseId, sectionId: courseMemberships.sectionId })
      .from(courseMemberships)
      .where(isNull(courseMemberships.removedAt)),
    getReadingsByCourse(),
  ])

  return (
    // `workwide`: the console takes the work-surface measure (globals.css,
    // next to .station-work) instead of the 1100px reading measure.
    <main className="workwide">
      <h1>Courses</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>
        Create courses and their sections. Readings live in one shared set and are
        included per course, so the same PDF is never uploaded twice.
      </p>

      {/* Folded by default, same idiom as the library's Add Readings and the
          roster's Invite learners: creating a course is occasional, checking
          on the existing ones is the daily visit. */}
      <details className="card invitefold" style={{ marginBottom: "28px" }}>
        <summary>
          <span className="tw">▸</span>
          <h2>New Course</h2>
        </summary>
        <p className="hint" style={{ marginTop: "10px" }}>
          The slug is derived from the name and used in links; it is made unique automatically.
        </p>
        <form action={createCourse} style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
          <div className="form-row">
            <span className="label">Name</span>
            <input name="name" placeholder="Design Frameworks" required />
          </div>
          <div className="form-row">
            <span className="label">Term (Optional)</span>
            <input name="term" placeholder="Fall 2026" />
          </div>
          <div className="form-row">
            <span className="label">Description (Optional)</span>
            <textarea name="description" placeholder="DES INV 200" />
          </div>
          <button
            className="btn mini"
            type="submit"
            style={{ justifySelf: "start" }}
            data-tip="Create the course — add sections and readings afterwards"
          >
            Create Course
          </button>
        </form>
      </details>

      {allCourses.length === 0 ? (
        <div className="card empty">
          <span className="cap">No courses yet — create one above</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {allCourses.map((course) => {
            const courseSectionRows = allSections.filter((s) => s.courseId === course.id)
            const memberships = allMemberships.filter((m) => m.courseId === course.id)
            const readings = readingsByCourse.get(course.id) ?? []
            const readingCount = readings.length
            const unassigned = memberships.filter((m) => !m.sectionId).length
            const isFocused = focusedCourseId === course.id

            return (
              <section
                className="card"
                key={course.id}
                style={course.isArchived ? { opacity: 0.6 } : undefined}
              >
                <div className="heading-with-info">
                  <h2 style={{ fontSize: "19px" }}>{course.name}</h2>
                  {course.term ? <span className="pill beaten">{course.term}</span> : null}
                  {course.isArchived ? <span className="pill loose">Archived</span> : null}
                  {isFocused ? <span className="pickedtag">Active</span> : null}
                </div>
                <p className="hint" style={{ marginTop: "4px" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>{course.slug}</span>
                  {" · "}
                  {memberships.length} learner(s)
                  {" · "}
                  {courseSectionRows.length} section(s)
                  {" · "}
                  {readingCount} reading(s)
                  {unassigned > 0 ? ` · ${unassigned} unassigned` : ""}
                </p>
                {course.description ? (
                  <p style={{ fontSize: "14px", marginTop: "8px" }}>{course.description}</p>
                ) : null}

                {/* One row of equal buttons; disclosures open below the row
                    in a .foldout so the buttons never move (see .actrow). */}
                <div className="actrow" style={{ marginTop: "14px" }}>
                  <details>
                    {/* "Metadata", not "Course" (TJ, 2026-08-21): this form
                        edits the name, slug, term and description only — the
                        course's readings and sections have their own panels,
                        and a button called Edit Course promised all three. */}
                    <summary
                      className="btn ghost mini"
                      data-tip="Edit the name, slug, term, and description"
                    >
                      Edit Metadata
                    </summary>
                    <form
                      className="foldout"
                      action={updateCourse}
                      style={{ display: "grid", gap: "10px", maxWidth: "640px" }}
                    >
                      <input type="hidden" name="courseId" value={course.id} />
                      <div className="form-row">
                        <span className="label">Name</span>
                        <input name="name" defaultValue={course.name} required />
                      </div>
                      <div className="form-row">
                        <span className="label">Slug</span>
                        <input name="slug" defaultValue={course.slug} className="mono-in" />
                      </div>
                      <div className="form-row">
                        <span className="label">Term</span>
                        <input name="term" defaultValue={course.term} />
                      </div>
                      <div className="form-row">
                        <span className="label">Description</span>
                        <textarea name="description" defaultValue={course.description} />
                      </div>
                      <button
                        className="btn mini"
                        type="submit"
                        style={{ justifySelf: "start" }}
                        data-tip="Save the course details"
                      >
                        Save Metadata
                      </button>
                    </form>
                  </details>

                  <form action={setCourseArchived}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="isArchived" value={course.isArchived ? "false" : "true"} />
                    <button
                      className="btn ghost mini"
                      type="submit"
                      data-tip={
                        course.isArchived
                          ? "Return this course to the course pickers"
                          : "Retire this course from the course pickers — nothing is deleted"
                      }
                    >
                      {course.isArchived ? "Unarchive" : "Archive"}
                    </button>
                  </form>

                  <details>
                    <summary
                      className="btn ghost mini pillbtn"
                      data-tip="Delete the course, its sections, and enrolments — readings and student work survive"
                    >
                      Delete
                    </summary>
                    <form
                      className="foldout"
                      action={deleteCourse}
                      style={{ display: "grid", gap: "8px", maxWidth: "420px" }}
                    >
                      <input type="hidden" name="courseId" value={course.id} />
                      <p className="hint" style={{ margin: 0, maxWidth: "46ch" }}>
                        Removes the course, its sections, memberships, allowlist, and reading
                        assignments. The readings themselves stay on the Readings tab and student
                        work is kept (its course link is cleared). Type <b>delete</b> to confirm.
                      </p>
                      <input name="confirm" placeholder="delete" className="mono-in" required />
                      {/* No data-tip: the bubble would sit exactly over the
                          warning this button must be read with. */}
                      <button className="btn mini danger" type="submit" style={{ justifySelf: "start" }}>
                        Delete Course
                      </button>
                    </form>
                  </details>
                </div>

                <div style={{ marginTop: "18px", borderTop: "1px dotted var(--rule)", paddingTop: "14px" }}>
                  <div className="heading-with-info">
                    <span className="label">Readings</span>
                    <span className="hint" style={{ fontSize: "13px" }}>
                      {readingCount} in this course
                    </span>
                  </div>

                  {readings.length === 0 ? (
                    <p className="hint" style={{ marginTop: "8px" }}>
                      No readings yet — add them from the{" "}
                      <a href={`/admin/library?course=${course.id}`}>Readings tab</a>.
                    </p>
                  ) : (
                    <div className="scrollbox" style={{ marginTop: "10px" }}>
                      {readings.map((reading) => (
                        <div key={reading.id} className="lrow" style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "15px", flex: "1 1 220px", minWidth: 0 }}>
                              {reading.title}
                            </span>
                            {reading.author ? (
                              <span className="hint" style={{ fontSize: "13px" }}>{reading.author}</span>
                            ) : null}
                            <span className={`pill ${reading.link.week != null ? "beaten" : "loose"}`}>
                              {reading.link.week != null ? `Week ${reading.link.week}` : "Unscheduled"}
                            </span>
                            <span className={`pill ${reading.link.isCore ? "beaten" : "loose"}`}>
                              {reading.link.isCore ? "Core" : "Supplemental"}
                            </span>
                            <span className={`pill ${reading.link.isVisible ? "beaten" : "loose"}`}>
                              {reading.link.isVisible ? "Visible" : "Hidden"}
                            </span>
                          </div>

                          {/* The same one-row-of-equal-buttons set as a library
                              card's: whatever a button discloses opens in a
                              .foldout below the row, so no button ever moves.
                              Pills above are what the reading *is*; buttons
                              here are what you can *do* — never the same shape,
                              except Remove, which wears the red pill every
                              destructive act in the admin wears. */}
                          <div className="actrow" style={{ marginTop: "8px" }}>
                            <details>
                              <summary
                                className="btn ghost mini"
                                data-tip="Set the week, order within the week, and core status"
                              >
                                Schedule
                              </summary>
                              <form
                                className="foldout"
                                action={updateCourseSourceSchedule}
                                style={{ display: "grid", gap: "8px", maxWidth: "420px" }}
                              >
                                <input type="hidden" name="courseId" value={course.id} />
                                <input type="hidden" name="sourceId" value={reading.id} />
                                <div className="form-row">
                                  <span className="label">Week</span>
                                  <input
                                    name="week"
                                    type="number"
                                    min="1"
                                    max="20"
                                    defaultValue={reading.link.week ?? ""}
                                    placeholder="Unscheduled"
                                  />
                                </div>
                                <div className="form-row">
                                  <span className="label">Order Within Week</span>
                                  <input
                                    name="position"
                                    type="number"
                                    min="0"
                                    defaultValue={reading.link.position}
                                  />
                                </div>
                                {/* Core and supplemental are one choice with two
                                    names, not a box to tick: a radio pair says
                                    the unchosen name out loud, so nobody has to
                                    infer what an empty checkbox made this. */}
                                <div className="form-row">
                                  <span className="label">Weight</span>
                                  <div className="radiorow">
                                    <label className="radiopick">
                                      <input
                                        type="radio"
                                        name="isCore"
                                        value="true"
                                        defaultChecked={reading.link.isCore}
                                      />
                                      Core
                                    </label>
                                    <label className="radiopick">
                                      <input
                                        type="radio"
                                        name="isCore"
                                        value="false"
                                        defaultChecked={!reading.link.isCore}
                                      />
                                      Supplemental
                                    </label>
                                  </div>
                                  <p className="hint" style={{ margin: "4px 0 0", fontSize: "13px" }}>
                                    Students graph the core readings; supplemental ones sit alongside.
                                  </p>
                                </div>
                                <button
                                  className="btn mini"
                                  type="submit"
                                  style={{ justifySelf: "start" }}
                                  data-tip="Save the schedule for this course only"
                                >
                                  Save schedule
                                </button>
                              </form>
                            </details>

                            <form action={setCourseSourceVisibility}>
                              <input type="hidden" name="courseId" value={course.id} />
                              <input type="hidden" name="sourceId" value={reading.id} />
                              <input
                                type="hidden"
                                name="isVisible"
                                value={reading.link.isVisible ? "false" : "true"}
                              />
                              <button
                                className="btn ghost mini"
                                type="submit"
                                data-tip={
                                  reading.link.isVisible
                                    ? "Hide this reading from students in this course"
                                    : "Reveal this reading to students in this course"
                                }
                              >
                                {reading.link.isVisible ? "Hide" : "Reveal"}
                              </button>
                            </form>

                            <form action={removeSourceFromCourse}>
                              <input type="hidden" name="courseId" value={course.id} />
                              <input type="hidden" name="sourceId" value={reading.id} />
                              <button
                                className="btn ghost mini pillbtn"
                                type="submit"
                                data-tip="Remove from this course's list — the reading stays in the library"
                              >
                                Remove from Course
                              </button>
                            </form>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "18px", borderTop: "1px dotted var(--rule)", paddingTop: "14px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                    <span className="label">Sections</span>
                    <a
                      className="act"
                      style={{ marginLeft: "auto" }}
                      href={`/admin?course=${encodeURIComponent(course.id)}`}
                      data-tip="Invite and enrol learners on the Roster tab"
                    >
                      {memberships.length} enrolled · invite →
                    </a>
                  </div>
                  {courseSectionRows.length === 0 ? (
                    <p className="hint" style={{ marginTop: "8px" }}>No sections yet.</p>
                  ) : (
                    <div className="scrollbox" style={{ marginTop: "10px" }}>
                      {courseSectionRows.map((section) => {
                        const count = memberships.filter((m) => m.sectionId === section.id).length
                        return (
                          <div key={section.id} className="lrow" style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "15px", flex: 1 }}>{section.name}</span>
                              {section.lead ? <span className="hint" style={{ fontSize: "13px" }}>{section.lead}</span> : null}
                              <span className="pill beaten">{count} learner{count !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="actrow" style={{ marginTop: "8px" }}>
                              {/* Sections are built here; people are invited on
                                  the Roster page. Without this link that is two
                                  pages with nothing joining them. */}
                              <a
                                className="act"
                                href={`/admin?course=${encodeURIComponent(course.id)}&section=${encodeURIComponent(section.id)}`}
                                data-tip="Open this section's roster"
                              >
                                roster →
                              </a>
                              <details>
                                <summary className="act" data-tip="Edit the section name and lead">
                                  edit
                                </summary>
                                <form
                                  className="foldout"
                                  action={updateSection}
                                  style={{ display: "grid", gap: "8px", maxWidth: "420px" }}
                                >
                                  <input type="hidden" name="courseId" value={course.id} />
                                  <input type="hidden" name="sectionId" value={section.id} />
                                  <div className="form-row">
                                    <span className="label">Name</span>
                                    <input name="name" defaultValue={section.name} required />
                                  </div>
                                  <div className="form-row">
                                    <span className="label">Lead</span>
                                    <input name="lead" defaultValue={section.lead} placeholder="Instructor of record" />
                                  </div>
                                  <button
                                    className="btn mini"
                                    type="submit"
                                    style={{ justifySelf: "start" }}
                                    data-tip="Save the section name and lead"
                                  >
                                    Save Section
                                  </button>
                                </form>
                              </details>
                              <form action={deleteSection}>
                                <input type="hidden" name="courseId" value={course.id} />
                                <input type="hidden" name="sectionId" value={section.id} />
                                <button
                                  className="rm"
                                  type="submit"
                                  data-tip="Delete this section — its learners stay enrolled, unassigned"
                                >
                                  remove
                                </button>
                              </form>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <form action={createSection} className="quietrow" style={{ marginTop: "12px" }}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input name="name" placeholder="Section name, e.g. Section 1 — Hugh" required />
                    <input name="lead" placeholder="Lead (optional)" />
                    <button className="btn mini" type="submit" data-tip="Create this section in the course">
                      Add Section
                    </button>
                  </form>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
