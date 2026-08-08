import Link from "next/link"

/**
 * Where NextAuth lands someone after a sign-in link has been sent. Its built-in
 * version says "Check your email" over a NextAuth logo; this says the two
 * things that actually prevent a second, self-defeating attempt — that the link
 * only works once, and that asking again retires the one already sent.
 */
export default function VerifyRequestPage() {
  return (
    <main>
      <div
        className="empty"
        style={{ marginTop: "100px", maxWidth: "680px", marginLeft: "auto", marginRight: "auto" }}
      >
        <h2>Check your inbox.</h2>
        <span className="cap" style={{ display: "block", marginTop: "10px", textTransform: "none" }}>
          if that address is on a course roster, a sign-in link is on its way. it works once, and
          expires in a day — and asking for another retires the one you have, so use the most
          recent email.
        </span>
        <div style={{ marginTop: "20px", display: "flex", justifyContent: "center" }}>
          <Link href="/" className="btn ghost">Back to Loom</Link>
        </div>
      </div>
    </main>
  )
}
