"use client"

// What a card is made of: the student's working definition, the passages
// behind it, and where else they met the concept.
//
// Rendered as HTML positioned over the card table's SVG rather than inside it.
// A quote needs real text wrapping and SVG has none — the table's edge labels
// are hand-wrapped for exactly that reason. It also sits outside the SVG's
// pointer handlers, so opening a menu can never start a drag.

import type { Byte, Concept } from "@/lib/types"
import { short } from "@/lib/clothMath"

type CardMenuProps = {
  concept: Concept
  bytes: Byte[]
  /** Titles of the readings this concept is evidenced in. */
  where: string[]
  pinned: boolean
  left: number
  /**
   * Distance from the table's top or bottom edge. A card low on the table gets
   * `bottom`, so the menu opens upward instead of hanging off the table into
   * the page below it.
   */
  top?: number
  bottom?: number
  onHold: (conceptId: string) => void
  onRelease: () => void
  onTogglePin: () => void
}

const SHOWN = 4

export default function CardMenu({
  concept, bytes, where, pinned, left, top, bottom, onHold, onRelease, onTogglePin,
}: CardMenuProps) {
  return (
    <div
      className="cardmenu"
      style={{ left, top, bottom }}
      onPointerEnter={() => onHold(concept.id)}
      onPointerLeave={onRelease}
    >
      <div className="cardmenuhead">{concept.label}</div>

      {concept.def ? (
        <>
          <span className="cap">your description</span>
          <p className="cardmenudef">{concept.def}</p>
          <button type="button" className="btn ghost mini compact" onClick={onTogglePin}>
            {pinned ? "unpin from the card" : "pin to the card"}
          </button>
        </>
      ) : (
        <p className="ghostnote">No description yet — add one on 01 · Reading.</p>
      )}

      <span className="cap" style={{ display: "block", marginTop: 12 }}>
        the passages behind it{bytes.length ? ` (${bytes.length})` : ""}
      </span>
      {bytes.length === 0 ? (
        /* The twin of the string fixed in VocabularyTab on 2026-08-09, and it
           was still shipping here — on every card whose concept has no passage.
           Two rules, not one: "no evidence" is a designation and never a
           warning (red line 4; a Concept may precede its evidence, TJ
           2026-08-08), AND var(--red) is declared RESERVED for "the one
           selected thing" in globals.css, so using it as an alarm overloads
           the single hue this design system keeps for selection. */
        <p className="ghostnote">
          No passage evidences this yet — you may have named it ahead of its
          evidence, or its passages may have moved on.
        </p>
      ) : (
        bytes.slice(0, SHOWN).map((b) => (
          <div key={b.id} className="bytequote">
            <span className="src">{b.source || "—"}{b.location ? ` · ${b.location}` : ""}</span>
            <br />
            {short(b.content, 240)}
          </div>
        ))
      )}
      {bytes.length > SHOWN && (
        <p className="ghostnote">…and {bytes.length - SHOWN} more, in your work.</p>
      )}

      {/* The seam, on the table: the same idea met in more than one text.
          Counted, never advised. */}
      {where.length > 1 && (
        <>
          <span className="cap" style={{ display: "block", marginTop: 10 }}>where else you met it</span>
          <p className="cardmenuwhere">{where.join(" · ")}</p>
        </>
      )}
    </div>
  )
}
