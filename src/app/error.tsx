"use client"

/**
 * WHEN A PAGE THROWS, SOMEBODY OTHER THAN THE STUDENT SHOULD KNOW.
 *
 * Found by an audit of the observability branch (2026-08-24): there was no
 * error boundary anywhere under src/, so a render crash showed Next's default
 * page and reached no log at all. That is the failure this whole branch is
 * about — TJ, on why the Sign-ins tab has to be a surface: "you found Cheng's
 * problem because he emailed you." A crash nobody records is a crash you learn
 * about the same way.
 *
 * TWO JOBS, and the first is the student's. They are mid-reading and something
 * broke; what they need is to know their work is safe and to have a way back.
 * Loom keeps every capture the moment it is made, so "nothing you captured is
 * lost" is a true sentence and worth saying — a blank error page invites
 * somebody to redo work that was never gone.
 *
 * The second is ours: the crash goes to the server log through /api/client-error,
 * so it lands on the same queryable stream as everything else rather than in a
 * browser console nobody is looking at. Best-effort by design — a boundary that
 * throws while reporting a throw helps nobody.
 */

import { useEffect } from "react"

export default function ReadingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    /**
     * `digest` is the id Next puts in the SERVER log for a server-side throw,
     * so sending it is what lets the two halves be joined up. For a client
     * throw there is no digest and the message is all there is.
     */
    const body = JSON.stringify({
      message: error.message,
      digest: error.digest ?? null,
      stack: error.stack?.split("\n").slice(0, 4).join("\n") ?? null,
      path: typeof window === "undefined" ? null : window.location.pathname,
    })
    // keepalive so the report survives the reader immediately navigating away,
    // which is what somebody meeting an error page usually does.
    fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* Reporting is best effort: a boundary that throws is worse than one
         that stays quiet. */
    })
  }, [error])

  return (
    <main>
      <div
        className="empty"
        style={{ marginTop: "100px", maxWidth: "620px", marginLeft: "auto", marginRight: "auto" }}
      >
        <h2>Something in Loom broke</h2>
        <span className="cap" style={{ display: "block", marginTop: "10px", textTransform: "none" }}>
          Not your doing, and nothing you captured is lost — passages, concepts and threads are
          kept the moment you make them. Try this page again; if it keeps happening, the error has
          been reported and you can say what you were doing to{" "}
          <a href="mailto:tjmcleish@berkeley.edu">tjmcleish@berkeley.edu</a>.
        </span>
        {error.digest ? (
          /* The one string that ties this screen to the server's own record of
             it. Worth showing precisely because a student can quote it. */
          <span className="cap" style={{ display: "block", marginTop: "8px" }}>
            reference {error.digest}
          </span>
        ) : null}
        <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
          <button className="btn" onClick={reset} data-tip="render this page again">
            Try again
          </button>
          {/* A PLAIN ANCHOR, deliberately. `<Link>` is a client-side
              navigation that keeps the same React tree and the same router —
              the tree that has just thrown. A document navigation is the one
              way out that cannot inherit whatever broke, which is the whole
              job of this button. The same reasoning the roster's Open Loom
              anchor gives for needing a real navigation. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn ghost" href="/" data-tip="back to your readings">
            Back to Loom
          </a>
        </div>
      </div>
    </main>
  )
}
