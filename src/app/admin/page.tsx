import { getRoster, getStaffViewer } from "@/actions/admin"
import { firstParam, getCourse, listSections, resolveSectionId } from "@/lib/courses"
import InviteLearners from "@/components/admin/InviteLearners"
import RosterTable from "@/components/admin/RosterTable"

type AdminPageSearchParams = {
  course?: string | string[]
  section?: string | string[]
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
  // Two panels, one population each (TJ, 2026-08-20): the invited who have
  // not signed in, then the enrolled. Each panel is a sortable RosterTable —
  // the rows and their controls live there now.
  const pending = roster.filter((row) => row.status === "pending")
  const enrolled = roster.filter((row) => row.status !== "pending")
  const pendingCount = pending.length
  const enrolledCount = enrolled.length

  return (
    <main>
      {/* No h1: the Teaching nav's highlighted Roster tab already names the
          page (TJ, 2026-08-21) — the course line leads instead. */}
      <p style={{ marginBottom: "20px" }}>
        {course?.name}
        {sectionName ? ` · ${sectionName}` : " · all sections"} —{" "}
        <b>{enrolledCount}</b> enrolled
        {pendingCount > 0 ? <> · <b>{pendingCount}</b> invited, not signed in yet</> : null}.
      </p>

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

      {roster.length === 0 ? (
        <div className="card empty">
          <span className="cap">
            {sectionName ? `Nobody on the roster for ${sectionName} yet` : "Nobody on the roster yet"}
          </span>
        </div>
      ) : (
        <>
          {/* Both folds share the invite fold's disclosure idiom (.invitefold
              summary + .tw), without its card wrapper — the list keeps its own
              flush card. Open by default: collapsing is for tucking a settled
              panel away, not for hiding the roster on arrival. The count pill
              is what keeps a collapsed panel legible. */}
          {pendingCount > 0 && (
            <details className="invitefold" open style={{ marginBottom: "24px" }}>
              <summary>
                <span className="tw">▸</span>
                <h2>Invited — not signed in yet</h2>
                <span className="pill loose">{pendingCount}</span>
              </summary>
              <RosterTable people={pending} courseId={courseId} courseSections={courseSections} isAdmin={isAdmin} />
            </details>
          )}

          <details className="invitefold" open>
            <summary>
              <span className="tw">▸</span>
              <h2>Enrolled</h2>
              <span className="pill loose">{enrolledCount}</span>
            </summary>
            {enrolledCount > 0 ? (
              <RosterTable people={enrolled} courseId={courseId} courseSections={courseSections} isAdmin={isAdmin} />
            ) : (
              <div className="card empty" style={{ marginTop: "10px" }}>
                <span className="cap">Nobody has signed in yet — invitations above are waiting</span>
              </div>
            )}
          </details>

          {isAdmin && (
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
