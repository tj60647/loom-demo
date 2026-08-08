"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { useLoom } from "@/components/providers/LoomProvider"
import AuthButton from "./AuthButton"

export default function Header({ deployEnv }: { deployEnv?: string }) {
  const { data: session } = useSession()
  const { flashMsg } = useLoom()
  const [showAbout, setShowAbout] = useState(false)
  // Nothing on an admin page writes to a loom, so the save dot sat there as a
  // bare em dash for the whole visit and read as a stray character.
  const inAdmin = usePathname()?.startsWith("/admin") ?? false
  // Anywhere that isn't the real site wears the red weft through the mark —
  // the same clue as the favicon and the dev OAuth app's logo.
  const isDev = deployEnv !== "production"

  return (
    <>
      <header>
        <div className="wordmark">
          <svg width="17" height="12" viewBox="0 0 26 18" fill="none" strokeWidth="1.8">
            <path d="M2 15 L7 4 L12 15 L17 4 L22 15" stroke="#a8843f"/>
            {isDev && <path d="M1 9.5 L23 9.5" stroke="#b23a2b" strokeWidth="1.6"/>}
          </svg>
          <div>
            Loom
            <small>
              lay the warp · throw the weft
              {isDev && <span style={{ color: "var(--red)" }}> · dev</span>}
            </small>
          </div>
        </div>
        <div className="spacer"></div>
        {session && !inAdmin && (
          <span id="saveDot">{flashMsg ? `· ${flashMsg} ·` : "—"}</span>
        )}
        <AuthButton />
        <button
          className="btn ghost mini"
          onClick={() => setShowAbout(true)}
          data-tip="what Loom is, and the thinking behind it"
        >
          about
        </button>
        <button
          onClick={() => window.dispatchEvent(new Event("loom:walkthrough"))}
          className="helpbtn"
          id="helpBtn"
          data-tip="how Loom works — the walkthrough"
          aria-label="how Loom works — open the walkthrough"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontFamily: "inherit" }}
        >
          ?
        </button>
      </header>

      {/* Same ink scrim as every other overlay — the light blurred backdrop
          was the one exception to the app's visual language. */}
      {showAbout && (
        <div className="info-scrim" onClick={(e) => { if (e.target === e.currentTarget) setShowAbout(false) }}>
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
              <li style={{ marginBottom: "6px" }}><b>Read & Capture:</b> Keep passages worth keeping — the author's words, verbatim, with citation. Name the concept each passage evidences, and gloss it in your own words in the description.</li>
              <li style={{ marginBottom: "6px" }}><b>Throw:</b> Pick two concepts and connect them.</li>
              <li style={{ marginBottom: "6px" }}><b>Name the Relation:</b> define the link between these ideas in your own phrasing.</li>
            </ul>
            <p style={{ lineHeight: "1.6", marginBottom: "24px" }}>Nothing is auto-generated. The tool only counts your own throws. The structure emerges organically from your coding: from open codes first, to axial reads across texts.</p>

            <h3 style={{ fontSize: "16px", marginBottom: "12px", borderBottom: "1px solid var(--rule)", paddingBottom: "4px" }}>Features</h3>
            <ul style={{ lineHeight: "1.6", marginBottom: "24px", paddingLeft: "20px" }}>
              <li style={{ marginBottom: "6px" }}><b>Bite-Sized Capture:</b> Keep the passages that matter as discrete passages — the author's words, verbatim, with their citation — each filed under a concept you name.</li>
              <li style={{ marginBottom: "6px" }}><b>Intentional Connections ("Throws"):</b> The power of Loom lies in the edges. You decide exactly how two concepts relate.</li>
              <li style={{ marginBottom: "6px" }}><b>The Woven Graph:</b> View your interconnected graph ("Read"), then write your own "axial read" across texts. Loom lays your threads out as material and counts what it sees; you write the reading, and copy it out as a draft.</li>
            </ul>

            <h3 style={{ fontSize: "16px", marginBottom: "12px", borderBottom: "1px solid var(--rule)", paddingBottom: "4px" }}>The Theory Behind the Tool</h3>
            <p style={{ lineHeight: "1.6", marginBottom: "8px" }}>Loom is built on foundational ideas from design theory, sociology, and ethnographic coding (see the concept deck for a deeper dive):</p>
            <ul style={{ lineHeight: "1.6", marginBottom: "12px", paddingLeft: "20px" }}>
              <li style={{ marginBottom: "8px" }}><b>Object Worlds (Bucciarelli):</b> Each discipline inhabits its own world with its own instruments and language. A mechanical engineer might name a connection "is the bottleneck for," while a humanist might say it "betrays" the text. Loom makes these differing worldviews visible and actionable.</li>
              <li style={{ marginBottom: "8px" }}><b>Communities of Practice (Wenger):</b> Shared vocabularies are learned by participating in a community, not just by being told. Loom enables a class or team to grow its own shared edge-vocabulary over time by doing the work together.</li>
              <li style={{ marginBottom: "8px" }}><b>Boundary Objects (Star):</b> How do people from distinct fields coordinate around one shared object without agreeing on exactly what it means? Loom serves as a cross-disciplinary boundary object—flexible enough to be locally useful, but robust enough to hold a common identity across groups.</li>
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
