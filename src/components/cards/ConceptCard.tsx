"use client"

/**
 * A Concept, drawn the same way wherever it appears.
 *
 * CONCEPT-FIRST — the idea is the subject and its passages are the evidence
 * under it, which is the mirror of [PassageCard](./PassageCard.tsx). Same
 * object, one appearance, and editability is a MODE rather than a second card
 * (TJ, 2026-08-13: "they should look the same i think as they represent the
 * same thing with different editable qualities").
 *
 * `read` is built. `edit` is Your work's row — 200-odd lines entangled with
 * OpenTab's own state (rename-clash confirms, refile, remove, the open/closed
 * toggle) and bound by selector to three Playwright specs. It moves here in
 * its own commit, where the diff can be read on its own; the class names below
 * are deliberately the ones Your work already uses so that adoption is a move
 * rather than a rewrite.
 *
 * No fixed type sizes, and no fixed width: this is meant to sit in a 380px
 * sheet, a margin rail and a popover without being re-tuned for each.
 */

import type { Concept, Passage } from "@/lib/types"
import PassageCard from "./PassageCard"

export type ConceptCardMode =
  /** Shown, never changed — the warp popover at 02. */
  | "read"

export default function ConceptCard({
  concept,
  passages,
  concepts,
  titleOf,
  mode = "read",
  onGotoPassage,
  /** Evidence from OTHER readings, counted rather than listed. */
  elsewhere = 0,
}: {
  concept: Concept
  /** This concept's evidence, in capture order. */
  passages: Passage[]
  /** The whole concept list, so a passage can name its other filings. */
  concepts: Concept[]
  titleOf: (sourceId: string) => string
  mode?: ConceptCardMode
  onGotoPassage?: (passage: Passage) => void
  elsewhere?: number
}) {
  return (
    <div className="ocard oconcept" data-mode={mode}>
      <div className="lhead oconcept-head">
        <div className="lconcept">{concept.label}</div>
        {(passages.length > 0 || elsewhere > 0) && (
          <div className="lsrc">
            {passages.length} passage{passages.length !== 1 ? "s" : ""}
            {elsewhere ? ` · ${elsewhere} elsewhere` : ""}
          </div>
        )}
      </div>

      {/* The gloss answers "what did I mean by this?" — which is most of why
          anyone opens this card — so it comes before the evidence rather than
          under it. Half the time it is the whole answer and no passage needs
          opening at all. */}
      {concept.def ? (
        <p className="oconcept-def">{concept.def}</p>
      ) : (
        <p className="oconcept-def empty">no working definition yet</p>
      )}

      {concept.note ? <p className="oconcept-note">{concept.note}</p> : null}

      {passages.length > 0 ? (
        <div className="oconcept-evidence">
          <div className="lgroup">Evidence</div>
          {passages.map((p) => (
            <PassageCard
              key={p.id}
              passage={p}
              concepts={concepts}
              titleOf={titleOf}
              onGoto={onGotoPassage}
              hideConceptId={concept.id}
            />
          ))}
        </div>
      ) : (
        // "No evidence" is a designation, never a warning to act on — the same
        // rule CardMenu and ThrowTab state. Said plainly, with the reason it
        // is legal, and no verb offered.
        <p className="oconcept-def empty">
          No passage backs this yet. You may have named it ahead of its evidence,
          which is allowed.
        </p>
      )}
    </div>
  )
}
