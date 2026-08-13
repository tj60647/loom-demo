"use client"

import { useState, useEffect } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { readingsOf } from "@/lib/scope"
import ConceptNamingAssist from "@/components/ui/ConceptNamingAssist"

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
  // The practice guide's signal that a highlight became a capture attempt:
  // this dialog only opens from a selection, so its appearance IS the
  // gesture. Harmless in the real app — nothing there listens.
  useEffect(() => {
    window.dispatchEvent(new Event("loom:capture-open"))
    return () => {
      window.dispatchEvent(new Event("loom:capture-close"))
    }
  }, [])

  const { state, addConcept, addPassage, editConcept } = useLoom()
  const [conceptLabel, setConceptLabel] = useState("")
  const [workingDef, setWorkingDef] = useState("")
  const [passageNote, setPassageNote] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  /**
   * Keeping the passage is the act; naming it is a separate one.
   *
   * TJ, 2026-08-12: "a passage does not require a concept, it should be
   * possible to capture a passage without a concept." The model has said so
   * all along — "A Passage with no Concepts is a legal state, the Unlabeled
   * Passage… It may never gain a Concept, which is fine" — and this dialog
   * was the one place in the app that refused it, holding Save disabled until
   * a name was typed. So a student who had found the words but not the word
   * had to invent one or lose the passage.
   */
  const handleCapture = async () => {
    const cname = conceptLabel.trim()
    if (!passage) return
    setIsSubmitting(true)
    try {
      const gloss = passageNote.trim()

      // Unlabeled: keep the words now, name them later or never.
      if (!cname) {
        const saved = await addPassage(
          [], source, location, passage, pageNumber, startOffset, endOffset, sourceId, pageContentHash, gloss
        )
        onCaptured?.(saved.id, "")
        onClose()
        return
      }

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
      const saved = await addPassage(
        [concept.id], source, location, passage, pageNumber, startOffset, endOffset, sourceId, pageContentHash, gloss
      )
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
          <span className="label">
            Concept — a short noun phrase naming the idea{" "}
            <span style={{ textTransform: "none", letterSpacing: 0 }}>(optional)</span>
          </span>
          <input
            list="conceptOptionsModal"
            id="captureConcept"
            placeholder="e.g. boundary objects"
            title="a noun phrase, not a sentence — if the author names it, use her name for it"
            value={conceptLabel}
            onChange={(e) => setConceptLabel(e.target.value)}
            autoFocus
          />
          <datalist id="conceptOptionsModal">
            {state.concepts.map(c => <option key={c.id} value={c.label} />)}
          </datalist>

          {/* Shared with the typed form since 2026-08-13 — this markup was
              copied there and the two had drifted. `conceptOptional` is the one
              real difference: an Unlabeled capture is a whole act here. */}
          <ConceptNamingAssist
            passage={passage}
            value={conceptLabel}
            onChange={setConceptLabel}
            conceptOptional
          />
        </div>

        {/* The CONCEPT's gloss — one meaning, shared by every passage filed
            under it. Only asked for when there is a concept to gloss. */}
        {conceptLabel.trim() ? (
          <div className="form-row">
            <span className="label">Description — the concept in your own words <span style={{textTransform: "none", letterSpacing: 0}}>(optional)</span></span>
            <input
              id="captureConceptDef"
              placeholder="e.g. a thing that means different things to different groups but still holds them together"
              title="your own-words gloss — a sentence is fine; this is where crude is welcome"
              value={workingDef}
              onChange={(e) => setWorkingDef(e.target.value)}
            />
          </div>
        ) : null}

        {/* THIS PASSAGE's own note — why you took these words, what struck you,
            what to come back to. Distinct from the concept's description above:
            that one belongs to the idea and travels with it, this one belongs
            to the quotation. The Capture Log has always had a place for it
            (model: Passage + Gloss + Concept Label) and nothing could write it
            until now. It is also the whole of what an unlabeled capture can
            say, which is why it sits outside the concept block. */}
        <div className="form-row">
          <span className="label">Note on this passage <span style={{textTransform: "none", letterSpacing: 0}}>(optional)</span></span>
          <textarea
            id="capturePassageNote"
            placeholder="why you kept these words — what struck you, what to come back to"
            title="your note on this quotation, not on the concept"
            value={passageNote}
            onChange={(e) => setPassageNote(e.target.value)}
            rows={2}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "24px", justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button id="capturePassageSave" className="btn" onClick={handleCapture} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : conceptLabel.trim() ? "Save Passage" : "Save unlabeled"}
          </button>
        </div>
      </div>
    </div>
  )
}
