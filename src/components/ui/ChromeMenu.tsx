"use client"

// The header's chrome, folded into one button.
//
// Reading focus (2026-08-15) stands the app header down so the station is just
// the text — and took About, My loom, Workflows, the guide, full screen and
// sign out down with it. They were not meant to be gone, only out of the way,
// so they come back here: one ☰ at the right-hand end of the journey bar, the
// row that is already standing.
//
// The SAME items and the SAME guards as Header draws inline. Where the two
// could drift they don't: the dialogs are AboutModal and MyLoomModal, and the
// fullscreen state is useFullscreen, all shared with the header rather than
// reimplemented beside it.
//
// Mounted only in reading focus (Workbench passes it to JourneyNav), so the
// header's copy and this one are never both reachable, and only one set of
// dialog state exists at a time.

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useReadings } from "@/components/providers/ReadingsProvider"
import AuthButton from "./AuthButton"
import AboutModal from "./AboutModal"
import MyLoomModal from "./MyLoomModal"
import { useFullscreen } from "./useFullscreen"

export default function ChromeMenu({ inSandbox = false }: {
  /** Suppresses "start over" in My loom — the practice loom keeps nothing, so
   *  offering to clear a real loom from it is a confusion worth avoiding. */
  inSandbox?: boolean
}) {
  const { data: session } = useSession()
  // Masked by the student lens, which is what makes the Workflows item below
  // come back for a staff member viewing as a student — exactly as in Header.
  const { course } = useReadings()
  const [open, setOpen] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showMyLoom, setShowMyLoom] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { isFull, canFull, toggleFull } = useFullscreen()

  /**
   * Escape closes and hands focus back to the button that opened it. Pointer
   * outside closes too — this is a panel over the work, not a mode, so
   * reaching past it for the text you were reading should simply put it away.
   * (The same contract as StationSearch two slots to the left.)
   */
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
    // Capture: an item inside the panel may be a <Link>, and letting the bubble
    // phase decide would race the navigation.
    window.addEventListener("pointerdown", onDown, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown, true)
    }
  }, [open])

  // Opening a dialog puts the menu away: the panel is how you reached the
  // dialog, and leaving it standing behind an overlay only gives Escape two
  // things to close.
  const pick = (run: () => void) => () => { setOpen(false); run() }

  return (
    <>
      <div className="chromemenu" ref={hostRef}>
        <button
          ref={buttonRef}
          type="button"
          className={`btn mini${open ? "" : " ghost"} chromemenu-toggle`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Loom — about, your loom, the guide, full screen and your account"
          data-tip="about, your loom, the guide, full screen"
        >
          ☰
        </button>

        {open && (
          <div className="chromemenu-panel" role="menu" aria-label="Loom">
            <button className="chromemenu-item" role="menuitem" onClick={pick(() => setShowAbout(true))}>
              about
              <span className="chromemenu-note">what Loom is, and the thinking behind it</span>
            </button>

            {session && (
              <button className="chromemenu-item" role="menuitem" onClick={pick(() => setShowMyLoom(true))}>
                my loom
                <span className="chromemenu-note">what you have made, and how to start over</span>
              </button>
            )}

            {/* Drawn only for those with no staff group to carry it — the same
                rule as Header, so the bar and this panel never both offer it. */}
            {session && !course?.isStaff && (
              <Link href="/workflows" className="chromemenu-item" role="menuitem" onClick={() => setOpen(false)}>
                workflows
                <span className="chromemenu-note">how you move through Loom, step by step</span>
              </Link>
            )}

            {session && (
              <Link href="/sandbox" className="chromemenu-item" role="menuitem" onClick={() => setOpen(false)}>
                guide
                <span className="chromemenu-note">walk every move on a real reading, nothing is kept</span>
              </Link>
            )}

            {/* Hidden where the browser will not grant it (an iframe without
                allowfullscreen, a locked-down kiosk) rather than offered dead.
                menuitemcheckbox, not menuitem: it is the one item here that
                latches, and `aria-pressed` is not a thing a menuitem has. */}
            {session && canFull && (
              <button className="chromemenu-item" role="menuitemcheckbox" onClick={pick(toggleFull)} aria-checked={isFull}>
                {isFull ? "exit full screen" : "full screen"}
                <span className="chromemenu-note">
                  {isFull ? "back to the browser (esc)" : "give Loom the whole screen"}
                </span>
              </button>
            )}

            {/* The account, last and under a rule: it is who you are, not
                somewhere to go. `isBranchPreview` is deliberately not threaded
                here — it only governs the SIGNED-OUT door ("Open preview"),
                and there is no signed-out reader in reading focus. */}
            <div className="chromemenu-account">
              <AuthButton />
            </div>
          </div>
        )}
      </div>

      {showMyLoom && <MyLoomModal onClose={() => setShowMyLoom(false)} allowReset={!inSandbox} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </>
  )
}
