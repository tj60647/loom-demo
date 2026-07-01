"use client"

import { signIn, signOut, useSession } from "next-auth/react"

export default function AuthButton() {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return <span className="label">Loading...</span>
  }

  if (session) {
    return (
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <span className="label">{session.user?.name || session.user?.email}</span>
        <a href="/admin/aggregate" className="btn ghost mini">Aggregate View</a>
        <a href="/admin" className="btn ghost mini">Admin</a>
        <button className="btn mini" onClick={() => signOut()}>Sign out</button>
      </div>
    )
  }

  return (
    <button className="btn" onClick={() => signIn("github")}>Sign in with GitHub</button>
  )
}
