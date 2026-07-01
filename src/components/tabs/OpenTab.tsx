"use client"

import { useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"

export default function OpenTab() {
  const { state, addConcept, addByte, editConcept, removeConcept, removeByte } = useLoom()
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
                  >✕</button>
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
                      <div key={b.id} style={{ marginTop: "12px", borderBottom: "1px dotted var(--rule)", paddingBottom: "8px" }}>
                        <div className="passage">"{b.content}"</div>
                        <div className="src">
                          {b.source} {b.location} 
                          <span className="rm" style={{ marginLeft: "8px" }} onClick={() => removeByte(b.id)}>remove</span>
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
