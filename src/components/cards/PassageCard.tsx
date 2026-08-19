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
 * places — Your work's list, the margin rail beside the page, and the warp
 * popover — each hand-rolled where it was used, which is how they drifted.
 * One card, one appearance, and EDITABILITY IS A MODE rather than a different
 * card.
 *
 * `edit` arrived 2026-08-18 and is Your work's row, moved here whole. It keeps
 * every block that row carried — TJ asked for the panel's "more verbose form"
 * expressly — and it keeps `.lrow.loose` on the wrapper, which is not
 * decoration: `.passage` and `.src` have NO base rule in globals.css, only the
 * descendant selectors `.lrow.loose .passage` and `.lrow.loose .src`, so
 * dropping that class would strip the type silently. (Grep the selectors, not
 * a line number — the numbers here were already 37 off before this file was
 * touched again.) Eleven spec files also bind to `.lrow`, `.passage.isdoor`
 * and `data-passage-id`.
 *
 * State stays in OpenTab. This card takes callbacks, because the row's state
 * is not the row's: the note is written optimistically by LoomProvider while
 * the refile is not, only one add-concept card may stand open across the whole
 * list, and OpenTab's focus effects reach in by `[data-passage-id]`.
 *
 * Deliberately width-fluid, with no fixed type sizes of its own. These homes
 * are at very different measures (a 460px sheet, a margin rail, a popover in
 * the warp column) and a card carrying px sizes would read as oversized in the
 * narrowest of them.
 */

import { useId, useLayoutEffect, useRef } from "react"
import type { Concept, Passage } from "@/lib/types"
import ConceptName from "@/components/ui/ConceptName"
import AddConceptCard from "./AddConceptCard"
import { conceptNameText } from "@/lib/conceptName"

export type PassageCardMode =
  /** Shown, never changed — the warp popover, and anywhere quoting evidence. */
  | "read"
  /** Your work's row: the note, the filings, and the one destructive act. */
  | "edit"

export type PassageCardEdit = {
  onEditNote: (note: string) => void
  onUnfile: (conceptId: string) => void
  onRemove: () => void
  /** The + beside the chips is a toggle, and only one card is open at a time —
   *  the list would otherwise grow several editors deep. */
  addOpen: boolean
  onToggleAdd: () => void
  onCloseAdd: () => void
  onCreateConcept: (label: string, def?: string) => Promise<Concept>
  onAddConcept: (passageId: string, conceptId: string) => Promise<Passage>
  onEditConcept?: (conceptId: string, data: { def: string }) => Promise<void>
}

export default function PassageCard({
  passage,
  concepts,
  titleOf,
  mode = "read",
  onGoto,
  hideConceptId,
  edit,
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
  /** Required by `mode="edit"`; ignored otherwise. */
  edit?: PassageCardEdit
}) {
  /**
   * The + gets focus back when the card it opened goes away — the same restore
   * the margin rail does with `restoreAddFocusFor` (ConceptRail.tsx), written
   * locally here because this card owns exactly one +. Without it a keyboard
   * user who pressed Escape or committed was returned to <body>, at the top of
   * a panel they had scrolled down.
   *
   * `wasOpen` is what keeps this from stealing focus on mount: the effect must
   * fire on the true -> false transition only, not on every render with the
   * card shut.
   */
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const wasOpen = useRef(false)
  const addCardId = useId()
  const addOpen = mode === "edit" && !!edit?.addOpen
  useLayoutEffect(() => {
    if (wasOpen.current && !addOpen) addButtonRef.current?.focus()
    wasOpen.current = addOpen
  }, [addOpen])

  const filedUnder = concepts.filter(
    (c) => passage.conceptIds.includes(c.id) && c.id !== hideConceptId
  )
  const where = passage.sourceId ? titleOf(passage.sourceId) : passage.source
  const isDoor = !!passage.sourceId || !!passage.source
  const canGoto = !!onGoto && isDoor

  /**
   * THE QUOTATION IS THE DOOR (TJ, 2026-08-17: "clicking on a passage in the
   * your work panel should be the 'goto passage'") — the same rule the margin
   * card follows, and why edit mode offers no separate "goto" button: that
   * would be the same act twice.
   *
   * The TEXT, not the whole row: the row also holds buttons and an input, and
   * a control inside a control is out of order for the keyboard and ambiguous
   * to a screen reader. This way the door is one element and its neighbours
   * are their own.
   */
  const quotation = (quoted: boolean) => (
    <div
      className={`passage${isDoor ? " isdoor" : ""}`}
      role={isDoor ? "button" : undefined}
      tabIndex={isDoor ? 0 : undefined}
      aria-label={isDoor ? "Open this passage in the reading" : undefined}
      title={isDoor ? "Open this passage in the reading" : undefined}
      onClick={() => isDoor && onGoto?.(passage)}
      onKeyDown={(e) => {
        if (!isDoor) return
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGoto?.(passage) }
      }}
    >{quoted ? `"${passage.content}"` : passage.content}</div>
  )

  if (mode === "edit" && edit) {
    return (
      <div data-passage-id={passage.id} className="lrow loose ywcard ywpassage">
        {quotation(true)}
        {/* The reading and where in it — one mono line, not the card's
            page number: `location` is what the hand-capture form fills, and a
            typed reading has no page at all. */}
        <div className="src">{passage.source || "—"}{passage.location ? ` · ${passage.location}` : ""}</div>

        {/* BLOCKS, EACH ABOUT ONE THING (TJ, 2026-08-17: "the passage concepts
            is a little confusing, there are concept badges, remove passage, and
            then add concept. this need better structure").

            It was: chips, then "remove passage", then a concept field — so a
            destructive act on the PASSAGE sat in the middle of the concept
            material and read as part of it. The order TJ drew on 2026-08-18
            keeps them apart the other way round: the quotation, its note and
            the act that destroys it are the passage's own material, and the
            concepts — what it evidences, and the + that files one more — come
            after, as the thing said ABOUT it. */}

        {/* The note, and it is EDITABLE (TJ: "i see the passage, but no
            notes"). It was invisible when empty, which on a passage captured
            without one meant always. Saved on blur.

            The key is load-bearing and must stay: the field is uncontrolled,
            LoomProvider writes `note` optimistically, and remounting on the
            saved value is what keeps the field from going stale without
            fighting the caret. */}
        <div className="pblock">
          <span className="label">Note <span className="labelsay">— why you kept these words</span></span>
          <textarea
            className="passagenote-edit"
            placeholder="what struck you, what to come back to"
            defaultValue={passage.note ?? ""}
            key={passage.id + ":" + (passage.note ?? "")}
            onBlur={(e) => {
              if (e.target.value !== (passage.note ?? "")) edit.onEditNote(e.target.value)
            }}
          />
        </div>

        {/* The destructive act sits with the PASSAGE's own material — its
            quotation and its note — and above the concepts, which are a
            different subject (TJ, 2026-08-18, showing the order he wants).
            Quiet, and still the only thing here that destroys anything. */}
        <div className="src rm-actions" style={{ marginTop: "8px" }}>
          <button
            type="button"
            className="rm"
            onClick={edit.onRemove}
            title="Delete this capture. Its filings go with it."
          >
            remove passage
          </button>
        </div>

        <div className="pblock">
          <span className="label">
            Concepts{" "}
            <span className="labelsay">
              {filedUnder.length ? "— what this passage evidences" : "— none yet, which is a legal state"}
            </span>
          </span>
          {/* THE CHIPS AND THE + ARE ONE ROW, as they are on the margin card.
              This block used to end in a labelled text field and an `add`
              button — a second way to do what the margin already did with a +
              and a card, and a lesser one: it had no description field, no
              picker, and it told you a concept was already filed only after
              you pressed. One act, one control, one card (TJ, 2026-08-18:
              "use the add concept to passage card when + is pressed"). */}
          <div className="passageconcepts">
            {filedUnder.map((c) => (
              <span key={c.id} className="pchip">
                <ConceptName concept={c} />
                <button
                  type="button"
                  className="pchip-x"
                  onClick={() => edit.onUnfile(c.id)}
                  aria-label={`Remove ${conceptNameText(c)} from this passage`}
                  title={`Remove “${conceptNameText(c)}” from this passage. The passage stays.`}
                >×</button>
              </span>
            ))}
            <button
              type="button"
              ref={addButtonRef}
              className="pchip-add"
              onClick={edit.onToggleAdd}
              aria-expanded={edit.addOpen}
              /* Named only while the card exists — an aria-controls pointing at
                 an absent id is a dangling reference, and aria-expanded already
                 carries the state on its own. */
              aria-controls={edit.addOpen ? addCardId : undefined}
              aria-label="Add a concept to this passage"
              title="Add a concept to this passage"
              data-add-concept-for={passage.id}
            >+</button>
          </div>
          {edit.addOpen && (
            <div id={addCardId}>
            <AddConceptCard
              passage={passage}
              concepts={concepts}
              onCreateConcept={edit.onCreateConcept}
              onAddConcept={edit.onAddConcept}
              onEditConcept={edit.onEditConcept}
              onClose={edit.onCloseAdd}
            />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ocard opassage" data-mode={mode}>
      {/* THE QUOTATION IS THE DOOR HERE TOO (TJ, 2026-08-18: "clicking on the
          passage in a concept card should take you to the reading passage") —
          the rule every other drawing of a Passage already followed, and the
          reason the separate `goto` button below it is gone: it was the same
          act twice, offered smaller. */}
      <blockquote
        className={`opassage-text${canGoto ? " isdoor" : ""}`}
        role={canGoto ? "button" : undefined}
        tabIndex={canGoto ? 0 : undefined}
        aria-label={canGoto ? "Open this passage in the reading" : undefined}
        title={canGoto ? "Open this passage in the reading" : undefined}
        onClick={() => canGoto && onGoto?.(passage)}
        onKeyDown={(e) => {
          if (!canGoto) return
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGoto?.(passage) }
        }}
      >{passage.content}</blockquote>

      {/* NO PASSAGE NOTE HERE (TJ, 2026-08-18: "the concept card does not need
          to show the passage notes"). Read mode is only ever reached through
          ConceptCard — the warp card's opened body and the projection popover —
          where these passages are EVIDENCE for the concept above them. A note
          is what the words meant to the student on the day they kept them,
          which is a fact about the passage, not about the concept it is being
          shown to support; several of them turn a concept's evidence into a
          column of asides. It is still written and read where the passage is
          the subject: `mode="edit"` above, in Your work. */}

      <div className="ocard-foot">
        <span className="ocard-where">
          {where || "no reading yet"}
          {passage.pageNumber ? ` · p. ${passage.pageNumber}` : ""}
        </span>
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
