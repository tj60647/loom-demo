"use client"

// The journey: one bar right under the header on every learner surface, so the
// whole arc is always visible wherever you stand in it.
//
// A station you can work at HERE is a button (a workbench tab); every other
// station is a link to where it lives.
//
// 2026-08-08 (TJ): 00 Reading and 01 Open merged into a single **Reading**
// station — the text and your captures are one place (model §3 tab 2), so
// station 00 is now always the Library. 05 **Weave is hidden** pending a
// decision on what it becomes (the refactor spec files it as the future Quilt
// space, ruling 19); the `/weave` route still works and 06 Keep links to it,
// so no whole-weave work is stranded. Unhide by flipping `hidden` below.
//
// Step numbers are DERIVED from the visible stations, so hiding or restoring
// one renumbers the bar instead of leaving a gap that reads as a bug. That is
// also why student copy should name a station rather than number it.

import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useReadings } from "@/components/providers/ReadingsProvider"

export type Station = "readings" | "open" | "throw" | "read" | "map" | "weave" | "keep"

const STATIONS: { key: Station; label: string; hidden?: boolean }[] = [
  { key: "readings", label: "Library" },
  { key: "open", label: "Reading" },
  { key: "throw", label: "Linking" },
  // Knowledge Graph before Vocabulary (TJ, 2026-08-08): you lay the graph out
  // and read it, and the vocabulary you have collected is what you check
  // afterwards. Keys stay legacy — `read` is Vocabulary, `map` is Knowledge
  // Graph, and `?tab=` keeps speaking them (refactor spec §F).
  { key: "map", label: "Knowledge Graph" },
  { key: "read", label: "Vocabulary" },
  { key: "weave", label: "Weave", hidden: true },
  { key: "keep", label: "Keep" },
]

/** The visible stations, each with the number it shows. */
export const VISIBLE_STATIONS = STATIONS.filter((s) => !s.hidden).map((s, i) => ({
  ...s,
  step: `${String(i).padStart(2, "0")} —`,
}))

/** The number a station displays, e.g. "04" for Knowledge Graph. Exported so
 *  the workbench footer cannot drift from the bar above it. */
export function stationNumber(key: Station): string {
  const found = VISIBLE_STATIONS.findIndex((s) => s.key === key)
  return found < 0 ? "" : String(found).padStart(2, "0")
}

const DEFAULT_HREF: Record<Station, string> = {
  readings: "/",
  open: "/",
  throw: "/weave?tab=throw",
  read: "/weave?tab=read",
  map: "/weave?tab=map",
  weave: "/weave",
  keep: "/keep",
}

/**
 * Stations that only exist inside a reading (TJ, 2026-08-09).
 *
 * Their DEFAULT_HREF above points at `/weave` — the whole-weave workbench —
 * which is not supported for v1. So rather than carrying a student somewhere
 * that is not finished, these render **greyed and inert** wherever they are not
 * a tab you can work at right here: on the Library and on Keep, both of which
 * are about every reading at once and neither of which has a text to link in.
 *
 * Inside a reading all three are handlers, so this never fires there.
 *
 * Deliberately keyed off "is there a handler" rather than off the route, so a
 * surface that gains one of these tabs gets a live station for free and nobody
 * has to remember to update a list.
 *
 * NOTE: 04 Vocabulary is UNSCOPED in the model — the User's holdings across
 * every reading — so it is the one here that would be legitimate outside a
 * text. It is greyed anyway because the only surface that renders it outside a
 * reading is the whole-weave workbench. When `/weave` is ruled on, this set is
 * where that decision lands.
 */
const READING_ONLY: ReadonlySet<Station> = new Set<Station>(["throw", "map", "read"])

const TIP: Partial<Record<Station, string>> = {
  open: "reading and capture happen together — pick a text first",
  weave: "the big picture — every reading at once",
}

/**
 * The staff group, drawn to the RIGHT of the journey and in its own colour
 * (TJ, 2026-08-09: "in faculty or admin mode, menu items should appear to the
 * right of this instead of an administration panel").
 *
 * One bar, not two. That is the model's own account of the role: faculty
 * "reach [the overlays] through their *own* learner surfaces … which they hold
 * alongside the faculty view, **capabilities being additive**" (model
 * §Overlays). Two separate navigations said the opposite — that you were
 * either a student or an administrator and had to leave one to be the other.
 *
 * Graded, because admin holds more than faculty (TJ, same message). Faculty get
 * the read-side of their own courses; the library and course managers are write
 * surfaces and stay admin's — the same split `/admin/layout.tsx` gates and
 * `AdminNav` used to draw. This decides what is DRAWN, never what may be read:
 * every page behind these re-checks for itself.
 *
 * Unnumbered on purpose. The numbers belong to the journey — a sequence a
 * student walks — and these are not steps in it.
 */
const STAFF_ITEMS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/admin", label: "Roster" },
  { href: "/admin/aggregate", label: "Cohort Graph" },
  { href: "/admin/library", label: "Readings", adminOnly: true },
  { href: "/admin/courses", label: "Courses", adminOnly: true },
]

/** Why a station is greyed. Says what to do, never what went wrong. */
const OFF_TIP = "open a reading first — this works inside a text"

/**
 * The staff group, split out for one mechanical reason: it is the only part of
 * this bar that reads search params, and `useSearchParams` forces the whole
 * route to be client-rendered unless it sits under a Suspense boundary. `/keep`
 * is statically prerendered, and putting this inline took the build down with
 * "useSearchParams() should be wrapped in a suspense boundary at page /keep".
 */
function StaffGroup() {
  const { course } = useReadings()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const staff = course?.isStaff
    ? STAFF_ITEMS.filter((i) => !i.adminOnly || course.isAdmin)
    : []
  if (staff.length === 0) return null

  // Carry the course (and section) the viewer is already looking at, so moving
  // between staff surfaces does not silently reset to "the first course".
  // On an /admin page that is the URL's own param; on a learner surface it is
  // the course whose syllabus is on screen.
  const staffHref = (href: string) => {
    const courseId = searchParams.get("course") ?? course?.id ?? null
    const sectionId = searchParams.get("section")
    const params = new URLSearchParams()
    if (courseId) params.set("course", courseId)
    if (sectionId) params.set("section", sectionId)
    const q = params.toString()
    return q ? `${href}?${q}` : href
  }

  return (
    <div className="staffgroup" aria-label="Teaching">
      {staff.map(({ href, label }) => (
        <Link
          key={href}
          href={staffHref(href)}
          className={`station staff${pathname === href ? " active" : ""}`}
          aria-current={pathname === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}

export default function JourneyNav({
  active,
  onStation = {},
  labels = {},
}: {
  active: Station | null
  /** Stations handled in place (workbench tabs) — rendered as buttons. */
  onStation?: Partial<Record<Station, () => void>>
  /** Per-context label overrides, e.g. "Reading" (this text) inside one. */
  labels?: Partial<Record<Station, string>>
}) {
  return (
    <nav aria-label="The journey">
      {VISIBLE_STATIONS.map(({ key, step, label }) => {
        const handler = onStation[key]
        const text = labels[key] ?? label
        const activeCls = active === key ? " active" : ""
        if (handler) {
          return (
            <button key={key} className={activeCls.trim()} onClick={handler}>
              <span className="step">{step}</span>
              {text}
            </button>
          )
        }
        // Nowhere to go: still drawn, still numbered, still part of the arc —
        // the journey is meant to be visible whole, and a station that
        // disappeared off the Library would misreport what the work is. A
        // <span>, not a disabled <button>: it is not a control that happens to
        // be off, it is a place you are not standing near.
        if (READING_ONLY.has(key)) {
          return (
            // aria-label, not just data-tip: the tip bubble is aria-hidden and
            // never appears on touch or keyboard focus (globals.css), and
            // aria-disabled on a span with no role is ignored outright — so
            // without this the word is simply grey and unexplained.
            <span key={key} className="station off" aria-label={`${text} — ${OFF_TIP}`} data-tip={OFF_TIP}>
              <span className="step">{step}</span>
              {text}
            </span>
          )
        }
        return (
          <Link key={key} href={DEFAULT_HREF[key]} className={`station${activeCls}`} data-tip={TIP[key]}>
            <span className="step">{step}</span>
            {text}
          </Link>
        )
      })}

      {/* fallback={null}: a student never sees this group at all, so the
          honest empty state during hydration is nothing, not a placeholder. */}
      <Suspense fallback={null}>
        <StaffGroup />
      </Suspense>
    </nav>
  )
}
