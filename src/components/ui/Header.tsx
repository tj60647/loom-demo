"use client"
import { useState } from "react"
import AuthButton from "./AuthButton"

export default function Header() {
  const [showAbout, setShowAbout] = useState(false)

  return (
    <>
      <header>
        <div className="wordmark">
          <svg width="17" height="12" viewBox="0 0 26 18" fill="none" stroke="#a8843f" strokeWidth="1.8">
            <path d="M2 15 L7 4 L12 15 L17 4 L22 15"/>
          </svg>
          <div>Loom<small>lay the warp · throw the weft</small></div>
        </div>
        <div className="spacer"></div>
        <AuthButton />
        <button 
          onClick={() => setShowAbout(true)} 
          className="helpbtn" 
          id="helpBtn" 
          title="how Loom works" 
          aria-label="how Loom works" 
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit" }}
        >
          ?
        </button>
      </header>

      {showAbout && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(240, 240, 240, 0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 10000
        }}>
          <div className="card" style={{ width: "90%", maxWidth: "600px", maxHeight: "85vh", overflowY: "auto", padding: "32px", boxShadow: "0 10px 40px rgba(0,0,0,0.15)", position: "relative" }}>
            <button 
              onClick={() => setShowAbout(false)}
              style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", fontSize: "20px", cursor: "pointer", opacity: 0.5 }}
            >✕</button>
            
            <h2 style={{ fontSize: "24px", marginBottom: "4px" }}>Loom</h2>
            <p className="hint" style={{ marginBottom: "24px" }}>Weaving Knowledge Through Shared Practice</p>

            <p style={{ lineHeight: "1.6", marginBottom: "24px" }}>Loom is a tool for emergent sense-making and collaborative synthesis. It provides a space where reading, capturing, and connecting ideas form a living knowledge graph—built entirely by you and your community, without auto-generation.</p>

            <h3 style={{ fontSize: "16px", marginBottom: "12px", borderBottom: "1px solid var(--rule)", paddingBottom: "4px" }}>What is Loom?</h3>
            <p style={{ lineHeight: "1.6", marginBottom: "12px" }}>Loom was born from the intersection of ethnographic research, theory, and practice. It is designed to help individuals and cross-disciplinary teams build shared understanding not by enforcing uniformity, but by negotiating differences.</p>

            <p style={{ lineHeight: "1.6", marginBottom: "8px" }}>The core workflow is simple:</p>
            <ul style={{ lineHeight: "1.6", marginBottom: "24px", paddingLeft: "20px" }}>
              <li style={{ marginBottom: "6px" }}><b>Read & Capture:</b> Read texts and distill passages into short "bytes" in your own words.</li>
              <li style={{ marginBottom: "6px" }}><b>Throw:</b> Pick two bytes and connect them.</li>
              <li style={{ marginBottom: "6px" }}><b>Name the Relation:</b> Define the "edge" between these ideas yourself, using your own phrasing or pulling a verb from one of the "tongues" (disciplinary thought styles).</li>
            </ul>
            <p style={{ lineHeight: "1.6", marginBottom: "24px" }}>Nothing is auto-generated. The tool only counts your own throws. The structure emerges organically from your coding: from open codes first, to axial reads across texts.</p>

            <h3 style={{ fontSize: "16px", marginBottom: "12px", borderBottom: "1px solid var(--rule)", paddingBottom: "4px" }}>Features</h3>
            <ul style={{ lineHeight: "1.6", marginBottom: "24px", paddingLeft: "20px" }}>
              <li style={{ marginBottom: "6px" }}><b>Bite-Sized Capture:</b> Synthesize complex readings into discrete, manageable nodes ("bytes").</li>
              <li style={{ marginBottom: "6px" }}><b>Intentional Connections ("Throws"):</b> The power of Loom lies in the edges. You decide exactly how two concepts relate.</li>
              <li style={{ marginBottom: "6px" }}><b>Disciplinary "Tongues":</b> The verbs we reach for to name a relation (e.g., constrains, refutes, betrays) aren't neutral; each belongs to a specific way of seeing the world. Loom lets you apply different lenses (e.g., "Cause & system" vs. "Stance & value") to the same connections to see how meaning shifts.</li>
              <li style={{ marginBottom: "6px" }}><b>The Woven Graph:</b> View your interconnected graph ("Read") and generate an "axial read"—a synthesized narrative spanning multiple texts that you can instantly copy as a draft.</li>
            </ul>

            <h3 style={{ fontSize: "16px", marginBottom: "12px", borderBottom: "1px solid var(--rule)", paddingBottom: "4px" }}>The Theory Behind the Tool</h3>
            <p style={{ lineHeight: "1.6", marginBottom: "8px" }}>Loom is built on foundational ideas from design theory, sociology, and ethnographic coding (see the concept deck for a deeper dive):</p>
            <ul style={{ lineHeight: "1.6", marginBottom: "12px", paddingLeft: "20px" }}>
              <li style={{ marginBottom: "8px" }}><b>Object Worlds (Bucciarelli):</b> Each discipline inhabits its own world with its own instruments and language. A mechanical engineer might name a connection "is the bottleneck for," while a humanist might say it "betrays" the text. Loom makes these differing worldviews visible and actionable.</li>
              <li style={{ marginBottom: "8px" }}><b>Communities of Practice (Wenger):</b> Shared vocabularies are learned by participating in a community, not just by being told. Loom enables a class or team to grow its own shared edge-vocabulary over time by doing the work together.</li>
              <li style={{ marginBottom: "8px" }}><b>Boundary Objects (Star):</b> How do people from distinct fields coordinate around one shared object without agreeing on exactly what it means? Loom serves as a cross-tongue boundary object—flexible enough to be locally useful, but robust enough to hold a common identity across groups.</li>
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
