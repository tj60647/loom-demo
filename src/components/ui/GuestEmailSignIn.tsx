"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { GUEST_SIGN_IN_EXPLANATION } from "@/lib/signIn"

/**
 * The guest door, behind a disclosure. Students have GitHub and should never
 * have to choose; someone invited to the course without a GitHub account has
 * to be able to find this, which is the whole reason it is here.
 *
 * Whether the address is on a roster is decided on the server — NextAuth runs
 * the sign-in gate before it sends anything, so an uninvited address gets the
 * same refusal page as it would from the GitHub door, and no email.
 */
export default function GuestEmailSignIn({ callbackUrl }: { callbackUrl?: string }) {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <details style={{ marginTop: "26px", textAlign: "center" }}>
      <summary className="cap" style={{ cursor: "pointer", textTransform: "none" }}>
        no github account?
      </summary>

      <form
        style={{
          marginTop: "14px",
          display: "flex",
          gap: "8px",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
        onSubmit={(e) => {
          e.preventDefault()
          if (busy || !email.trim()) return
          setBusy(true)
          // Leaves the page on success (the "check your inbox" screen) or on
          // refusal, so busy is never cleared — deliberately, to stop a second
          // submit retiring the link the first one just sent.
          signIn("email", { email: email.trim(), ...(callbackUrl ? { callbackUrl } : {}) })
        }}
      >
        <label className="cap" style={{ textTransform: "none" }} htmlFor="guest-email">
          {GUEST_SIGN_IN_EXPLANATION}
        </label>
        <input
          id="guest-email"
          type="email"
          required
          autoComplete="email"
          placeholder="the address the course invited"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ minWidth: "260px" }}
        />
        <button type="submit" className="btn ghost mini" disabled={busy}>
          {busy ? "Sending…" : "Email me a link"}
        </button>
      </form>
    </details>
  )
}
