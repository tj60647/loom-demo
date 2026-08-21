"use client"

import { useMemo, useState } from "react"
import { addAllowedEmail, removeAllowedEmail, removeFromRoster, setMemberRole } from "@/actions/admin"
import { assignMemberSection } from "@/actions/courses"
import AutoSaveSelect from "@/components/admin/AutoSaveSelect"
import { useDialog } from "@/components/providers/DialogProvider"

/**
 * The roster as a sortable table (TJ, 2026-08-21: "sortable columns. show
 * roles for all. align columns"). One shared grid template lays the header
 * and every row, so the six columns — who | role | concepts | edges |
 * section | actions — agree to the pixel, and every row shows its role
 * (learner rows too, not only faculty; the tag-pushes-pills misalignment
 * was the complaint that forced role into a column of its own).
 *
 * A client component only for the sort state; every control still submits
 * the same server actions the server-rendered rows did. Sorting is
 * display-order alone — nothing here reads or widens data the page did not
 * already hold.
 */
export type RosterPerson = {
  email: string
  name: string | null
  userId: string | null
  status: string
  sectionId: string | null
  sectionName: string | null
  role: string
  conceptsCount: number
  edgesCount: number
}

type SortKey = "name" | "role" | "concepts" | "edges" | "section"

const NUMERIC: SortKey[] = ["concepts", "edges"]

export default function RosterTable({
  people,
  courseId,
  courseSections,
  isAdmin,
}: {
  people: RosterPerson[]
  courseId: string
  courseSections: { id: string; name: string }[]
  isAdmin: boolean
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [dir, setDir] = useState<"asc" | "desc">("asc")
  const { confirm } = useDialog()

  const sorted = useMemo(() => {
    const byName = (a: RosterPerson, b: RosterPerson) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email)
    const value: Record<SortKey, (p: RosterPerson) => string | number> = {
      name: (p) => (p.name ?? p.email).toLowerCase(),
      role: (p) => p.role,
      concepts: (p) => p.conceptsCount,
      edges: (p) => p.edgesCount,
      // "~" sorts unplaced people after every real section name.
      section: (p) => (p.sectionName ?? "~unassigned").toLowerCase(),
    }
    const get = value[sortKey]
    const flip = dir === "asc" ? 1 : -1
    return [...people].sort((a, b) => {
      const av = get(a)
      const bv = get(b)
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv))
      return cmp !== 0 ? cmp * flip : byName(a, b)
    })
  }, [people, sortKey, dir])

  const sortBy = (key: SortKey) => {
    if (key === sortKey) {
      setDir(dir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      // Counts read most usefully largest-first; text columns A-first.
      setDir(NUMERIC.includes(key) ? "desc" : "asc")
    }
  }

  const head = (key: SortKey, label: string) => (
    <button type="button" className={sortKey === key ? "on" : undefined} onClick={() => sortBy(key)}>
      {label}
      {sortKey === key ? (dir === "asc" ? " ▲" : " ▼") : null}
    </button>
  )

  return (
    <div className="card rosterlist" style={{ marginTop: "10px" }}>
      <div className="rosterhead">
        {head("name", "name")}
        <span className="rostercol">open loom</span>
        {head("concepts", "concepts")}
        {head("edges", "edges")}
        {head("section", "section")}
        {head("role", "role")}
        <span aria-hidden="true" />
      </div>

      {sorted.map((person) => (
        <div key={person.userId ?? person.email} className={`rosterrow${person.status === "pending" ? " pendingrow" : ""}`}>
          <div className="rosterwho">
            <span className="rostername">{person.name ?? person.email}</span>
            {person.name ? <span className="rosteremail">{person.email}</span> : null}
          </div>

          <div>
            {person.userId ? (
              /* The roster's one door into a student's work, right beside
                 the name (TJ, 2026-08-21 column order). Enters Open Loom
                 (src/lib/viewUser.ts) — a plain anchor: the enter route
                 needs a document navigation so the providers remount
                 reading the new owner. */
              <a
                href={`/api/view-user/enter?user=${encodeURIComponent(person.userId)}`}
                className="btn mini compact openloom"
                data-tip="their whole loom, read-only — the app navigates their work; exit from the float"
              >
                Open Loom
              </a>
            ) : (
              <span className="rosterdash" title="no loom until they sign in">—</span>
            )}
          </div>

          <div>
            {person.status === "pending" ? (
              <span className="rosterdash">—</span>
            ) : (
              <span className="pill beaten">{person.conceptsCount}</span>
            )}
          </div>
          <div>
            {person.status === "pending" ? (
              <span className="rosterdash">—</span>
            ) : (
              <span className="pill loose">{person.edgesCount}</span>
            )}
          </div>

          {/* Two different writes behind one control, and the pick saves on
              change (SectionSelect). Once someone exists, their section
              lives on the membership; before that it lives on the
              invitation, so placing a pending learner is an upsert of the
              invitation and they land there on first sign-in. The empty div
              when the form cannot render holds the grid track, so columns
              stay aligned for a faculty (read-only) viewer too. */}
          {isAdmin && courseSections.length > 0 ? (
            <form action={person.userId ? assignMemberSection : addAllowedEmail}>
              <input type="hidden" name="courseId" value={courseId} />
              {person.userId ? (
                <input type="hidden" name="userId" value={person.userId} />
              ) : (
                <input type="hidden" name="email" value={person.email} />
              )}
              <AutoSaveSelect
                name="sectionId"
                defaultValue={person.sectionId ?? ""}
                ariaLabel={`Section for ${person.name ?? person.email}`}
                emptyLabel="No section"
                options={courseSections.map((s) => ({ value: s.id, label: s.name }))}
              />
            </form>
          ) : (
            <div aria-hidden="true">
              {person.sectionName ? <span className="cap" style={{ textTransform: "none" }}>{person.sectionName}</span> : null}
            </div>
          )}

          <div>
            {person.status === "pending" ? (
              <span className="pill loose" title="invited — has not signed in, so has no loom yet">
                invited
              </span>
            ) : isAdmin && person.userId ? (
              /* The role IS the control (TJ, 2026-08-21: "just a set role
                 dropdown" — the toggle button column was the long way round).
                 Reversible by the same select, so it saves on change like the
                 section pick. Ruling 18 still holds server-side: promotion
                 homes them in the Faculty Section, demotion returns them to
                 unassigned. */
              <form action={setMemberRole}>
                <input type="hidden" name="courseId" value={courseId} />
                <input type="hidden" name="userId" value={person.userId} />
                <AutoSaveSelect
                  name="role"
                  defaultValue={person.role}
                  ariaLabel={`Role for ${person.name ?? person.email}`}
                  title="faculty holds this course's read-side admin view; demotion returns them to unassigned for re-placement"
                  options={[
                    { value: "LEARNER", label: "learner" },
                    { value: "FACULTY", label: "faculty" },
                  ]}
                />
              </form>
            ) : person.role === "FACULTY" ? (
              <span className="pill" title="holds this course's read-side admin view (ruling 18)">
                faculty
              </span>
            ) : (
              <span className="pill loose">learner</span>
            )}
          </div>

          <div className="rosteracts">
            {person.userId && isAdmin ? (
              /* Removal confirms first (TJ, 2026-08-21) — the one roster
                 write whose undo is a fresh invitation rather than the same
                 control. The dialog's body carries what the page's hint
                 paragraph used to say (it read as a lost tooltip under the
                 table — TJ, same day); the data-tip is the glance version.
                 FormData is read BEFORE the await: the form element nulls
                 off the event once the dialog opens. */
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  const formData = new FormData(event.currentTarget)
                  void confirm({
                    title: `Remove ${person.name ?? person.email} from the course?`,
                    body: "Their access to this course ends — other courses are untouched, and their work is kept. Re-inviting them brings it all back.",
                    confirmLabel: "Remove",
                    danger: true,
                  }).then((ok) => { if (ok) return removeFromRoster(formData) })
                }}
              >
                <input type="hidden" name="courseId" value={courseId} />
                <input type="hidden" name="userId" value={person.userId} />
                <button
                  className="btn ghost mini compact"
                  type="submit"
                  aria-label={`Remove ${person.name ?? person.email} from course`}
                  data-tip="access to this course ends; their work is kept — re-inviting brings it back"
                >
                  Remove
                </button>
              </form>
            ) : !person.userId && isAdmin ? (
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
      ))}
    </div>
  )
}
