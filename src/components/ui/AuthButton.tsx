"use client"

import { signIn, signOut, useSession } from "next-auth/react"
import { usePathname } from "next/navigation"

export default function AuthButton() {
  const { data: session, status } = useSession()
  // Inside /admin the AdminNav already offers these, so the header's copies are
  // duplicate navigation — "Cohort Map" appeared twice on the same screen.
  const inAdmin = usePathname()?.startsWith("/admin") ?? false

  if (status === "loading") {
    return <span className="label">Loading...</span>
  }

  if (session) {
    const isAdmin = session.user?.isAdmin === true

    return (
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span className="label">{session.user?.name || session.user?.email}</span>
        {isAdmin && <span className="pill beaten">Admin</span>}
        {isAdmin && !inAdmin && <a href="/admin/aggregate" className="btn ghost mini">Cohort Map</a>}
        {isAdmin && !inAdmin && <a href="/admin" className="btn ghost mini">Administration</a>}
        <button className="btn mini" onClick={() => signOut()}>Sign out</button>
      </div>
    )
  }

  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
      <button className="btn" onClick={() => signIn("github")}>Sign in with GitHub</button>
    </div>
  )
}
