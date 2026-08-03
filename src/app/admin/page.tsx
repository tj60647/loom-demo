import { addAllowedEmail, getRoster, removeAllowedEmail, removeFromRoster } from "@/actions/admin"
import { assignMemberSection } from "@/actions/courses"
import { firstParam, getCourse, listSections, resolveCourseId, resolveSectionId } from "@/lib/courses"
import InviteLearners from "@/components/admin/InviteLearners"

type AdminPageSearchParams = {
  course?: string | string[]
  section?: string | string[]
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const resolved = await searchParams
  const courseId = await resolveCourseId(firstParam(resolved.course))

  if (!courseId) {
    return (
      <main>
        <h1>Roster</h1>
        <div className="card empty" style={{ marginTop: "20px" }}>
          <span className="cap">No courses yet — create one on the Courses tab</span>
        </div>
      </main>
    )
  }

  const sectionId = await resolveSectionId(courseId, firstParam(resolved.section))
  const [course, courseSections, roster] = await Promise.all([
    getCourse(courseId),
    listSections(courseId),
    getRoster(courseId, sectionId),
  ])

  const sectionName = sectionId
    ? courseSections.find((section) => section.id === sectionId)?.name ?? null
    : null
  const pendingCount = roster.filter((row) => row.status === "pending").length
  const enrolledCount = roster.length - pendingCount

  return (
    <main>
      <h1>Roster</h1>
      <p style={{ marginBottom: "20px" }}>
        {course?.name}
        {sectionName ? ` · ${sectionName}` : " · all sections"} —{" "}
        <b>{enrolledCount}</b> enrolled
        {pendingCount > 0 ? <> · <b>{pendingCount}</b> invited, not signed in yet</> : null}.
      </p>

      <details className="card invitefold" style={{ marginBottom: "24px" }}>
        <summary>
          <span className="tw">▸</span>
          <h2>Invite learners</h2>
        </summary>
        <p className="hint" style={{ marginTop: "10px" }}>
          Sign-in succeeds for anyone invited to or enrolled in a course. A learner joins this
          course the first time they sign in with the GitHub email you invite here, landing in
          whichever section you gave them — you can move them afterwards.
        </p>
        <InviteLearners courseId={courseId} sections={courseSections} />
      </details>

      {roster.length === 0 ? (
        <div className="card empty">
          <span className="cap">
            {sectionName ? `Nobody on the roster for ${sectionName} yet` : "Nobody on the roster yet"}
          </span>
        </div>
      ) : (
        <>
          <div className="card rosterlist">
            {roster.map((person) => (
              <div key={person.userId ?? person.email} className={`rosterrow${person.status === "pending" ? " pendingrow" : ""}`}>
                <div className="rosterwho">
                  <span className="rostername">{person.name ?? person.email}</span>
                  {person.name ? <span className="rosteremail">{person.email}</span> : null}
                </div>

                <div className="rosterpills">
                  {person.status === "pending" ? (
                    <span className="pill loose" title="invited — has not signed in, so has no loom yet">
                      not signed in yet
                    </span>
                  ) : (
                    <>
                      <span className="pill beaten">{person.conceptsCount} concepts</span>
                      <span className="pill loose">{person.edgesCount} edges</span>
                    </>
                  )}
                </div>

                {/* Two different writes behind one control. Once someone exists,
                    their section lives on the membership; before that it lives on
                    the invitation, so placing a pending learner is an upsert of
                    the invitation and they land there on first sign-in. */}
                {courseSections.length > 0 ? (
                  <form action={person.userId ? assignMemberSection : addAllowedEmail}>
                    <input type="hidden" name="courseId" value={courseId} />
                    {person.userId ? (
                      <input type="hidden" name="userId" value={person.userId} />
                    ) : (
                      <input type="hidden" name="email" value={person.email} />
                    )}
                    <select name="sectionId" className="tinput inline" defaultValue={person.sectionId ?? ""} aria-label={`Section for ${person.name ?? person.email}`}>
                      <option value="">No section</option>
                      {courseSections.map((section) => (
                        <option key={section.id} value={section.id}>{section.name}</option>
                      ))}
                    </select>
                    <button className="btn ghost mini compact" type="submit">
                      {person.userId ? "Assign" : "Place"}
                    </button>
                  </form>
                ) : null}

                <div className="rosteracts">
                  {person.userId ? (
                    <>
                      <a
                        href={`/admin/user/${person.userId}?course=${encodeURIComponent(courseId)}`}
                        className="btn mini compact"
                      >
                        Open Loom
                      </a>
                      <form action={removeFromRoster}>
                        <input type="hidden" name="courseId" value={courseId} />
                        <input type="hidden" name="userId" value={person.userId} />
                        <button
                          className="btn ghost mini compact"
                          type="submit"
                          aria-label={`Remove ${person.name ?? person.email} from course`}
                        >
                          Remove
                        </button>
                      </form>
                    </>
                  ) : (
                    <form action={removeAllowedEmail}>
                      <input type="hidden" name="courseId" value={courseId} />
                      <input type="hidden" name="email" value={person.email} />
                      <button
                        className="btn ghost mini compact"
                        type="submit"
                        aria-label={`Withdraw the invitation for ${person.email}`}
                      >
                        Withdraw
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="hint" style={{ fontSize: "12.5px", marginTop: "10px" }}>
            Removing an enrolled learner ends their access to this course only — other courses are
            untouched, and their work is kept. Re-inviting them brings it all back.
          </p>
        </>
      )}
    </main>
  )
}
