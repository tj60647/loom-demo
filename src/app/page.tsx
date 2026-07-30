"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useLoom } from "@/components/providers/LoomProvider"
import OpenTab from "@/components/tabs/OpenTab"
import ThrowTab from "@/components/tabs/ThrowTab"
import ReadTab from "@/components/tabs/ReadTab"
import MapTab from "@/components/tabs/MapTab"
import LibraryTab from "@/components/tabs/LibraryTab"
import KeepTab from "@/components/tabs/KeepTab"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"
import type { Byte } from "@/lib/types"

const FOOT: Record<"library" | "open" | "throw" | "read" | "map" | "keep", [string, string]> = {
  library: ["00 — LIBRARY", "CHOOSE A READING"],
  open: ["01 — OPEN", "LAY THE WARP"],
  throw: ["02 — THROW", "ONE THREAD AT A TIME"],
  read: ["03 — READ", "PULL A THREAD"],
  map: ["04 — MAP", "THE CARD TABLE"],
  keep: ["05 — KEEP", "YOURS TO TAKE"],
}

type Tab = "library" | "open" | "throw" | "read" | "map" | "keep"

/**
 * Tabs that stay mounted once visited, hidden by `.panel`'s display rule, the
 * way v14 kept every panel in the DOM. These four hold work in progress — a
 * half-typed throw sentence, the traced prompt on Read, the definitions
 * toggle on Map — which unmounting destroys. Library and Keep stay lazy:
 * Library fetches sources and can pull up a PDF, and Keep holds no state
 * worth preserving.
 */
const KEEP_ALIVE: ReadonlySet<Tab> = new Set<Tab>(["open", "throw", "read", "map"])

type LibraryNavTarget = {
  byteId: string
  sourceId: string | null
  sourceName: string | null
  pageNumber: number | null
}

export default function Home() {
  const { data: session } = useSession()
  const { isLoading } = useLoom()
  const [activeTab, setActiveTab] = useState<Tab>("open")
  const [libraryTarget, setLibraryTarget] = useState<LibraryNavTarget | null>(null)
  const [openTargetByteId, setOpenTargetByteId] = useState<string | null>(null)
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set<Tab>(["open"]))

  const goTo = (tab: Tab) => {
    setActiveTab(tab)
    setVisited((seen) => (seen.has(tab) ? seen : new Set(seen).add(tab)))
  }

  // Keep-alive tabs render once visited and thereafter stay in the DOM; the
  // rest mount only while active.
  const shouldRender = (tab: Tab) => (KEEP_ALIVE.has(tab) ? visited.has(tab) : activeTab === tab)

  const handleGotoLibraryByte = (byte: Byte) => {
    setLibraryTarget({
      byteId: byte.id,
      sourceId: byte.sourceId,
      sourceName: byte.source,
      pageNumber: byte.pageNumber,
    })
    goTo("library")
  }

  const handleGotoOpenByte = (byteId: string) => {
    setOpenTargetByteId(byteId)
    goTo("open")
  }

  // The walkthrough mounts in every state so the header's "?" is never a dead
  // control; it only opens itself unasked once a student is signed in.
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

  if (isLoading) {
    return (
      <main>
        <div className="empty" style={{ marginTop: "100px" }}>
          <h2>Loading your loom...</h2>
        </div>
        <FirstRunWalkthrough autoOpen={false} />
      </main>
    )
  }

  return (
    <>
      <nav>
        <button 
          className={activeTab === "library" ? "active" : ""} 
          onClick={() => goTo("library")}
        >
          <span className="step">00 —</span>Library
        </button>
        <button 
          className={activeTab === "open" ? "active" : ""} 
          onClick={() => goTo("open")}
        >
          <span className="step">01 —</span>Open
        </button>
        <button 
          className={activeTab === "throw" ? "active" : ""} 
          onClick={() => goTo("throw")}
        >
          <span className="step">02 —</span>Throw
        </button>
        <button 
          className={activeTab === "read" ? "active" : ""} 
          onClick={() => goTo("read")}
        >
          <span className="step">03 —</span>Read
        </button>
        <button
          className={activeTab === "map" ? "active" : ""}
          onClick={() => goTo("map")}
        >
          <span className="step">04 —</span>Map
        </button>
        <button
          className={activeTab === "keep" ? "active" : ""}
          onClick={() => goTo("keep")}
        >
          <span className="step">05 —</span>Keep
        </button>
      </nav>

      <main>
        <div className={`panel ${activeTab === "library" ? "active" : ""}`}>
          {shouldRender("library") && (
            <LibraryTab
              target={libraryTarget}
              onTargetHandled={() => setLibraryTarget(null)}
              onGotoOpenByte={handleGotoOpenByte}
            />
          )}
        </div>
        <div className={`panel ${activeTab === "open" ? "active" : ""}`}>
          {shouldRender("open") && (
            <OpenTab
              onGotoByte={handleGotoLibraryByte}
              focusByteId={openTargetByteId}
              onFocusHandled={() => setOpenTargetByteId(null)}
            />
          )}
        </div>
        <div className={`panel ${activeTab === "throw" ? "active" : ""}`}>
          {shouldRender("throw") && <ThrowTab />}
        </div>
        <div className={`panel ${activeTab === "read" ? "active" : ""}`}>
          {shouldRender("read") && <ReadTab />}
        </div>
        <div className={`panel ${activeTab === "map" ? "active" : ""}`}>
          {shouldRender("map") && <MapTab />}
        </div>
        <div className={`panel ${activeTab === "keep" ? "active" : ""}`}>
          {shouldRender("keep") && <KeepTab />}
        </div>
        <FirstRunWalkthrough />
      </main>

      <footer>
        <span className="fl">{FOOT[activeTab][0]}</span>
        <span className="fr">{FOOT[activeTab][1]}</span>
      </footer>
    </>
  )
}
