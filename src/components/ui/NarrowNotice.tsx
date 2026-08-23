"use client"

/**
 * WHAT LOOM IS BUILT FOR, said once, on a screen too small for it.
 *
 * TJ, 2026-08-23: "perhaps a 'this app works best on…' it is not intended as a
 * 'select text on phone' kind of app, although reading there should be
 * possible."
 *
 * Both halves matter. Loom's standard is a desktop tool — floor 1280, target
 * ~1600 (AGENTS.md) — and the work surfaces say so: the cloth wants 480px of
 * its own before it starts scrolling, the board is a drag surface, and the
 * reading station's margin cards need a margin to sit in. Below 900 the viewer
 * already drops to one page at a time rather than a spread, deliberately.
 *
 * But reading is not the same ask as weaving, and a reader on a tablet is
 * doing something reasonable. Measured on WebKit at an iPad Pro 11 in
 * portrait (834 x 1194): a reading opens, its text layer draws, a drag selects
 * the words and the capture arms. So this is a note about fit, not a wall —
 * one line, dismissible, and it does not come back.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM: anything about an Apple Pencil. The
 * question that prompted all of this was a Pencil that would not select, and
 * that is iPadOS gesture arbitration, which no test here can reach. Saying
 * "works with a Pencil" would be inventing evidence; saying "use a wider
 * screen" is true whatever the Pencil does.
 */

import { useEffect, useState } from "react"

/** Below this, Loom is out of its stated range — the same 900 PdfViewer uses
 *  to stop drawing two-page spreads (src/components/pdf/PdfViewer.tsx:838). */
const NARROW = 900
const DISMISSED = "loom.narrowNotice.dismissed"

export default function NarrowNotice() {
  // Starts hidden and is decided on the client: the server has no viewport,
  // and rendering it wide-then-hiding would flash a banner at every desktop
  // reader on first paint.
  const [show, setShow] = useState(false)

  useEffect(() => {
    const decide = () => {
      let dismissed = false
      try {
        dismissed = window.localStorage.getItem(DISMISSED) === "1"
      } catch {
        // Private browsing, or storage refused. A notice that cannot remember
        // being dismissed is worse than none, so treat it as dismissed.
        dismissed = true
      }
      setShow(!dismissed && window.innerWidth < NARROW)
    }
    decide()
    window.addEventListener("resize", decide)
    return () => window.removeEventListener("resize", decide)
  }, [])

  if (!show) return null

  return (
    <div className="narrownotice" role="note">
      {/**
        * ONE SENTENCE, AND IT IS ADVICE.
        *
        * It read "Loom is built for a wider screen. Reading and capturing work
        * here; the cloth and the board want more room." — three claims with no
        * speech act between them, and TJ said so: "is that an instruction? a
        * warning? a sentence?" It was none of them, and it explained itself in
        * words a reader on a tablet has never met. "The cloth" and "the board"
        * are Loom's names for its own surfaces; someone who has not reached
        * 03 yet has no referent for either.
        *
        * So: what to do, then what it costs. "Works best on" is the advice,
        * the clause after the dash is what you lose by ignoring it, and every
        * word in it is a word the reader already has.
        */}
      <span>
        Loom works best on a <b>wider screen</b> — you can read and capture passages
        here, but building your concept map needs more room.
      </span>
      {/* A × on the sentence's own line, not a word-button under it: spelled
          out, "dismiss" could not fit beside the text at 834 and took the
          notice to two rows and 73px — a banner, which is what a note about
          getting out of the way must not be. The accessible name carries the
          meaning the glyph cannot. */}
      <button
        className="btn ghost mini noticex"
        aria-label="Dismiss this notice"
        data-tip="hide this — it will not come back"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISSED, "1")
          } catch {
            // Nothing to do: it simply returns next visit.
          }
          setShow(false)
        }}
      >
        ×
      </button>
    </div>
  )
}
