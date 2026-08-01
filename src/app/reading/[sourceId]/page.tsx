// One reading's workbench. The route IS the scope (see LoomProvider), so the
// URL is what makes a reading the thing you are working in — bookmarkable,
// back-buttonable, and linkable by an instructor.

import Link from "next/link"
import { getSources } from "@/actions/sources"
import Workbench from "@/components/Workbench"

// Next 16: params is a Promise (async request APIs are no longer sync).
export default async function ReadingPage({
  params,
}: {
  params: Promise<{ sourceId: string }>
}) {
  const { sourceId } = await params
  const sources = await getSources()
  const source = sources.find((s) => s.id === sourceId)

  // Not a 404: the reading may exist but not be published to this student's
  // course, and "go back to the shelf" is more use than a dead end.
  if (!source) {
    return (
      <main>
        <div className="empty" style={{ marginTop: "100px" }}>
          <h2>That reading isn&apos;t among your readings.</h2>
          <span className="cap">it may not be published to your course yet</span>
          <p style={{ marginTop: 18 }}>
            <Link className="btn ghost mini" href="/">‹ back to your readings</Link>
          </p>
        </div>
      </main>
    )
  }

  return (
    <Workbench
      // Keyed by the reading so a half-typed throw sentence, a traced prompt,
      // or an open PDF page can never follow the student into another text.
      key={source.id}
      source={{
        id: source.id,
        title: source.title,
        author: source.author ?? "",
        week: source.week,
        hasFile: !!source.storageKey,
      }}
    />
  )
}
