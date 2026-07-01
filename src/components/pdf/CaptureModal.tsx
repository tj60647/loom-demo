"use client"

import { useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { contentWords } from "@/lib/utils"

interface CaptureModalProps {
  passage: string;
  source: string;
  location: string;
  pageNumber?: number;
  startOffset?: number;
  endOffset?: number;
  onClose: () => void;
}

export default function CaptureModal({ passage, source, location, pageNumber, startOffset, endOffset, onClose }: CaptureModalProps) {
  const { state, addConcept, addByte } = useLoom()
  const [conceptLabel, setConceptLabel] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCapture = async () => {
    if (!conceptLabel || !passage) return
    setIsSubmitting(true)
    try {
      let concept = state.concepts.find(c => c.label.toLowerCase() === conceptLabel.toLowerCase())
      if (!concept) {
        concept = await addConcept(conceptLabel)
      }
      await addByte(concept.id, source, location, passage, pageNumber, startOffset, endOffset)
      onClose()
    } catch(e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
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
      <div className="card" style={{ width: "100%", maxWidth: "450px", padding: "24px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
        <h2 style={{ marginBottom: "16px", fontSize: "18px" }}>Capture Byte</h2>
        
        <div style={{ marginBottom: "20px" }}>
          <span className="label">Passage</span>
          <div className="passage" style={{ maxHeight: "150px", overflowY: "auto", fontSize: "14px", color: "var(--ink)", padding: "12px", background: "var(--paper-alt)", borderRadius: "6px", border: "1px solid var(--rule)" }}>
            "{passage}"
          </div>
        </div>

        <div style={{ marginBottom: "20px", display: "flex", gap: "16px" }}>
          <div style={{ flex: 1 }}>
            <span className="label">Source</span>
            <div className="hint">{source}</div>
          </div>
          <div style={{ flex: 1 }}>
            <span className="label">Location</span>
            <div className="hint">{location}</div>
          </div>
        </div>

        <div className="form-row">
          <span className="label">Concept — what's this bit about?</span>
          <input 
            list="conceptOptionsModal" 
            placeholder="e.g. boundary objects"
            value={conceptLabel}
            onChange={(e) => setConceptLabel(e.target.value)}
            autoFocus
          />
          <datalist id="conceptOptionsModal">
            {state.concepts.map(c => <option key={c.id} value={c.label} />)}
          </datalist>

          <div className="scaffold" style={{marginTop: "12px"}}>
            <div className="snote" style={{fontSize: "12px", color: "var(--ink-soft)"}}>
              Stuck naming it? You don't need a clever term — <b style={{color: "var(--ink)", fontWeight: 500}}>point at the words in the passage that carry the point</b> and tap to build the concept from the author's own words.
            </div>
            {passage.trim() ? (
              <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {contentWords(passage).map(w => (
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
            ) : null}
            
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

        <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn" onClick={handleCapture} disabled={!conceptLabel || isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Byte"}
          </button>
        </div>
      </div>
    </div>
  )
}
