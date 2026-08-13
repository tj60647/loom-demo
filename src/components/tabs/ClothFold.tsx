"use client"

// The cloth's own card — Cloth Title and Cloth Description.
//
// Home moved 2026-08-08 (TJ): it belongs on the work surface for its scope. A
// cloth starts in READING, so inside a reading this renders in 01 · Reading
// at the head of Your work; the whole weave has no Reading station, so there it
// stays on 02 · Linking. Folded either way — the work is the tab's business,
// the cloth is its name, and an untitled cloth is a fine state.
//
// Saving here is what brings a cloth row into existence: the Base Cloth is
// conceptually always there, and the row is written the first time you title or
// describe it. The shelf card shows that title and when it was last edited.

import { useState, useEffect, useRef } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import ObjectDownload from "@/components/ui/ObjectDownload"
import { short } from "@/lib/clothMath"
import { buildClothExport, buildClothMarkdown } from "@/lib/objectExport"
import { scopeLabelOf } from "@/lib/graphExport"

/**
 * The cloth's own card — Cloth Title and Cloth Description, edited where the
 * model homes them (Linking). Folded: the bench is this tab's work; the cloth
 * is its name. Saving here is also how a cloth begun from the shelf's Create
 * Cloth button gets its title — the shelf card shows both.
 */
export default function ClothFold() {
  const { activeCloth, updateCloth, isLoading, scope, flash, state, scoped, scopeMaps, resetReading } = useLoom()
  const { byId } = useReadings()
  const titleOf = (id: string) => byId.get(id)?.title ?? id
  const scopeLabel = scopeLabelOf(scope.key, titleOf)
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

  /**
   * Start this reading over — the narrower exit, at the object it clears
   * (TJ, 2026-08-13). Only inside a reading: the whole weave has no Reading
   * station, and there is no "this reading" to clear there.
   */
  const soleSource = scope.sourceIds.length === 1 ? scope.sourceIds[0] : null
  const [arming, setArming] = useState(false)
  const [clearing, setClearing] = useState(false)
  const here = {
    passages: scoped.passages.length,
    maps: scopeMaps.length,
    cloth: !!((activeCloth?.title ?? "") || (activeCloth?.description ?? "")),
  }
  const somethingHere = here.passages > 0 || here.maps > 0 || here.cloth

  const startOver = async () => {
    if (!soleSource) return
    setClearing(true)
    try {
      const n = await resetReading(soleSource)
      // The drafts are this component's own state and would otherwise sit
      // there holding the text the server just deleted, ready to write it
      // back on the next save.
      setTitle("")
      setDescription("")
      setArming(false)
      flash(`this reading is clear — ${n.passages} passage${n.passages === 1 ? "" : "s"} gone, your concepts kept`)
    } catch (e) {
      flash(e instanceof Error ? e.message : "could not clear this reading")
    } finally {
      setClearing(false)
    }
  }

  const shownTitle = (activeCloth?.title ?? "").trim()
  return (
    <details
      id="clothFold"
      className="card invitefold"
      style={{ marginBottom: 14 }}
      open={foldOpen}
      onToggle={(e) => setFoldOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <span className="tw">▸</span>
        <h2>
          This cloth{" "}
          {!isLoading && (
            <span className="n">{shownTitle ? `— “${short(shownTitle, 60)}”` : "— untitled"}</span>
          )}
        </h2>
      </summary>
      <p className="hint" style={{ marginTop: 10 }}>
        Your work on this reading, under your own name for it. The title is a
        sentence or headline — yours, not the reading&apos;s — and both show on
        the reading&apos;s card in the Library.
      </p>
      {/* The cloth is the whole of your work here; a projection is one lens on
          it. Both carry a title and a description, and students reasonably
          assume they are the same field — they are not, and a projection's
          travel with the projection. */}
      <p className="hint" style={{ marginTop: 6, color: "var(--ink-soft)" }}>
        This names <b>the cloth</b> — everything you have woven from this reading.
        A <b>projection</b> on 03 · Knowledge Graph is one arrangement of it, a particular lens,
        and carries its <i>own</i> title, one-line and description. Keep several projections and
        each keeps its own; they can say quite different things about the same cloth.
      </p>
      <div className="form-row">
        <span className="label">Cloth Title</span>
        <input
          id="clothTitle"
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
          placeholder="your short interpretation of the reading"
        />
      </div>
      <div className="clothfoot">
        <button id="clothSave" className="btn mini" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save cloth"}
        </button>
        {/* The cloth downloads on the cloth's own card (TJ, 2026-08-10) —
            whole: its passages, the concepts they evidence, the threads
            between those, and its projections. */}
        <ObjectDownload
          kind="cloth"
          noun="cloth"
          slug={activeCloth?.title || scopeLabel}
          tip="this cloth, whole — its passages, concepts, threads and projections"
          json={(p) => JSON.stringify(buildClothExport(state, scope.key, p, titleOf), null, 2)}
          markdown={(p) => buildClothMarkdown(state, scope.key, p, titleOf)}
        />
      </div>

      {/* Ruled off and last, below the download — the order is the advice:
          keep a copy where you made it, then clear. Only drawn inside a
          reading, and only when there is something here to clear. */}
      {soleSource && somethingHere && (
        <div className="clothdanger">
          {!arming ? (
            <button className="btn ghost mini clothreset" onClick={() => setArming(true)}>
              start this reading over
            </button>
          ) : (
            <>
              <p className="hint" style={{ margin: "0 0 8px" }}>
                Clears <b>{here.passages} passage{here.passages === 1 ? "" : "s"}</b> captured here
                {here.cloth ? <>, <b>this cloth&apos;s title and description</b></> : null}
                {here.maps ? <> and <b>{here.maps} projection{here.maps === 1 ? "" : "s"}</b></> : null}.
                {" "}Your concepts, links and threads stay — they are yours across every reading, so
                some will be left showing <b>no evidence</b> until you capture again.
              </p>
              <div className="clothfoot">
                <button className="btn ghost mini" onClick={() => setArming(false)} disabled={clearing}>
                  Cancel
                </button>
                <button className="btn danger mini" onClick={startOver} disabled={clearing}>
                  {clearing ? "Clearing…" : "Yes, clear this reading"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </details>
  )
}
