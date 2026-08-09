"use client"

import { signOut, useSession } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import { useReadings } from "@/components/providers/ReadingsProvider"
import GithubSignInButton from "@/components/ui/GithubSignInButton"
import { VIEW_AS_STUDENT_COOKIE } from "@/lib/viewAs"

export default function AuthButton() {
  const { data: session, status } = useSession()
  const { course, refresh } = useReadings()
  const router = useRouter()
  const pathname = usePathname()

  if (status === "loading") {
    return <span className="label">Loading...</span>
  }

  if (session) {
    // From the COURSE, not the session. `session.user.isAdmin` is the site
    // role and the student lens cannot touch it — which is exactly how a
    // "viewing as student" header would have kept wearing an Admin pill.
    // The course carries both grades, so `isStaff && !isAdmin` is Faculty.
    const isAdmin = !!course?.isAdmin
    const isStaff = !!course?.isStaff
    // The one unmasked read in this file: it draws the way back out.
    const staffTruly = !!course?.staffTruly
    const asStudent = !!course?.viewingAsStudent

    const setLens = (on: boolean) => {
      // A display preference, set where it is toggled. Not httpOnly on purpose
      // — it only ever withholds, so there is nothing to protect from its
      // owner (src/lib/viewAs.ts). refresh() because the masking happens in a
      // server action, so the value has to be re-fetched to take effect.
      document.cookie = `${VIEW_AS_STUDENT_COOKIE}=${on ? "1" : ""}; path=/; max-age=${on ? 60 * 60 * 12 : 0}; samesite=lax`
      // BOTH, and both are needed. `refresh()` re-runs ReadingsProvider's own
      // fetch of getActiveCourse — which is where the mask lives, and which
      // router.refresh() does not touch because it is a client fetch to a route
      // handler, not a server render. `router.refresh()` is for the surfaces
      // that decide on the server instead: /workflows and the shelf query.
      refresh()
      // Standing on /admin when the lens goes on means standing somewhere no
      // student can reach — and with the staff group masked away there is
      // nothing on the page that admits it. Leave for the Library, which is
      // where a student would be. (The /admin gate itself is untouched: this
      // is a lens, not a lock, and typing the URL still works.)
      if (on && pathname?.startsWith("/admin")) router.push("/")
      else router.refresh()
    }

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
        {/* The role, and the lens. Roster / Cohort Graph / Readings / Courses
            used to sit here as an "Administration" and a "Cohort Map" button;
            since 2026-08-09 they are the journey bar's staff group, on every
            surface, so the header keeps only who you are. */}
        {isStaff && <span className="pill beaten">{isAdmin ? "Admin" : "Faculty"}</span>}
        {staffTruly && (
          asStudent ? (
            /* Loud on purpose. A lens you cannot tell you are wearing is a
               way to misread your own tool — and while it is on, this button
               is the only route back to the teaching surfaces. */
            <button
              className="btn mini"
              onClick={() => setLens(false)}
              data-tip="you are seeing Loom as a student does — click to return"
            >
              Viewing as student ✕
            </button>
          ) : (
            <button
              className="btn ghost mini"
              onClick={() => setLens(true)}
              data-tip="see Loom exactly as a student does — hides the overlays and the teaching surfaces"
            >
              View as student
            </button>
          )
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
      <GithubSignInButton />
    </div>
  )
}
