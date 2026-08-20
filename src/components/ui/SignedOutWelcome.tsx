"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import GithubSignInButton from "@/components/ui/GithubSignInButton"
import { SIGN_IN_EXPLANATION } from "@/lib/signIn"

/**
 * The signed-out state, shared by the Library and the workbench.
 *
 * It exists because the workbench's own version of this was a dead end: a
 * session that expired mid-reading reloaded into "Please sign in to continue"
 * with no control on the page — and inside a reading the header, which
 * carries the other sign-in button, stands down (TJ, 2026-08-20: "the login
 * times out and if it happens on reading we have no way of logging back in").
 * One component rather than two copies, because the door is
 * environment-aware — on a branch preview GitHub sign-in cannot work (an
 * OAuth App holds one callback URL and every preview has its own address),
 * so the preview offers its own door instead — and two copies of that
 * branching is how one surface would keep offering the trap.
 *
 * Every door returns the reader to the reading they were in; the GitHub
 * button also keeps the exact page and tab (its default callbackUrl is the
 * full URL), while the two /auth/signin links carry the pathname alone —
 * query state (?tab=, ?page=) is dropped there, a known and accepted
 * narrowing, because carrying it would mean useSearchParams and the Suspense
 * boundary this component deliberately avoids. /auth/signin hands the
 * callbackUrl to all three of its doors.
 */
export default function SignedOutWelcome({
  isPreviewDeployment = false,
}: {
  isPreviewDeployment?: boolean
}) {
  const pathname = usePathname()
  const signinHref =
    pathname && pathname !== "/"
      ? `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`
      : "/auth/signin"

  return (
    <div
      className="empty"
      style={{ marginTop: "100px", maxWidth: "680px", marginLeft: "auto", marginRight: "auto" }}
    >
      <h2>Welcome to Loom.</h2>
      {/* The explanation is about matching a GitHub account to the roster,
          which is not the question on a preview — leaving it there told the
          reader to use GitHub in the sentence directly above the one saying
          GitHub cannot work. */}
      {!isPreviewDeployment && (
        <span className="cap" style={{ textTransform: "none" }}>{SIGN_IN_EXPLANATION}</span>
      )}

      {/* On a preview, GitHub sign-in cannot succeed — an OAuth App holds
          one callback URL and every preview has its own address, so GitHub
          refuses the redirect before Loom is ever asked. Offering the
          button anyway is a trap: it is the most prominent thing on the
          page, it fails on GitHub's own error screen, and the reader
          concludes the deployment is broken. So say where they are and
          send them to the door that works. */}
      {isPreviewDeployment ? (
        <div style={{ marginTop: "20px" }}>
          <span className="cap" style={{ display: "block", textTransform: "none" }}>
            this is a preview of work in progress — github sign-in cannot work here,
            because github only returns to one registered address and a preview has
            its own.
          </span>
          <Link
            href={signinHref}
            className="btn"
            style={{ display: "inline-block", marginTop: "16px" }}
          >
            Open this preview
          </Link>
        </div>
      ) : (
        <>
          <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
            <GithubSignInButton className="btn" />
          </div>
          {/* The guest door lives on /auth/signin, folded away, and whether it
              is open at all is a server question — so from here it is just a
              quiet way through for the one person who needs it. */}
          <Link href={signinHref} className="cap" style={{ display: "inline-block", marginTop: "16px", textTransform: "none" }}>
            no github account?
          </Link>
        </>
      )}
    </div>
  )
}
