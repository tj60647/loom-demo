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
 * `edit` is Your work's row, moved here on 2026-08-18 — the commit this file
 * predicted. It keeps every block that row carried (TJ asked for the panel's
 * "more verbose form" expressly) and it keeps `.lrow`, `.lhead`, `.lconcept`
 * and `data-concept-id` on the same elements, because eleven spec files and
 * OpenTab's own focus effects reach in by those.
 *
 * The state it edits is NOT held here. The rename runs a whole-graph homonym
 * search and an `await confirm()` that can roll the input back; the open/closed
 * toggle is forced open by OpenTab's own handlers after a refile. Both stay in
 * OpenTab and arrive as callbacks.
 *
 * No fixed type sizes, and no fixed width: this is meant to sit in a 380px
 * sheet, a margin rail and a popover without being re-tuned for each.
 */

import type { Concept, Passage } from "@/lib/types"
import PassageCard from "./PassageCard"
import ConceptName from "@/components/ui/ConceptName"

export type ConceptCardMode =
  /** Shown, never changed — the warp popover at 02. */
  | "read"
  /** Your work's row: rename, describe, and the evidence under it. */
  | "edit"

export type ConceptCardEdit = {
  isOpen: boolean
  onToggle: () => void
  /** Takes the input so OpenTab can roll its value back when the clash
   *  confirm is declined — the reason this is not just (label: string). */
  onRename: (input: HTMLInputElement) => void
  onEditDef: (def: string) => void
  /** The evidence rows. OpenTab still draws these: they carry an unfile and a
   *  remove whose wording is settled (TJ, 2026-08-17, "BOTH, always") and they
   *  are the smallest, safest thing to move next. */
  renderEvidence: (passage: Passage) => React.ReactNode
}

export default function ConceptCard({
  concept,
  passages,
  concepts,
  titleOf,
  mode = "read",
  onGotoPassage,
  /** Evidence from OTHER readings, counted rather than listed. */
  elsewhere = 0,
  edit,
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
  /** Required by `mode="edit"`; ignored otherwise. */
  edit?: ConceptCardEdit
}) {
  if (mode === "edit" && edit) {
    return (
      <div data-concept-id={concept.id} className={`lrow ywcard ywconcept ${edit.isOpen ? "open" : ""}`}>
        {/* No destructive control here: this header is the row's
            expand/collapse target, so "delete this concept" lives inside the
            opened row next to "remove passage", labelled, as in v14. */}
        <div className="lhead" onClick={edit.onToggle} style={{ display: "flex", alignItems: "center" }}>
          <div className="lconcept" style={{ flex: 1 }}><ConceptName concept={concept} /></div>
          {/* This reading's evidence, and only this reading's (TJ, 2026-08-13:
              "the header is 'in this reading' … only count the concept in this
              reading"). No "0 passages" under a heading that already reads NO
              EVIDENCE: it says the same thing twice, and the zero is the more
              judgemental of the two. The cross-reading fact is not lost — open
              the row and it is said in full. */}
          {passages.length > 0 && (
            <div className="lsrc">
              {passages.length} passage{passages.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        {edit.isOpen && (
          <div className="lbody">
            <div className="defrow">
              <span className="label">Concept</span>
              {/* Uncontrolled and keyed on the label: the rename can be rolled
                  back by OpenTab when the homonym confirm is declined. */}
              <input
                key={concept.label}
                placeholder="concept label…"
                defaultValue={concept.label}
                onBlur={(e) => edit.onRename(e.target)}
              />
            </div>
            <div className="defrow">
              <span className="label">Description</span>
              {/* A textarea, not an input (TJ, 2026-08-17: "the description
                  should wrap so we can read it all"). A gloss is up to 100
                  words by the model; on one line you could read about eight of
                  them, and the rest scrolled sideways out of view. */}
              <textarea
                className="conceptdef"
                rows={2}
                placeholder="in your words; same sense across your sources?"
                defaultValue={concept.def ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (concept.def ?? "")) edit.onEditDef(e.target.value)
                }}
              />
            </div>
            {passages.map((b) => edit.renderEvidence(b))}
            {/* "N more passages evidence this concept in your other readings"
                stood here until 2026-08-13 (TJ: "i think that belongs in
                vocabulary, not 'in this reading'"). It does, and it is already
                there, said better: 04 counts the readings a concept travels
                through and NAMES them, which is the number that means
                something. This panel is the reading-scoped record of what you
                captured here — the division 04's own header draws. Nothing was
                moved; a thinner copy of it stopped being shown twice. */}
            {/* DELETING A CONCEPT IS NOT AN ACT OF THIS STATION (TJ,
                2026-08-17: "i sense that delete concept should only be in
                vocabulary. and that in reading it is remove concept from
                passage").

                The scope argument is the whole of it. This panel is one
                reading's record; a concept belongs to the student and travels
                through every text they have read. Offering its destruction
                from inside one reading put a loom-wide act behind a
                reading-scoped door — and the passages it would have taken with
                it are not all on this page to see.

                04 · Vocabulary already holds it, with the same confirmation,
                and 04 is where you see every concept you own at once — which
                is what you need in order to judge whether one should go at
                all.

                What remains here is the scoped act: remove this concept from
                this passage, on each row above. */}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="ocard oconcept" data-mode={mode}>
      <div className="lhead oconcept-head">
        <div className="lconcept"><ConceptName concept={concept} /></div>
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
        // rule ThrowTab states. Said plainly, with the reason it is legal, and
        // no verb offered.
        <p className="oconcept-def empty">
          No passage backs this yet. You may have named it ahead of its evidence,
          which is allowed.
        </p>
      )}
    </div>
  )
}
