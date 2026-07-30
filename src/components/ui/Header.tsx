"use client"
import { useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useLoom } from "@/components/providers/LoomProvider"
import { buildExport, buildMarkdown, exportFilename, parseImport } from "@/lib/graphExport"
import AuthButton from "./AuthButton"

export default function Header() {
  const { data: session } = useSession()
  const { state, studentName, flashMsg, importFromText, resetAll } = useLoom()
  const [showAbout, setShowAbout] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const download = (text: string, filename: string, type: string) => {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleExportJson = () => {
    download(JSON.stringify(buildExport(state, studentName), null, 2), exportFilename(studentName, "json"), "application/json")
  }

  const handleExportMd = () => {
    download(buildMarkdown(state, studentName), exportFilename(studentName, "md"), "text/markdown")
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) {
      input.value = ""
      return
    }
    try {
      const text = await file.text()
      let parsed
      try {
        parsed = parseImport(text)
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err))
        return
      }
      if (!confirm(
        "Importing replaces your current cloth with " + parsed.concepts.length + " concepts, " +
        parsed.bytes.length + " passages, " + parsed.edges.length + " threads. Your weaving history is kept. Continue?"
      )) return
      try {
        await importFromText(text)
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err))
      }
    } finally {
      input.value = ""
    }
  }

  const handleReset = () => {
    if (confirm("Clear everything and start blank? This wipes your cloth for this course (Export first if you want to keep it). Your weaving history is kept.")) {
      resetAll()
    }
  }

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
        {session && (
          <>
            <span id="saveDot">{flashMsg ? `· ${flashMsg} ·` : "—"}</span>
            <button className="btn ghost mini" onClick={handleExportJson}>Export .json</button>
            <button className="btn ghost mini" onClick={handleExportMd}>Export .md</button>
            <button className="btn ghost mini" onClick={() => importInputRef.current?.click()}>Import</button>
            <button className="btn ghost mini" onClick={handleReset}>Reset</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
          </>
        )}
        <AuthButton />
        <span
          onClick={() => setShowAbout(true)}
          style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--ink-soft)", cursor: "pointer", letterSpacing: ".04em", alignSelf: "center" }}
        >
          about
        </span>
        <button
          onClick={() => window.dispatchEvent(new Event("loom:walkthrough"))}
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
              <li style={{ marginBottom: "6px" }}><b>Read & Capture:</b> Keep passages worth keeping as short "bytes" — the author's words, verbatim, with citation. Name the concept each passage evidences, and gloss it in your own words in the working definition.</li>
              <li style={{ marginBottom: "6px" }}><b>Throw:</b> Pick two concepts and connect them.</li>
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
