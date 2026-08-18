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
      <div className="card capturecard" style={{ width: "100%", maxWidth: "450px", maxHeight: "85vh", overflowY: "auto", background: "var(--paper)", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
        <h2>Capture Passage</h2>

        {/* THE QUOTATION IS THE SUBJECT, so it carries no caption and no box.
            It was a labelled panel in --paper-2 with its own border and 12px of
            padding — 176.5px measured, for the one thing on this card nobody
            needs told the name of. It now takes the type Your work gives a
            passage, which is the same object at the same measure (400px of
            content here against the sheet's 396px). The height cap stays: a
            full-page capture would otherwise push everything below it away. */}
        <div className="passage">&quot;{passage}&quot;</div>
        {/* Citation and location, as one mono line rather than two labelled
            columns. Read-only: a capture off the page is unambiguously from the
            page, so this path never offered an override to break. The two-cell
            version cost 82.5px and two labels to say what Your work says in
            15px, in the same words and the same order. */}
        <div className="src">{source}{location ? ` · ${location}` : ""}</div>

        {/* THE NOTE COMES BEFORE THE CONCEPT, matching Your work's order (TJ,
            2026-08-18). It already had to sit outside the concept block, being
            the whole of what an Unlabeled capture can say; above it is where
            that reasoning actually lands, because an Unlabeled capture then
            reads top to bottom with nothing skipped.

            THIS PASSAGE's own note — why you took these words, what struck you,
            what to come back to. Distinct from the concept's description below:
            that one belongs to the idea and travels with it, this one belongs
            to the quotation. */}
        <div className="form-row">
          <span className="label">Note on this passage <span className="labelsay">(optional)</span></span>
          <textarea
            id="capturePassageNote"
            placeholder="why you kept these words — what struck you, what to come back to"
            title="your note on this quotation, not on the concept"
            value={passageNote}
            onChange={(e) => setPassageNote(e.target.value)}
            rows={2}
          />
        </div>

        <div className="form-row">
          <span className="label">
            Concept — a short noun phrase naming the idea{" "}
            <span className="labelsay">(optional)</span>
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
            {/* Blanks filtered, not placeheld: this option's VALUE is typed into
                the field above and then matched to reuse or coin a Concept, so
                "(unlabeled concept)" here would mint one by that name. */}
            {state.concepts.filter(c => c.label.trim()).map(c => <option key={c.id} value={c.label} />)}
          </datalist>

          {/* Shared with the typed form since 2026-08-13 — this markup was
              copied there and the two had drifted. `conceptOptional` is the one
              real difference: an Unlabeled capture is a whole act here.

              It stays directly UNDER the field it coaches (ConceptNamingAssist's
              own header records why: the typed form had it above, and "forty
              lines of naming advice sat between the passage and the field they
              were about"). It is also the tallest thing on this card — 248.5px
              measured, 422.8 with its ladder open — and it is kept whole on
              purpose, so the height had to come from everything around it. */}
          <ConceptNamingAssist
            passage={passage}
            value={conceptLabel}
            onChange={setConceptLabel}
            conceptOptional
          />

          {/* The CONCEPT's gloss — one meaning, shared by every passage filed
              under it. Only asked for when there is a concept to gloss, which
              practice-guide.spec.ts asserts by its absence. Inside the concept
              block now rather than after it: it is about the concept, and Your
              work keeps a concept's description on the concept's own card. */}
          {conceptLabel.trim() ? (
            <>
              <span className="label addlabel">Description — the concept in your own words <span className="labelsay">(optional)</span></span>
              <input
                id="captureConceptDef"
                placeholder="e.g. a thing that means different things to different groups but still holds them together"
                title="your own-words gloss — a sentence is fine; this is where crude is welcome"
                value={workingDef}
                onChange={(e) => setWorkingDef(e.target.value)}
              />
            </>
          ) : null}
        </div>

        {/* STICKY, because slimming alone does not keep the promise the old
            comment made. Measured at 1280x800 before this change: the card's
            content was 871px inside a 734px box, and Save — being the last
            child of a scrolling column — sat 191px below the visible bottom,
            or 388px with the naming ladder open. The card still scrolls; the
            commit no longer scrolls away. */}
        <div className="capturefoot">
          <button className="btn ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button id="capturePassageSave" className="btn" onClick={handleCapture} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : conceptLabel.trim() ? "Save Passage" : "Save unlabeled"}
          </button>
        </div>
      </div>
    </div>
  )
}
