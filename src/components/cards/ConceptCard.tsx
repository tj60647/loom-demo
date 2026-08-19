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

import { useState } from "react"
import type { Concept, Passage } from "@/lib/types"
import PassageCard from "./PassageCard"
import ConceptName from "@/components/ui/ConceptName"
import { conceptNameText } from "@/lib/conceptName"

export type ConceptCardMode =
  /** Shown, never changed — the warp popover at 02. */
  | "read"
  /** Your work's row: rename, describe, and the evidence under it. */
  | "edit"
  /** 02 · Linking's warp list: the same card as a pick target. */
  | "pick"

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
  allPassages,
  edit,
  pick = null,
  onPick,
}: {
  concept: Concept
  /** This concept's evidence, in capture order — SCOPED by the caller. See
   *  `noEvidence`, which is not derived from this. */
  passages: Passage[]
  /** The whole concept list, so a passage can name its other filings. */
  concepts: Concept[]
  titleOf: (sourceId: string) => string
  mode?: ConceptCardMode
  onGotoPassage?: (passage: Passage) => void
  elsewhere?: number
  /**
   * EVERY passage in the loom, so the card can work out for itself what it is
   * looking at (TJ, 2026-08-18: "maybe behind the scenes a card knows if there
   * is evidence in the loom and evidence in the reading?").
   *
   * It has to be the card's own sum, not a flag from the caller. `passages` is
   * SCOPED — Your work hands it this reading's evidence — so a concept carried
   * in from another text arrives with an empty list while being nothing like
   * evidence-less. A caller computing "no evidence" off that list tells a lie
   * the card cannot detect, and the two hosts had two different predicates for
   * it before this prop existed: 02 counted the whole loom, Your work counted
   * the reading.
   *
   * Omitted, the card falls back to `passages` and says only what it can see.
   */
  allPassages?: Passage[]
  /** Required by `mode="edit"`; ignored otherwise. */
  edit?: ConceptCardEdit
  /** Required by `mode="pick"`; which slot this concept is loaded into. */
  pick?: 1 | 2 | null
  onPick?: () => void
}) {
  /**
   * The warp card opens in place, like Your work's (TJ, 2026-08-18: "the dot
   * isn't needed because, if we are using the same card as in your work,
   * clicking on the concept opens it"). Held locally because nothing outside
   * needs to force it — Your work's equivalent lives in OpenTab only because
   * a refile has to open the row it just filed into.
   */
  const [openHere, setOpenHere] = useState(false)
  /**
   * WHAT THIS CONCEPT IS BACKED BY, worked out here rather than asked for.
   * `here` is what the host gave us — this reading, or the whole loom if the
   * host is not reading-scoped. `loom` is every text the student has read.
   */
  const here = passages.length
  const loom = allPassages
    ? allPassages.filter((p) => p.conceptIds.includes(concept.id)).length
    : here

  /**
   * THE HEAD'S RIGHT-HAND SLOT, shared by every mode so the cards say the same
   * things in the same order, and there are three things to say, not two:
   *
   * The bench slot is NOT one of them any more (TJ, 2026-08-18: "instead of
   * pick 1 being outside the button and overriding the passage count, let the
   * button text change to PICKED #"). It sat here and displaced the count, so
   * picking a concept hid the one fact the row existed to show.
   *
   *  - no evidence — nothing anywhere backs it. A designation, never a warning:
   *    "a Concept may precede its evidence" (TJ, 2026-08-08; red line 4, "empty
   *    states are visible, not blocked").
   *  - elsewhere — backed, but not in the text you are reading. This used to
   *    render as nothing at all, which read identically to evidence-less.
   */
  const headTag =
    loom === 0 ? (
      <div
        className="pickedtag noevidence"
        title="no passage backs this yet — you may have named it ahead of its evidence, which is allowed"
      >no evidence</div>
    )
    : here === 0 ? (
      <div
        className="lsrc"
        title={`Backed by ${loom} passage${loom !== 1 ? "s" : ""} in your other readings, none in this one.`}
      >{loom} elsewhere</div>
    )
    : (
      <div className="lsrc">
        {here} passage{here !== 1 ? "s" : ""}
      </div>
    )

  if (mode === "pick" && onPick) {
    return (
      <div
        data-concept-id={concept.id}
        className={`crow ywcard ywconcept ywpick ${pick ? "picked" : ""} ${openHere ? "open" : ""}`}
      >
        {/* THE HEAD OPENS THE CARD; THE BUTTON PICKS IT. The row used to do
            both jobs with one tap, which is why a ● had to exist to reach the
            concept's own card at all. Splitting them lets the warp behave like
            Your work — click the name, it opens — and gives picking a control
            that says what it does (TJ, 2026-08-18: "a button pointing to the
            right that says 'select' or something, and changes the row
            colour"). */}
        <div className="lhead" onClick={() => setOpenHere((v) => !v)} aria-expanded={openHere}>
          {/* .clabel as well as .lconcept: six spec files select the warp by
              `.crow` and its name by `.clabel`, and the admin and faculty
              read-only views use `.clabel` for the same object. */}
          <div className="lconcept clabel"><ConceptName concept={concept} /></div>
          {headTag}
          {/* THE RIGHT END OF THE ROW, not a control floating in it (TJ,
              2026-08-18). Full row height and flush to the card's edge, so the
              row reads as one object with a hinged end rather than as a line
              with a button dropped on it. The slot number rides the button:
              `PICKED 1` says both that it is on the bench and which half of
              the pair it is, and leaves the evidence count where it was. */}
          <button
            type="button"
            className="cselect"
            aria-pressed={!!pick}
            aria-label={pick ? `Unpick ${conceptNameText(concept)}` : `Select ${conceptNameText(concept)} for the bench`}
            title={pick ? "take it off the bench" : "load it into the bench"}
            onClick={(e) => { e.stopPropagation(); onPick() }}
          >
            <span>{pick ? `picked ${pick}` : "select"}</span>
            {/* Chevron, drawn rather than typed: an arrow glyph sits on the
                text baseline and rides the font, a stroked path does not. */}
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"
                 fill="none" stroke="currentColor" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        </div>
        {openHere && (
          /* What the ● used to show, in place: the gloss first, because half
             the time it is the whole answer, then the evidence. Read-only —
             02 is where you link concepts, not where you rename them. */
          <div className="lbody cbody">
            {concept.def
              ? <p className="oconcept-def">{concept.def}</p>
              : <p className="oconcept-def empty">no working description yet</p>}
            {passages.length > 0 ? (
              <div className="oconcept-evidence">
                <div className="lgroup">Evidence in this reading</div>
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
                {/* Said plainly, because it is true and not obvious: stations
                    unmount, so leaving 02 drops the picks on the bench. This
                    was the popover's own warning and it outlived it. */}
                {onGotoPassage && (
                  <p className="oconcept-def empty">
                    Opening a passage goes to 01 · Reading and lets go of your picks here.
                  </p>
                )}
              </div>
            ) : (
              <p className="oconcept-def empty">
                {loom === 0
                  ? "No passage backs this yet. You may have named it ahead of its evidence, which is allowed."
                  : `Backed in your other readings, not in this one — ${loom} passage${loom !== 1 ? "s" : ""} elsewhere.`}
              </p>
            )}
          </div>
        )}
      </div>
    )
  }
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
          {headTag}
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
        <p className="oconcept-def empty">no working description yet</p>
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
