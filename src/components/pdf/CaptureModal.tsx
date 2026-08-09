"use client"

import { useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { contentWords } from "@/lib/utils"
import { readingsOf } from "@/lib/scope"

interface CaptureModalProps {
  passage: string;
  source: string;
  sourceId?: string;
  location: string;
  pageNumber?: number;
  startOffset?: number;
  endOffset?: number;
  pageContentHash?: string;
  onClose: () => void;
  /**
   * A capture landed. Fired before onClose so the viewer can say so where the
   * reader is looking — until 2026-08-09 a capture taken from the page went
   * through in silence, the modal simply vanishing, and the only sign it had
   * worked was 1500ms of "· saved ·" in the far corner of the header.
   */
  onCaptured?: (passageId: string, conceptLabel: string, reuse?: CaptureReuse) => void;
}

/**
 * The concept this capture joined had already been evidenced in OTHER readings.
 *
 * Reported up rather than shown here, because the modal closes on save: the
 * acknowledgement belongs in the toast the viewer draws, where it can be read
 * against the page. Undefined whenever the concept is new, or was only ever
 * met in this reading — neither is ambiguous. See `ReuseOffer`.
 */
export type CaptureReuse = {
  conceptId: string
  label: string
  /** Titles of the other readings, resolved by the viewer via `titleOf`. */
  whereIds: string[]
  filledDescription: string
}

export default function CaptureModal({ passage, source, sourceId, location, pageNumber, startOffset, endOffset, pageContentHash, onClose, onCaptured }: CaptureModalProps) {
  const { state, addConcept, addPassage, editConcept } = useLoom()
  const [conceptLabel, setConceptLabel] = useState("")
  const [workingDef, setWorkingDef] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCapture = async () => {
    const cname = conceptLabel.trim()
    if (!cname || !passage) return
    setIsSubmitting(true)
    try {
      // Same rule as manual capture: the gloss fills a new concept, or an
      // existing one that has none, and never overwrites what you wrote before.
      const wdef = workingDef.trim()
      let concept = state.concepts.find(c => c.label.toLowerCase() === cname.toLowerCase())
      // Read BEFORE the passage lands, or this capture counts itself as prior
      // evidence. Same rule and same trigger as the hand path in OpenTab —
      // only readings other than this one make the reuse ambiguous.
      const metElsewhere = concept
        ? readingsOf(concept.id, state.passages).filter(id => id !== sourceId)
        : []
      let filledDescription = ""
      if (!concept) {
        concept = await addConcept(cname, wdef || undefined)
      } else if (wdef && !concept.def) {
        await editConcept(concept.id, { def: wdef })
        filledDescription = wdef
      }
      const saved = await addPassage([concept.id], source, location, passage, pageNumber, startOffset, endOffset, sourceId, pageContentHash)
      onCaptured?.(
        saved.id,
        concept.label,
        metElsewhere.length
          ? { conceptId: concept.id, label: concept.label, whereIds: metElsewhere, filledDescription }
          : undefined
      )
      onClose()
    } catch(e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="info-scrim">
      {/* Opaque, not `.card`'s rgba(255,255,255,.5): this sits directly over
          the page you are reading, and a half-transparent form leaves the PDF's
          own text running through the passage you are about to keep.
          Scrolls past the viewport: a full-passage capture grows tall (the
          word chips alone can fill a screen) and Save must stay reachable. */}
      <div className="card" style={{ width: "100%", maxWidth: "450px", maxHeight: "85vh", overflowY: "auto", padding: "24px", background: "var(--paper)", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
        <h2 style={{ marginBottom: "16px", fontSize: "18px" }}>Capture Passage</h2>
        
        <div style={{ marginBottom: "20px" }}>
          <span className="label">Passage</span>
          <div className="passage" style={{ maxHeight: "150px", overflowY: "auto", fontSize: "14px", color: "var(--ink)", padding: "12px", background: "var(--paper-2)", borderRadius: "6px", border: "1px solid var(--rule)" }}>
            "{passage}"
          </div>
        </div>

        <div style={{ marginBottom: "20px", display: "flex", gap: "16px" }}>
          <div style={{ flex: 1 }}>
            {/* "Citation", matching the hand-capture form since 2026-08-09.
                Read-only here — a capture off the page is unambiguously from
                the page, so this path never offered an override to break. */}
            <span className="label">Citation</span>
            <div className="hint">{source}</div>
          </div>
          <div style={{ flex: 1 }}>
            <span className="label">Location</span>
            <div className="hint">{location}</div>
          </div>
        </div>

        <div className="form-row">
          <span className="label">Concept — a short noun phrase naming the idea</span>
          <input
            list="conceptOptionsModal"
            placeholder="e.g. boundary objects"
            title="a noun phrase, not a sentence — if the author names it, use her name for it"
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
                  Just to show the shape — concepts as noun phrases: &nbsp;<i>&ldquo;boundary objects&rdquo; · &ldquo;the central tension&rdquo;</i>
                </li>
              </ul>
              <div style={{marginTop: "6px", color: "var(--ink-soft)", fontSize: "12px"}}>
                A concept can be a phrase, not a word. It&apos;s provisional — rename it later, or type an existing name to reuse it.
              </div>
            </details>
          </div>
        </div>

        <div className="form-row">
          <span className="label">Description — the concept in your own words <span style={{textTransform: "none", letterSpacing: 0}}>(optional)</span></span>
          <input
            placeholder="e.g. a thing that means different things to different groups but still holds them together"
            title="your own-words gloss — a sentence is fine; this is where crude is welcome"
            value={workingDef}
            onChange={(e) => setWorkingDef(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="btn" onClick={handleCapture} disabled={!conceptLabel.trim() || isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Passage"}
          </button>
        </div>
      </div>
    </div>
  )
}
