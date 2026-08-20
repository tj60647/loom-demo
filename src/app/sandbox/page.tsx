// The practice loom — the real interface, real gestures, nothing kept.
//
// TJ, 2026-08-10: "in many games the actual interface is used for the
// tutorial, not screenshots, is that possible?" This is that: the real
// Workbench on a real reading, wrapped in SandboxLoomProvider so every write
// stops at local state. A student really drag-selects a sentence, really
// names the concept, really throws a thread, really drags a card on the
// board — and closing the page loses all of it, by design.
//
// It runs on a REAL reading rather than a bundled sample, so the PDF, its
// text layer and the whole capture path are the genuine ones. The text is
// chosen at PREFERRED below — Oh, the Places You'll Go! (TJ, 2026-08-11: "lets
// use Oh, the Places You'll Go! it is in the database"), superseding his
// earlier pick of Learning How to Learn.

import Link from "next/link"
import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { sourcePages } from "@/db/schema"
import { getSources } from "@/actions/sources"
import { buildPracticeCloth } from "@/lib/practiceCloth"
import SandboxWorkbench from "@/components/SandboxWorkbench"

/**
 * Preferred practice reading, matched loosely on title (TJ, 2026-08-11: "lets
 * use Oh, the Places You'll Go! it is in the database"). Short, and about
 * going and getting stuck rather than about method, which makes it a text a
 * student can read a whole idea out of in the minute the tutorial lasts.
 *
 * Not hard-wired: it is a real uploaded reading rather than a fixture, so a
 * course without it falls back to the first reading with a file rather than
 * dead-ending — and the worked cloth falls back with it, since its
 * quotations belong to this text alone.
 */
const PREFERRED = "places you'll go"

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
          <span className="cap">the guide borrows a reading from your list</span>
          <p style={{ marginTop: 18 }}>
            <Link className="btn ghost mini" href="/">‹ back to your readings</Link>
          </p>
        </div>
      </main>
    )
  }

  // The worked cloth the practice loom opens with — read here, on the server,
  // because SandboxLoomProvider must never touch the database (that is the
  // guarantee `scripts/check-sandbox.ts` enforces). It arrives as a prop and
  // lives only in that component's state.
  const pageRows = await db
    .select()
    .from(sourcePages)
    .where(eq(sourcePages.sourceId, source.id))
    .orderBy(asc(sourcePages.pageNumber))
  const practiceCloth = buildPracticeCloth(
    pageRows.map((row) => ({
      pageNumber: row.pageNumber,
      textContent: row.textContent ?? "",
      contentHash: row.contentHash ?? "",
    })),
    source.id,
    [source.author, source.title].filter(Boolean).join(", ")
  )

  // The shelf the guide opens on. Every visible reading is drawn so the
  // Library looks like the Library; only the practice one opens.
  const cards = withFile.concat(sources.filter((s) => !s.storageKey)).map((s) => ({
    id: s.id,
    title: s.title,
    author: s.author,
    description: s.description,
    isDescriptionVisible: s.isDescriptionVisible,
    hasFile: !!s.storageKey,
  }))

  return (
    <SandboxWorkbench
      sourceId={source.id}
      cards={cards}
      practiceCloth={practiceCloth}
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
