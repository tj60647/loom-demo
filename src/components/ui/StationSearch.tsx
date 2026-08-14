"use client"

/**
 * One search per station, scoped by where you are standing.
 *
 * TJ, 2026-08-13: "i do not like that the standing band takes up so much space
 * and is redundant. i do like that it is consistently placed. how might we have
 * the best of both? one search, scoped and labeled, per station" — and then the
 * rule: "library is your loom, vocabulary is your loom, all else this
 * reading/cloth".
 *
 * The band's virtue was that it never moved; its cost was a whole row on every
 * surface. Those are separable. This rides the journey bar — the one row
 * already under the header on every learner surface — so the placement is as
 * consistent as the band's and costs no height at all.
 *
 * SCOPE IS CONTEXTUAL, NEVER A TOGGLE. It follows from what the station IS:
 * the Library and Vocabulary are the User's holdings across every reading
 * (JourneyNav says so of Vocabulary: "UNSCOPED in the model"), and the other
 * three stations are one text and the cloth woven from it. So there is nothing
 * to choose and nothing to get wrong — but the scope must be VISIBLE, which is
 * why it is in the button's own label. It used to live only in the input's
 * placeholder, which vanishes the moment you type: while you were actually
 * reading results, nothing on screen said what had been searched.
 */

import { useEffect, useRef, useState } from "react"
import ShelfSearch from "@/components/shelf/ShelfSearch"

export type SearchScope = "loom" | "reading"

export default function StationSearch({ scope, sourceId }: {
  scope: SearchScope
  /** The reading to search. Required at "reading" scope, ignored at "loom". */
  sourceId?: string
}) {
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const label = scope === "loom" ? "your loom" : "this reading"
  const what = scope === "loom"
    ? "Search your loom — readings, cloths, projections, concepts, link labels, links and passages"
    : "Search this reading — its pages, cloth, projections, concepts, link labels, links and passages"

  /**
   * Escape closes and hands focus back to the button that opened it. Pointer
   * outside closes too — this is a panel over the work, not a mode, so
   * reaching past it for the thing you were reading should simply put it away.
   */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    // Capture: a hit inside the panel is a <Link>, and letting the bubble phase
    // decide would race the navigation.
    window.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown, true)
    }
  }, [open])

  return (
    <div className="stationsearch" ref={hostRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`btn mini${open ? "" : " ghost"}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={what}
        data-tip={scope === "loom"
          ? "find a word or phrase anywhere in your loom"
          : "find a word or phrase in this reading and the work you have done on it"}
      >
        ⌕ {label}
      </button>

      {open && (
        <div className="stationsearch-panel" role="search" aria-label={what}>
          <ShelfSearch sourceId={sourceId} onClose={() => { setOpen(false); buttonRef.current?.focus() }} />
        </div>
      )}
    </div>
  )
}
