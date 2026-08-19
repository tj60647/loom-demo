"use client"

/**
 * THE CAPTURE FORM — one of them, wherever the capture is taken.
 *
 * This was CaptureModal's body until 2026-08-19, when capture moved onto the
 * rail (TJ: "the capture passage is currently a modal, i want it to go on the
 * rail", and then: "i want to keep the content of the existing capture passage
 * card"). It is extracted rather than reimplemented for exactly that reason:
 * the rail card and the modal must ASK THE SAME THINGS, and the only way to
 * guarantee that is to have one form with two shells around it. `RailCardBody`
 * is the precedent — the canvas and page mode drew a passage card differently
 * for hours before it was shared.
 *
 * So the shells own the chrome and nothing else:
 *   CaptureModal — the scrim, the card, the "Capture Passage" heading.
 *   DraftCard    — the rail card, anchored on the selection by its leader.
 *
 * WHAT MUST NOT MOVE, because things outside this file point at it by name:
 *   - `#captureConcept`, `#capturePassageNote`, `#capturePassageSave` are the
 *     practice guide's spotlight targets (src/lib/practiceGuide.ts, beat 3).
 *     Rename one and the guide highlights nothing, silently.
 *   - `#captureConceptDef` is asserted ABSENT on the unlabeled path
 *     (practice-guide.spec.ts).
 *   - "Save Passage" / "Save unlabeled" are matched as button text by specs.
 *   - `loom:capture-open` / `loom:capture-close` are how PracticeGuide knows a
 *     capture is being written. They fire from HERE now, not from the modal,
 *     so the guide keeps working on whichever path the reader is on.
 */

import { useState, useEffect } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { readingsOf } from "@/lib/scope"
import ConceptNamingAssist from "@/components/ui/ConceptNamingAssist"
import { sortedByLabel } from "@/lib/utils"
import type { CaptureReuse } from "./CaptureModal"

/**
 * Open the concept block INTO VIEW, not merely open (TJ, 2026-08-19: "is there
 * an 'anchor' on 'add a concept' or something we can scroll to so it is all
 * visible in the card?").
 *
 * The card caps its own height — 62vh on the rail, 85vh in the modal — and its
 * footer is sticky ON TOP of the scrolling content, so "revealed" and "not
 * under the Save button" are different questions. This answers the second one:
 * the usable bottom is the card's bottom minus the footer.
 *
 * It scrolls THE CARD, by writing scrollTop, and never calls scrollIntoView.
 * That is deliberate. scrollIntoView walks every scrollable ancestor, and in
 * page mode the stage is one of them (.pdf-stage.mode-page is overflow:auto) —
 * so it would move the page out from under the reader in order to reveal a
 * card in the margin. The matrix documents the same hazard from the other
 * side, which is why its stage is overflow:clip rather than hidden.
 *
 * Two cases, because one rule cannot serve both. A block that FITS is nudged
 * up by exactly its overshoot, so nothing moves that did not have to. A block
 * TALLER than the card cannot be shown whole, so its title goes to the top and
 * the rest is scrolled to — the most of it that can be on screen at once, and
 * it keeps the heading you just pressed in sight.
 */
function revealConceptBlock(el: HTMLElement) {
  const card = el.closest<HTMLElement>(".pdf-draftcard, .capturecard")
  if (!card) return
  const pad = 10
  const c = card.getBoundingClientRect()
  const d = el.getBoundingClientRect()
  const footH = card.querySelector<HTMLElement>(".capturefoot")?.getBoundingClientRect().height ?? 0
  if (d.height <= c.height - footH - pad * 2) {
    const overshoot = d.bottom - (c.bottom - footH - pad)
    if (overshoot > 0) card.scrollTop += overshoot
  } else {
    card.scrollTop += d.top - c.top - pad
  }
  // The caret goes in without scrolling anything itself — the browser's own
  // focus scroll would undo the arithmetic above and can reach ancestors.
  document.getElementById("captureConcept")?.focus({ preventScroll: true })
}

export default function CaptureFields({
  passage,
  source,
  sourceId,
  location,
  pageNumber,
  startOffset,
  endOffset,
  pageContentHash,
  onClose,
  onCaptured,
  variant = "modal",
}: {
  passage: string
  source: string
  sourceId?: string
  location: string
  pageNumber?: number
  startOffset?: number
  endOffset?: number
  pageContentHash?: string
  onClose: () => void
  onCaptured?: (passageId: string, conceptLabel: string, reuse?: CaptureReuse) => void
  /** Which shell is around it. Only the footer's class differs; the questions
   *  asked, the ids, and the save are identical by construction. */
  variant?: "modal" | "rail"
}) {
  // The practice guide's signal that a highlight became a capture attempt:
  // this form only mounts from a selection, so its appearance IS the gesture.
  // Harmless in the real app — nothing there listens.
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
   * Passage… It may never gain a Concept, which is fine" — and this form was
   * the one place in the app that refused it, holding Save disabled until a
   * name was typed. So a student who had found the words but not the word had
   * to invent one or lose the passage.
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
    <>
      {/* THE QUOTATION, IN THE MODAL ONLY (TJ, 2026-08-19: "the capture passage
          does not need the passage in the card, it is highlighted on the pdf").
          True on the rail, and it is the strongest thing about putting capture
          there: the card sits in the margin beside the words with a leader line
          drawn to them, so reprinting the passage says a second time what the
          page is already saying better — and it was the tallest fixed block on a
          card that has to fit beside a page.

          NOT true in the modal, which is the one place the reader cannot see the
          page: it is a 450px card centred over the reading, and whatever it
          covers is wherever the highlight happens to be. There the quotation is
          the only sight of the words being kept. Hence the variant test — the
          one difference between the two shells that is about what the reader can
          SEE rather than about chrome.

          The text is passed either way: ConceptNamingAssist builds its word
          chips out of it, so the rail loses the display and keeps the help. */}
      {variant === "modal" && <div className="passage">&quot;{passage}&quot;</div>}
      {/* Citation on its own line, then WHERE IN THE FILE on the next (TJ,
          2026-08-19: "put the page and then the character span or address on a
          line of its own"). Two lines because they answer different questions —
          the first is what you are reading, the second is the address that makes
          this capture findable again — and because a reading whose name carries
          a chapter ("Learning How to Learn — Chapter 1: Learning About Learning")
          wrapped the page number onto a second line anyway, just without saying
          it meant to.

          "pdf p." and not "p.", because it is NOT the page number printed on the
          page (TJ, same message). On the seeded scans the two are far apart: the
          folio reads 82 where the file is on sheet 3. Calling it "p. 4" invited
          exactly the reading it is not.

          Read-only. A capture off the page is unambiguously from the page, so
          this path never offered an override to break — and the character span
          is the anchor the highlight is redrawn from, not something anyone
          should be able to type over.

          Built from the props rather than from `location`: that string is what
          gets SAVED on the passage, and every other surface (Your work, the
          highlight's aria-label) already reads it in its stored form. Changing
          how it is displayed here must not change what is written there. */}
      <div className="src">{source}</div>
      <div className="src capturewhere">
        {pageNumber != null ? `pdf p. ${pageNumber}` : location}
        {startOffset != null && endOffset != null ? ` · chars ${startOffset}–${endOffset}` : ""}
      </div>

      {/* THE NOTE COMES BEFORE THE CONCEPT, matching Your work's order (TJ,
          2026-08-18). It already had to sit outside the concept block, being
          the whole of what an Unlabeled capture can say; above it is where
          that reasoning actually lands, because an Unlabeled capture then
          reads top to bottom with nothing skipped.

          THIS PASSAGE's own note — why you took these words, what struck you,
          what to come back to. Distinct from the concept's description below:
          that one belongs to the idea and travels with it, this one belongs
          to the quotation.

          IT ALSO TAKES THE CARET (TJ, 2026-08-19: "when open the cursor should
          start in the passage notes, not concept"). The concept field held it
          until then, which meant the form opened one field BELOW its own first
          question — and asked for the name of the idea before the reason for
          keeping it, in a card whose whole order says the opposite. Naming is
          the separate, optional act; the note is what you have while the words
          are still in front of you. */}
      <div className="form-row">
        <span className="label">Note on this passage <span className="labelsay">(optional)</span></span>
        <textarea
          id="capturePassageNote"
          placeholder="why you kept these words — what struck you, what to come back to"
          title="your note on this quotation, not on the concept"
          value={passageNote}
          onChange={(e) => setPassageNote(e.target.value)}
          rows={2}
          autoFocus
        />
      </div>

      {/* NAMING IS FOLDED AWAY UNTIL ASKED FOR (TJ, 2026-08-19: "let this be
          'add a concept - ...' and let it be collapsed except for title").
          The heading is a verb now, not a noun, because closed it is no longer
          a field's label — it is the offer to open one.

          This is the same claim the form has been making since 2026-08-12 in
          every other respect: a passage needs no concept, and keeping the
          words and naming them are two acts. The block was still the tallest
          thing on the card by a distance — ConceptNamingAssist alone measures
          248.5px, and 422.8 with its ladder open — so the optional half of the
          form was most of its height, above the fold, in front of the Save.
          Closed, the card opens on the note (which now takes the caret) and
          the whole of it is in view.

          Opening moves the caret into the field, so "add a concept" is one
          press and then typing, not a press and then a hunt. */}
      <details
        className="form-row captureconcept"
        onToggle={(e) => {
          const el = e.currentTarget as HTMLDetailsElement;
          if (!el.open) return;
          // After the frame that reveals it, for two reasons: focus() on a node
          // inside a closed details does nothing at all, and the block has no
          // height to scroll to until it has been laid out.
          requestAnimationFrame(() => revealConceptBlock(el));
        }}
      >
        <summary id="captureConceptToggle" className="label">
          Add a concept — a short noun phrase naming the idea{" "}
          <span className="labelsay">(optional)</span>
        </summary>
        <input
          list="conceptOptionsCapture"
          id="captureConcept"
          placeholder="e.g. boundary objects"
          title="a noun phrase, not a sentence — if the author names it, use her name for it"
          value={conceptLabel}
          onChange={(e) => setConceptLabel(e.target.value)}
        />
        <datalist id="conceptOptionsCapture">
          {/* Blanks filtered, not placeheld: this option's VALUE is typed into
              the field above and then matched to reuse or coin a Concept, so
              "(unlabeled concept)" here would mint one by that name. */}
          {sortedByLabel(state.concepts).filter(c => c.label.trim()).map(c => <option key={c.id} value={c.label} />)}
        </datalist>

        {/* Shared with the typed form since 2026-08-13 — this markup was
            copied there and the two had drifted. `conceptOptional` is the one
            real difference: an Unlabeled capture is a whole act here.

            It stays directly UNDER the field it coaches (ConceptNamingAssist's
            own header records why: the typed form had it above, and "forty
            lines of naming advice sat between the passage and the field they
            were about"). It is also the tallest thing here — 248.5px measured,
            422.8 with its ladder open — and it is kept whole on purpose. */}
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
      </details>

      {/* STICKY in the modal, because slimming alone does not keep the promise
          the old comment made. Measured at 1280x800 before that change: the
          card's content was 871px inside a 734px box, and Save — being the
          last child of a scrolling column — sat 191px below the visible
          bottom, or 388px with the naming ladder open. On the rail the card
          scrolls within its own height and the footer sticks to the same
          rule. */}
      <div className={variant === "rail" ? "capturefoot capturefoot-rail" : "capturefoot"}>
        <button className="btn ghost" onClick={onClose} disabled={isSubmitting}>Cancel</button>
        <button id="capturePassageSave" className="btn" onClick={handleCapture} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : conceptLabel.trim() ? "Save Passage" : "Save unlabeled"}
        </button>
      </div>
    </>
  )
}
