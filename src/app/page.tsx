"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useLoom } from "@/components/providers/LoomProvider"
import OpenTab from "@/components/tabs/OpenTab"
import ThrowTab from "@/components/tabs/ThrowTab"
import ReadTab from "@/components/tabs/ReadTab"
import LibraryTab from "@/components/tabs/LibraryTab"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"
import type { Byte } from "@/lib/types"

type LibraryNavTarget = {
  byteId: string
  sourceId: string | null
  sourceName: string | null
  pageNumber: number | null
}

export default function Home() {
  const { data: session } = useSession()
  const { isLoading } = useLoom()
  const [activeTab, setActiveTab] = useState<"library" | "open" | "throw" | "read">("open")
  const [libraryTarget, setLibraryTarget] = useState<LibraryNavTarget | null>(null)
  const [openTargetByteId, setOpenTargetByteId] = useState<string | null>(null)

  const handleGotoLibraryByte = (byte: Byte) => {
    setLibraryTarget({
      byteId: byte.id,
      sourceId: byte.sourceId,
      sourceName: byte.source,
      pageNumber: byte.pageNumber,
    })
    setActiveTab("library")
  }

  const handleGotoOpenByte = (byteId: string) => {
    setOpenTargetByteId(byteId)
    setActiveTab("open")
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

  if (isLoading) {
    return (
      <main>
        <div className="empty" style={{ marginTop: "100px" }}>
          <h2>Loading your loom...</h2>
        </div>
      </main>
    )
  }

  return (
    <>
      <nav>
        <button 
          className={activeTab === "library" ? "active" : ""} 
          onClick={() => setActiveTab("library")}
        >
          <span className="step">00</span> Library
        </button>
        <button 
          className={activeTab === "open" ? "active" : ""} 
          onClick={() => setActiveTab("open")}
        >
          <span className="step">01</span> Open
        </button>
        <button 
          className={activeTab === "throw" ? "active" : ""} 
          onClick={() => setActiveTab("throw")}
        >
          <span className="step">02</span> Throw
        </button>
        <button 
          className={activeTab === "read" ? "active" : ""} 
          onClick={() => setActiveTab("read")}
        >
          <span className="step">03</span> Read
        </button>
      </nav>

      <main>
        <div className={`panel ${activeTab === "library" ? "active" : ""}`}>
          {activeTab === "library" && (
            <LibraryTab
              target={libraryTarget}
              onTargetHandled={() => setLibraryTarget(null)}
              onGotoOpenByte={handleGotoOpenByte}
            />
          )}
        </div>
        <div className={`panel ${activeTab === "open" ? "active" : ""}`}>
          {activeTab === "open" && (
            <OpenTab
              onGotoByte={handleGotoLibraryByte}
              focusByteId={openTargetByteId}
              onFocusHandled={() => setOpenTargetByteId(null)}
            />
          )}
        </div>
        <div className={`panel ${activeTab === "throw" ? "active" : ""}`}>
          {activeTab === "throw" && <ThrowTab />}
        </div>
        <div className={`panel ${activeTab === "read" ? "active" : ""}`}>
          {activeTab === "read" && <ReadTab />}
        </div>
        <FirstRunWalkthrough />
      </main>
      
      <footer>
        <span className="fl">Loom</span>
        <span className="fr">v8—Next</span>
      </footer>
    </>
  )
}
