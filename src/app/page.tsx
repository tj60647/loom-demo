"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useLoom } from "@/components/providers/LoomProvider"
import OpenTab from "@/components/tabs/OpenTab"
import ThrowTab from "@/components/tabs/ThrowTab"
import ReadTab from "@/components/tabs/ReadTab"

export default function Home() {
  const { data: session } = useSession()
  const { isLoading } = useLoom()
  const [activeTab, setActiveTab] = useState<"open" | "throw" | "read">("open")

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
        <div className={`panel ${activeTab === "open" ? "active" : ""}`}>
          {activeTab === "open" && <OpenTab />}
        </div>
        <div className={`panel ${activeTab === "throw" ? "active" : ""}`}>
          {activeTab === "throw" && <ThrowTab />}
        </div>
        <div className={`panel ${activeTab === "read" ? "active" : ""}`}>
          {activeTab === "read" && <ReadTab />}
        </div>
      </main>
      
      <footer>
        <span className="fl">Loom</span>
        <span className="fr">v8—Next</span>
      </footer>
    </>
  )
}
