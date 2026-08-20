"use client"

/**
 * HOW TWO CONCEPTS HANG TOGETHER — the field, and the openers that unstick it.
 *
 * Lifted out of ThrowTab on 2026-08-19, when the cloth gained a create-thread
 * card and needed to ask the same question (TJ: "we want a version of the 02
 * stage but streamlined as a popup with editable fields"). Shared rather than
 * copied for the reason this repo keeps relearning: the passage card drifted
 * between page mode and the canvas, and the capture form drifted between the
 * modal and the rail, both times because the second copy looked cheap.
 *
 * The OPENERS are the whole point of the control and not decoration. A student
 * asked to describe a relationship in the abstract writes nothing; handed a
 * half-sentence to finish, they finish it. Tapping one REPLACES whatever opener
 * is already there rather than stacking a second — you are choosing how the
 * sentence starts, not appending to it.
 *
 * The description is encouraged and never required (P0.3): a thread can be
 * thrown now and described later, so nothing here gates a throw.
 */

import { useRef } from "react"

export const OPENERS = [
  'this means that',
  'this explains why',
  'these are both about',
  'you can’t have this without that —',
  'this is an example of',
  'these pull against each other because',
  'these don’t obviously touch, except',
]

/** Swap in a new opening, leaving whatever was written after it alone. */
export function withOpener(sentence: string, opener: string) {
  let rest = sentence
  for (const o of OPENERS) {
    if (rest.startsWith(o + ' ')) rest = rest.slice((o + ' ').length)
  }
  return opener + ' ' + rest
}

export default function LinkDescription({
  value,
  onChange,
  textareaRef,
  label = "The link description — how they relate, however awkwardly",
  placeholder = "…or just start typing. Long and awkward is fine.",
  rows,
  openers = true,
}: {
  value: string
  onChange: (next: string) => void
  /** The bench focuses the field when a pair lands; the cloth's card does too. */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  label?: string
  placeholder?: string
  rows?: number
  /**
   * The opener chips. On by default, because on the bench they are the control
   * — a student asked to describe a relationship in the abstract writes
   * nothing, and one handed a half-sentence finishes it.
   *
   * Off on the cloth's create-thread card (TJ, 2026-08-19). That card is
   * explicitly the shortcut "for the student who has done the process 12
   * times", who is not stuck for an opening; and seven chips wrapping over
   * five rows is most of a 340px popup, so the scaffold was crowding out the
   * field it exists to help fill.
   */
  openers?: boolean
}) {
  const own = useRef<HTMLTextAreaElement>(null)
  const ref = textareaRef ?? own
  return (
    <div className="form-row">
      <span className="label">{label}</span>
      {openers && (
        <div className="chips" style={{ margin: "2px 0 6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {OPENERS.map((o) => (
            <span key={o} className="openchip" onClick={() => onChange(withOpener(value, o))}>
              {o}…
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        placeholder={placeholder}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
