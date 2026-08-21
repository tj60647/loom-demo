import { getRoster, getStaffViewer } from "@/actions/admin"
import { firstParam, getCourse, listSections, resolveSectionId } from "@/lib/courses"
import InviteLearners from "@/components/admin/InviteLearners"
import RosterTable from "@/components/admin/RosterTable"

type AdminPageSearchParams = {
  course?: string | string[]
  section?: string | string[]
  view?: string | string[]
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
  const pending = roster.filter((row) => row.status === "pending")
  const enrolled = roster.filter((row) => row.status !== "pending")
  const pendingCount = pending.length
  const enrolledCount = enrolled.length

  // Two tabs, one population each (TJ, 2026-08-21: "maybe tabs go here for
  // invited, enrolled" — they replaced the stacked folds). Enrolled leads:
  // it is the daily visit. The invite panel lives on the Invited tab, with
  // the people it produces. Plain links, so the view survives reload and
  // the back button, and the server component stays one.
  const view = firstParam(resolved.view) === "invited" ? "invited" : "enrolled"
  const tabHref = (v: string) =>
    `/admin?course=${encodeURIComponent(courseId)}${sectionId ? `&section=${encodeURIComponent(sectionId)}` : ""}&view=${v}`

  return (
    <main>
      {/* No h1: the Teaching nav's highlighted Roster tab already names the
          page (TJ, 2026-08-21). */}
      <div className="rostertabs">
        <a className={view === "enrolled" ? "on" : undefined} href={tabHref("enrolled")}>
          Enrolled <span className="pill loose">{enrolledCount}</span>
        </a>
        <a className={view === "invited" ? "on" : undefined} href={tabHref("invited")}>
          Invited <span className="pill loose">{pendingCount}</span>
        </a>
        <span className="rostertabsline">
          {course?.name}
          {sectionName ? ` · ${sectionName}` : " · all sections"}
        </span>
      </div>

      {view === "invited" ? (
        <>
          {isAdmin && (
            <details className="card invitefold" style={{ marginBottom: "24px" }}>
              <summary>
                <span className="tw">▸</span>
                <h2>Invite learners</h2>
              </summary>
              <p className="hint" style={{ marginTop: "10px" }}>
                Sign-in succeeds for anyone invited to or enrolled in a course. A learner joins this
                course the first time they sign in with the GitHub email you invite here, landing in
                whichever section you gave them — you can move them afterwards. An invitation
                addressed to the Faculty Section enrols as faculty: they get this course&apos;s
                read-side admin view alongside their own workspace.
              </p>
              <InviteLearners courseId={courseId} sections={courseSections} />
            </details>
          )}
          {pendingCount > 0 ? (
            <RosterTable people={pending} courseId={courseId} courseSections={courseSections} isAdmin={isAdmin} />
          ) : (
            <div className="card empty">
              <span className="cap">No open invitations — everyone invited has signed in</span>
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
