"use client"

// The workbench for one reading. Since 2026-08-11 that is the only scope
// there is: the whole weave went out of the app with its route.
//
// Reading-first (docs/archive/reading-scope-and-map-passes.md §A.1): the shelf is the
// home screen and this is what opens when you pick a reading off it, so the
// 01-04 sequence runs INSIDE a text rather than across the course. `04 Map`
// is honest per reading now that placement is per-map (maps carry their own
// tiers): a reading's map sorts only against that reading's concepts.

import { useCallback, useState, useEffect, useMemo } from "react"
import dynamic from "next/dynamic"
import { useSession } from "next-auth/react"
import { useLoom } from "@/components/providers/LoomProvider"
import OpenTab from "@/components/tabs/OpenTab"
import ThrowTab from "@/components/tabs/ThrowTab"
import VocabularyTab from "@/components/tabs/VocabularyTab"
import MapTab from "@/components/tabs/MapTab"
import JourneyNav, { stationNumber, type Station } from "@/components/ui/JourneyNav"
import ShelfSearch from "@/components/shelf/ShelfSearch"
import type { Passage } from "@/lib/types"

const PdfViewer = dynamic(() => import("@/components/pdf/PdfViewer"), { ssr: false })

export type WorkbenchSource = {
  id: string
  title: string
  author: string
  week: number | null
  /**
   * False for a reference-only card — a reading the student added that has no
   * PDF here. Its passages are captured by hand, so tab 00 and the download
   * would both be dead controls.
   */
  hasFile: boolean
}

// 2026-08-08 (TJ): "reading" IS the merged station — the text and the capture
// log in one place (model §3 tab 2), where 00 Reading and 01 Open used to be
// two. `?tab=open` still lands here; the URL params are legacy per §F.
export type Tab = "reading" | "throw" | "read" | "map"

const FOOT: Record<Tab, [string, string]> = {
  reading: ["READING", "THE TEXT AND YOUR CAPTURES"],
  throw: ["LINKING", "ONE THREAD AT A TIME"],
  map: ["KNOWLEDGE GRAPH", "THE LIST AND THE BOARD"],
  read: ["VOCABULARY", "THE WORDS YOU OWN"],
}

/** The journey station each workbench tab sits at. */
const STATION_OF: Record<Tab, Station> = {
  reading: "open",
  throw: "throw",
  read: "read",
  map: "map",
}

/**
 * Tabs that stay mounted once visited, hidden by `.panel`'s display rule, the
 * way v14 kept every panel in the DOM. These hold work in progress — a
 * half-typed throw sentence, a half-typed passage — which unmounting destroys.
 * The whole workbench is keyed by scope at the route level, so those drafts
 * belong to one reading and cannot follow the student into another.
 *
 * `reading` is in the set for the capture side; the PdfViewer inside it is
 * still mounted only while the tab is active, because it is heavy and its
 * position is restored from `pdfPage` anyway.
 */
const KEEP_ALIVE: ReadonlySet<Tab> = new Set<Tab>(["reading", "throw", "read", "map"])

export default function Workbench({
  source,
  initialTab,
  initialSearch,
  practice = false,
}: {
  /**
   * The reading this workbench is for. Not nullable since 2026-08-11: the
   * whole weave was the only caller that passed null, and TJ retired it —
   * "poorly defined and not supported in the course". A student works in a
   * text, and every scope in the app is now one.
   */
  source: WorkbenchSource
  /** Landing tab for a deep link (`?tab=map`); validated below. */
  initialTab?: Tab
  /** A shelf-search hit's query, carried into the reading's own search. */
  initialSearch?: string
  /**
   * The practice loom (`/sandbox`): the same workbench, wrapped in
   * `SandboxLoomProvider` so nothing is written. Two things must change here,
   * and both are about honesty rather than capability — a standing band that
   * says nothing is kept, and no search field, because search is the one
   * control on this page that reads the student's REAL loom straight from the
   * server and would show their actual work inside a practice space.
   */
  practice?: boolean
}) {
  // `status`, not just `session`: next-auth reports "loading" on every hard
  // load while it fetches /api/auth/session, and during that window `session`
  // is null. Reading only the session made a signed-in student's own reading
  // greet them with "Please sign in to continue" for a few hundred
  // milliseconds before the workbench appeared.
  const { data: session, status } = useSession()
  const { isLoading, scoped } = useLoom()
  // Tab order follows the journey bar: Knowledge Graph (03) before Vocabulary
  // (04). The keys are legacy — `map` is the graph, `read` is Vocabulary.
  // Memoised because the practice guide's station listener depends on it —
  // a fresh array each render would tear the listener down and rebuild it on
  // every keystroke anywhere in the workbench.
  const tabs = useMemo<Tab[]>(() => ["reading", "throw", "map", "read"], [])
  // `?tab=open` predates the merge and is still in links and bookmarks.
  const requested = (initialTab as string) === "open" ? "reading" : initialTab
  const firstTab: Tab = requested && tabs.includes(requested as Tab) ? (requested as Tab) : "reading"
  const [activeTab, setActiveTab] = useState<Tab>(firstTab)

 const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set<Tab>([firstTab]))
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfFocusPassageId, setPdfFocusPassageId] = useState<string | null>(null)
  // Where the reader actually is, which is not the same as `pdfPage` — that
  // one is an instruction TO the viewer ("go here"), this is a report FROM it.
  // Kept apart on purpose: feeding the report back in as the instruction lets
  // a stale render drag the reader back a page.
  const [livePdfPage, setLivePdfPage] = useState(1)
  const handlePageChange = useCallback((n: number) => setLivePdfPage(n), [])
  const [openTargetPassageId, setOpenTargetPassageId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  // Your work — this reading's Capture Log — as a sheet over the text. Closed
  // by default: reading is what the station is for, and a student who has not
  // captured anything does not need a panel over the page. It is handed to the
  // viewer rather than rendered beside it (see PdfViewer's `workPanel`),
  // because it has to travel with the reading into fullscreen — which is
  // position:fixed with its own stacking context, and swallowed the old rail
  // whole. A reference-only reading has no text to lie over, so its capture
  // side is the whole panel.
  const [workOpen, setWorkOpen] = useState(false)
  // Stable identity: PdfViewer's window keydown effect takes this as a dep,
  // and an inline arrow re-bound the reading's whole keyboard every render.
  const toggleWork = useCallback(() => {
    setPdfFocusPassageId(null)
    setWorkOpen((v) => !v)
  }, [])

  const goTo = useCallback((tab: Tab) => {
    setActiveTab(tab)
    setVisited((seen) => (seen.has(tab) ? seen : new Set(seen).add(tab)))
  }, [])

  // The practice guide moves the student between stations as its beats change.
  // An event rather than a prop: the guide renders below this component's own
  // chrome, and threading a setter down through it would put the workbench's
  // tab state in the hands of something that is not a tab.
  useEffect(() => {
    if (!practice) return
    const onStation = (e: Event) => {
      const wanted = (e as CustomEvent).detail
      if (typeof wanted === "string" && (tabs as string[]).includes(wanted)) {
        // Through `goTo`, not `setActiveTab`: a kept-alive tab renders only
        // once it has been VISITED, so setting the active tab alone switched
        // the underline and left the station blank.
        goTo(wanted as Tab)
      }
    }
    // The guide also turns the page. Its "highlight a passage" beat cannot
    // teach anything on a cover, and `Oh, the Places You'll Go!` opens on two
    // of them — so the guide asks for one of the example's own passages and
    // the viewer lands on the page it was taken from, marked.
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent).detail
      if (typeof id === "string") setPdfFocusPassageId(id)
    }
    window.addEventListener("loom:practice-station", onStation)
    window.addEventListener("loom:practice-focus", onFocus)
    return () => {
      window.removeEventListener("loom:practice-station", onStation)
      window.removeEventListener("loom:practice-focus", onFocus)
    }
  }, [practice, tabs, goTo])
   const shouldRender = (tab: Tab) => (KEEP_ALIVE.has(tab) ? visited.has(tab) : activeTab === tab)

  // Since the merge, "goto" is not a tab away at all — the text and your work
  // are the same station, so this only moves the page under the reader. It
  // also sends the sheet back: you asked to see the passage in its page, and a
  // sheet over the right third of that page is not showing it to you.
  const handleGotoPassage = (passage: Passage) => {
    if (!source.hasFile) return
    setPdfPage(passage.pageNumber && passage.pageNumber > 0 ? passage.pageNumber : 1)
    setPdfFocusPassageId(passage.id)
    setWorkOpen(false)
    goTo("reading")
  }

  // A capture just landed, or somebody pressed "In your work" on a highlight:
  // slide the sheet out ON it, rather than leaving them to wonder where it
  // went. The sheet is already mounted, so the row it scrolls to has a real
  // layout box the instant this fires.
  const handleGotoOpenPassage = (passageId: string) => {
    setOpenTargetPassageId(passageId)
    setWorkOpen(true)
    goTo("reading")
  }

  // Stable identity again: OpenTab's focus effect lists this in its deps and
  // the sheet is mounted permanently now, so an inline arrow re-ran that
  // effect on every Workbench render while a target was set.
  const handleFocusHandled = useCallback(() => setOpenTargetPassageId(null), [])

  // "See them all in Vocabulary", from the capture side. The tab is this
  // component's state, so it has to be moved from here.
  const handleGotoVocabulary = useCallback(() => goTo("read"), [goTo])

  // Loading comes FIRST. Until next-auth has answered we do not yet know
  // whether anybody is signed in, and guessing "signed out" is the guess that
  // shows a sign-in screen to someone who is already signed in.
  if (status === "loading" || (session && isLoading)) {
    // The journey stays put while the loom loads: it is the one fixed thing
    // under the header, and blinking it out mid-load makes the app look like
    // it is rebuilding itself around you.
    //
    // It carries its handlers while loading too, and that matters more since
    // 2026-08-09: a station with no handler now renders GREYED, so passing
    // none here made every entry into a reading flash four unavailable
    // stations before correcting itself — an outright lie, and a worse one
    // than the plain links it used to draw. The tabs are local state, so the
    // handlers are valid before any data arrives; only the content below is
    // not ready.
    return (
      <>
        <JourneyNav
          active={STATION_OF[activeTab]}
          onStation={Object.fromEntries(tabs.map((tab) => [STATION_OF[tab], () => goTo(tab)]))}
        />
        <main>
          <div className="empty" style={{ marginTop: "100px" }}>
            <h2>Loading your loom...</h2>
          </div>
        </main>
      </>
    )
  }

  if (!session) {
    return (
      <main>
        <div className="empty" style={{ marginTop: "100px" }}>
          <h2>Welcome to Loom.</h2>
          <span className="cap">Please sign in to continue</span>
        </div>
      </main>
    )
  }

  return (
    <>
      <div className="scopebar">
        {/* No "‹ library" here (TJ, 2026-08-08): 00 · Library is in the journey
            bar directly below, so this was a second door to the same place. */}
        <>
          <span className="scopetitle">{source.title}</span>
          {source.author ? <span className="scopemeta">{source.author}</span> : null}
          <span className="scopemeta">
            {scoped.concepts.length} concept{scoped.concepts.length !== 1 ? "s" : ""} evidenced here
            {scoped.bridges.length
              ? ` · ${scoped.bridges.length} thread${scoped.bridges.length !== 1 ? "s" : ""} out`
              : ""}
          </span>
          {/* The library card used to carry this; the reading is the library
              card now, so the affordance moves here rather than disappearing. */}
          {source.hasFile ? (
            <a className="scopeback scopedl" href={`/api/readings/${source.id}?download=1`}>
              Download PDF
            </a>
          ) : (
            <span className="scopemeta scopedl">your own card — no pdf here</span>
          )}
        </>
        {/* The one search field, present on every tab (ruling 34): readings,
            concepts, links and your own passages, grouped by kind. On wide
            screens the field itself is persistent below the bar (TJ,
            2026-08-10 — a visible input is the discoverable form); this
            button is the compact form, shown only under 900px. */}
        {!practice && (
          <button
            className={`btn mini searchtoggle ${searchOpen ? "" : "ghost"}`}
            onClick={() => setSearchOpen((v) => !v)}
            aria-pressed={searchOpen}
            aria-label="Search everything"
            style={{ marginLeft: "auto" }}
          >
            ⌕ Search
          </button>
        )}
      </div>

      {/* Not rendered in the practice loom: ShelfSearch reads the student's
          REAL loom over its own GET route, bypassing the provider entirely —
          the one control here that would show their actual work inside a
          space that keeps nothing. */}
      {!practice && (
        <div className={`searchhost${searchOpen ? " open" : ""}`} style={{ padding: "0 24px" }}>
          {/* Contextual scope (TJ, 2026-08-10): inside a reading this field
              searches THE READING — its pages and your work here. The whole
              loom is one station away, on the Library. */}
          <ShelfSearch
            onActiveChange={() => {}}
            onClose={() => setSearchOpen(false)}
            sourceId={source.id}
          />
        </div>
      )}

      <JourneyNav
        // The underline follows the open tab: in this workbench the stations
        // ARE the tabs.
        active={STATION_OF[activeTab]}
        // In this workbench the tabs are stations you can work at right here;
        // Library and Keep are elsewhere, so JourneyNav renders them as links.
        // Since the merge, station 00 is always the Library — no relabelling.
        onStation={Object.fromEntries(
          tabs.map((tab) => [STATION_OF[tab], () => goTo(tab)])
        )}
      />

      {/* The text gets the room. On 00 the viewer manages its own scrolling
          and wants every pixel under the journey, so main stops padding and
          stops scrolling and simply hands over its height. Every other station
          is an ordinary scrolling page. */}
      <main className={activeTab === "reading" && source.hasFile ? "station-reading" : undefined}>
        {(
          <div className={`panel ${activeTab === "reading" ? "active" : ""}`}>
            {shouldRender("reading") &&
              (source.hasFile ? (
                // The merged station. The text holds the whole room; Your work
                // slides over it. Nothing here reserves space for the sheet —
                // the page NOT moving is the change (see globals.css).
                activeTab === "reading" && (
                  <PdfViewer
                    url={`/api/readings/${source.id}`}
                    sourceName={source.title}
                    sourceId={source.id}
                    initialPageNumber={pdfPage}
                    initialSearch={initialSearch}
                    focusPassageId={pdfFocusPassageId}
                    onGotoOpenPassage={handleGotoOpenPassage}
                    onPageChange={handlePageChange}
                    workOpen={workOpen}
                    onToggleWork={toggleWork}
                    workPanel={
                      <OpenTab
                        compact
                        currentPage={livePdfPage}
                        onGotoPassage={handleGotoPassage}
                        focusPassageId={openTargetPassageId}
                        onFocusHandled={handleFocusHandled}
                        onGotoVocabulary={handleGotoVocabulary}
                      />
                    }
                  />
                )
              ) : (
                // A reference-only reading has no text to lie over, so the
                // capture side is the whole station.
                <OpenTab
                  onGotoPassage={handleGotoPassage}
                  focusPassageId={openTargetPassageId}
                  onFocusHandled={handleFocusHandled}
                  onGotoVocabulary={handleGotoVocabulary}
                />
              ))}
          </div>
        )}
        <div className={`panel ${activeTab === "throw" ? "active" : ""}`}>
          {shouldRender("throw") && <ThrowTab />}
        </div>
        <div className={`panel ${activeTab === "read" ? "active" : ""}`}>
          {/* The station key stays "read" (and so does ?tab=read) — the URL
              params are deliberately legacy per refactor spec §F. What it
              renders is now the model's Vocabulary tab. */}
          {shouldRender("read") && <VocabularyTab />}
        </div>
        <div className={`panel ${activeTab === "map" ? "active" : ""}`}>
          {shouldRender("map") && <MapTab practice={practice} />}
        </div>
      </main>

      <footer>
        {/* The number comes from the bar above, so hiding or restoring a
            station can never leave the footer claiming a different one. */}
        <span className="fl">{stationNumber(STATION_OF[activeTab])} — {FOOT[activeTab][0]}</span>
        <span className="fr">{FOOT[activeTab][1]}</span>
      </footer>
    </>
  )
}
