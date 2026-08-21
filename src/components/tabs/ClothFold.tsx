"use client"

// The cloth's own card — Cloth Title and Cloth Description.
//
// Home moved 2026-08-08 (TJ): it belongs on the work surface for its scope. A
// cloth starts in READING, so this renders in 01 · Reading at the head of Your
// work — the only home left, since the whole weave (whose copy sat on
// 02 · Linking) went out of the app on 2026-08-11. Folded — the work is the
// tab's business, the cloth is its name, and an untitled cloth is a fine state.
//
// Saving here is what brings a cloth row into existence: the Base Cloth is
// conceptually always there, and the row is written the first time you title or
// describe it. The shelf card shows that title and when it was last edited.

import { useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import ObjectDownload from "@/components/ui/ObjectDownload"
import { short } from "@/lib/clothMath"
import { buildClothExport, buildClothMarkdown } from "@/lib/objectExport"
import { scopeLabelOf } from "@/lib/graphExport"

/**
 * The cloth's own card — Cloth Title and Cloth Description, edited where the
 * model homes them (01 · Reading, at the head of Your work). Folded: the work
 * is the tab's business; the cloth is its name. Saving here is how a cloth
 * opened from its Library card (the card is the only door) gets its title —
 * the shelf card shows it, or "Base cloth" until then.
 */
export default function ClothFold({ openOnArrival = false }: {
  /** A search hit named this cloth — see below. */
  openOnArrival?: boolean
} = {}) {
  // `readOnly` is Open Loom (src/lib/viewUser.ts, TJ 2026-08-21): the fields
  // become plain text and "start this reading over" is not drawn — the cloth
  // is the student's name for their work, not the viewer's to change.
  const { activeCloth, updateCloth, flushCloth, isLoading, scope, flash, state, scoped, scopeMaps, resetReading, readOnly } = useLoom()
  const { byId } = useReadings()
  const titleOf = (id: string) => byId.get(id)?.title ?? id
  const scopeLabel = scopeLabelOf(scope.key, titleOf)
  // Controlled so the fold can be opened from elsewhere — which is what
  // `openOnArrival` now does. A cloth starts in READING, not here (TJ,
  // 2026-08-08), so nothing routes a student straight at the title field
  // otherwise; a hit whose match IS the title is the exception, since the words
  // that matched are inside the fold. Initial value only, so closing it sticks.
  const [foldOpen, setFoldOpen] = useState(openOnArrival)

  /**
   * Driven straight from the row, exactly as a projection's one-line and
   * paragraph are in MapTab — no local drafts, because `updateCloth` writes
   * optimistically and the row IS the current text.
   *
   * The drafts went with the Save button (TJ, 2026-08-13). They existed to
   * hold text between typing and pressing, and they carried a reseed effect
   * keyed on the row id to stop a save clobbering a keystroke. Under autosave
   * that same effect becomes the bug: the first write swaps the optimistic row
   * for the server's, the id changes, and the reseed would revert whatever was
   * typed in the 700ms since. Removing the drafts removes the whole class.
   */
  const title = activeCloth?.title ?? ""
  const description = activeCloth?.description ?? ""

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
      // Nothing to clear locally any more: the fields read straight from the
      // row, and resetReading re-reads the loom, so they empty themselves.
      // (They used to be drafts, which held the deleted text ready to write
      // it back on the next save.)
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
      {/* Plain text in Open Loom: the student's title and description stay
          readable; only the fields go (TJ, 2026-08-21). */}
      {readOnly ? (
        <>
          <div className="form-row">
            <span className="label">Cloth Title</span>
            {title.trim() ? (
              <p className="oconcept-def" style={{ margin: 0 }}>{title}</p>
            ) : (
              <p className="oconcept-def empty" style={{ margin: 0 }}>untitled</p>
            )}
          </div>
          <div className="form-row">
            <span className="label">Cloth Description</span>
            {description.trim() ? (
              <p className="oconcept-def" style={{ margin: 0 }}>{description}</p>
            ) : (
              <p className="oconcept-def empty" style={{ margin: 0 }}>no description yet</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="form-row">
            <span className="label">Cloth Title</span>
            <input
              id="clothTitle"
              value={title}
              onChange={(e) => updateCloth({ title: e.target.value })}
              onBlur={flushCloth}
              placeholder="a sentence or headline — what your reading of it says"
              maxLength={200}
            />
          </div>
          <div className="form-row">
            <span className="label">Cloth Description</span>
            <textarea
              value={description}
              onChange={(e) => updateCloth({ description: e.target.value })}
              onBlur={flushCloth}
              placeholder="your short interpretation of the reading"
            />
          </div>
        </>
      )}
      <div className="clothfoot">
        {/* "Save cloth" stood here beside these two until 2026-08-13, three
            buttons in a row reading SAVE CLOTH · DOWNLOAD CLOTH .JSON ·
            DOWNLOAD CLOTH .MD — which is why it read as a third file format
            (TJ). It is gone: the fields autosave, and the word "cloth" in this
            foot now means one thing. */}
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
          reading, and only when there is something here to clear — and never
          in Open Loom, where the work is the student's (TJ, 2026-08-21). */}
      {!readOnly && soleSource && somethingHere && (
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
