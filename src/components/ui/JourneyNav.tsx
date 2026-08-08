"use client"

// The journey, v14-style (ratified TJ 8/1): one bar right under the header on
// every learner surface — 00 Readings · 01 Open · 02 Throw · 03 Read · 04 Map
// · 05 Weave · 06 Keep — so the whole arc is always visible, wherever you
// stand in it. 05 Weave is the big-picture phase the course builds toward
// (weeks 11+ mine and quilt the whole graph): every reading at once, its own
// station rather than the same tabs quietly scoped wider (ratified TJ 8/1).
//
// A station you can work at HERE is a button (a workbench tab); every other
// station is a link to where it lives. Outside a reading, Open routes to the
// shelf: opening IS picking a text (reading-first), and the tooltip says so.
// On /weave the WEAVE station is the underlined one — throw/read/map there
// are its tools, the footer names the open tool — so the underline always
// answers "where on the journey am I", never "which panel is showing".

import Link from "next/link"

export type Station = "readings" | "open" | "throw" | "read" | "map" | "weave" | "keep"

const STATIONS: { key: Station; step: string; label: string }[] = [
  { key: "readings", step: "00 —", label: "Library" },
  { key: "open", step: "01 —", label: "Open" },
  { key: "throw", step: "02 —", label: "Linking" },
  { key: "read", step: "03 —", label: "Vocabulary" },
  { key: "map", step: "04 —", label: "Knowledge Graph" },
  { key: "weave", step: "05 —", label: "Weave" },
  { key: "keep", step: "06 —", label: "Keep" },
]

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
  open: "capture happens inside a reading — pick one first",
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
      {STATIONS.map(({ key, step, label }) => {
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
