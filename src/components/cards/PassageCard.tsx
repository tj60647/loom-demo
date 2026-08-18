"use client"

/**
 * A Passage, drawn the same way wherever it appears.
 *
 * PASSAGE-FIRST — the quotation is the subject, and the concepts it evidences
 * are said about it. That is the opposite of [ConceptCard](./ConceptCard.tsx),
 * and the distinction is the model's, not a layout preference: "a concept does
 * not belong to a text; a passage does". TJ, 2026-08-13, reading the two
 * apart: "one is a passage with concept, the other is concept with passages."
 *
 * Written because the same object was drawn three different ways in three
 * places — Your work's list, the margin rail beside the page, and (as of now)
 * the warp popover — each hand-rolled where it was used, which is how they
 * drifted. One card, one appearance, and EDITABILITY IS A MODE rather than a
 * different card.
 *
 * Deliberately width-fluid, with no fixed type sizes of its own. These three
 * homes are at very different measures (a 380px sheet, a margin rail, a
 * popover in the warp column) and a card carrying px sizes would read as
 * oversized in the narrowest of them — the fault we had just finished fixing
 * in Your work when this was written.
 */

import type { Concept, Passage } from "@/lib/types"
import ConceptName from "@/components/ui/ConceptName"

export type PassageCardMode =
  /** Shown, never changed — the warp popover, and anywhere quoting evidence. */
  | "read"

export default function PassageCard({
  passage,
  concepts,
  titleOf,
  mode = "read",
  onGoto,
  hideConceptId,
}: {
  passage: Passage
  /** The student's whole concept list, for resolving this passage's filings. */
  concepts: Concept[]
  /** A reading's title, or a plain fallback — never a bare id. Called only
   *  with a real sourceId, so it need not handle null. */
  titleOf: (sourceId: string) => string
  mode?: PassageCardMode
  /**
   * Open this passage where it was captured. Absent = no door, which is a
   * real state: a passage with no reading attached has nowhere to go.
   */
  onGoto?: (passage: Passage) => void
  /**
   * Drop one concept from the chips — the one whose card this passage is
   * sitting inside. Without it every passage in a Concept card repeats that
   * concept's own name, which is noise where the useful fact is the OTHER
   * filings. Standing alone (the margin rail), nothing is hidden.
   */
  hideConceptId?: string
}) {
  const filedUnder = concepts.filter(
    (c) => passage.conceptIds.includes(c.id) && c.id !== hideConceptId
  )
  const where = passage.sourceId ? titleOf(passage.sourceId) : passage.source
  const canGoto = !!onGoto && (!!passage.sourceId || !!passage.source)

  return (
    <div className="ocard opassage" data-mode={mode}>
      <blockquote className="opassage-text">{passage.content}</blockquote>

      {passage.note ? <p className="opassage-note">{passage.note}</p> : null}

      <div className="ocard-foot">
        <span className="ocard-where">
          {where || "no reading yet"}
          {passage.pageNumber ? ` · p. ${passage.pageNumber}` : ""}
        </span>
        {canGoto && (
          <button
            type="button"
            className="rm ocard-goto"
            onClick={() => onGoto?.(passage)}
            title="Open this passage in the reading"
          >
            goto
          </button>
        )}
      </div>

      {/* The other concepts this passage evidences — what makes a multi-filed
          passage visibly the same object seen from another concept, rather
          than a copy. */}
      {filedUnder.length > 0 && (
        <div className="ocard-chips">
          {filedUnder.map((c) => (
            <span key={c.id} className="ocard-chip"><ConceptName concept={c} /></span>
          ))}
        </div>
      )}
    </div>
  )
}
