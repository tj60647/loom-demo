"use client"

// The journey, v14-style (ratified TJ 8/1): one bar right under the header on
// every learner surface — 00 Readings · 01 Open · 02 Throw · 03 Read · 04 Map
// · 05 Keep — so the whole arc is always visible, wherever you stand in it.
//
// A station you can work at HERE is a button (a workbench tab); every other
// station is a link to where it lives. Outside a reading, Open routes to the
// shelf: opening IS picking a text (reading-first), and the tooltip says so.

import Link from "next/link"

export type Station = "readings" | "open" | "throw" | "read" | "map" | "keep"

const STATIONS: { key: Station; step: string; label: string }[] = [
  { key: "readings", step: "00 —", label: "Readings" },
  { key: "open", step: "01 —", label: "Open" },
  { key: "throw", step: "02 —", label: "Throw" },
  { key: "read", step: "03 —", label: "Read" },
  { key: "map", step: "04 —", label: "Map" },
  { key: "keep", step: "05 —", label: "Keep" },
]

const DEFAULT_HREF: Record<Station, string> = {
  readings: "/",
  open: "/",
  throw: "/weave?tab=throw",
  read: "/weave?tab=read",
  map: "/weave?tab=map",
  keep: "/keep",
}

const TIP: Partial<Record<Station, string>> = {
  open: "capture happens inside a reading — pick one off the shelf",
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
