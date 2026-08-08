"use client"

import { signIn } from "next-auth/react"

/**
 * The one way into Loom. Naming the provider in signIn() sends the student
 * straight to GitHub — there is no provider list to walk past, and there
 * should not be one while GitHub is the only provider.
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
