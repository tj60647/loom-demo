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
 * repository says on 02's bench, in its editor fold, in its export and in the
 * model.
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

import type { Concept, Edge, Link } from "@/lib/types"
import { labelOf } from "@/lib/linkResolve"
import { conceptNameText } from "@/lib/conceptName"

export type ThreadCardMode =
  /** Shown, never changed — the admin lists and 03's reading pane. */
  | "read"
  /** 02 · Linking's row: the two folds and the one destructive act. */
  | "edit"

export type ThreadCardEdit = {
  /** The description fold — open, and its contents. */
  editing: boolean
  onToggleEdit: () => void
  /** The label fold — open, and its contents. */
  naming: boolean
  onToggleName: () => void
  onRemove: () => void
  /** Whatever the host wants below `.tmeta`: the two folds live there, because
   *  their fields, chips and undo stack are 02's and not this card's. */
  folds?: React.ReactNode
}

export default function ThreadCard({
  thread,
  from,
  to,
  links = [],
  mode = "read",
  by,
  selected = false,
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

  return (
    /* `.thread` and `.sent` are load-bearing for the suite, and `.sent` must
       stay a DIRECT CHILD of the root: three specs take `.sent`'s parent as
       their handle on a row. `data-edge-id` is the stable hook that replaces
       that hop, named for its siblings `data-concept-id` and
       `data-passage-id`. Both are kept — the classes so nothing goes vacuously
       green, the attribute so the next change need not. */
    <div
      data-edge-id={thread.id}
      className={`thread ywcard ywthread${selected ? " sel" : ""}${onSelect ? " ispick" : ""}`}
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
      <div className="trip">
        <b>{end(from)}</b>
        {/* THE PILL IS THE LABEL; THE ARROW IS ONLY DIRECTION. With no label
            the ends had nothing between them and two long names ran together
            as one — measured on the seeded cloth at 1536: "negotiation of
            meaning  design as social process".
            An arrow rather than a stand-in word, and BARE rather than in the
            pill: the pill is bordered and sage because that is what the cloth
            draws a beaten thread in, so a glyph inside one says "labelled".
            That is the exact mistake /admin/user/[id] has been making — a `→`
            in the solid pill, on every loose thread it lists. */}
        {label
          ? <span className="v">{label}</span>
          : <span className="tarrow" aria-hidden="true">→</span>}
        <b>{end(to)}</b>
      </div>

      <div className="sent">&ldquo;{thread.sentence}&rdquo;</div>

      <div className="tmeta">
        {/* WHAT THIS THREAD IS, in one word. Sage and solid once a label has
            been distilled out of the sentence, grey and dashed while the
            sentence is the whole of it — the same two states the cloth draws
            its arcs in, so the pill and the drawing agree. */}
        {label
          ? <span className="pill beaten">label</span>
          : <span className="pill loose">description</span>}
        {by ? <span className="cap">{by}</span> : null}
        {mode === "edit" && edit && (
          <>
            <span className="act" onClick={edit.onToggleEdit}>
              {edit.editing ? "close" : "edit description"}
            </span>
            {/* One word for one control (TJ, 2026-08-12). It read "coin a
                label" on a thread with none and "edit label" on one with a
                label — the pill beside it already says which of the two this
                thread is. */}
            <span className="act" onClick={edit.onToggleName}>
              {edit.naming ? "close" : "edit label"}
            </span>
            <span className="rm" onClick={edit.onRemove}>remove</span>
          </>
        )}
      </div>

      {/* The folds are the HOST's. Their fields, their chips, their undo stack
          and their two save buttons are 02's business — the card's job is to
          say where they open, which is under the meta line and inside the
          card's own root, because every control a spec reaches for must be
          scoped to the row it belongs to. */}
      {mode === "edit" && edit?.folds}
    </div>
  )
}
