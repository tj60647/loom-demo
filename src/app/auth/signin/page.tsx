import Link from "next/link"
import GithubSignInButton from "@/components/ui/GithubSignInButton"
import GuestEmailSignIn from "@/components/ui/GuestEmailSignIn"
import PreviewDoor from "@/components/ui/PreviewDoor"
import { isBranchPreview, previewLoginNeedsKey } from "@/lib/previewLogin"
import { emailSignInConfigured } from "@/lib/auth"
import { ROSTER_CONTACT_EMAIL, signInMessage } from "@/lib/signIn"

/**
 * The sign-in screen. One button, one sentence — and, where mail is
 * configured, a folded-away second door for a guest with no GitHub account.
 * Folded because a visible choice is a choice students would have to make, and
 * for every one of them GitHub is the answer.
 *
 * It is also where NextAuth deposits the retryable OAuth failures — it
 * redirects OAuthSignin / OAuthCallback / OAuthAccountNotLinked and friends to
 * the sign-in route rather than to pages.error, on the reasoning that the way
 * out of them is to try again. So this page reads `?error=` too, and the copy
 * for every code lives in one table shared with /auth/error.
 *
 * A server component on purpose: reading searchParams here keeps useSearchParams
 * (and its Suspense boundary, and its build-time bail-out) out of the picture.
 */
type SignInPageProps = {
  searchParams?: Promise<{
    error?: string
    callbackUrl?: string
  }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams
  const failed = Boolean(params?.error)
  const message = signInMessage(params?.error)
  // Server-side only, and not NEXT_PUBLIC: which door this page offers is not
  // a decision to take on a value the client could set. The tester site is a
  // Preview deployment too and must keep the GitHub button — see isTesterSite.
  const isPreviewDeployment = isBranchPreview()

  return (
    <main>
      <div
        className="empty"
        style={{ marginTop: "100px", maxWidth: "680px", marginLeft: "auto", marginRight: "auto" }}
      >
        <h2>{failed ? message.title : "Welcome to Loom."}</h2>

        <span className="cap" style={{ display: "block", marginTop: "10px", textTransform: "none" }}>
          {message.body}
        </span>

        {message.contact && (
          <span className="cap" style={{ display: "block", marginTop: "8px", textTransform: "none" }}>
            still stuck? email <a href={`mailto:${ROSTER_CONTACT_EMAIL}`}>{ROSTER_CONTACT_EMAIL}</a>, saying
            which email address is on your github account.
          </span>
        )}

        {/* On a preview the GitHub button is not merely useless, it is
            misleading: it is the obvious thing to press and it fails on
            GitHub's own "Be careful!" screen, which reads as the deployment
            being broken rather than as a door that was never open. So a
            preview offers the door that does work, and does not offer the one
            that cannot. */}
        <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
          {message.retry && !isPreviewDeployment && (
            <GithubSignInButton className="btn" callbackUrl={params?.callbackUrl} />
          )}
          <Link href="/" className="btn ghost">Back to Loom</Link>
        </div>

        {message.retry && isPreviewDeployment && (
          <PreviewDoor callbackUrl={params?.callbackUrl} requiresKey={previewLoginNeedsKey()} />
        )}

        {message.retry && !isPreviewDeployment && emailSignInConfigured() && (
          <GuestEmailSignIn callbackUrl={params?.callbackUrl} />
        )}
      </div>
    </main>
  )
}
