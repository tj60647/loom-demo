// The practice loom — the real interface, real gestures, nothing kept.
//
// TJ, 2026-08-10: "in many games the actual interface is used for the
// tutorial, not screenshots, is that possible?" This is that: the real
// Workbench on a real reading, wrapped in SandboxLoomProvider so every write
// stops at local state. A student really drag-selects a sentence, really
// names the concept, really throws a thread, really drags a card on the
// board — and closing the page loses all of it, by design.
//
// It runs on a REAL reading (TJ: "use the learning to learn pdf") rather than
// a bundled sample, so the PDF, its text layer and the whole capture path are
// the genuine ones. Novak & Gowin is also the book the board's method comes
// from, which makes it the right text to practise the method on.

import Link from "next/link"
import { getSources } from "@/actions/sources"
import SandboxWorkbench from "@/components/SandboxWorkbench"

/** Preferred practice reading, matched loosely on title. Not hard-wired: it
 *  is a real uploaded reading rather than a seed fixture, so a course without
 *  it falls back to the first reading with a file rather than dead-ending. */
const PREFERRED = "learning how to learn"

export default async function SandboxPage() {
  const sources = await getSources()
  const withFile = sources.filter((s) => s.storageKey)
  const source =
    withFile.find((s) => s.title.toLowerCase().includes(PREFERRED)) ?? withFile[0]

  if (!source) {
    return (
      <main>
        <div className="empty" style={{ marginTop: "100px" }}>
          <h2>Nothing to practise on yet.</h2>
          <span className="cap">the practice loom borrows a reading from your list</span>
          <p style={{ marginTop: 18 }}>
            <Link className="btn ghost mini" href="/">‹ back to your readings</Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <SandboxWorkbench
      sourceId={source.id}
      source={{
        id: source.id,
        title: source.title,
        author: source.author,
        sourceReference: source.sourceReference,
        description: source.description,
        isDescriptionVisible: source.isDescriptionVisible,
        storageKey: source.storageKey,
        isOwn: source.isOwn,
      }}
    />
  )
}
