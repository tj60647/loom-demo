"use client"

import { signIn, signOut, useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { useReadings } from "@/components/providers/ReadingsProvider"

export default function AuthButton() {
  const { data: session, status } = useSession()
  const { course } = useReadings()
  // Inside /admin the AdminNav already offers these, so the header's copies are
  // duplicate navigation — "Cohort Map" appeared twice on the same screen.
  const inAdmin = usePathname()?.startsWith("/admin") ?? false

  if (status === "loading") {
    return <span className="label">Loading...</span>
  }

  if (session) {
    const isAdmin = session.user?.isAdmin === true

    return (
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {/* Whose syllabus this is, before whose account it is: one person can
            carry several courses, and every count on screen belongs to one of
            them. Quieter than the name so it reads as context, not identity. */}
        {course && (
          <>
            <span className="label" style={{ color: "var(--ochre)" }}>
              {course.name}
              {course.term ? ` · ${course.term}` : ""}
            </span>
            {/* Both are small mono caps, so without a rule they read as one
                run of text — "…FALL 2026 TEST USER A". */}
            <span
              aria-hidden="true"
              style={{ width: "1px", height: "13px", background: "var(--rule)", display: "inline-block" }}
            />
          </>
        )}
        <span className="label">{session.user?.name || session.user?.email}</span>
        {isAdmin && <span className="pill beaten">Admin</span>}
        {isAdmin && !inAdmin && (
          <a href="/admin/aggregate" className="btn ghost mini" data-tip="the cohort's collective cloth">
            Cohort Map
          </a>
        )}
        {isAdmin && !inAdmin && (
          <a href="/admin" className="btn ghost mini" data-tip="roster, readings, and courses">
            Administration
          </a>
        )}
        {/* Ghost like its row-mates: in this app a solid button marks where
            you are or the one primary act, and signing out is neither. */}
        <button className="btn ghost mini" onClick={() => signOut()} data-tip="sign out of Loom">
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
      <button className="btn mini" onClick={() => signIn("github")}>Sign in with GitHub</button>
    </div>
  )
}
