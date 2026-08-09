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

import Link from "next/link"

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

const TIP: Partial<Record<Station, string>> = {
  open: "reading and capture happen together — pick a text first",
  weave: "the big picture — every reading at once",
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
        return handler ? (
          <button key={key} className={activeCls.trim()} onClick={handler}>
            <span className="step">{step}</span>
            {text}
          </button>
        ) : (
          <Link key={key} href={DEFAULT_HREF[key]} className={`station${activeCls}`} data-tip={TIP[key]}>
            <span className="step">{step}</span>
            {text}
          </Link>
        )
      })}
    </nav>
  )
}
