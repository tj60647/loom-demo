// One reading's workbench. The route IS the scope (see LoomProvider), so the
// URL is what makes a reading the thing you are working in — bookmarkable,
// back-buttonable, and linkable by an instructor.

import Link from "next/link"
import { getSources } from "@/actions/sources"
import Workbench, { type Tab } from "@/components/Workbench"
import { firstParam } from "@/lib/courses"
import { isBranchPreview } from "@/lib/previewLogin"

type ReadingPageSearchParams = {
  tab?: string | string[]
  q?: string | string[]
  concept?: string | string[]
  label?: string | string[]
  passage?: string | string[]
  projection?: string | string[]
  cloth?: string | string[]
  page?: string | string[]
}

// Deep links land on a station (`?tab=reading` from a shelf-search hit);
// anything else lands on the default first tab. `q` rides
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
  /**
   * Where inside the station to land (TJ, 2026-08-13: "it seems like the
   * search results could be more specific and contextual… concepts should have
   * a link to the vocabulary location. links the same").
   *
   * A hit used to open the right ROOM and stop there: a concept landed on
   * Vocabulary with its row somewhere in a list of every word you own. These
   * carry the last hop, so the hit is a door to the object rather than to the
   * surface it lives on. Each is a plain, linkable, bookmarkable param — the
   * route is the scope here (see the note at the top), and this is the same
   * idea one level in.
   */
  const focus = {
    concept: firstParam(resolved.concept)?.trim() || undefined,
    label: firstParam(resolved.label)?.trim() || undefined,
    passage: firstParam(resolved.passage)?.trim() || undefined,
    projection: firstParam(resolved.projection)?.trim() || undefined,
    cloth: firstParam(resolved.cloth) === "1",
    // A page number off a URL is a stranger's integer. Anything that is not a
    // whole number above zero becomes undefined here rather than reaching the
    // viewer, which would otherwise be asked to render page 0, page -3 or
    // page NaN on someone else's bookmark.
    page: (() => {
      const raw = firstParam(resolved.page)
      const n = raw ? Number(raw) : NaN
      return Number.isInteger(n) && n > 0 ? n : undefined
    })(),
  }
  const sources = await getSources()
  const source = sources.find((s) => s.id === sourceId)

  // Not a 404: the reading may exist but not be published to this student's
  // course, and "go back to the shelf" is more use than a dead end.
  if (!source) {
    return (
      <main>
        <div className="empty" style={{ marginTop: "100px" }}>
          <h2>That reading isn&apos;t among your readings.</h2>
          {/* Two honest reasons, both named: unpublished, or published to a
              DIFFERENT course of yours — since a bookmark can outlive a course
              switch, "not published yet" alone would half-lie to a two-course
              student whose link is fine and whose working course is not. */}
          <span className="cap">it may not be published to your course yet — or it belongs to another of your courses</span>
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
      focus={focus}
      isPreviewDeployment={isBranchPreview()}
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
