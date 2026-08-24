import { getRoster, getStaffViewer } from "@/actions/admin"
import { firstParam, getCourse, listSections, resolveSectionId } from "@/lib/courses"
import InviteLearners from "@/components/admin/InviteLearners"
import RosterTable from "@/components/admin/RosterTable"
import RosterDownload from "@/components/admin/RosterDownload"
import RosterFind from "@/components/admin/RosterFind"

type AdminPageSearchParams = {
  course?: string | string[]
  section?: string | string[]
  view?: string | string[]
  filter?: string | string[]
  role?: string | string[]
  find?: string | string[]
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
  /**
   * FIND SOMEBODY BY EMAIL (TJ, 2026-08-24: "there should be a find student by
   * email where we put in an email and the student row shows up").
   *
   * The question this answers is "is this address on the roster, and in what
   * state" — the one a professor has when a student writes to say they cannot
   * sign in. So a find CROSSES THE TABS: an address may be invited, enrolled,
   * or invited-and-still-silent, and having to guess which tab to look on is
   * the whole difficulty. It also ignores the section picker, for the same
   * reason — you are asking about a person, not about a section.
   */
  const find = (firstParam(resolved.find) ?? "").trim().toLowerCase()
  const [course, courseSections, courseRoster] = await Promise.all([
    getCourse(courseId),
    listSections(courseId),
    /**
     * THE WHOLE COURSE, ALWAYS — every section, so the find in the browser has
     * everything it could be asked for and never needs a request of its own.
     * The section picker then narrows in memory, one line below.
     *
     * This is the same row filter `getRoster` would have applied: enrolled
     * rows come from `getClassData`, which filters on
     * `courseMemberships.sectionId` (src/actions/admin.ts:135), and pending
     * invitations on the section the invitation named — one rule, and every
     * row already carries `sectionId`.
     */
    getRoster(courseId, null),
  ])
  const roster = sectionId
    ? courseRoster.filter((row) => row.sectionId === sectionId)
    : courseRoster

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
  const ROLE_CHIPS = [
    { value: "learner", label: "learners" },
    { value: "faculty", label: "faculty" },
  ] as const
  /**
   * A SET, NOT A CHOICE (TJ, 2026-08-24: "we should be able to pick more than
   * one of these"). The chips were already drawn as checkboxes — ▢ and ▣ —
   * so the control promised a set and behaved as a radio group. This makes it
   * mean what it looks like.
   *
   * Comma-separated in the URL, so a narrowed roster survives a reload and can
   * be pasted to a colleague — the same reason the tabs above are links.
   *
   * THE TWO ROLES ARE NAMED, not derived from the rows, because those are the
   * two `setMemberRole` will write (src/actions/admin.ts:106) and the two TJ
   * asked for. A third does exist: `enrolInvitedCourses` gives an admin who
   * joins by invitation INSTRUCTOR (src/lib/auth.ts:289). That is why
   * "everyone" stays rather than being spelled "both chips ticked" — with
   * both ticked an INSTRUCTOR is filtered OUT, and only "everyone" shows the
   * whole enrolment. Unknown values in the URL are dropped rather than
   * narrowing to nothing.
   */
  const roleFilter = new Set(
    (firstParam(resolved.role) ?? "")
      .toLowerCase()
      .split(",")
      .map((part) => part.trim())
      .filter((part) => ROLE_CHIPS.some((chip) => chip.value === part))
  )
  const roleHref = (roles: Set<string>) => {
    const value = [...roles].sort().join(",")
    return `${baseHref}&view=enrolled${value ? `&role=${value}` : ""}`
  }
  const baseHref = `/admin?course=${encodeURIComponent(courseId)}${sectionId ? `&section=${encodeURIComponent(sectionId)}` : ""}`
  const invitedPeople = filterNoResponse ? noResponse : invitedAll

  const enrolledPeople = roleFilter.size
    ? enrolled.filter((row) => roleFilter.has((row.role ?? "").toLowerCase()))
    : enrolled

  // What the filters narrowed to, said once — the table renders it, the
  // download names it in the file, and neither can drift from the other.
  const shown = view === "invited" ? invitedPeople : enrolledPeople
  const scope = [
    view,
    view === "invited" && filterNoResponse ? "no_response" : "",
    view === "enrolled" && roleFilter.size ? [...roleFilter].sort().join("_") : "",
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

      <RosterFind
        all={courseRoster}
        initial={find}
        courseId={courseId}
        courseSections={courseSections}
        isAdmin={isAdmin}
        courseName={course?.name}
      >
      {      view === "invite" ? (
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
            {/* "Everyone" is the reset: it clears the set rather than being a
                third value in it. Ticked exactly when nothing else is. */}
            <a className={roleFilter.size === 0 ? "on" : undefined} href={roleHref(new Set())}>
              {roleFilter.size === 0 ? "▣" : "▢"} everyone <span className="pill loose">{enrolledCount}</span>
            </a>
            {ROLE_CHIPS.map(({ value, label }) => {
              const picked = roleFilter.has(value)
              // Each chip's link carries the set it WOULD produce — ticking
              // adds, unticking removes — so one click changes one thing and
              // the URL always states the whole filter.
              const next = new Set(roleFilter)
              if (picked) next.delete(value)
              else next.add(value)
              return (
                <a key={value} className={picked ? "on" : undefined} href={roleHref(next)}>
                  {picked ? "▣" : "▢"} {label}{" "}
                  <span className="pill loose">
                    {enrolled.filter((row) => (row.role ?? "").toLowerCase() === value).length}
                  </span>
                </a>
              )
            })}
            <RosterDownload people={enrolledPeople} courseName={course?.name} scope={scope} />
          </div>
          {enrolledPeople.length > 0 ? (
            <RosterTable people={enrolledPeople} courseId={courseId} courseSections={courseSections} isAdmin={isAdmin} />
          ) : (
            <div className="card empty">
              <span className="cap">
                {roleFilter.size
                  ? `Nobody enrolled${sectionName ? ` in ${sectionName}` : ""} is ${[...roleFilter].sort().join(" or ")}`
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
      </RosterFind>
    </main>
  )
}
