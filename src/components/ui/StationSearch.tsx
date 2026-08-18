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

  /**
   * "Your cloth", not "this reading" (TJ, 2026-08-17) — and the rename fixes a
   * false claim rather than just a name. This panel calls searchReadings and
   * searchLoom; searchLoom returns concepts, link labels, links, passages,
   * cloths and projections, and NO pages. The label and the aria-label both
   * said "its pages" anyway, and the coverage line added below on the same day
   * repeated it from them without checking.
   *
   * The page text is the reading toolbar's "in the text", which is the one
   * search that really does read the PDF. So the pair now splits cleanly by
   * subject: the words on the page there, the work you made from them here.
   */
  const label = scope === "loom" ? "your loom" : "your cloth"
  /**
   * ONE sentence about coverage, said in three places (TJ, 2026-08-17: "the
   * search bar mouseover text should match the text in the popup search. right
   * now is generic").
   *
   * The tip used to say "find a word or phrase anywhere in your loom" — true,
   * and it told you nothing you could not guess from a magnifier. Meanwhile
   * the panel listed what is actually searched. A reader who hovered and a
   * reader who opened were told different things, and only one of them was
   * told the useful thing.
   *
   * So `covers` is the single source: the tip, the accessible name and the
   * line above the input are all built from it, and they cannot drift because
   * there is nothing to keep in step.
   */
  const covers = scope === "loom"
    ? "readings · cloths · projections · concepts · link labels · links · passages"
    : "passages · concepts · link labels · links · projections"
  const what = `Search ${label} — ${covers.replace(/ · /g, ", ")}`

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
        // "search …", not just the coverage (TJ, 2026-08-17): a tip on a
        // control should say what pressing it does before it says what it
        // reaches. The panel's own line drops the verb — by the time you are
        // reading that, you have already pressed it.
        data-tip={`search ${label} — ${covers}`}
      >
        ⌕ {label}
      </button>

      {open && (
        <div className="stationsearch-panel" role="search" aria-label={what}>
          {/* What this search covers, said in the panel (TJ, 2026-08-17).
              The button's label carries the SCOPE — this reading, or your
              loom — which is what stops the two searches on the reading
              station being confused for each other. It cannot also carry the
              coverage without becoming a sentence, so the coverage lived in
              the tooltip and the aria-label: invisible to a mouse user who
              does not hover, and unavailable to anyone once they start typing.

              Here it stands while you type and while you read the results,
              which is exactly when "would it have found that?" gets asked.
              aria-hidden because the panel's own aria-label already says it —
              a screen reader should not hear the coverage twice. */}
          <p className="stationsearch-covers" aria-hidden="true">
            {label} — {covers}
          </p>
          <ShelfSearch sourceId={sourceId} onClose={() => { setOpen(false); buttonRef.current?.focus() }} />
        </div>
      )}
    </div>
  )
}
