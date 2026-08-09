"use client"

// The cloth's own card — Cloth Title and Cloth Description.
//
// Home moved 2026-08-08 (TJ): it belongs on the work surface for its scope. A
// cloth starts in READING, so inside a reading this renders in 01 · Reading
// beside the capture log; the whole weave has no Reading station, so there it
// stays on 02 · Linking. Folded either way — the work is the tab's business,
// the cloth is its name, and an untitled cloth is a fine state.
//
// Saving here is what brings a cloth row into existence: the Base Cloth is
// conceptually always there, and the row is written the first time you title or
// describe it. The shelf card shows that title and when it was last edited.

import { useState, useEffect, useRef } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { isWholeWeave } from "@/lib/scope"
import { short } from "@/lib/clothMath"

/**
 * The cloth's own card — Cloth Title and Cloth Description, edited where the
 * model homes them (Linking). Folded: the bench is this tab's work; the cloth
 * is its name. Saving here is also how a cloth begun from the shelf's Create
 * Cloth button gets its title — the shelf card shows both.
 */
export default function ClothFold() {
  const { activeCloth, updateCloth, isLoading, scope, flash } = useLoom()
  const wholeWeave = isWholeWeave(scope)
  // Controlled so the fold can be opened from elsewhere later; today it simply
  // starts closed. A cloth starts in READING, not here (TJ, 2026-08-08), so
  // nothing routes a student straight at the title field any more.
  const [foldOpen, setFoldOpen] = useState(false)
  const [title, setTitle] = useState(activeCloth?.title ?? "")
  const [description, setDescription] = useState(activeCloth?.description ?? "")
  const [busy, setBusy] = useState(false)

  // Reseed the drafts when the underlying row changes identity — on load, and
  // when a first save swaps the optimistic row for the server's. Keying on the
  // id keeps a keystroke from being clobbered by the save it caused.
  const seededId = useRef<string | null>(activeCloth?.id ?? null)
  useEffect(() => {
    const id = activeCloth?.id ?? null
    if (id !== seededId.current) {
      seededId.current = id
      setTitle(activeCloth?.title ?? "")
      setDescription(activeCloth?.description ?? "")
    }
  }, [activeCloth])

  const dirty =
    title !== (activeCloth?.title ?? "") || description !== (activeCloth?.description ?? "")

  const save = async () => {
    if (busy || !dirty) return
    setBusy(true)
    try {
      const ok = await updateCloth({ title, description })
      if (ok) flash("cloth saved")
    } finally {
      setBusy(false)
    }
  }

  const shownTitle = (activeCloth?.title ?? "").trim()
  return (
    <details
      className="card invitefold"
      style={{ marginBottom: 14 }}
      open={foldOpen}
      onToggle={(e) => setFoldOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span className="tw">▸</span>
        <h2>
          {wholeWeave ? "The whole weave's cloth" : "This cloth"}{" "}
          {!isLoading && (
            <span className="n">{shownTitle ? `— “${short(shownTitle, 60)}”` : "— untitled"}</span>
          )}
        </h2>
      </summary>
      <p className="hint" style={{ marginTop: 10 }}>
        {wholeWeave
          ? "A title and a short interpretation for everything at once — every reading, one cloth."
          : "Your work on this reading, under your own name for it. The title is a sentence or headline — yours, not the reading's — and both show on the reading's card in the Library."}
      </p>
      {/* The cloth is the whole of your work here; a projection is one lens on
          it. Both carry a title and a description, and students reasonably
          assume they are the same field — they are not, and a projection's
          travel with the projection. */}
      <p className="hint" style={{ marginTop: 6, color: "var(--ink-soft)" }}>
        This names <b>the cloth</b> — everything you have woven{wholeWeave ? "" : " from this reading"}.
        A <b>projection</b> on 04 · Knowledge Graph is one arrangement of it, a particular lens,
        and carries its <i>own</i> title, one-line and description. Keep several projections and
        each keeps its own; they can say quite different things about the same cloth.
      </p>
      <div className="form-row">
        <span className="label">Cloth Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="a sentence or headline — what your reading of it says"
          maxLength={200}
        />
      </div>
      <div className="form-row">
        <span className="label">Cloth Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={wholeWeave ? "your short interpretation, across the readings" : "your short interpretation of the reading"}
        />
      </div>
      <button className="btn mini" onClick={save} disabled={busy || !dirty}>
        {busy ? "Saving…" : "Save cloth"}
      </button>
    </details>
  )
}
