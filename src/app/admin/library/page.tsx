import {
  addSourceToCourse,
  deleteSource,
  getLibraryOverview,
  rescoreSourceAction,
  setSourceArchived,
  updateSourceMetadata,
} from "@/actions/sources"
import DraftMetadataButton from "@/components/library/DraftMetadataButton"
import ExtractionScore from "@/components/library/ExtractionScore"
import SourceThumbnail from "@/components/library/SourceThumbnail"
import UploadReadingsForm from "@/components/library/UploadReadingsForm"
import { firstParam, getCourse, resolveCourseId } from "@/lib/courses"

type AdminLibrarySearchParams = {
  course?: string | string[]
}

/**
 * The Readings tab: every reading in the library, on its own terms.
 *
 * Course membership is shown here as a badge and edited with "Add to course",
 * but a reading is never *scoped* to a course on this page — that view belongs
 * to the Courses tab, which lists each course's full reading list. The `?course`
 * param only pre-selects a default in the add-to-course pickers.
 */
export default async function AdminLibraryPage({
  searchParams,
}: {
  searchParams: Promise<AdminLibrarySearchParams>
}) {
  const resolved = await searchParams
  const activeCourseId = await resolveCourseId(firstParam(resolved.course))
  const activeCourse = activeCourseId ? await getCourse(activeCourseId) : null

  const { readings, courses } = await getLibraryOverview()

  const live = readings.filter((reading) => !reading.isArchived)
  const archived = readings.filter((reading) => reading.isArchived)
  const unscheduled = live.filter((reading) => reading.courses.length === 0).length

  return (
    <main>
      <h1>Readings</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>
        One shared library. Every reading is uploaded and OCR&apos;d once, then included in any
        number of courses — each with its own week, visibility, and core/supplemental status.
      </p>

      <UploadReadingsForm
        course={activeCourse ? { id: activeCourse.id, name: activeCourse.name } : null}
      />

      <section>
        <div className="heading-with-info" style={{ marginBottom: "6px" }}>
          <h2>All Readings</h2>
          <span className="hint">{live.length} reading(s)</span>
          {unscheduled > 0 ? (
            <span className="pill loose">{unscheduled} in no course</span>
          ) : null}
        </div>
        <p className="hint" style={{ marginBottom: "14px" }}>
          Metadata and scores are shared across every course that includes a reading. Week,
          visibility, and core status are per-course — set those on the Courses tab.
        </p>

        {live.length === 0 ? (
          <div className="card empty">
            <span className="cap">No readings uploaded yet</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {live.map((reading) => {
              const memberOf = new Set(reading.courses.map((course) => course.id))
              const addable = courses.filter((course) => !memberOf.has(course.id))

              return (
                <div className="card" key={reading.id} style={{ padding: "20px" }}>
                  <div style={{ display: "flex", gap: "18px", alignItems: "stretch", flexWrap: "wrap" }}>
                    <SourceThumbnail sourceId={reading.id} title={reading.title} fixedHeight={220} />

                    {/* Top-down flow, never space-between: bottom-pinning the
                        action row only holds while the column is shorter than
                        the thumbnail, so the row would jump up the moment a
                        disclosure opens and the column outgrows it. */}
                    <div
                      style={{
                        flex: "1 1 340px",
                        minWidth: "240px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div className="heading-with-info">
                          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>{reading.title}</h3>
                          {reading.courses.length === 0 ? (
                            <span className="pill loose">In no course</span>
                          ) : (
                            reading.courses.map((course) => (
                              <span
                                key={course.id}
                                className={`pill ${course.isVisible ? "beaten" : "loose"}`}
                                title={
                                  course.isVisible
                                    ? `Published in ${course.name}${course.week != null ? `, week ${course.week}` : ", unscheduled"}`
                                    : `Staged but hidden in ${course.name}`
                                }
                              >
                                {course.name}
                                {course.week != null ? ` · wk ${course.week}` : ""}
                                {course.isVisible ? "" : " · hidden"}
                              </span>
                            ))
                          )}
                        </div>

                        {reading.author ? (
                          <p className="hint" style={{ margin: "0 0 8px 0" }}>{reading.author}</p>
                        ) : null}
                        {reading.sourceReference ? (
                          <p
                            className="hint"
                            style={{
                              margin: reading.author ? "-4px 0 8px 0" : "0 0 8px 0",
                              fontSize: "13px",
                            }}
                          >
                            {reading.sourceReference}
                          </p>
                        ) : null}
                        {reading.isDescriptionVisible && reading.description ? (
                          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "12px" }}>
                            {reading.description}
                          </p>
                        ) : null}

                        <div style={{ marginTop: "10px" }}>
                          <ExtractionScore score={reading.score} />
                        </div>
                      </div>

                      {/* One row of equal buttons; whatever a button discloses
                          opens in a .foldout on its own line below the row, so
                          the buttons themselves never move (see .actrow). */}
                      <div className="actrow">
                        {addable.length > 0 ? (
                          <details>
                            <summary
                              className="btn mini"
                              data-tip="Include this reading in a course's list — pick the course and week"
                            >
                              Add to Course
                            </summary>
                            <form
                              className="foldout"
                              action={addSourceToCourse}
                              style={{ display: "grid", gap: "10px", maxWidth: "420px" }}
                            >
                              <input type="hidden" name="sourceId" value={reading.id} />
                              <div className="form-row">
                                <span className="label">Course</span>
                                <select
                                  name="courseId"
                                  className="tinput"
                                  defaultValue={
                                    addable.find((course) => course.id === activeCourseId)?.id ??
                                    addable[0].id
                                  }
                                >
                                  {addable.map((course) => (
                                    <option key={course.id} value={course.id}>
                                      {course.term ? `${course.name} · ${course.term}` : course.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-row">
                                <span className="label">Week (Optional)</span>
                                <input name="week" type="number" min="1" max="20" placeholder="Unscheduled" />
                              </div>
                              <label
                                className="hint"
                                style={{ display: "flex", alignItems: "center", gap: "8px" }}
                              >
                                <input type="checkbox" name="isCore" defaultChecked value="on" />
                                Core reading (students graph this one)
                              </label>
                              <button
                                className="btn mini"
                                type="submit"
                                style={{ justifySelf: "start" }}
                                data-tip="Add with the chosen course, week, and core status"
                              >
                                Add to Course
                              </button>
                            </form>
                          </details>
                        ) : (
                          <span className="hint" style={{ fontSize: "13px" }}>
                            {courses.length === 0
                              ? "Create a course to assign this reading"
                              : "In every course already"}
                          </span>
                        )}

                        <details>
                          <summary
                            className="btn ghost mini"
                            data-tip="Edit the title, author, and description shared by every course"
                          >
                            Edit Entry
                          </summary>
                          <form
                            className="foldout"
                            action={updateSourceMetadata}
                            style={{ display: "grid", gap: "10px", maxWidth: "640px" }}
                          >
                            <input type="hidden" name="sourceId" value={reading.id} />
                            <DraftMetadataButton sourceId={reading.id} />
                            <div className="form-row">
                              <span className="label">Title</span>
                              <input name="title" defaultValue={reading.title} required />
                            </div>
                            <div className="form-row">
                              <span className="label">Author</span>
                              <input name="author" defaultValue={reading.author ?? ""} />
                            </div>
                            <div className="form-row">
                              <span className="label">Source Reference</span>
                              <input
                                name="sourceReference"
                                defaultValue={reading.sourceReference ?? ""}
                                placeholder="Bibliographic citation or canonical source reference"
                              />
                            </div>
                            <div className="form-row">
                              <span className="label">Description</span>
                              <textarea
                                name="description"
                                defaultValue={reading.description ?? ""}
                                placeholder="One sentence — where the reading sits and what it is doing, not what it concludes"
                              />
                            </div>
                            <label
                              className="hint"
                              style={{ display: "flex", alignItems: "center", gap: "8px" }}
                            >
                              <input
                                type="checkbox"
                                name="isDescriptionVisible"
                                defaultChecked={reading.isDescriptionVisible}
                              />
                              Show description on library cards
                            </label>
                            <div className="form-row">
                              <span className="label">Metadata Provenance</span>
                              <textarea
                                name="metadataProvenance"
                                defaultValue={reading.metadataProvenance ?? ""}
                                placeholder="Where this metadata came from, e.g. email text, PDF front matter, manual review"
                              />
                            </div>
                            <button
                              className="btn mini"
                              type="submit"
                              style={{ justifySelf: "start" }}
                              data-tip="Save these fields for every course that includes this reading"
                            >
                              Save Metadata
                            </button>
                          </form>
                        </details>

                        <a
                          className="btn ghost mini"
                          href={`/api/readings/${reading.id}?download=1`}
                          data-tip="Download the original PDF file"
                        >
                          Download PDF
                        </a>

                        <form action={rescoreSourceAction}>
                          <input type="hidden" name="sourceId" value={reading.id} />
                          <button
                            className="btn ghost mini"
                            type="submit"
                            data-tip="Re-run extraction scoring and rebuild the cover thumbnail"
                          >
                            Rescore
                          </button>
                        </form>

                        <form action={setSourceArchived}>
                          <input type="hidden" name="sourceId" value={reading.id} />
                          <input type="hidden" name="isArchived" value="true" />
                          <button
                            className="btn ghost mini"
                            type="submit"
                            data-tip="Retire from the library — courses that already include it keep it"
                          >
                            Archive
                          </button>
                        </form>

                        <details>
                          <summary
                            className="btn ghost mini pillbtn"
                            data-tip="Permanently delete the PDF and remove it from every course"
                          >
                            Delete
                          </summary>
                          <form
                            className="foldout"
                            action={deleteSource}
                            style={{ display: "grid", gap: "8px" }}
                          >
                            <input type="hidden" name="sourceId" value={reading.id} />
                            <p className="hint" style={{ margin: 0, maxWidth: "46ch" }}>
                              Permanently deletes the PDF and removes it from every course. Student
                              bytes captured from it keep their quoted text but lose the source link.
                            </p>
                            {/* No data-tip here: the bubble would sit exactly
                                over the warning this button must be read with. */}
                            <button className="btn mini danger" type="submit" style={{ justifySelf: "start" }}>
                              Delete Permanently
                            </button>
                          </form>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {archived.length > 0 ? (
        <section style={{ marginTop: "30px" }}>
          <div className="heading-with-info" style={{ marginBottom: "6px" }}>
            <h2>Archived</h2>
            <span className="hint">{archived.length} reading(s)</span>
          </div>
          <p className="hint" style={{ marginBottom: "14px" }}>
            Retired from the library. Courses that already include them are unaffected.
          </p>
          <div className="scrollbox">
            {archived.map((reading) => (
              <div key={reading.id} className="lrow" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: "12px", alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "15px", flex: "1 1 260px", minWidth: 0 }}>
                    {reading.title}
                  </span>
                  {reading.author ? (
                    <span className="hint" style={{ fontSize: "13px" }}>{reading.author}</span>
                  ) : null}
                  {reading.courses.map((course) => (
                    <span key={course.id} className="pickedtag">in {course.name}</span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                  <form action={setSourceArchived}>
                    <input type="hidden" name="sourceId" value={reading.id} />
                    <input type="hidden" name="isArchived" value="false" />
                    <button className="act" type="submit" data-tip="Return this reading to the live library">
                      restore
                    </button>
                  </form>
                  <a
                    className="act"
                    href={`/api/readings/${reading.id}?download=1`}
                    data-tip="Download the original PDF file"
                  >
                    download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
