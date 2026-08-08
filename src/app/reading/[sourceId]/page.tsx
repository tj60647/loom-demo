// One reading's workbench. The route IS the scope (see LoomProvider), so the
// URL is what makes a reading the thing you are working in — bookmarkable,
// back-buttonable, and linkable by an instructor.

import Link from "next/link"
import { getSources } from "@/actions/sources"
import Workbench, { type Tab } from "@/components/Workbench"
import { firstParam } from "@/lib/courses"

type ReadingPageSearchParams = { tab?: string | string[]; q?: string | string[] }

// Deep links land on a station (`?tab=reading` from a shelf-search hit);
// anything else lands on the default first tab, as /weave does. `q` rides
// along from a shelf-search hit and opens the reading's own search panel
// pre-filled, so the trail of marks continues into the text itself.
//
// `open` is kept as an accepted value although the tab is gone: it is in old
// links and bookmarks, and the Workbench folds it onto `reading` (they merged
// 2026-08-08). Legacy URL params are deliberate — refactor spec §F.
const READING_TABS = new Set<string>(["reading", "open", "throw", "read", "map"])

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
  const initialTab = rawTab && READING_TABS.has(rawTab) ? (rawTab as Tab) : undefined
  const initialSearch = firstParam(resolved.q)?.trim() || undefined
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
