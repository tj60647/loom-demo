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
 * descendant selectors `.lrow.loose .passage` (316) and `.lrow.loose .src`
 * (317), so dropping that class would strip the type silently. Eleven spec
 * files also bind to `.lrow`, `.passage.isdoor` and `data-passage-id`.
 *
 * State stays in OpenTab. This card takes values and callbacks, because the
 * row's state is not the row's: `handleRefile` runs a duplicate check and a
 * create-if-missing, the note is optimistic in LoomProvider while the refile
 * is not, and OpenTab's focus effects reach in by `[data-passage-id]`.
 *
 * Deliberately width-fluid, with no fixed type sizes of its own. These homes
 * are at very different measures (a 460px sheet, a margin rail, a popover in
 * the warp column) and a card carrying px sizes would read as oversized in the
 * narrowest of them.
 */

import type { Concept, Passage } from "@/lib/types"
import ConceptName from "@/components/ui/ConceptName"
import { conceptNameText } from "@/lib/conceptName"

export type PassageCardMode =
  /** Shown, never changed — the warp popover, and anywhere quoting evidence. */
  | "read"
  /** Your work's row: the note, the filings, and the one destructive act. */
  | "edit"

export type PassageCardEdit = {
  /** The shared concept datalist. A PROP, never hardcoded: OpenTab uses two
   *  different ids because VocabularyTab declares one of the same name and
   *  both tabs are kept alive — a bug that already shipped once. */
  listId: string
  refileValue: string
  refileBusy: boolean
  onRefileChange: (value: string) => void
  onRefile: () => void
  onEditNote: (note: string) => void
  onUnfile: (conceptId: string) => void
  onRemove: () => void
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

        {/* THREE BLOCKS, EACH ABOUT ONE THING (TJ, 2026-08-17: "the passage
            concepts is a little confusing, there are concept badges, remove
            passage, and then add concept. this need better structure").

            It was: chips, then "remove passage", then a concept field — so a
            destructive act on the PASSAGE sat in the middle of the concept
            material and read as part of it. Now the note is its own labelled
            block, the concepts are one block (what it is filed under, and how
            to add another), and the one destructive control is last and on its
            own. */}

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

        <div className="pblock">
          <span className="label">
            Concepts{" "}
            <span className="labelsay">
              {filedUnder.length ? "— what this passage evidences" : "— none yet, which is a legal state"}
            </span>
          </span>
          {filedUnder.length > 0 && (
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
            </div>
          )}
          {/* Two labels, at two levels: the BLOCK is Concepts, plural, what
              this passage is filed under; the FIELD is Concept, singular, the
              one you are about to add. The LABEL carries the act and the
              button is the verb (TJ, 2026-08-17: "the line could be add
              concept to passage, and the button is just add"). The shape of
              the answer stays on the same line; it is the one thing a student
              cannot infer from the act. */}
          <span className="label addlabel">
            Add concept to passage <span className="labelsay">— a short noun phrase</span>
          </span>
          <div className="quietrow">
            <input
              list={edit.listId}
              placeholder="e.g. boundary objects"
              value={edit.refileValue}
              onChange={(e) => edit.onRefileChange(e.target.value)}
            />
            <button
              className="btn ghost mini"
              onClick={edit.onRefile}
              disabled={edit.refileBusy}
              aria-label="Add concept to passage"
            >add</button>
          </div>
        </div>

        {/* Last, alone, and quiet: the one act here that destroys something.
            It used to sit between the chips and the concept field. */}
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
      </div>
    )
  }

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
