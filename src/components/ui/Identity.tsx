"use client"

import { signOut, useSession } from "next-auth/react"
import { useReadings } from "@/components/providers/ReadingsProvider"

/**
 * Who you are, and the way out — the workbench footer's left half (TJ,
 * 2026-08-17: "user name on left with any badge they may have like admin or
 * faculty… put a sign out next to user name").
 *
 * This used to sit in the header, inside AuthButton. It moved so the header
 * could be hidden on the reading station without taking identity with it — and
 * because the footer was print that restated the journey bar ("01 — READING")
 * while carrying nothing you could not already see.
 *
 * The grade comes from the COURSE, never from the session. `session.user
 * .isAdmin` is the site role and the student lens cannot touch it, which is
 * exactly how a "viewing as student" header kept wearing an Admin pill. The
 * course carries both grades, so `isStaff && !isAdmin` is Faculty. Kept
 * verbatim from AuthButton, where it was already right.
 */
export default function Identity() {
  const { data: session, status } = useSession()
  const { course } = useReadings()

  if (status === "loading" || !session) return null

  const isAdmin = !!course?.isAdmin
  const isStaff = !!course?.isStaff

  return (
    <span className="footid">
      {/* Sign out leads, left of the name (TJ, 2026-08-17) — the row reads as
          a control with its subject beside it, and the button lands on the
          window's own corner rather than after a name of unpredictable length.

          Ghost like its old row-mates: a solid button marks where you are or
          the one primary act, and signing out is neither.

          `compact` because `.btn.mini` carries min-height:36px — the same
          floor that made the reading toolbar 63px. Unreleased it set this
          footer to 47px, taller than the 36px band it replaced, on a row whose
          tallest text is 11px. With it the button is 23px, the same height as
          the buttons in the reading toolbar. */}
      <button className="btn ghost mini compact" onClick={() => signOut()} data-tip="sign out of Loom">
        Sign out
      </button>
      <span className="label">{session.user?.name || session.user?.email}</span>
      {isStaff && <span className="pill beaten">{isAdmin ? "Admin" : "Faculty"}</span>}
    </span>
  )
}
