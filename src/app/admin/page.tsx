import { addAllowedEmail, getRoster, getStaffViewer, removeAllowedEmail, removeFromRoster, setMemberRole } from "@/actions/admin"
import { assignMemberSection } from "@/actions/courses"
import { firstParam, getCourse, listSections, resolveSectionId } from "@/lib/courses"
import InviteLearners from "@/components/admin/InviteLearners"
import SectionSelect from "@/components/admin/SectionSelect"

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
  // Two panels, one population each (TJ, 2026-08-20): the invited who have
  // not signed in, then the enrolled. The row markup stays shared — a row
  // knows which controls it carries from its own status, as before.
  const pending = roster.filter((row) => row.status === "pending")
  const enrolled = roster.filter((row) => row.status !== "pending")
  const pendingCount = pending.length
  const enrolledCount = enrolled.length

  const rosterCard = (person: (typeof roster)[number]) => (
    <div key={person.userId ?? person.email} className={`card rostercard${person.status === "pending" ? " pending" : ""}`}>
      <div className="rcardhead">
        <div className="rosterwho">
          <span className="rostername">{person.name ?? person.email}</span>
          {person.name ? <span className="rosteremail">{person.email}</span> : null}
        </div>
        {person.status === "pending" ? (
          <span className="pill loose" title="invited — has not signed in, so has no loom yet">
            not signed in yet
          </span>
        ) : person.role === "FACULTY" ? (
          <span className="pill" title="holds this course's read-side admin view (ruling 18)">
            faculty
          </span>
        ) : null}
      </div>

      {person.status !== "pending" && (
        <div className="rosterpills">
          <span className="pill beaten">{person.conceptsCount} concepts</span>
          <span className="pill loose">{person.edgesCount} edges</span>
        </div>
      )}

      <div className="rcardacts">
        {/* Two different writes behind one control, and the pick saves on
            change (SectionSelect). Once someone exists, their section lives
            on the membership; before that it lives on the invitation, so
            placing a pending learner is an upsert of the invitation and
            they land there on first sign-in. */}
        {isAdmin && courseSections.length > 0 ? (
          <form className="sectionpick" action={person.userId ? assignMemberSection : addAllowedEmail}>
            <input type="hidden" name="courseId" value={courseId} />
            {person.userId ? (
              <input type="hidden" name="userId" value={person.userId} />
            ) : (
              <input type="hidden" name="email" value={person.email} />
            )}
            <SectionSelect
              name="sectionId"
              defaultValue={person.sectionId ?? ""}
              ariaLabel={`Section for ${person.name ?? person.email}`}
              emptyLabel="No section"
              options={courseSections}
            />
          </form>
        ) : null}

        {person.userId ? (
          <>
            {/* Enters Open Loom (src/lib/viewUser.ts): the student's FULL
                loom, read-only, navigated by the app itself — not the old
                summary page, which remains routable at /admin/user/[id]. A
                plain anchor: the enter route needs a document navigation so
                the providers remount reading the new owner. */}
            <a
              href={`/api/view-user/enter?user=${encodeURIComponent(person.userId ?? "")}`}
              className="btn mini compact"
              data-tip="their whole loom, read-only — the app navigates their work; exit from the floating Teaching menu"
            >
              Open Loom
            </a>
            {isAdmin && (
              <>
                {/* One reversible toggle (ruling 18): promotion homes
                    them in the Faculty Section; demotion returns them
                    to unassigned for deliberate re-placement. */}
                <form action={setMemberRole}>
                  <input type="hidden" name="courseId" value={courseId} />
                  <input type="hidden" name="userId" value={person.userId} />
                  <input type="hidden" name="role" value={person.role === "FACULTY" ? "LEARNER" : "FACULTY"} />
                  <button
                    className="btn ghost mini compact"
                    type="submit"
                    data-tip={person.role === "FACULTY"
                      ? "back to a learner's view — their section resets to unassigned"
                      : "grants this course's read-side admin view; their own workspace is untouched"}
                  >
                    {person.role === "FACULTY" ? "Return to learner" : "Make faculty"}
                  </button>
                </form>
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
            )}
          </>
        ) : isAdmin ? (
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
        ) : null}
      </div>
    </div>
  )

  return (
    <main>
      <h1>Roster</h1>
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
              <div className="rostergrid">{pending.map(rosterCard)}</div>
            </details>
          )}

          <details className="invitefold" open>
            <summary>
              <span className="tw">▸</span>
              <h2>Enrolled</h2>
              <span className="pill loose">{enrolledCount}</span>
            </summary>
            {enrolledCount > 0 ? (
              <div className="rostergrid">{enrolled.map(rosterCard)}</div>
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
