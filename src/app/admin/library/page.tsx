import {
  addSourceToCourse,
  createSourceFromForm,
  deleteSource,
  getCourseSources,
  getLibrarySources,
  removeSourceFromCourse,
  setCourseSourceVisibility,
  setSourceArchived,
  updateCourseSourcePlacement,
  updateSourceMetadata,
} from "@/actions/sources"
import SourceThumbnail from "@/components/library/SourceThumbnail"
import { firstParam, getCourse, resolveCourseId } from "@/lib/courses"

type AdminLibrarySearchParams = {
  course?: string | string[]
}

export default async function AdminLibraryPage({
  searchParams,
}: {
  searchParams: Promise<AdminLibrarySearchParams>
}) {
  const resolved = await searchParams
  const courseId = await resolveCourseId(firstParam(resolved.course))
  const course = courseId ? await getCourse(courseId) : null

  const [library, included] = await Promise.all([
    getLibrarySources({ includeArchived: true }),
    getCourseSources(courseId),
  ])

  const includedIds = new Set(included.map((source) => source.id))
  const available = library.filter((source) => !includedIds.has(source.id) && !source.isArchived)

  return (
    <main>
      <h1>Readings</h1>
      <p className="tasksub" style={{ marginBottom: "20px" }}>
        One shared library. Every reading is uploaded and OCR&apos;d once, then included in any
        number of courses — each with its own week, visibility, and core/supplemental status.
      </p>

      <section className="card" style={{ marginBottom: "24px" }}>
        <h2>Add a Reading to the Library</h2>
        <p className="hint" style={{ marginTop: "8px" }}>
          Upload the PDF first. Then review source reference, provenance, title, and optional description below.
        </p>
        <form action={createSourceFromForm} style={{ marginTop: "14px" }}>
          <input type="hidden" name="courseId" value={courseId ?? ""} />
          <div className="form-row">
            <span className="label">Title Override (Optional)</span>
            <input name="title" placeholder="Defaults to the PDF filename" />
          </div>
          <div className="form-row" style={{ marginTop: "10px" }}>
            <span className="label">PDF File</span>
            <input name="file" type="file" accept="application/pdf" required />
          </div>
          {course ? (
            <label className="hint" style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
              <input type="checkbox" name="addToCourse" defaultChecked />
              Also include it in {course.name}
            </label>
          ) : null}
          <button className="btn mini" style={{ marginTop: "12px" }} type="submit">Upload Reading</button>
        </form>
      </section>

      {!course ? (
        <div className="card empty">
          <span className="cap">Create a course before building a reading list</span>
        </div>
      ) : (
        <section style={{ marginBottom: "30px" }}>
          <div className="heading-with-info" style={{ marginBottom: "6px" }}>
            <h2>In {course.name}</h2>
            <span className="hint">{included.length} reading(s)</span>
          </div>
          <p className="hint" style={{ marginBottom: "14px" }}>
            Hiding a reading affects this course only. Removing it returns it to the library.
          </p>

          {included.length === 0 ? (
            <div className="card empty">
              <span className="cap">No readings in this course yet — add them from the library below</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {included.map((source) => (
                <div className="card" key={source.id} style={{ padding: "20px" }}>
                  <div style={{ display: "flex", gap: "18px", alignItems: "stretch", flexWrap: "wrap" }}>
                    <SourceThumbnail sourceId={source.id} title={source.title} fixedHeight={220} />
                    <div style={{ flex: "1 1 340px", minWidth: "240px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "12px" }}>
                      <div>
                        <div className="heading-with-info">
                          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>{source.title}</h3>
                          <span className={`pill ${source.link.isVisible ? "beaten" : "loose"}`}>
                            {source.link.isVisible ? "Visible" : "Hidden"}
                          </span>
                          <span className={`pill ${source.link.isCore ? "beaten" : "loose"}`}>
                            {source.link.isCore ? "Core" : "Supplemental"}
                          </span>
                          {source.link.week != null ? (
                            <span className="pill beaten">Week {source.link.week}</span>
                          ) : (
                            <span className="pill loose">Unscheduled</span>
                          )}
                        </div>
                        {source.author ? <p className="hint" style={{ margin: "0 0 12px 0" }}>{source.author}</p> : null}
                        {source.sourceReference ? (
                          <p className="hint" style={{ margin: source.author ? "-6px 0 12px 0" : "0 0 12px 0", fontSize: "13px" }}>
                            {source.sourceReference}
                          </p>
                        ) : null}
                        {source.isDescriptionVisible && source.description ? (
                          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
                            {source.description}
                          </p>
                        ) : null}
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <details>
                          <summary className="btn ghost mini" style={{ listStyle: "none", cursor: "pointer" }}>Placement</summary>
                          <form action={updateCourseSourcePlacement} style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                            <input type="hidden" name="courseId" value={course.id} />
                            <input type="hidden" name="sourceId" value={source.id} />
                            <div className="form-row">
                              <span className="label">Week</span>
                              <input name="week" type="number" min="1" max="20" defaultValue={source.link.week ?? ""} placeholder="Unscheduled" />
                            </div>
                            <div className="form-row">
                              <span className="label">Order Within Week</span>
                              <input name="position" type="number" min="0" defaultValue={source.link.position} />
                            </div>
                            <label className="hint" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input type="checkbox" name="isCore" defaultChecked={source.link.isCore} />
                              Core reading (students graph this one)
                            </label>
                            <button className="btn mini" type="submit" style={{ justifySelf: "start" }}>Save Placement</button>
                          </form>
                        </details>

                        <details>
                          <summary className="btn ghost mini" style={{ listStyle: "none", cursor: "pointer" }}>Edit</summary>
                          <p className="hint" style={{ marginTop: "10px", maxWidth: "46ch" }}>
                            Metadata is shared across every course that includes this reading.
                          </p>
                          <form action={updateSourceMetadata} style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
                            <input type="hidden" name="sourceId" value={source.id} />
                            <div className="form-row">
                              <span className="label">Title</span>
                              <input name="title" defaultValue={source.title} required />
                            </div>
                            <div className="form-row">
                              <span className="label">Author</span>
                              <input name="author" defaultValue={source.author ?? ""} />
                            </div>
                            <div className="form-row">
                              <span className="label">Source Reference</span>
                              <input name="sourceReference" defaultValue={source.sourceReference ?? ""} placeholder="Bibliographic citation or canonical source reference" />
                            </div>
                            <div className="form-row">
                              <span className="label">Description</span>
                              <textarea name="description" defaultValue={source.description ?? ""} placeholder="Optional summary or note for approval" />
                            </div>
                            <label className="hint" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input type="checkbox" name="isDescriptionVisible" defaultChecked={source.isDescriptionVisible} />
                              Show description on library cards
                            </label>
                            <div className="form-row">
                              <span className="label">Metadata Provenance</span>
                              <textarea name="metadataProvenance" defaultValue={source.metadataProvenance ?? ""} placeholder="Where this metadata came from, e.g. email text, PDF front matter, manual review" />
                            </div>
                            <button className="btn mini" type="submit" style={{ justifySelf: "start" }}>Save Metadata</button>
                          </form>
                        </details>

                        <form action={setCourseSourceVisibility}>
                          <input type="hidden" name="courseId" value={course.id} />
                          <input type="hidden" name="sourceId" value={source.id} />
                          <input type="hidden" name="isVisible" value={source.link.isVisible ? "false" : "true"} />
                          <button className="btn ghost mini" type="submit">
                            {source.link.isVisible ? "Hide" : "Reveal"}
                          </button>
                        </form>

                        <a className="btn ghost mini" href={`/api/readings/${source.id}?download=1`}>Download PDF</a>

                        <form action={removeSourceFromCourse}>
                          <input type="hidden" name="courseId" value={course.id} />
                          <input type="hidden" name="sourceId" value={source.id} />
                          <button className="btn ghost mini" type="submit">Remove from Course</button>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <div className="heading-with-info" style={{ marginBottom: "6px" }}>
          <h2>Shared Library</h2>
          <span className="hint">{library.length} reading(s)</span>
        </div>
        <p className="hint" style={{ marginBottom: "14px" }}>
          Available to every course. {course ? `${available.length} not yet in ${course.name}.` : ""}
        </p>

        {library.length === 0 ? (
          <div className="card empty">
            <span className="cap">No readings uploaded yet</span>
          </div>
        ) : (
          <div className="scrollbox">
            {library.map((source) => {
              const isIncluded = includedIds.has(source.id)
              return (
                <div key={source.id} className="lrow" style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "baseline", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "15px", flex: "1 1 260px", minWidth: 0 }}>{source.title}</span>
                    {source.author ? <span className="hint" style={{ fontSize: "13px" }}>{source.author}</span> : null}
                    {source.isArchived ? <span className="pill loose">Archived</span> : null}
                    {isIncluded && course ? <span className="pickedtag">in {course.name}</span> : null}
                  </div>

                  <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    {course && !isIncluded && !source.isArchived ? (
                      <form action={addSourceToCourse} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="courseId" value={course.id} />
                        <input type="hidden" name="sourceId" value={source.id} />
                        <input name="week" type="number" min="1" max="20" placeholder="Week" style={{ width: "88px" }} />
                        <button className="btn mini" type="submit">Add to {course.name}</button>
                      </form>
                    ) : null}

                    <form action={setSourceArchived}>
                      <input type="hidden" name="sourceId" value={source.id} />
                      <input type="hidden" name="isArchived" value={source.isArchived ? "false" : "true"} />
                      <button className="act" type="submit">{source.isArchived ? "restore" : "archive"}</button>
                    </form>

                    <a className="act" href={`/api/readings/${source.id}?download=1`}>download</a>

                    <details>
                      <summary className="rm" style={{ listStyle: "none", cursor: "pointer" }}>delete from library</summary>
                      <form action={deleteSource} style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
                        <input type="hidden" name="sourceId" value={source.id} />
                        <p className="hint" style={{ margin: 0, maxWidth: "46ch" }}>
                          Permanently deletes the PDF and removes it from every course. Student
                          bytes captured from it keep their quoted text but lose the source link.
                        </p>
                        <button className="btn mini" type="submit" style={{ justifySelf: "start" }}>Delete Permanently</button>
                      </form>
                    </details>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
