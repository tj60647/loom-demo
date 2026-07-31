"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import KeepTab from "@/components/tabs/KeepTab"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"

export default function KeepPage() {
  const { data: session } = useSession()

  if (!session) {
    return (
      <main>
        <div className="empty" style={{ marginTop: "100px" }}>
          <h2>Welcome to Loom.</h2>
          <span className="cap">Please sign in to continue</span>
        </div>
        <FirstRunWalkthrough autoOpen={false} />
      </main>
    )
  }

  return (
    <>
      <div className="scopebar">
        <Link href="/" className="scopeback">‹ the shelf</Link>
        <span className="scopetitle">Keep</span>
        <span className="scopemeta">your whole artifact — every reading, in one file</span>
      </div>
      <main>
        <KeepTab />
        <FirstRunWalkthrough />
      </main>
      <footer>
        <span className="fl">05 — KEEP</span>
        <span className="fr">YOURS TO TAKE</span>
      </footer>
    </>
  )
}
