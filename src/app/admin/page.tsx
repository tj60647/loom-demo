import { getRoster, getStaffViewer } from "@/actions/admin"
import { firstParam, getCourse, listSections, resolveSectionId } from "@/lib/courses"
import InviteLearners from "@/components/admin/InviteLearners"
import RosterTable from "@/components/admin/RosterTable"

type AdminPageSearchParams = {
  course?: string | string[]
  section?: string | string[]
  view?: string | string[]
  filter?: string | string[]
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminPageSearchParams> }) {
  const resolved = await searchParams
  // Faculty read the roster; only an admin holds its write controls, so the
  // page renders those conditionally rather than letting a form submit into a
  // redirect.
  const { courseId, isAdmin } = await getStaffViewer(firstParam(resolved.course))

  if (!courseId) {
    return (
      <main>
        {/* No h1: the Teaching nav's highlighted Roster tab already names
            the page (TJ, 2026-08-21). */}
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
  const enrolled = roster.filter((row) => row.status !== "pending")
  const enrolledCount = enrolled.length
  // Invited means EVERYONE who was asked (TJ, 2026-08-21) — the pending AND
  // the enrolled who arrived by invitation — with a filter narrowing to the
  // silent. getRoster marks enrolled rows with `invited` for exactly this.
  const invitedAll = roster.filter((row) => row.invited)
  const noResponse = roster.filter((row) => row.status === "pending")
  const noResponseCount = noResponse.length

  // Three tabs (TJ, 2026-08-21): Enrolled — the daily visit — leads; Invited
  // is the invitation's ledger; Invite learners is the write surface and
  // shows only to the admin who holds it. Plain links, so the view survives
  // reload and the back button, and the server component stays one.
  const requestedView = firstParam(resolved.view)
  const view =
    requestedView === "invited" ? "invited"
    : requestedView === "invite" && isAdmin ? "invite"
    : "enrolled"
  const filterNoResponse = view === "invited" && firstParam(resolved.filter) === "noresponse"
  const baseHref = `/admin?course=${encodeURIComponent(courseId)}${sectionId ? `&section=${encodeURIComponent(sectionId)}` : ""}`
  const invitedPeople = filterNoResponse ? noResponse : invitedAll

  return (
    <main>
      {/* No h1: the Teaching nav's highlighted Roster tab already names the
          page (TJ, 2026-08-21). */}
      <div className="rostertabs">
        <a className={view === "enrolled" ? "on" : undefined} href={`${baseHref}&view=enrolled`}>
          Enrolled <span className="pill loose">{enrolledCount}</span>
        </a>
        <a className={view === "invited" ? "on" : undefined} href={`${baseHref}&view=invited`}>
          Invited <span className="pill loose">{invitedAll.length}</span>
        </a>
        {isAdmin && (
          <a className={view === "invite" ? "on" : undefined} href={`${baseHref}&view=invite`}>
            Invite learners
          </a>
        )}
        <span className="rostertabsline">
          {course?.name}
          {sectionName ? ` · ${sectionName}` : " · all sections"}
        </span>
      </div>

      {view === "invite" ? (
        <div className="card">
          <h2>Invite learners</h2>
          <p className="hint" style={{ marginTop: "10px" }}>
            Sign-in succeeds for anyone invited to or enrolled in a course. A learner joins this
            course the first time they sign in with the GitHub email you invite here, landing in
            whichever section you gave them — you can move them afterwards. An invitation
            addressed to the Faculty Section enrols as faculty: they get this course&apos;s
            read-side admin view alongside their own workspace.
          </p>
          <InviteLearners courseId={courseId} sections={courseSections} />
        </div>
      ) : view === "invited" ? (
        <>
          {/* The one filter: the silent. Everyone else on this tab already
              answered by enrolling. */}
          <div className="rosterfilter">
            <a
              className={filterNoResponse ? "on" : undefined}
              href={`${baseHref}&view=invited${filterNoResponse ? "" : "&filter=noresponse"}`}
            >
              {filterNoResponse ? "▣" : "▢"} no response yet <span className="pill loose">{noResponseCount}</span>
            </a>
          </div>
          {invitedPeople.length > 0 ? (
            <RosterTable people={invitedPeople} courseId={courseId} courseSections={courseSections} isAdmin={isAdmin} />
          ) : (
            <div className="card empty">
              <span className="cap">
                {filterNoResponse ? "No silence — everyone invited has signed in" : "Nobody has been invited yet"}
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          {enrolledCount > 0 ? (
            <RosterTable people={enrolled} courseId={courseId} courseSections={courseSections} isAdmin={isAdmin} />
          ) : (
            <div className="card empty">
              <span className="cap">
                {sectionName ? `Nobody enrolled in ${sectionName} yet` : "Nobody has signed in yet — see the Invited tab"}
              </span>
            </div>
          )}
          {isAdmin && enrolledCount > 0 && (
            <p className="hint" style={{ fontSize: "12.5px", marginTop: "10px" }}>
              Removing an enrolled learner ends their access to this course only — other courses are
              untouched, and their work is kept. Re-inviting them brings it all back.
            </p>
          )}
        </>
      )}
    </main>
  )
}
