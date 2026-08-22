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
  addSourceToCourse,
  getLibrarySources,
  getReadingsByCourse,
  removeSourceFromCourse,
  setCourseSourceVisibility,
  updateCourseSourceSchedule,
} from "@/actions/sources"
import { checkAdmin } from "@/actions/admin"
import { db } from "@/db"
import { courseMemberships, sections, users } from "@/db/schema"
import { asc, inArray, isNull } from "drizzle-orm"
import { listCourses, listCourseFaculty, firstParam } from "@/lib/courses"

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
  const courseParam = firstParam(resolved.course) ?? null

  const [allCourses, allSections, allMemberships, readingsByCourse, librarySources] =
    await Promise.all([
      listCourses({ includeArchived: true }),
      db.select().from(sections).orderBy(asc(sections.name)),
      db
        .select({ courseId: courseMemberships.courseId, sectionId: courseMemberships.sectionId })
        .from(courseMemberships)
        .where(isNull(courseMemberships.removedAt)),
      getReadingsByCourse(),
      // The whole unarchived library, title order — the Readings panel's add
      // dropdown offers what is not already in the selected course.
      getLibrarySources(),
    ])

  // Master–detail (TJ, 2026-08-21): the scope strip's course picker and this
  // page's content select the SAME course — before this the strip said one
  // course and the page listed them all. ?course= takes an id or a slug, the
  // same match AdminNav applies client-side; a bare or dead URL falls back to
  // the first live course, again as AdminNav does, so the select and the
  // detail below never disagree. Archived courses are reachable only by the
  // catalog rows minting their id here — the strip never offers them.
  const selected =
    allCourses.find((c) => c.id === courseParam || c.slug === courseParam) ??
    allCourses.find((c) => !c.isArchived) ??
    allCourses[0] ??
    null

  // Live courses in creation order, then the archive — a catalog is scanned
  // for the working courses first; the shelf of retired ones reads as a tail.
  const catalog = [
    ...allCourses.filter((c) => !c.isArchived),
    ...allCourses.filter((c) => c.isArchived),
  ]

  // The selected course's lead machinery (migration 0028): its FACULTY as
  // the dropdowns' options, and a name for every referenced lead — queried
  // from users directly, not from the faculty list, because a lead who was
  // since demoted or removed still has a name the row must say.
  const selectedSections = selected ? allSections.filter((s) => s.courseId === selected.id) : []
  const leadIds = [
    ...new Set(selectedSections.map((s) => s.leadUserId).filter((v): v is string => v !== null)),
  ]
  const [facultyOptions, leadRows] = await Promise.all([
    selected ? listCourseFaculty(selected.id) : Promise.resolve([]),
    leadIds.length
      ? db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, leadIds))
      : Promise.resolve([]),
  ])
  const leadName = new Map(leadRows.map((u) => [u.id, u.name || u.email]))

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
          {/* The catalog: every course on one line each, archived included —
              this is the only place an archived course can be reached, since
              the scope strip offers live ones (AdminNav filters). The row IS
              the selector: it mints ?course=, the same param the strip's
              picker writes, so the two controls cannot disagree. */}
          <div className="card catlist">
            <div className="cathead">
              <span>Course</span>
              <span>Term</span>
              <span>Learners</span>
              <span>Sections</span>
              <span>Readings</span>
              <span>State</span>
            </div>
            {catalog.map((course) => {
              const learnerCount = allMemberships.filter((m) => m.courseId === course.id).length
              const sectionCount = allSections.filter((s) => s.courseId === course.id).length
              const readingCount = (readingsByCourse.get(course.id) ?? []).length
              return (
                <a
                  key={course.id}
                  className={`catrow${selected?.id === course.id ? " on" : ""}`}
                  href={`/admin/courses?course=${encodeURIComponent(course.id)}`}
                  aria-current={selected?.id === course.id ? "true" : undefined}
                >
                  <span className="catname">{course.name}</span>
                  <span className="catterm">{course.term || "—"}</span>
                  <span className="catnum">{learnerCount}</span>
                  <span className="catnum">{sectionCount}</span>
                  <span className="catnum">{readingCount}</span>
                  <span>
                    {course.isArchived ? <span className="pill loose">Archived</span> : null}
                  </span>
                </a>
              )
            })}
          </div>

          {selected && (() => {
            const course = selected
            const courseSectionRows = allSections.filter((s) => s.courseId === course.id)
            const memberships = allMemberships.filter((m) => m.courseId === course.id)
            const readings = readingsByCourse.get(course.id) ?? []
            const readingCount = readings.length
            const unassigned = memberships.filter((m) => !m.sectionId).length
            const inCourse = new Set(readings.map((r) => r.id))
            const addable = librarySources.filter((s) => !inCourse.has(s.id))

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

                {/* The two halves of what a course IS — its readings and its
                    sections — as named, collapsible panels (TJ, 2026-08-21:
                    "sub panels could be collapsible", "read clearly as
                    panels"). Open by default: folding is for skipping past
                    one to work in the other, not a place to lose them. */}
                <details
                  className="panelfold"
                  open
                  style={{ marginTop: "18px", borderTop: "1px dotted var(--rule)", paddingTop: "14px" }}
                >
                  <summary>
                    <span className="tw">▸</span>
                    <h3 style={{ fontSize: "16px" }}>Readings</h3>
                    <span className="hint" style={{ fontSize: "13px" }}>
                      {readingCount} in this course
                    </span>
                  </summary>

                  {readings.length === 0 ? (
                    <p className="hint" style={{ marginTop: "8px" }}>
                      No readings yet — add one below.
                    </p>
                  ) : (
                    <div className="scrollbox" style={{ marginTop: "10px" }}>
                      {readings.map((reading) => (
                        <div key={reading.id} className="lrow" style={{ padding: "8px 12px" }}>
                          {/* One line per reading (TJ, 2026-08-21: "the
                              readings list cards could just be one row"): what
                              the reading IS — title, author, pills — reads
                              left; what you can DO reads right, in the same
                              .actrow container, so the Schedule foldout still
                              lands on its own full-width line below (.actrow
                              .foldout) and no control moves when it opens.
                              Pills and buttons keep their never-the-same-shape
                              rule — except Remove, which wears the red pill
                              every destructive act in the admin wears. Title
                              flexes and ellipsizes; the author is capped so a
                              long name cannot push the controls off the line. */}
                          <div className="actrow" style={{ alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: "15px",
                                flex: "1 1 220px",
                                minWidth: 0,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {reading.title}
                            </span>
                            {reading.author ? (
                              <span
                                className="hint"
                                style={{
                                  fontSize: "13px",
                                  maxWidth: "24ch",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  // .card .hint carries margin:2px 0 14px for
                                  // prose hints; as a flex item here that 14px
                                  // inflated the line from 29px to 36px
                                  // (measured on the running app at 1920).
                                  margin: 0,
                                }}
                              >
                                {reading.author}
                              </span>
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
                            <details>
                              <summary
                                className="btn ghost mini"
                                data-tip="Set the week, order within the week, and core status"
                              >
                                Schedule
                              </summary>
                              <form className="foldout foldline" action={updateCourseSourceSchedule}>
                                <input type="hidden" name="courseId" value={course.id} />
                                <input type="hidden" name="sourceId" value={reading.id} />
                                <div className="form-row">
                                  <span className="label">Week</span>
                                  <input
                                    className="numin"
                                    name="week"
                                    type="number"
                                    min="1"
                                    max="20"
                                    defaultValue={reading.link.week ?? ""}
                                    // The placeholder carried "Unscheduled"
                                    // when the box was 400px wide; in a 66px
                                    // one it renders as "Unsch…". The empty
                                    // field means unscheduled and the row's
                                    // own pill says so in words.
                                    placeholder="—"
                                  />
                                </div>
                                <div className="form-row">
                                  <span className="label">Order Within Week</span>
                                  <input
                                    className="numin"
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
                                </div>
                                <button
                                  className="btn mini"
                                  type="submit"
                                  data-tip="Save the schedule for this course only"
                                >
                                  Save schedule
                                </button>
                                {/* Last on the line, so this is what wraps when
                                    the row runs out of width — never a control.
                                    It stays visible text rather than becoming a
                                    tip: it explains what Core MEANS, and a tip
                                    is mouse-only. */}
                                <span className="hint">
                                  Students graph the core readings; supplemental ones sit alongside.
                                </span>
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

                  {/* Adding is a pick from the shared library (TJ, 2026-08-21:
                      "i should be able to add readings via dropdown") — the
                      same addSourceToCourse the library's Add to Course picker
                      posts. It lands unscheduled, core, and hidden unless its
                      text-layer score passed (sources.ts computes isVisible
                      from the score, not from a form field), so the next acts
                      are Schedule and Reveal on the new row. Uploading NEW
                      files stays on the Readings tab. */}
                  {addable.length > 0 ? (
                    <form action={addSourceToCourse} className="quietrow" style={{ marginTop: "12px" }}>
                      <input type="hidden" name="courseId" value={course.id} />
                      <select
                        name="sourceId"
                        className="tinput inline"
                        required
                        defaultValue=""
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <option value="" disabled>
                          Add a reading from the library…
                        </option>
                        {addable.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.author ? `${s.title} — ${s.author}` : s.title}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn mini"
                        type="submit"
                        data-tip="Include in this course — it arrives unscheduled, and hidden unless its text score passed"
                      >
                        Add Reading
                      </button>
                    </form>
                  ) : (
                    <p className="hint" style={{ marginTop: "12px", marginBottom: 0 }}>
                      Every library reading is already in this course — upload new ones on the
                      Readings tab.
                    </p>
                  )}
                </details>

                <details
                  className="panelfold"
                  open
                  style={{ marginTop: "18px", borderTop: "1px dotted var(--rule)", paddingTop: "14px" }}
                >
                  <summary>
                    <span className="tw">▸</span>
                    <h3 style={{ fontSize: "16px" }}>Sections</h3>
                    <span className="hint" style={{ fontSize: "13px" }}>
                      {memberships.length} enrolled
                      {unassigned > 0 ? ` · ${unassigned} unassigned` : ""}
                    </span>
                  </summary>
                  {/* The roster door — inside the body, not the summary,
                      where a click would also toggle the fold. Withheld for
                      an archived course: /admin resolves live courses only
                      (getStaffViewer → resolveCourseId, which lists
                      unarchived), so the link would silently land on the
                      first live course's roster instead. */}
                  {course.isArchived ? (
                    <p className="hint" style={{ marginTop: "8px" }}>
                      The roster only opens for live courses — unarchive to invite or place
                      learners.
                    </p>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                      <a
                        className="act"
                        href={`/admin?course=${encodeURIComponent(course.id)}`}
                        data-tip="Invite and enrol learners on the Roster tab"
                      >
                        invite →
                      </a>
                    </div>
                  )}
                  {courseSectionRows.length === 0 ? (
                    <p className="hint" style={{ marginTop: "8px" }}>No sections yet.</p>
                  ) : (
                    <div className="scrollbox" style={{ marginTop: "10px" }}>
                      {courseSectionRows.map((section) => {
                        const count = memberships.filter((m) => m.sectionId === section.id).length
                        // The reference wins; the free-text column is only a
                        // display fallback for pre-0028 rows (see schema.ts).
                        const leadDisplay = section.leadUserId
                          ? leadName.get(section.leadUserId) ?? null
                          : section.lead || null
                        const leadInFaculty =
                          section.leadUserId !== null &&
                          facultyOptions.some((f) => f.userId === section.leadUserId)
                        // The edit select's resting value: the reference when
                        // it is offerable, the keep-sentinel when there is a
                        // lead the option list cannot name (legacy text, or a
                        // demoted member) — updateSection leaves those rows
                        // untouched — and "no lead" only when there is truly
                        // none.
                        const leadDefault = leadInFaculty
                          ? section.leadUserId!
                          : section.leadUserId || section.lead
                            ? "__keep__"
                            : ""
                        return (
                          <div key={section.id} className="lrow" style={{ padding: "8px 12px" }}>
                            {/* One line per section, the reading rows' shape
                                (TJ, 2026-08-21: "section cards could be a
                                single row"): name · lead · count read left,
                                the three quiet verbs read right, and the edit
                                foldout drops to its own full-width line below
                                (.actrow .foldout). The lead hint zeroes the
                                .card .hint prose margin like the author span
                                above, for the same 7px reason. */}
                            <div className="actrow" style={{ alignItems: "center" }}>
                              <span
                                style={{
                                  fontSize: "15px",
                                  flex: "1 1 220px",
                                  minWidth: 0,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {section.name}
                              </span>
                              {leadDisplay ? (
                                <span
                                  className="hint"
                                  style={{
                                    fontSize: "13px",
                                    maxWidth: "24ch",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    margin: 0,
                                  }}
                                >
                                  {leadDisplay}
                                </span>
                              ) : null}
                              <span className="pill beaten">{count} learner{count !== 1 ? "s" : ""}</span>
                              {/* Sections are built here; people are invited on
                                  the Roster page. Without this link that is two
                                  pages with nothing joining them. Withheld when
                                  archived, like the panel's invite door and for
                                  the same resolveCourseId reason. */}
                              {!course.isArchived && (
                                <a
                                  className="act"
                                  href={`/admin?course=${encodeURIComponent(course.id)}&section=${encodeURIComponent(section.id)}`}
                                  data-tip="Open this section's roster"
                                >
                                  roster →
                                </a>
                              )}
                              <details>
                                <summary className="act" data-tip="Edit the section name and lead">
                                  edit
                                </summary>
                                <form className="foldout foldline" action={updateSection}>
                                  <input type="hidden" name="courseId" value={course.id} />
                                  <input type="hidden" name="sectionId" value={section.id} />
                                  <div className="form-row">
                                    <span className="label">Name</span>
                                    <input
                                      name="name"
                                      defaultValue={section.name}
                                      required
                                      style={{ width: "220px" }}
                                    />
                                  </div>
                                  <div className="form-row">
                                    <span className="label">Lead</span>
                                    <select
                                      // Keyed by its default: after a save the
                                      // RSC update reconciles the node and an
                                      // uncontrolled select keeps its old DOM
                                      // state — which here was "" (No lead), so
                                      // a follow-up rename would post "" and
                                      // wipe the lead just set (walked on the
                                      // running app, 2026-08-21). A changed key
                                      // remounts it onto the fresh default.
                                      key={leadDefault}
                                      name="leadUserId"
                                      className="tinput inline"
                                      defaultValue={leadDefault}
                                      aria-label="Section lead — chosen from this course's faculty"
                                    >
                                      {/* A lead the option list cannot name —
                                          legacy free text, or a member since
                                          demoted — stays put behind the keep
                                          sentinel until a real choice is
                                          made, so a rename cannot wipe it. */}
                                      {leadDefault === "__keep__" ? (
                                        <option value="__keep__">
                                          {section.leadUserId
                                            ? `${leadName.get(section.leadUserId) ?? "current lead"} — no longer faculty`
                                            : `${section.lead} — free text`}
                                        </option>
                                      ) : null}
                                      <option value="">No lead</option>
                                      {facultyOptions.map((f) => (
                                        <option key={f.userId} value={f.userId}>
                                          {f.name || f.email}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <button
                                    className="btn mini"
                                    type="submit"
                                    data-tip="Save the section name and lead"
                                  >
                                    Save Section
                                  </button>
                                  {/* Last on the line, so this is what wraps
                                      when the row runs out — never a control. */}
                                  {facultyOptions.length === 0 ? (
                                    <span className="hint">
                                      Leads are chosen from this course&apos;s faculty — promote
                                      someone on the roster first.
                                    </span>
                                  ) : null}
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
                    {/* The lead is a choice from the course's faculty, not
                        free text (TJ, 2026-08-21) — createSection validates
                        the membership again server-side. */}
                    <select
                      name="leadUserId"
                      className="tinput inline"
                      defaultValue=""
                      aria-label="Section lead — chosen from this course's faculty"
                      data-tip={
                        facultyOptions.length === 0
                          ? "No faculty in this course yet — promote on the roster, then set the lead"
                          : "Optional — the course's faculty"
                      }
                    >
                      <option value="">Lead — none</option>
                      {facultyOptions.map((f) => (
                        <option key={f.userId} value={f.userId}>
                          {f.name || f.email}
                        </option>
                      ))}
                    </select>
                    <button className="btn mini" type="submit" data-tip="Create this section in the course">
                      Add Section
                    </button>
                  </form>
                </details>
              </section>
            )
          })()}
        </div>
      )}
    </main>
  )
}
