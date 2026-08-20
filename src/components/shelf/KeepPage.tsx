"use client"

import { useSession } from "next-auth/react"
import KeepTab from "@/components/tabs/KeepTab"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"

export default function KeepPage() {
  const { data: session, status } = useSession()
  if (status === "loading") return <main><div className="empty" style={{ marginTop: "100px" }}><h2>Loading your loom...</h2></div></main>
  if (!session) return <main><div className="empty" style={{ marginTop: "100px" }}><h2>Welcome to Loom.</h2><span className="cap">Please sign in to continue</span></div><FirstRunWalkthrough autoOpen={false} /></main>
  return <>
    <div className="workspacehead"><span className="scopetitle">Export &amp; backup</span><span className="scopemeta">export, restore, and keep your work</span></div>
    <main><KeepTab /><FirstRunWalkthrough /></main>
  </>
}
