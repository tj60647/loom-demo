"use client"

// The seam between readings — where a concept you already named picks up a
// second piece of evidence.
//
// Ruled by TJ, 2026-08-09. Three paths used to disagree about this moment:
// naming ahead of evidence ASKED, hand capture joined silently and then
// ASSERTED ("it is one concept, not two"), and capture from the PDF — the
// busiest path in the app — joined silently and said nothing at all. Whatever
// the right answer is, three different answers is not it.
//
// The answer is an OFFER, not a question and not a verdict:
//
//   - Not a question, because a blocking confirm would tax the exact move the
//     course teaches. Cross-Reading Concept recurrence is the v1 substrate
//     (model §1), and a dialog that fires on recurrence and not on novelty
//     teaches that recurrence is the exceptional case. It is the goal.
//   - Not a verdict, because red line 2 is "the tool never decides what a
//     student meant". `findConcept` matches `label.toLowerCase()` across the
//     WHOLE graph, so joining is a decision the tool makes on a string match —
//     and the student is the one who knows whether "framing" in Goffman is
//     "framing" in Schön.
//
// So: it happened, here is where, and here is the way out if it was wrong.
// Homonyms are a ratified legal state, which is what makes the way out cheap —
// Vocabulary tells two apart by their passage counts.
//
// The way BACK is no longer one act (2026-08-12): merge is hidden while TJ
// resolves what it means, so a student who separates and then changes their
// mind refiles this passage onto the concept they kept and removes the new
// one. Worth knowing before this button is made any easier to press — it is
// still cheap, but it is now cheap in one direction and manual in the other.
//
// Shown ONLY when the concept was already evidenced in a DIFFERENT reading.
// A second passage under the same concept in the same reading is not ambiguous
// and gets nothing.

import { useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"

export default function ReuseOffer({
  passageId,
  conceptId,
  label,
  where,
  filledDescription,
  onResolved,
  className = "seam",
}: {
  /** The passage that just landed under the reused concept. */
  passageId: string
  /** The concept it joined — the one that already existed. */
  conceptId: string
  label: string
  /** Titles of the OTHER readings this concept was already evidenced in. */
  where: string[]
  /**
   * The gloss this capture wrote onto the existing concept, if it wrote one.
   *
   * `handleAddPassage`/`handleCapture` fill an existing concept's Description
   * when it has none. If the student then says these are different ideas, that
   * sentence was written about the NEW one — so separating MOVES it rather
   * than copying it, and the concept it was borrowed from goes back to having
   * none. Empty whenever this capture did not write one, which is the common
   * case; nothing is ever cleared that the student wrote earlier.
   */
  filledDescription?: string
  /** Fired once the split has landed, so the host can put the note away. */
  onResolved?: () => void
  /** The host's own chrome — `.seam` in a form, something quieter in a toast. */
  className?: string
}) {
  const { addConcept, addPassageConcept, unfilePassage, editConcept, flash } = useLoom()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const separate = async () => {
    if (busy || done) return
    setBusy(true)
    try {
      // Order matters: attach the passage to its new home BEFORE detaching the
      // old one. `unfilePassage` leaves the passage alive with no concept — a
      // legal Unlabeled Passage — so the reverse order would be correct but
      // would flicker the passage out of the concept's list and back, and a
      // failure between the two would strand it as unlabeled.
      const fresh = await addConcept(label, filledDescription || undefined)
      await addPassageConcept(passageId, fresh.id)
      await unfilePassage(passageId, conceptId)
      if (filledDescription) await editConcept(conceptId, { def: "" })
      setDone(true)
      flash("separate concept made — same name, its own entry")
      onResolved?.()
    } finally {
      setBusy(false)
    }
  }

  if (done) return null

  return (
    <div className={className} role="status">
      <span className="cap">the same concept, twice</span>
      <p>
        You&apos;ve named <b>{label}</b> before — in{" "}
        {where.map((w, i) => (
          <span key={w + i}>
            {i > 0 && (i === where.length - 1 ? " and " : ", ")}
            <i>{w}</i>
          </span>
        ))}
        . This passage joins its evidence there.
      </p>
      {/* The escape, stated as a question the student answers — not as a
          warning. There is nothing wrong with the state it offers to leave. */}
      <button type="button" className="btn ghost mini" onClick={separate} disabled={busy}>
        {busy ? "Separating…" : "Not the same idea? Make it a separate concept"}
      </button>
    </div>
  )
}
