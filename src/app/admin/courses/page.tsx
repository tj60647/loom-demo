import {
  createCourse,
  createSection,
  deleteCourse,
  deleteSection,
  setCourseArchived,
  updateCourse,
  updateSection,
} from "@/actions/courses"
import { checkAdmin } from "@/actions/admin"
import { db } from "@/db"
import { courseMemberships, courseSources, sections } from "@/db/schema"
import { asc } from "drizzle-orm"
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

  const [allCourses, allSections, allMemberships, allCourseSources] = await Promise.all([
    listCourses({ includeArchived: true }),
    db.select().from(sections).orderBy(asc(sections.name)),
    db.select({ courseId: courseMemberships.courseId, sectionId: courseMemberships.sectionId }).from(courseMemberships),
    db.select({ courseId: courseSources.courseId }).from(courseSources),
  ])

  return (
    <main>
      <h1>Courses</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>
        Create courses and their sections. Readings live in one shared library and are
        included per course, so the same PDF is never uploaded twice.
      </p>

      <section className="card" style={{ marginBottom: "28px" }}>
        <h2>New Course</h2>
        <p className="hint" style={{ marginTop: "6px" }}>
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
          <button className="btn mini" type="submit" style={{ justifySelf: "start" }}>Create Course</button>
        </form>
      </section>

      {allCourses.length === 0 ? (
        <div className="card empty">
          <span className="cap">No courses yet — create one above</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {allCourses.map((course) => {
            const courseSectionRows = allSections.filter((s) => s.courseId === course.id)
            const memberships = allMemberships.filter((m) => m.courseId === course.id)
            const readingCount = allCourseSources.filter((r) => r.courseId === course.id).length
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

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                  <details>
                    <summary className="btn ghost mini" style={{ listStyle: "none", cursor: "pointer" }}>Edit</summary>
                    <form action={updateCourse} style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
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
                      <button className="btn mini" type="submit" style={{ justifySelf: "start" }}>Save Course</button>
                    </form>
                  </details>

                  <form action={setCourseArchived}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <input type="hidden" name="isArchived" value={course.isArchived ? "false" : "true"} />
                    <button className="btn ghost mini" type="submit">
                      {course.isArchived ? "Unarchive" : "Archive"}
                    </button>
                  </form>

                  <details>
                    <summary className="btn ghost mini" style={{ listStyle: "none", cursor: "pointer" }}>Delete</summary>
                    <form action={deleteCourse} style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                      <input type="hidden" name="courseId" value={course.id} />
                      <p className="hint" style={{ margin: 0, maxWidth: "46ch" }}>
                        Removes the course, its sections, memberships, allowlist, and reading
                        assignments. Readings stay in the shared library and student work is
                        kept (its course link is cleared). Type <b>delete</b> to confirm.
                      </p>
                      <input name="confirm" placeholder="delete" className="mono-in" required />
                      <button className="btn mini" type="submit" style={{ justifySelf: "start" }}>Delete Course</button>
                    </form>
                  </details>
                </div>

                <div style={{ marginTop: "18px", borderTop: "1px dotted var(--rule)", paddingTop: "14px" }}>
                  <span className="label">Sections</span>
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
                              <span className="pill beaten">{count} learner(s)</span>
                            </div>
                            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                              <details>
                                <summary className="act" style={{ listStyle: "none", cursor: "pointer" }}>edit</summary>
                                <form action={updateSection} style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
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
                                  <button className="btn mini" type="submit" style={{ justifySelf: "start" }}>Save Section</button>
                                </form>
                              </details>
                              <form action={deleteSection}>
                                <input type="hidden" name="courseId" value={course.id} />
                                <input type="hidden" name="sectionId" value={section.id} />
                                <button className="rm" type="submit">remove</button>
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
                    <button className="btn mini" type="submit">Add Section</button>
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
