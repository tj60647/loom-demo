import Link from "next/link"
import GithubSignInButton from "@/components/ui/GithubSignInButton"
import { ROSTER_CONTACT_EMAIL, signInMessage } from "@/lib/signIn"

/**
 * Where a refused sign-in lands: the codes that *end* an attempt, rather than
 * the retryable OAuth ones NextAuth sends back to /auth/signin.
 *
 * Two of them are Loom's own — NoVerifiedEmail and NotOnRoster, returned as
 * redirect paths from the signIn callback — because "GitHub confirmed no
 * address we can match" and "we matched you, and no course invited that
 * address" are fixed in different places, and telling a student only "access
 * denied" leaves them guessing which.
 *
 * The `email` parameter is echoed through displayEmail() inside signInMessage,
 * which re-normalizes it: whatever reaches this page is shaped like an email
 * even when the query string is written by hand.
 */
type AuthErrorPageProps = {
  searchParams?: Promise<{
    error?: string
    email?: string
  }>
}

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const params = await searchParams
  const message = signInMessage(params?.error, params?.email)

  return (
    <main>
      <div
        className="empty"
        style={{ marginTop: "100px", maxWidth: "680px", marginLeft: "auto", marginRight: "auto" }}
      >
        <h2>{message.title}</h2>

        <span className="cap" style={{ display: "block", marginTop: "10px", textTransform: "none" }}>
          {message.body}
        </span>

        {message.contact && (
          <span className="cap" style={{ display: "block", marginTop: "8px", textTransform: "none" }}>
            email <a href={`mailto:${ROSTER_CONTACT_EMAIL}`}>{ROSTER_CONTACT_EMAIL}</a>, saying which email
            address is on your github account.
          </span>
        )}

        <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
          {message.retry && <GithubSignInButton className="btn" />}
          <Link href="/" className="btn ghost">Back to Loom</Link>
        </div>
      </div>
    </main>
  )
}
