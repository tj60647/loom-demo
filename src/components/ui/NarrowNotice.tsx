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
      {/* Short on purpose: at 834 the longer version ran to three rows with
          the button on its own line, which is a banner rather than a note. */}
      <span>
        Loom is built for a <b>wider screen</b>. Reading and capturing work here;
        the cloth and the board want more room.
      </span>
      <button
        className="btn ghost mini"
        aria-label="Dismiss this notice"
        onClick={() => {
          try {
            window.localStorage.setItem(DISMISSED, "1")
          } catch {
            // Nothing to do: it simply returns next visit.
          }
          setShow(false)
        }}
      >
        dismiss
      </button>
    </div>
  )
}
