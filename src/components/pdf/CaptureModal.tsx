"use client"

import { useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"

interface CaptureModalProps {
  passage: string;
  source: string;
  location: string;
  onClose: () => void;
}

export default function CaptureModal({ passage, source, location, onClose }: CaptureModalProps) {
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
      await addByte(concept.id, source, location, passage)
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
