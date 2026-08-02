"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import KeepTab from "@/components/tabs/KeepTab"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"
import JourneyNav from "@/components/ui/JourneyNav"

export default function KeepPage() {
  // See the note in Workbench: "loading" is not "signed out".
  const { data: session, status } = useSession()

  if (status === "loading") {
    return (
      <>
        <JourneyNav active="keep" />
        <main>
          <div className="empty" style={{ marginTop: "100px" }}>
            <h2>Loading your loom...</h2>
          </div>
        </main>
      </>
    )
  }

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
        <Link href="/" className="scopeback">‹ readings</Link>
        <span className="scopetitle">Keep</span>
        <span className="scopemeta">your maps as files, and the whole cloth behind them</span>
      </div>
      <JourneyNav active="keep" />
      <main>
        <KeepTab />
        <FirstRunWalkthrough />
      </main>
      <footer>
        <span className="fl">06 — KEEP</span>
        <span className="fr">YOURS TO TAKE</span>
      </footer>
    </>
  )
}
