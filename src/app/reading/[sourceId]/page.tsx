// One reading's workbench. The route IS the scope (see LoomProvider), so the
// URL is what makes a reading the thing you are working in — bookmarkable,
// back-buttonable, and linkable by an instructor.

import Link from "next/link"
import Workbench, { type Tab } from "@/components/Workbench"
import { frontendReadings } from "@/lib/frontendFixture"

type ReadingPageSearchParams = { tab?: string | string[]; q?: string | string[] }
const firstParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

// Deep links land on a station (`?tab=reading` from a shelf-search hit);
// anything else lands on the default first tab, as /weave does. `q` rides
// along from a shelf-search hit and opens the reading's own search panel
// pre-filled, so the trail of marks continues into the text itself.
const READING_TABS = new Set<Tab>(["reading", "open", "throw", "read", "map"])

// Next 16: params is a Promise (async request APIs are no longer sync).
export default async function ReadingPage({
  params,
  searchParams,
}: {
  params: Promise<{ sourceId: string }>
  searchParams: Promise<ReadingPageSearchParams>
}) {
  const { sourceId } = await params
  const resolved = await searchParams
  const rawTab = firstParam(resolved.tab)
  const initialTab = rawTab && READING_TABS.has(rawTab as Tab) ? (rawTab as Tab) : undefined
  const initialSearch = firstParam(resolved.q)?.trim() || undefined
  const source = frontendReadings.find((s) => s.id === sourceId)

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
      initialTab={initialTab}
      initialSearch={initialSearch}
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
