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
  conceptsEvidenced: number
  edgesCount: number
  edgesDescribed: number
  clothsCount: number
  clothNames: string[]
  /** When they were asked, and when they answered. Either may be null. */
  invitedAt: Date | string | null
  acceptedAt: Date | string | null
}

type SortKey = "name" | "email" | "role" | "cloths" | "concepts" | "edges" | "section" | "invited" | "accepted"

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * What each stat is made of, as a sentence.
 *
 * A sentence and not a list because `.tiplayer` is `white-space:normal` at
 * 240px (globals.css) — a newline would render as a space, so the breakdown
 * is written the way every other tip in the app is written, separated by ·.
 *
 * These strings are also the pills' aria-labels, which is why each one names
 * its own subject ("3 cloths — …") rather than assuming the column heading:
 * a screen reader reaches the pill, not the header above it.
 */
function clothsTip(p: RosterPerson): string {
  if (p.clothsCount === 0) return "no cloths yet — a cloth is one reading's work, woven"
  // Named, up to four: past that the bubble becomes a list nobody reads at a
  // glance, and the count itself is the answer.
  const shown = p.clothNames.slice(0, 4).join(", ")
  const rest = p.clothNames.length - 4
  return `${plural(p.clothsCount, "cloth")} — ${shown}${rest > 0 ? `, and ${rest} more` : ""}`
}

function conceptsTip(p: RosterPerson): string {
  if (p.conceptsCount === 0) return "no concepts yet"
  const bare = p.conceptsCount - p.conceptsEvidenced
  return `${plural(p.conceptsCount, "concept")} — ${p.conceptsEvidenced} with a passage behind ${
    p.conceptsEvidenced === 1 ? "it" : "them"
  }, ${bare} not yet evidenced`
}

function threadsTip(p: RosterPerson): string {
  if (p.edgesCount === 0) return "no threads yet"
  const unsaid = p.edgesCount - p.edgesDescribed
  return `${plural(p.edgesCount, "thread")} — ${p.edgesDescribed} with a description, ${unsaid} drawn but unsaid`
}

const NUMERIC: SortKey[] = ["cloths", "concepts", "edges", "invited", "accepted"]

/**
 * A date small enough for a 58px column: day and month, no year, no time.
 *
 * The year is dropped because a roster is read within one term — and where it
 * is not, the full stamp is one hover away in the tip rather than four
 * characters wider on every row, on every row that has a date at all.
 *
 * A route through the app can hand these over as Date or as an ISO string:
 * `getRoster` returns Date objects, but this is a client component and
 * anything that crossed a JSON boundary arrives as a string.
 */
const asDate = (value: Date | string | null): Date | null => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
const stamp = (value: Date | string | null): string => {
  const date = asDate(value)
  return date ? `${date.getDate()}/${date.getMonth() + 1}` : "—"
}
const stampTip = (value: Date | string | null, said: string): string => {
  const date = asDate(value)
  return date ? `${said} ${date.toLocaleDateString()}` : `not ${said.replace(/ed$/, "ed")} — no date on record`
}
/** Sortable as a number; the undated sort last either way. */
const stampOrder = (value: Date | string | null): number => asDate(value)?.getTime() ?? 0

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
      /**
       * BY ADDRESS (TJ, 2026-08-26: "we need sort by email on the roster").
       * The column already shows both — the name in ink, the address under it
       * — so it sorts by either, and this is the half a professor has in hand
       * when a student writes in. Lowercased for the reason the student picker
       * is: the database collates in C.UTF-8, where every capital sorts before
       * every lowercase letter, so "Zoe@" would come before "adam@".
       */
      email: (p) => (p.email ?? "").toLowerCase(),
      role: (p) => p.role,
      cloths: (p) => p.clothsCount,
      concepts: (p) => p.conceptsCount,
      edges: (p) => p.edgesCount,
      // "~" sorts unplaced people after every real section name.
      section: (p) => (p.sectionName ?? "~unassigned").toLowerCase(),
      invited: (p) => stampOrder(p.invitedAt),
      accepted: (p) => stampOrder(p.acceptedAt),
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
    <button
      type="button"
      className={sortKey === key ? "on" : undefined}
      onClick={() => sortBy(key)}
      /* The tip says what the NEXT click does, not what the column is — the
         header already says that, and the arrow only says where you are. */
      data-tip={
        sortKey === key
          ? `sort by ${label}, ${dir === "asc" ? "descending" : "ascending"}`
          : `sort by ${label}`
      }
    >
      {label}
      {sortKey === key ? (dir === "asc" ? " ▲" : " ▼") : null}
    </button>
  )

  return (
    <div className="card rosterlist" style={{ marginTop: "10px" }}>
      <div className="rosterhead">
        {/* One column, two orders. The cell carries the name over the
            address, so it offers a sort for each rather than making the
            reader guess which one "name" means. */}
        <span className="rosterheadpair">
          {head("name", "name")}
          <span aria-hidden="true">·</span>
          {head("email", "email")}
        </span>
        <span className="rostercol">open loom</span>
        {head("cloths", "cloths")}
        {head("concepts", "concepts")}
        {head("edges", "threads")}
        {head("invited", "invited")}
        {head("accepted", "accepted")}
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
                 reading the new owner. Carries THIS roster's course, so the
                 loom that opens is the one this table was showing counts
                 for — not whichever course the student last selected. */
              <a
                href={`/api/view-user/enter?user=${encodeURIComponent(person.userId)}&course=${encodeURIComponent(courseId)}`}
                className="btn mini compact openloom"
                data-tip="their whole loom, read-only — the app navigates their work; exit from the float"
              >
                Open Loom
              </a>
            ) : (
              <span className="rosterdash" title="no loom until they sign in">—</span>
            )}
          </div>

          {/* Each stat discloses what it is made of on hover (TJ,
              2026-08-22: "the stat pills need mouseover with break down").
              The breakdown rides in BOTH data-tip and aria-label: a tip is
              decorative, aria-hidden and mouse-only by construction
              (TipLayer.tsx), so meaning that lives only there reaches
              nobody using a keyboard or a screen reader. */}
          <div>
            {person.status === "pending" ? (
              <span className="rosterdash">—</span>
            ) : (
              <span className="pill beaten" data-tip={clothsTip(person)} aria-label={clothsTip(person)}>
                {person.clothsCount}
              </span>
            )}
          </div>
          <div>
            {person.status === "pending" ? (
              <span className="rosterdash">—</span>
            ) : (
              <span className="pill beaten" data-tip={conceptsTip(person)} aria-label={conceptsTip(person)}>
                {person.conceptsCount}
              </span>
            )}
          </div>
          <div>
            {person.status === "pending" ? (
              <span className="rosterdash">—</span>
            ) : (
              <span className="pill loose" data-tip={threadsTip(person)} aria-label={threadsTip(person)}>
                {person.edgesCount}
              </span>
            )}
          </div>

          {/*
            WHEN THEY WERE ASKED, AND WHEN THEY ANSWERED (TJ, 2026-08-24).
            Day and month only — the full date rides in the tip and the
            aria-label, for the reason the stat pills give above: a tip is
            decorative and mouse-only by construction (TipLayer.tsx), so
            meaning that lives only there reaches nobody on a keyboard.

            An em dash where there is no date, which is a real state rather
            than missing data: no invitation on record for somebody enrolled,
            and no acceptance for somebody who has not signed in.
          */}
          <div>
            <span className="rosterstamp" data-tip={stampTip(person.invitedAt, "invited")} aria-label={stampTip(person.invitedAt, "invited")}>
              {stamp(person.invitedAt)}
            </span>
          </div>
          <div>
            <span className="rosterstamp" data-tip={stampTip(person.acceptedAt, "accepted")} aria-label={stampTip(person.acceptedAt, "accepted")}>
              {stamp(person.acceptedAt)}
            </span>
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
                  data-tip="cancel this invitation — nobody has signed in on it, so there is no work to keep"
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
