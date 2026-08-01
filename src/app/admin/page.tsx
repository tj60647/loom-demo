import { addAllowedEmail, getRoster, removeAllowedEmail } from "@/actions/admin"
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

      <section className="card" style={{ marginBottom: "24px" }}>
        <h2>Invite learners</h2>
        <p className="hint" style={{ marginTop: "6px" }}>
          Sign-in succeeds only for an email on this roster. A learner joins the course the first
          time they sign in with that GitHub email, landing in whichever section you gave them
          here — you can move them afterwards.
        </p>
        <InviteLearners courseId={courseId} sections={courseSections} />
      </section>

      {roster.length === 0 ? (
        <div className="card empty">
          <span className="cap">
            {sectionName ? `Nobody on the roster for ${sectionName} yet` : "Nobody on the roster yet"}
          </span>
        </div>
      ) : (
        <div className="two">
          {roster.map((person) => (
            <div key={person.userId ?? person.email} className={`card${person.status === "pending" ? " pendingcard" : ""}`}>
              <h2>{person.name ?? person.email}</h2>
              {person.name ? <div className="hint">{person.email}</div> : null}
              <div style={{ marginTop: "10px" }}>
                {person.status === "pending" ? (
                  <span className="pill loose" title="invited — has not signed in, so has no loom yet">
                    not signed in yet
                  </span>
                ) : (
                  <>
                    <span className="pill beaten">{person.conceptsCount} concepts</span>
                    <span className="pill loose" style={{ marginLeft: "10px" }}>{person.edgesCount} edges</span>
                  </>
                )}
                {person.sectionName ? (
                  <span className="pill beaten" style={{ marginLeft: "10px" }}>{person.sectionName}</span>
                ) : (
                  <span className="pill loose" style={{ marginLeft: "10px" }}>Unassigned</span>
                )}
              </div>

              {/* Two different writes behind one control. Once someone exists,
                  their section lives on the membership; before that it lives on
                  the invitation, so placing a pending learner is an upsert of
                  the invitation and they land there on first sign-in. */}
              {courseSections.length > 0 ? (
                <form
                  action={person.userId ? assignMemberSection : addAllowedEmail}
                  className="quietrow"
                  style={{ marginTop: "12px" }}
                >
                  <input type="hidden" name="courseId" value={courseId} />
                  {person.userId ? (
                    <input type="hidden" name="userId" value={person.userId} />
                  ) : (
                    <input type="hidden" name="email" value={person.email} />
                  )}
                  <select name="sectionId" className="tinput" defaultValue={person.sectionId ?? ""} aria-label={`Section for ${person.name ?? person.email}`}>
                    <option value="">No section</option>
                    {courseSections.map((section) => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </select>
                  <button className="btn ghost mini" type="submit">
                    {person.userId ? "Assign" : "Place"}
                  </button>
                </form>
              ) : null}

              <div style={{ display: "flex", gap: "8px", marginTop: "15px", flexWrap: "wrap" }}>
                {person.userId ? (
                  <a
                    href={`/admin/user/${person.userId}?course=${encodeURIComponent(courseId)}`}
                    className="btn mini"
                  >
                    Open Loom
                  </a>
                ) : null}
                {person.invited ? (
                  <form action={removeAllowedEmail}>
                    <input type="hidden" name="courseId" value={courseId} />
                    <input type="hidden" name="email" value={person.email} />
                    <button className="btn ghost mini" type="submit">
                      {person.status === "pending" ? "Withdraw invitation" : "Remove from roster"}
                    </button>
                  </form>
                ) : null}
              </div>
              {person.status === "enrolled" && person.invited && (
                <p className="hint" style={{ fontSize: "12px", marginTop: "8px", marginBottom: 0 }}>
                  Removing them from the roster blocks future sign-ins; it does not delete the work
                  they have already done.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
