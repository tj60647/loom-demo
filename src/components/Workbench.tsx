"use client"

// The workbench for one scope — a reading, or the whole weave.
//
// Reading-first (docs/archive/reading-scope-and-map-passes.md §A.1): the shelf is the
// home screen and this is what opens when you pick a reading off it, so the
// 01-04 sequence runs INSIDE a text rather than across the course. `04 Map`
// is honest per reading now that placement is per-map (maps carry their own
// tiers): a reading's map sorts only against that reading's concepts.

import { useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useSession } from "next-auth/react"
import { useLoom } from "@/components/providers/LoomProvider"
import OpenTab from "@/components/tabs/OpenTab"
import ThrowTab from "@/components/tabs/ThrowTab"
import VocabularyTab from "@/components/tabs/VocabularyTab"
import MapTab from "@/components/tabs/MapTab"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"
import JourneyNav, { type Station } from "@/components/ui/JourneyNav"
import ShelfSearch from "@/components/shelf/ShelfSearch"
import type { Byte } from "@/lib/types"

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

export type Tab = "reading" | "open" | "throw" | "read" | "map"

const FOOT: Record<Tab, [string, string]> = {
  reading: ["00 — READING", "THE TEXT ITSELF"],
  open: ["01 — OPEN", "LAY THE WARP"],
  throw: ["02 — LINKING", "ONE THREAD AT A TIME"],
  read: ["03 — VOCABULARY", "THE WORDS YOU OWN"],
  map: ["04 — KNOWLEDGE GRAPH", "THE CARD TABLE"],
}

/** The journey station each workbench tab sits at. */
const STATION_OF: Record<Tab, Station> = {
  reading: "readings",
  open: "open",
  throw: "throw",
  read: "read",
  map: "map",
}

/**
 * Tabs that stay mounted once visited, hidden by `.panel`'s display rule, the
 * way v14 kept every panel in the DOM. These hold work in progress — a
 * half-typed throw sentence, the traced prompt on Read — which unmounting
 * destroys. The whole workbench is keyed by scope at the route level, so those
 * drafts belong to one reading and cannot follow the student into another.
 */
const KEEP_ALIVE: ReadonlySet<Tab> = new Set<Tab>(["open", "throw", "read", "map"])

export default function Workbench({
  source,
  initialTab,
  initialSearch,
}: {
  source: WorkbenchSource | null
  /** Landing tab for journey deep links (`/weave?tab=map`); validated below. */
  initialTab?: Tab
  /** A shelf-search hit's query, carried into the reading's own search. */
  initialSearch?: string
}) {
  // `status`, not just `session`: next-auth reports "loading" on every hard
  // load while it fetches /api/auth/session, and during that window `session`
  // is null. Reading only the session made a signed-in student's own reading
  // greet them with "Please sign in to continue" for a few hundred
  // milliseconds before the workbench appeared.
  const { data: session, status } = useSession()
  const { isLoading, scoped } = useLoom()
  const tabs: Tab[] = source
    ? (source.hasFile ? ["reading", "open", "throw", "read", "map"] : ["open", "throw", "read", "map"])
    : ["throw", "read", "map"]
  const firstTab: Tab =
    initialTab && tabs.includes(initialTab)
      ? initialTab
      : tabs.includes("open")
        ? "open"
        : "throw"
  const [activeTab, setActiveTab] = useState<Tab>(firstTab)
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set<Tab>([firstTab]))
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfFocusByteId, setPdfFocusByteId] = useState<string | null>(null)
  const [openTargetByteId, setOpenTargetByteId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const goTo = (tab: Tab) => {
    setActiveTab(tab)
    setVisited((seen) => (seen.has(tab) ? seen : new Set(seen).add(tab)))
  }

  const shouldRender = (tab: Tab) => (KEEP_ALIVE.has(tab) ? visited.has(tab) : activeTab === tab)

  // Inside a reading, "goto" is a tab away rather than a page away: the text is
  // already open in this workbench.
  const handleGotoByte = (byte: Byte) => {
    if (!source?.hasFile) return
    setPdfPage(byte.pageNumber && byte.pageNumber > 0 ? byte.pageNumber : 1)
    setPdfFocusByteId(byte.id)
    goTo("reading")
  }

  const handleGotoOpenByte = (byteId: string) => {
    setOpenTargetByteId(byteId)
    goTo("open")
  }

  // Loading comes FIRST. Until next-auth has answered we do not yet know
  // whether anybody is signed in, and guessing "signed out" is the guess that
  // shows a sign-in screen to someone who is already signed in.
  if (status === "loading" || (session && isLoading)) {
    // The journey stays put while the loom loads: it is the one fixed thing
    // under the header, and blinking it out mid-load makes the app look like
    // it is rebuilding itself around you.
    return (
      <>
        <JourneyNav active={source ? STATION_OF[activeTab] : "weave"} />
        <main>
          <div className="empty" style={{ marginTop: "100px" }}>
            <h2>Loading your loom...</h2>
          </div>
          <FirstRunWalkthrough autoOpen={false} />
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
        <FirstRunWalkthrough autoOpen={false} />
      </main>
    )
  }

  return (
    <>
      <div className="scopebar">
        <Link href="/" className="scopeback">‹ library</Link>
        {source ? (
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
        ) : (
          <>
            <span className="scopetitle">Your whole weave</span>
            <span className="scopemeta">every reading at once</span>
          </>
        )}
        {/* The one search field, present on every tab (ruling 34): readings,
            concepts, links and your own passages, grouped by kind. */}
        <button
          className={`btn mini ${searchOpen ? "" : "ghost"}`}
          onClick={() => setSearchOpen((v) => !v)}
          aria-pressed={searchOpen}
          aria-label="Search everything"
          style={{ marginLeft: "auto" }}
        >
          ⌕ Search
        </button>
      </div>

      {searchOpen && (
        <div style={{ padding: "0 24px" }}>
          <ShelfSearch onActiveChange={() => {}} onClose={() => setSearchOpen(false)} />
        </div>
      )}

      <JourneyNav
        // Inside a reading the underline follows the tab; at the whole weave
        // it stays on 05 — Weave, the journey phase this place IS, while
        // throw/read/map act as its tools (the footer names the open one).
        active={source ? STATION_OF[activeTab] : "weave"}
        // In this workbench, the tabs are stations you can work at right here;
        // Readings and Keep (and Open, at the whole weave) are elsewhere, so
        // JourneyNav renders them as links. Inside a text, station 00 IS this
        // reading, so its label goes singular.
        labels={source?.hasFile ? { readings: "Reading" } : {}}
        onStation={Object.fromEntries(
          tabs.map((tab) => [STATION_OF[tab], () => goTo(tab)])
        )}
      />

      {/* The text gets the room. On 00 the viewer manages its own scrolling
          and wants every pixel under the journey, so main stops padding and
          stops scrolling and simply hands over its height. Every other station
          is an ordinary scrolling page. */}
      <main className={activeTab === "reading" ? "station-reading" : undefined}>
        {source?.hasFile && (
          <div className={`panel ${activeTab === "reading" ? "active" : ""}`}>
            {activeTab === "reading" && (
              <PdfViewer
                url={`/api/readings/${source.id}`}
                sourceName={source.title}
                sourceId={source.id}
                initialPageNumber={pdfPage}
                initialSearch={initialSearch}
                focusByteId={pdfFocusByteId}
                onGotoOpenByte={handleGotoOpenByte}
                onClose={() => {
                  setPdfFocusByteId(null)
                  goTo("open")
                }}
              />
            )}
          </div>
        )}
        {source && (
          <div className={`panel ${activeTab === "open" ? "active" : ""}`}>
            {shouldRender("open") && (
              <OpenTab
                onGotoByte={handleGotoByte}
                focusByteId={openTargetByteId}
                onFocusHandled={() => setOpenTargetByteId(null)}
              />
            )}
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
          {shouldRender("map") && <MapTab />}
        </div>
        <FirstRunWalkthrough />
      </main>

      <footer>
        <span className="fl">{FOOT[activeTab][0]}</span>
        <span className="fr">{FOOT[activeTab][1]}</span>
      </footer>
    </>
  )
}
