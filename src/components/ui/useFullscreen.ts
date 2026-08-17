"use client"

import { useSyncExternalStore } from "react"

/** Module-level so the store identity is stable across renders. */
const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange)
  return () => document.removeEventListener("fullscreenchange", onChange)
}

/**
 * The whole screen, from every page (TJ, 2026-08-12). Extracted from Header so
 * the reading-focus menu can offer the same control while the header stands
 * down — one implementation, so the two copies of the button can never drift
 * into disagreeing about whether Loom is full screen.
 *
 * WHY IT EARNS A SLOT IN THE CHROME. Vertical is the scarce axis on a desktop
 * (contracts.md §2c-iii): at the 1280×800 floor there is ~600px of usable
 * height under the chrome, and the browser's own tab strip and URL bar are
 * ~90–120px of what is left. F11 has always done this; almost nobody presses
 * F11.
 *
 * NOT THE SAME CONTROL as the reading toolbar's "full screen", which is an
 * in-app mode — `.pdf-shell.fullscreen` covers Loom's own chrome so the text
 * fills the window.
 *
 * The state is read from the DOCUMENT, never from what we last asked for:
 * Esc, F11 and the browser's own affordances all leave fullscreen without
 * telling us, and a label that only tracked our own clicks would start lying
 * at the first Esc.
 */
export function useFullscreen() {
  const isFull = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenElement,
    () => false
  )
  const canFull = useSyncExternalStore(
    subscribeFullscreen,
    () => !!document.fullscreenEnabled,
    () => false
  )
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // A refused request (a policy, a gesture the browser did not count) is
      // not a failure worth a dialog — the button simply does not latch.
    }
  }
  return { isFull, canFull, toggleFull }
}
