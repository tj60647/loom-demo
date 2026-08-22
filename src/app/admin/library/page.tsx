import { checkAdmin } from "@/actions/admin"
import { buildStamp } from "@/lib/buildStamp"
import { getRepairSummary, getRepairsForSource } from "@/actions/repairs"
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
import RepairPanel from "@/components/library/RepairPanel"
import SourceThumbnail from "@/components/library/SourceThumbnail"
import UploadReadingsForm from "@/components/library/UploadReadingsForm"
import { firstParam, getCourse, resolveCourseId } from "@/lib/courses"
import { timeAgo } from "@/lib/utils"

type AdminLibrarySearchParams = {
  course?: string | string[]
}

/**
 * Five frontier models read a crop one after another, and the slowest of them
 * has been measured at 210 seconds on a single region. The platform default
 * would cut that off mid-panel and leave the region unread with the money
 * already spent, so this page — and therefore every Server Function reached
 * from it — is given the room the work actually takes.
 *
 * `transcribeAllRepairs` sidesteps this entirely by handing the loop to
 * `after()`; this ceiling is what makes reading ONE region synchronously, which
 * is how a reviewer checks a single page, survive the round trip.
 */
export const maxDuration = 300

/**
 * The Readings tab: every reading in the library, on its own terms.
 *
 * Course membership is shown here as a badge and edited with "Add to course" —
 * one of two doors: since 2026-08-21 a course's own Readings panel adds from
 * the library inline, posting the same addSourceToCourse. A reading is never
 * *scoped* to a course on this page — that view belongs to the Courses tab,
 * which lists each course's full reading list. The `?course` param only
 * pre-selects a default in the add-to-course pickers.
 */
export default async function AdminLibraryPage({
  searchParams,
}: {
  searchParams: Promise<AdminLibrarySearchParams>
}) {
  // The shell admits course FACULTY (ruling 18) but this is a write surface and
  // stays admin's. Gate the page the way the Courses tab does — a redirect —
  // rather than leaving it to the first action's `Unauthorized` throw, which
  // faculty who typed the URL met as a 500 error page.
  await checkAdmin()

  const resolved = await searchParams
  const activeCourseId = await resolveCourseId(firstParam(resolved.course))
  const activeCourse = activeCourseId ? await getCourse(activeCourseId) : null

  const { readings, courses } = await getLibraryOverview()
  const repairSummary = await getRepairSummary()

  const live = readings.filter((reading) => !reading.isArchived)
  const archived = readings.filter((reading) => reading.isArchived)
  const unscheduled = live.filter((reading) => reading.courses.length === 0).length

  // Full proposal rows only where there are any. A reading nobody has run
  // detection on renders an empty panel, which is the correct thing to see —
  // detection is free and the panel says so.
  const repairsBySource = new Map(
    await Promise.all(
      live
        .filter((reading) => repairSummary.repairs[reading.id])
        .map(async (reading) => [reading.id, await getRepairsForSource(reading.id)] as const)
    )
  )

  return (
    <main>
      <h1>Readings</h1>
      {/* The build stamp, where the environment already matters (TJ,
          2026-08-19). This page is where deployments get checked, so "which
          copy of the app is this" belongs beside the readings rather than only
          in the About card a student reads. Same one line, same source. */}
      <p className="aboutbuild" style={{ marginTop: 0, borderTop: "none", paddingTop: 0 }}>{buildStamp()}</p>
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

              // The disclosure says where this reading is in the loop, so an
              // admin does not have to open eleven panels to find the one with
              // a decision waiting in it.
              const repairCounts = repairSummary.repairs[reading.id]
              const repairNote = repairCounts?.accepted
                ? `${repairCounts.accepted} to write`
                : repairCounts?.proposed
                  ? `${repairCounts.proposed} to review`
                  : repairCounts?.applied
                    ? `${repairCounts.applied} applied`
                    : ""

              return (
                <div className={`card${reading.isOwn ? " owncard" : ""}`} key={reading.id} style={{ padding: "20px" }}>
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
                          {reading.isOwn ? (
                            /* A student's own reading is not "in no course" —
                               no course was ever meant to include it. Slate,
                               named for its owner (TJ, 2026-08-21). */
                            <span
                              className="pill own"
                              title={`${reading.owner} added this for themselves — it sits on their shelf only`}
                            >
                              own · {reading.owner}
                            </span>
                          ) : reading.courses.length === 0 ? (
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

                        {/* Version sits with the score, not with the course
                            pills: both are facts about the FILE, and a reading
                            in four courses would otherwise push it off the end
                            of the heading row. Two sites showing the same
                            reading at different versions is the whole point —
                            it is how you see that a repair has not reached
                            students yet. */}
                        <div
                          style={{
                            marginTop: "10px",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            className={`pill ${reading.revisions.length > 0 ? "beaten" : "loose"}`}
                            title={
                              reading.revisions.length === 0
                                ? "Version 1 — the file as first uploaded"
                                : `Version ${reading.revisions.length + 1} — this reading's file has been replaced ${
                                    reading.revisions.length === 1
                                      ? "once"
                                      : `${reading.revisions.length} times`
                                  }`
                            }
                          >
                            v{reading.revisions.length + 1}
                          </span>
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
                            <form className="foldout foldline" action={addSourceToCourse}>
                              <input type="hidden" name="sourceId" value={reading.id} />
                              <div className="form-row">
                                <span className="label">Course</span>
                                <select
                                  name="courseId"
                                  className="tinput inline"
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
                                {/* No "Unscheduled" placeholder: it does not fit
                                    a 66px box. An empty field is unscheduled,
                                    and the label already says optional. */}
                                <input className="numin" name="week" type="number" min="1" max="20" />
                              </div>
                              {/* Same pair, same words, as the Courses tab's
                                  Schedule foldout — one choice with two names.
                                  Same one-line shape too, since 2026-08-22. */}
                              <div className="form-row">
                                <span className="label">Weight</span>
                                <div className="radiorow">
                                  <label className="radiopick">
                                    <input type="radio" name="isCore" value="true" defaultChecked />
                                    Core
                                  </label>
                                  <label className="radiopick">
                                    <input type="radio" name="isCore" value="false" />
                                    Supplemental
                                  </label>
                                </div>
                              </div>
                              <button
                                className="btn mini"
                                type="submit"
                                data-tip="Add with the chosen course, week, and core status"
                              >
                                Add to Course
                              </button>
                              {/* Last on the line, so this is what wraps. */}
                              <span className="hint">
                                Students graph the core readings; supplemental ones sit alongside.
                              </span>
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

                        {/* Only where there is history to read: a reading on
                            its first file has nothing to disclose that the v1
                            badge has not already said. `source_revision` has
                            been written since migration 0025 and read by
                            nothing — this is the record finally surfacing. */}
                        {reading.revisions.length > 0 ? (
                          <details>
                            <summary
                              className="btn ghost mini"
                              data-tip="Every version of this reading's file, and why each replaced the last"
                            >
                              File History
                            </summary>
                            <div
                              className="foldout"
                              style={{ display: "grid", gap: "12px", maxWidth: "560px" }}
                            >
                              {reading.revisions
                                .map((revision, index) => ({ revision, version: index + 2 }))
                                .reverse()
                                .map(({ revision, version }) => (
                                  <div
                                    key={revision.id}
                                    className="revline"
                                    style={{ display: "grid", gap: "2px" }}
                                  >
                                    <span
                                      style={{
                                        fontFamily: "var(--mono)",
                                        fontSize: "12px",
                                        letterSpacing: ".04em",
                                      }}
                                    >
                                      v{version} · {timeAgo(revision.createdAt)}
                                    </span>
                                    <span className="hint" style={{ fontSize: "13px" }}>
                                      {revision.reason || "no reason recorded"}
                                    </span>
                                  </div>
                                ))}
                              <div className="revline" style={{ display: "grid", gap: "2px" }}>
                                <span
                                  style={{
                                    fontFamily: "var(--mono)",
                                    fontSize: "12px",
                                    letterSpacing: ".04em",
                                  }}
                                >
                                  v1 · {timeAgo(reading.createdAt)}
                                </span>
                                <span className="hint" style={{ fontSize: "13px" }}>
                                  added to the library
                                </span>
                              </div>
                            </div>
                          </details>
                        ) : null}

                        <a
                          className="btn ghost mini"
                          href={`/api/readings/${reading.id}?download=1`}
                          data-tip="Download the PDF this reading currently serves"
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

                        {/* Repair sits next to Rescore because it is what you
                            reach for when the score comes back bad: rescore
                            re-measures, this fixes. */}
                        <details>
                          <summary
                            className="btn ghost mini"
                            data-tip="Find scan damage no score can see, have five models read it, and decide what the page actually says"
                          >
                            Repair Text{repairNote ? ` · ${repairNote}` : ""}
                          </summary>
                          <div className="foldout">
                            <RepairPanel
                              sourceId={reading.id}
                              repairs={repairsBySource.get(reading.id) ?? []}
                              hasHighlights={repairSummary.highlights[reading.id] ?? 0}
                            />
                          </div>
                        </details>

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
                              passages captured from it keep their quoted text but lose the source link.
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
                    data-tip="Download the PDF this reading currently serves"
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
