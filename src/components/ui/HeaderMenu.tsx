"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The header's menu: My loom and About (TJ, 2026-08-17).
 *
 * The button is a 4x4 GRID, not a hamburger (TJ). Three lines crossing three
 * lines is what this app is called: warp and weft, and the cloth they make.
 * A hamburger says "there is a list behind this" in the same voice every other
 * site says it; the grid says whose list.
 *
 * Three low-frequency destinations that were three standing buttons. None of
 * them is a control you reach for while working — you open your loom to look
 * at it, read your flow once, or read what Loom is — so they cost header room
 * every second of every session to be pressed a handful of times.
 *
 * NOT everything folds in. The guide and full screen stay out as their own
 * icons: the guide because it is meant to be found by someone who is lost
 * (TJ, 2026-08-11), and full screen because it is a toggle you flip rather
 * than a place you go.
 *
 * This is the same shape as the hamburger PR #20 proposed and TJ closed —
 * arrived at from the other direction. That one hid six items because reading
 * focus had taken their bar away, including the way out; this one folds three
 * because they do not earn a standing slot, and Sign out is in the footer.
 *
 * The interaction is StationSearch's, deliberately: Escape closes and hands
 * focus back to the button, and a pointer outside closes. Both items open a
 * modal now that Workflows is gone, so nothing here navigates — but the
 * pointerdown listener stays on the capture phase, which is what would catch
 * a click on a link before the navigation raced it if one ever returns.
 */
export default function HeaderMenu({
  onAbout,
  onMyLoom,
  showMyLoom,
}: {
  onAbout: () => void
  onMyLoom: () => void
  /**
   * An empty loom is a fact about a student, and there is no student here
   * without one — so this is off when signed out. About is NOT: it was the
   * one item of the three a visitor could always reach, and folding the menu
   * away behind a session would have quietly taken it from them.
   */
  showMyLoom: boolean
}) {
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown, true)
    }
  }, [open])

  // A modal opening under a menu that is still up would leave the menu over
  // it; close first, then act.
  const pick = (go: () => void) => () => {
    setOpen(false)
    go()
  }

  return (
    <div className="headermenu" ref={hostRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn ghost mini iconly"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu — your loom, and about Loom"
        data-tip="your loom, and what Loom is"
      >
        <svg
          viewBox="0 0 24 24"
          width="1.95em"
          height="1.95em"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="butt"
          aria-hidden="true"
          focusable="false"
          style={{ verticalAlign: "-0.25em", flex: "none" }}
        >
          <path d="M9 3v18" /><path d="M15 3v18" />
          <path d="M3 9h18" /><path d="M3 15h18" />
        </svg>
      </button>

      {open && (
        <div className="headermenu-panel" role="menu" aria-label="Menu">
          {showMyLoom && (
            <button type="button" role="menuitem" className="headermenu-item" onClick={pick(onMyLoom)}>
              my loom
              <span className="headermenu-say">what you have made, and how to start over</span>
            </button>
          )}
          {/* WORKFLOWS IS NOT HERE (TJ, 2026-08-17): "maybe students just
              dont get workflow yet, it needs more development anyway." The
              diagrams are generated from src/lib/workflows.ts and are true, but
              being true is not the same as being ready to hand a student.

              Staff keep it — the journey bar's own staff group carries it, on
              every surface, and that is where someone who reads all three
              flows looks for it. So this is the student's link going away, not
              the page.

              The route is not gated, only unlinked. A student who types
              /workflows still reads their own flow, which is harmless and
              always was; "not yet" here means "not offered", and a redirect
              would be a lock nobody asked for. Nothing in workflows.ts changes
              either: the student flow never drew reading-your-own-flow as a
              step, so no node loses an edge. */}
          <button type="button" role="menuitem" className="headermenu-item" onClick={pick(onAbout)}>
            about
            <span className="headermenu-say">what Loom is, and the thinking behind it</span>
          </button>
        </div>
      )}
    </div>
  )
}
