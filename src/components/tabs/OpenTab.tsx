"use client"

import { useEffect, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import type { Byte } from "@/lib/types"
import { contentWords } from "@/lib/utils"

type OpenTabProps = {
  onGotoByte?: (byte: Byte) => void
  focusByteId?: string | null
  onFocusHandled?: () => void
}

export default function OpenTab({ onGotoByte, focusByteId, onFocusHandled }: OpenTabProps) {
  const { state, addConcept, addByte, editConcept, removeConcept } = useLoom()
  const [source, setSource] = useState("")
  const [location, setLocation] = useState("")
  const [content, setContent] = useState("")
  const [conceptLabel, setConceptLabel] = useState("")
  const [newConceptOnly, setNewConceptOnly] = useState("")

  const [openLogRows, setOpenLogRows] = useState<Record<string, boolean>>({})

  const handleAddByte = async () => {
    if (!content || !conceptLabel) return
    
    // Find concept or create it
    let concept = state.concepts.find(c => c.label.toLowerCase() === conceptLabel.toLowerCase())
    if (!concept) {
      concept = await addConcept(conceptLabel)
    }

    await addByte(concept.id, source, location, content)
    
    // reset form (keep source/location if user wants to enter multiple passages from same place)
    setContent("")
    setConceptLabel("")
  }

  const handleAddConceptOnly = async () => {
    if (!newConceptOnly) return
    if (!state.concepts.find(c => c.label.toLowerCase() === newConceptOnly.toLowerCase())) {
      await addConcept(newConceptOnly)
    }
    setNewConceptOnly("")
  }

  const toggleRow = (id: string) => {
    setOpenLogRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  useEffect(() => {
    if (!focusByteId) return
    const targetByte = state.bytes.find((b) => b.id === focusByteId)
    if (!targetByte) {
      onFocusHandled?.()
      return
    }

    setOpenLogRows((prev) => ({ ...prev, [targetByte.conceptId]: true }))

    const timer = window.setTimeout(() => {
      const target = document.querySelector(`[data-byte-id="${focusByteId}"]`) as HTMLElement | null
      target?.scrollIntoView({ behavior: "smooth", block: "center" })
      onFocusHandled?.()
    }, 40)

    return () => window.clearTimeout(timer)
  }, [focusByteId, onFocusHandled, state.bytes])

  return (
    <div className="two">
      <div className="card">
        <h2>Capture a byte</h2>
        <p className="do">Do this — paste a passage, then say what it's about <i>in your own words</i>.</p>
        <p className="hint">A “byte” is just a passage worth keeping. A crude concept name is fine — tap the passage's own words if you're stuck.</p>
        
        <div className="form-row">
          <span className="label">Source — author, work</span>
          <input 
            className="mono-in" 
            placeholder="Suchman, Plans and Situated Actions"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
        
        <div className="form-row">
          <span className="label">Location</span>
          <input 
            className="mono-in" 
            placeholder="ch. 3, p. 49"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        
        <div className="form-row">
          <span className="label">Passage</span>
          <textarea 
            placeholder="paste or type the passage…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="scaffold" style={{marginTop: "12px"}}>
            <div className="snote" style={{fontSize: "12px", color: "var(--ink-soft)"}}>
              Stuck naming it? You don't need a clever term — <b style={{color: "var(--ink)", fontWeight: 500}}>point at the words in the passage that carry the point</b> and tap to build the concept from the author's own words.
            </div>
            {content.trim() ? (
              <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {contentWords(content).map(w => (
                  <span 
                    key={w} 
                    className="chip" 
                    onClick={() => setConceptLabel(prev => prev ? `${prev} ${w}` : w)}
                    style={{
                      fontFamily: "var(--mono)", fontSize: "12px", background: "#fff", border: "1px solid var(--rule)", 
                      borderRadius: "12px", padding: "3px 9px", cursor: "pointer", color: "var(--ink)"
                    }}
                  >{w}</span>
                ))}
              </div>
            ) : (
              <div className="snote" style={{fontStyle: "italic", fontSize: "12px", color: "var(--ink-soft)", marginTop: "8px"}}>
                …paste a passage above and its words appear here to tap.
              </div>
            )}
            
            <details className="ladder" style={{marginTop: "12px", fontSize: "13px"}}>
              <summary style={{cursor: "pointer", color: "var(--sage)"}}>still stuck? a few ways in</summary>
              <ul style={{marginTop: "6px", paddingLeft: "20px", color: "var(--ink-soft)", lineHeight: "1.5"}}>
                <li>What is this passage an <b style={{color: "var(--ink)", fontWeight: 500}}>example of</b>?</li>
                <li>Tell a friend what this bit is about in <b style={{color: "var(--ink)", fontWeight: 500}}>five words</b>.</li>
                <li>What's the <b style={{color: "var(--ink)", fontWeight: 500}}>one move</b> the author is making here?</li>
                <li className="eg" style={{marginTop: "6px", color: "var(--ink-soft)"}}>
                  Just to show the shape — concepts in plain words: &nbsp;<i>"tools go invisible until they break" · "people just know how to go on"</i>
                </li>
              </ul>
              <div style={{marginTop: "6px", color: "var(--ink-soft)", fontSize: "12px"}}>
                A concept can be a phrase, not a word. It's provisional — rename it later, or type an existing name to reuse it.
              </div>
            </details>
          </div>
        </div>
        
        <div className="form-row">
          <span className="label">Concept — what's this bit about, in your words</span>
          <input 
            list="conceptOptions" 
            placeholder="e.g. plans just point you, you work it out as you go"
            value={conceptLabel}
            onChange={(e) => setConceptLabel(e.target.value)}
          />
          <datalist id="conceptOptions">
            {state.concepts.map(c => <option key={c.id} value={c.label} />)}
          </datalist>
        </div>
        
        <button 
          className="btn" 
          onClick={handleAddByte}
          disabled={!content || !conceptLabel}
        >
          Add byte
        </button>
      </div>

      <div className="card">
        <h2>Coding log <span className="n">{state.concepts.length}</span></h2>
        <p className="do calm">Everything you capture lands here, newest on top — your growing pile of concepts.</p>
        <p className="hint">The warp being laid, thread by thread. Click a row to open it; next, take these to <b>02 — Throw</b>.</p>
        
        <div className="scrollbox">
          {state.concepts.slice().reverse().map(concept => {
            const isOpen = openLogRows[concept.id]
            const conceptBytes = state.bytes.filter(b => b.conceptId === concept.id)
            
            return (
              <div key={concept.id} className={`lrow ${isOpen ? "open" : ""}`}>
                <div className="lhead" onClick={() => toggleRow(concept.id)} style={{ display: "flex", alignItems: "center" }}>
                  <div className="lconcept" style={{flex: 1}}>{concept.label}</div>
                  <div className="lsrc">{conceptBytes.length} bytes</div>
                  <button 
                    className="btn ghost mini" 
                    style={{padding: "2px 6px", minHeight: 0, margin: "0 0 0 8px", opacity: 0.6}} 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (window.confirm(`Are you sure you want to delete "${concept.label}"?\n\nThis will permanently delete all associated bytes and threads. This cannot be undone.`)) {
                        removeConcept(concept.id); 
                      }
                    }}
                    title="Delete concept"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M7 6l1 14h8l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M10 10v6M14 10v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                {isOpen && (
                  <div className="lbody">
                    <div className="defrow">
                      <input 
                        placeholder="working definition..." 
                        defaultValue={concept.def ?? ""}
                        onBlur={(e) => editConcept(concept.id, { def: e.target.value })}
                      />
                    </div>
                    {conceptBytes.map(b => (
                      <div key={b.id} data-byte-id={b.id} style={{ marginTop: "12px", borderBottom: "1px dotted var(--rule)", paddingBottom: "8px" }}>
                        <div className="passage">"{b.content}"</div>
                        <div className="src">
                          {b.source} {b.location}
                          <span className="rm-actions" style={{ marginLeft: "8px" }}>
                            <button
                              type="button"
                              className="rm"
                              style={{ marginRight: "8px", background: "none", border: "none", padding: 0 }}
                              onClick={() => onGotoByte?.(b)}
                              disabled={!b.sourceId && !b.source}
                              title={b.sourceId || b.source ? "Open this byte in the library PDF" : "No library source linked for this byte"}
                            >
                              goto
                            </button>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="quietrow">
          <input 
            list="conceptOptions" 
            placeholder="add a concept with no byte yet (rare)"
            value={newConceptOnly}
            onChange={(e) => setNewConceptOnly(e.target.value)}
          />
          <button className="btn ghost mini" onClick={handleAddConceptOnly}>Add</button>
        </div>
      </div>
    </div>
  )
}
