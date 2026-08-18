"use client"

import { useLoom } from "@/components/providers/LoomProvider"

/**
 * The app's one status line: blank at rest, the message for 1500ms after a
 * write (LoomProvider's `flash`).
 *
 * It lived in the header until 2026-08-17, which was fine while the header
 * stood on every station. The reading station hides the header now, and 01 is
 * where capture happens: `addPassage` calls `savedOk()`, and since the
 * highlight paints optimistically — before the server answers — that "saved"
 * is the only signal the yellow mark is real. So the light moved to the
 * journey bar, which survives everywhere (TJ, 2026-08-17).
 *
 * In the bar, not behind a control in it: a status is not a destination, and a
 * save light you have to open something to read is not a save light.
 *
 * The em-dash at rest is deliberate — the element keeps its width, so a
 * message arriving does not shove the row sideways.
 */
export default function SaveLight() {
  const { flashMsg } = useLoom()
  return (
    <span id="saveDot" role="status" aria-live="polite">
      {flashMsg ? `· ${flashMsg} ·` : "—"}
    </span>
  )
}
