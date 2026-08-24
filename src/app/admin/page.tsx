import { getRoster, getStaffViewer } from "@/actions/admin"
import { firstParam, getCourse, listSections, resolveSectionId } from "@/lib/courses"
import InviteLearners from "@/components/admin/InviteLearners"
import RosterTable from "@/components/admin/RosterTable"
import RosterDownload from "@/components/admin/RosterDownload"

type AdminPageSearchParams = {
  course?: string | string[]
  section?: string | string[]
  view?: string | string[]
  filter?: string | string[]
  role?: string | string[]
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
  /**
   * THE ROLE FILTER (TJ, 2026-08-24: "we should be able to filter by role and
   * section"). Section already narrows the whole page through getRoster; role
   * is the other half and had no control at all — it was a per-row select and
   * nothing more, so "mail the faculty" or "mail only learners" meant reading
   * the column and copying by hand.
   *
   * Enrolled only, and that is not an oversight: a pending invitation has no
   * role yet. It gets one when the person first signs in, from the section the
   * invitation named (src/lib/auth.ts, enrolInvitedCourses), so filtering the
   * Invited tab by role would filter on a value that does not exist.
   */
  const roleParam = (firstParam(resolved.role) ?? "").toLowerCase()
  const roleFilter = roleParam === "learner" || roleParam === "faculty" ? roleParam : null
  const baseHref = `/admin?course=${encodeURIComponent(courseId)}${sectionId ? `&section=${encodeURIComponent(sectionId)}` : ""}`
  const invitedPeople = filterNoResponse ? noResponse : invitedAll
  const enrolledPeople = roleFilter
    ? enrolled.filter((row) => (row.role ?? "").toLowerCase() === roleFilter)
    : enrolled

  // What the filters narrowed to, said once — the table renders it, the
  // download names it in the file, and neither can drift from the other.
  const shown = view === "invited" ? invitedPeople : enrolledPeople
  const scope = [
    view,
    view === "invited" && filterNoResponse ? "no_response" : "",
    view === "enrolled" && roleFilter ? roleFilter : "",
    sectionName ?? "",
  ]
    .filter(Boolean)
    .join(" ")

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
            <RosterDownload people={invitedPeople} courseName={course?.name} scope={scope} />
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
          {/* Role, alongside the section picker in the strip above. Links, not
              a select, for the same reason the tabs are links: the view
              survives a reload and the back button, and the page stays one
              server component. */}
          <div className="rosterfilter">
            {([
              ["all", "everyone", null],
              ["learner", "learners", "learner"],
              ["faculty", "faculty", "faculty"],
            ] as const).map(([key, label, value]) => (
              <a
                key={key}
                className={roleFilter === value ? "on" : undefined}
                href={`${baseHref}&view=enrolled${value ? `&role=${value}` : ""}`}
              >
                {roleFilter === value ? "▣" : "▢"} {label}{" "}
                <span className="pill loose">
                  {value ? enrolled.filter((row) => (row.role ?? "").toLowerCase() === value).length : enrolledCount}
                </span>
              </a>
            ))}
            <RosterDownload people={enrolledPeople} courseName={course?.name} scope={scope} />
          </div>
          {enrolledPeople.length > 0 ? (
            <RosterTable people={enrolledPeople} courseId={courseId} courseSections={courseSections} isAdmin={isAdmin} />
          ) : (
            <div className="card empty">
              <span className="cap">
                {roleFilter
                  ? `Nobody enrolled${sectionName ? ` in ${sectionName}` : ""} holds the ${roleFilter} role`
                  : sectionName
                    ? `Nobody enrolled in ${sectionName} yet`
                    : "Nobody has signed in yet — see the Invited tab"}
              </span>
            </div>
          )}
          {/* The removal explainer left this spot (TJ, 2026-08-21: "feels
              like a tooltip, it gets lost in the footer") — it lives in the
              Remove confirm's body now, read at the moment of decision, with
              a data-tip on the button for the glance. */}
        </>
      )}
    </main>
  )
}
