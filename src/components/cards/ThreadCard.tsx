"use client"

/**
 * A Thread, drawn the same way wherever it appears.
 *
 * RELATION-FIRST — the two concepts are the ENDS and the sentence is the
 * substance, which is the third of the three subjects the other two cards
 * already divide between them. [ConceptCard](./ConceptCard.tsx) is
 * concept-first, an idea with its evidence under it;
 * [PassageCard](./PassageCard.tsx) is passage-first, a quotation with the
 * concepts said about it (TJ, 2026-08-13: "one is a passage with concept, the
 * other is concept with passages"). A Thread is neither: it is the claim that
 * two of them hang together, and "the description IS the thread" — which this
 * repository says on 02's bench, in its editor fold, in the practice guide and
 * in the header's About.
 *
 * Written for the reason PassageCard was: the same object was drawn SIX
 * different ways in six places (docs/thread-card.md has the inventory), each
 * hand-rolled where it was used, which is how they drifted. The head and body
 * here are not a new arrangement — every one of the six already put the trip
 * first and the sentence under it. This is the best of them, made the only one.
 *
 * EDITABILITY IS A MODE, as it is in both siblings. Selection and attribution
 * are PROPS rather than modes: /admin/aggregate needs a card that is selectable
 * and says whose it is, and neither of those is a different card.
 *
 * No fixed width and no fixed type sizes of its own. Its homes are a third of
 * 02's three-column station, a full-width admin list and a reading pane, and a
 * card carrying px sizes reads as oversized in the narrowest of them.
 */

import { useRef } from "react"
import type { Concept, Edge, Link } from "@/lib/types"
import { labelOf } from "@/lib/linkResolve"
import { conceptNameText } from "@/lib/conceptName"

export type ThreadCardMode =
  /** Shown, never changed — the admin lists and 03's reading pane. */
  | "read"
  /** 02 · Linking's row: the two folds and the one destructive act. */
  | "edit"

/**
 * TJ, 2026-08-19, on the first cut: "in the others isnt the description and
 * label directly editable? is there a way to do that and still include the
 * hints?"
 *
 * They are, and now this is. The first cut kept 02's older shape — two `.act`
 * toggles opening two `.distill` folds, each with a Save button — which made
 * the one card in the set that does not edit the way its siblings do.
 * ConceptCard and PassageCard both open to LABELLED FIELDS committing on blur,
 * and the hint rides the label (`.label` + `.labelsay`) instead of standing as
 * a paragraph over a form. So do these.
 */
export type ThreadCardEdit = {
  /** Open, and the toggle. ONE disclosure for the card, not one per text. */
  open: boolean
  onToggle: () => void
  /** Committed on blur. Empty is legal for both and is not a deletion. */
  onSaveSentence: (next: string) => void
  onSaveLabel: (next: string) => void
  /**
   * Tapping one of the student's own labels ATTACHES that Link object rather
   * than copying its word — the whole point of 5.1, and why this is its own
   * callback and not `onSaveLabel` with a string.
   */
  onAttachLink: (link: Link) => void
  /** The student's Link List, truncated however the host chooses. */
  ownLabels?: { shown: Link[]; rest: number }
  /** Everyday verbs for someone who has coined none yet. These FILL the field;
   *  they attach nothing, because a suggestion is a starting point. */
  suggestions?: string[]
  onRemove: () => void
}

export default function ThreadCard({
  thread,
  from,
  to,
  links = [],
  mode = "read",
  by,
  selected = false,
  compact = false,
  onSelect,
  edit,
}: {
  thread: Edge
  /**
   * The resolved ends. `undefined` is a real state and is drawn as "?" rather
   * than dropping the row — v14's rule, and 02's: a thread the student threw
   * should stay visible and removable, not vanish because one end went missing.
   */
  from?: Concept
  to?: Concept
  /**
   * The student's Links, so the label can be resolved the ONE right way:
   * `linkId` first, the legacy `handle` second (src/lib/linkResolve.ts). Every
   * hand-rolled row this card replaces branched on `handle` alone, so a thread
   * carrying a `linkId` and an empty handle drew as unlabelled everywhere
   * except 04 · Vocabulary.
   *
   * Defaults to `[]`, which is not a shortcut: /admin/user/[id] builds its
   * `LoomState` with `links: []`, and an empty list is exactly the input that
   * makes `labelOf` fall back to the legacy string.
   */
  links?: Link[]
  mode?: ThreadCardMode
  /** Who threw it. /admin/aggregate is the only surface with more than one
   *  student in it, and the only one that has ever said this. */
  by?: string
  selected?: boolean
  /** Makes the whole card a target — the cohort list's "read this one out". */
  onSelect?: () => void
  /** Required by `mode="edit"`; ignored otherwise. */
  edit?: ThreadCardEdit
  /**
   * The card reduced to the thread itself — from, label, to — and the state
   * pill that says what it is. The SENTENCE is withheld (TJ, 2026-08-22: "the
   * thread cards need to be simpler, jsut show the thread, not description or
   * contributor, that will show up below when selected").
   *
   * For a LIST you scan, not a card you read: the cohort's Threads panel is
   * 316px wide and 67 cards long, and a description on every one of them made
   * a wall you had to read to find anything. Selecting a card still shows the
   * sentence in full, in the read-out, which is what "below when selected"
   * names. The contributor needs no flag — `by` is already opt-in and that
   * list simply stops passing it.
   *
   * The state pill STAYS. It is the one thing the card exists to hold — "a
   * pill appears if and only if the thread has a label" (thread-card.spec)
   * — and it is what the drawing's solid-vs-dashed arcs agree with.
   */
  compact?: boolean
}) {
  /**
   * THE LABEL, RESOLVED ONCE. Empty string means unlabelled, which is a legal
   * and finished state (P0.3: "you can throw now and write it later"), not a
   * draft — so the pill is simply ABSENT rather than standing in with a word.
   *
   * The three surfaces this replaces each invented a different stand-in: the
   * truncated sentence, the literal word "description", and an arrow — and the
   * arrow was drawn in the SOLID pill, which is the beaten-thread mark, so
   * /admin/user/[id] showed every loose thread as labelled.
   */
  const label = labelOf(thread, links)

  /* Ends are NOT truncated. 02 cut them at 30 characters because its column is
     narrow; a card that wraps solves that everywhere, and ConceptCard already
     refuses to truncate a name in a card for the same reason. */
  const end = (c: Concept | undefined) => (c ? conceptNameText(c) : "?")

  /* The everyday-verb chips write straight into the field, so the field has to
     be reachable. Uncontrolled + a ref rather than controlled state, to match
     the siblings' fields exactly. */
  const labelRef = useRef<HTMLInputElement>(null)

  return (
    /* `.thread` and `.sent` are load-bearing for the suite, and `.sent` must
       stay a DIRECT CHILD of the root: thread-card.spec.ts asserts exactly
       that (`.thread[data-edge-id] > .sent`). The parent hops the specs used
       to take were rewritten to `data-edge-id` on 2026-08-18 — the stable hook
       named for its siblings `data-concept-id` and
       `data-passage-id`. Both are kept — the classes so nothing goes vacuously
       green, the attribute so the next change need not. */
    <div
      data-edge-id={thread.id}
      className={`thread ywcard ywthread${selected || edit?.open ? " sel" : ""}${onSelect ? " ispick" : ""}${edit?.open ? " open" : ""}`}
      data-mode={mode}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (!onSelect) return
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect() }
      }}
    >
      {/* THE TRIP OPENS THE CARD, the way a concept's name opens its own (TJ,
          2026-08-18: "if we are using the same card as in your work, clicking
          on the concept opens it"). It is the head in all but name — `.sent`
          has to stay a DIRECT CHILD of the root (thread-card.spec.ts), so there is no
          `.lhead` wrapper to hang the disclosure on, and the two lines that
          would be inside one carry it instead. */}
      <div
        className={`trip${edit ? " isopen" : ""}`}
        onClick={edit?.onToggle}
        role={edit ? "button" : undefined}
        tabIndex={edit ? 0 : undefined}
        aria-expanded={edit ? edit.open : undefined}
        onKeyDown={(e) => {
          if (!edit) return
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit.onToggle() }
        }}
      >
        <b>{end(from)}</b>
        {/* THE PILL IS THE LABEL; THE ARROW IS ONLY DIRECTION. With no label
            the ends had nothing between them and two long names ran together
            as one — measured on the seeded cloth at 1536: "negotiation of
            meaning  design as social process".
            An arrow rather than a stand-in word, and BARE rather than in the
            pill: the pill is bordered and sage because that is what the cloth
            draws a beaten thread in, so a glyph inside one says "labelled".
            That is the exact mistake /admin/user/[id] made until it adopted
            this card (2026-08-18) — a `→`
            in the solid pill, on every loose thread it listed. */}
        {label
          ? <span className="v">{label}</span>
          : <span className="tarrow" aria-hidden="true">→</span>}
        <b>{end(to)}</b>
      </div>

      {/* NOTHING WHERE THERE IS NOTHING (TJ, 2026-08-19: "the 'not described'
          take up a lot of space"). It carried a full italic line reading
          "thrown, not yet described — which is allowed", which is a paragraph
          spent on an absence; the pill below says it in one word instead. An
          undescribed thread is legal (P0.3, "you can throw now and write it
          later"), so this is a designation either way — just a cheaper one. */}
      {thread.sentence.trim() && !compact ? (
        <div className={`sent${edit ? " isopen" : ""}`} onClick={edit?.onToggle}>
          &ldquo;{thread.sentence}&rdquo;
        </div>
      ) : null}

      <div className="tmeta">
        {/* WHAT THIS THREAD IS, in one word. Sage and solid once a label has
            been distilled out of the sentence, grey and dashed while the
            sentence is the whole of it — the same two states the cloth draws
            its arcs in, so the pill and the drawing agree. A third state was
            being drawn as a whole line and is a pill now: a thread with no
            label AND no sentence has not been described at all, and calling
            that "description" was the one inaccurate thing on the card. */}
        {label
          ? <span className="pill beaten">label</span>
          : thread.sentence.trim()
            ? <span className="pill loose">description</span>
            : <span className="pill loose">not described</span>}
        {by ? <span className="cap">{by}</span> : null}
        {mode === "edit" && edit && (
          <span className="rm" onClick={edit.onRemove}>remove</span>
        )}
      </div>

      {mode === "edit" && edit?.open && (
        /* THE SIBLINGS' BODY, in the siblings' order: what it says, then what
           it is called. Both commit on blur and neither has a Save button —
           ConceptCard's Description and PassageCard's Note are written exactly
           this way, and a Save button beside a field that has already saved is
           an invitation to write twice. */
        <div className="tbody">
          <div className="defrow">
            <span className="label">
              Description <span className="labelsay">— the claim you would defend out loud</span>
            </span>
            {/* Uncontrolled and keyed on the saved value, as ConceptCard's is:
                the provider writes optimistically, and remounting on what
                landed keeps the field from going stale without fighting the
                caret. Clearing it is allowed and is NOT a deletion — it returns
                the thread to exactly the state a fresh throw can be in. */}
            <textarea
              key={`s:${thread.id}:${thread.sentence}`}
              className="conceptdef threadsentence"
              rows={2}
              placeholder="how these two hang together. Long and awkward is fine."
              defaultValue={thread.sentence}
              onBlur={(e) => {
                if (e.target.value.trim() !== thread.sentence.trim()) edit.onSaveSentence(e.target.value)
              }}
            />
          </div>

          <div className="defrow">
            <span className="label">
              Label <span className="labelsay">— optional; one short word, so this kind of link can recur</span>
            </span>
            <input
              key={`l:${thread.id}:${label}`}
              ref={labelRef}
              className="tinput threadlabel"
              placeholder="your word… e.g. leads to · contradicts · is part of"
              defaultValue={label}
              onBlur={(e) => {
                if (e.target.value.trim() !== label) edit.onSaveLabel(e.target.value)
              }}
            />
            {edit.ownLabels && edit.ownLabels.shown.length > 0 && (
              <>
                <span className="label addlabel">
                  Labels you have used before
                  {edit.ownLabels.rest > 0 && (
                    <span className="labelsay">
                      {" "}— the {edit.ownLabels.shown.length} you reach for most, of{" "}
                      {edit.ownLabels.shown.length + edit.ownLabels.rest}
                    </span>
                  )}
                </span>
                <div className="chips">
                  {edit.ownLabels.shown.map((link) => (
                    <span
                      key={link.id}
                      className="verbchip borrowed"
                      title={link.description || undefined}
                      onClick={() => edit.onAttachLink(link)}
                    >{link.label}</span>
                  ))}
                </div>
              </>
            )}
            {edit.suggestions && edit.suggestions.length > 0 && (
              <>
                <span className="label addlabel">
                  Stuck for a word? <span className="labelsay">tap an everyday suggestion</span>
                </span>
                <div className="chips">
                  {edit.suggestions.map((v) => (
                    /* FILLS the field rather than saving: a suggestion is a
                       starting point, not the answer, and returning focus is
                       what lets the student edit it into their own word (v14
                       did the same). The blur that follows is what commits. */
                    <span
                      key={v}
                      className="verbchip"
                      onClick={() => {
                        if (!labelRef.current) return
                        labelRef.current.value = v
                        labelRef.current.focus()
                      }}
                    >{v}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
