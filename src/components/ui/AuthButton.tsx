"use client"

import { useSession } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { useReadings } from "@/components/providers/ReadingsProvider"
import CourseSwitch from "@/components/ui/CourseSwitch"
import GithubSignInButton from "@/components/ui/GithubSignInButton"
import { VIEW_AS_STUDENT_COOKIE } from "@/lib/viewAs"

export default function AuthButton({ isBranchPreview = false }: { isBranchPreview?: boolean }) {
  const { data: session, status } = useSession()
  const { course, refresh } = useReadings()
  const router = useRouter()
  const pathname = usePathname()

  if (status === "loading") {
    return <span className="label">Loading...</span>
  }

  if (session) {
    // The grades themselves moved out with the pill they drew — Identity.tsx
    // carries them now, and the note about reading them from the COURSE and
    // never from the session went with them, because that is where it applies.
    // The one unmasked read left in this file: it draws the way back out.
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
        {/* Whose syllabus this is, before whose account it is — and, when one
            person carries several courses, the place they pick which one
            (CourseSwitch keeps the single-course case as the exact quiet
            span this comment used to sit over). The divider stays here: it
            is row composition, not label behavior. */}
        {course && (
          <>
            <CourseSwitch course={course} />
            {/* Both are small mono caps, so without a rule they read as one
                run of text — "…FALL 2026 TEST USER A". */}
            <span
              aria-hidden="true"
              style={{ width: "1px", height: "13px", background: "var(--rule)", display: "inline-block" }}
            />
          </>
        )}
        {/* The NAME, the BADGE and SIGN OUT are not here any more — they are
            the workbench footer's left half (TJ, 2026-08-17), so that hiding
            the header on the reading station does not take identity or the way
            out with it. See Identity.tsx, which carries the same
            course-not-session derivation this file established.

            The lens stays. It is not identity, it is a mode you are in, and
            while it is on this button is the only route back. */}
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
      </div>
    )
  }

  // The header's button is the most prominent thing on a signed-out screen, so
  // on a branch preview it must not be the one door that cannot open. The
  // tester site is a Preview deployment too and keeps GitHub: its callback is
  // registered, its testers are real, and its data is theirs. GitHub returns
  // people only to the single address its OAuth App holds, and a preview has
  // its own — pressing it lands on GitHub's error page, which reads as a broken
  // deployment. Send them to the sign-in page, which carries the team-key form.
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {isBranchPreview ? (
        <Link className="btn" href="/auth/signin" data-tip="This is a preview — sign in with the team key">
          Open preview
        </Link>
      ) : (
        <GithubSignInButton />
      )}
    </div>
  )
}
