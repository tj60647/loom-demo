"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import KeepTab from "@/components/tabs/KeepTab"
import JourneyNav, { stationNumber } from "@/components/ui/JourneyNav"

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
      </main>
    )
  }

  return (
    <>
      <div className="scopebar">
        <Link href="/" className="scopeback">‹ library</Link>
        <span className="scopetitle">Keep</span>
        <span className="scopemeta">every reading at once — your projections as files, and the whole cloth behind them</span>
      </div>
      <JourneyNav active="keep" />
      <main>
        <KeepTab />
      </main>
      <footer>
        {/* Derived, like the workbench footer: Weave is hidden, so Keep is
            05 and not the 06 this line used to hardcode — the bar above said
            one number and the foot said another. */}
        <span className="fl">{stationNumber("keep")} — KEEP</span>
        <span className="fr">YOURS TO TAKE</span>
      </footer>
    </>
  )
}
