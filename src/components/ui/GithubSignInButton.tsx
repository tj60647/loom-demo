"use client"

import { signIn } from "next-auth/react"

/**
 * The default way into Loom. Naming the provider in signIn() sends the student
 * straight to GitHub — no provider list to walk past. The guest email link
 * (GuestEmailSignIn, folded away where mail is configured) is the other door.
 */
export default function GithubSignInButton({
  className = "btn mini",
  callbackUrl,
  children = "Sign in with GitHub",
}: {
  className?: string
  callbackUrl?: string
  children?: React.ReactNode
}) {
  return (
    <button
      className={className}
      onClick={() => signIn("github", callbackUrl ? { callbackUrl } : undefined)}
      data-tip="loom finds your course by the email on your github account"
    >
      {children}
    </button>
  )
}
