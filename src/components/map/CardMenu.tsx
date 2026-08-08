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
        <p className="ghostnote">No description yet — add one on 01 · Open.</p>
      )}

      <span className="cap" style={{ display: "block", marginTop: 12 }}>
        the passages behind it{bytes.length ? ` (${bytes.length})` : ""}
      </span>
      {bytes.length === 0 ? (
        <p className="ghostnote" style={{ color: "var(--red)" }}>
          No evidence — every concept should trace to a passage.
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
        <p className="ghostnote">…and {bytes.length - SHOWN} more, in the capture log.</p>
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
