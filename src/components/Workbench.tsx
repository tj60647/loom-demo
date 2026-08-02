"use client"

// The workbench for one scope — a reading, or the whole weave.
//
// Reading-first (docs/reading-scope-and-map-passes.md §A.1): the shelf is the
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
import ReadTab from "@/components/tabs/ReadTab"
import MapTab from "@/components/tabs/MapTab"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"
import JourneyNav, { type Station } from "@/components/ui/JourneyNav"
import type { Byte } from "@/lib/types"

const PdfViewer = dynamic(() => import("@/components/pdf/PdfViewer"), { ssr: false })
const SpreadCanvas = dynamic(() => import("@/components/pdf/SpreadCanvas"), { ssr: false })

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
  throw: ["02 — THROW", "ONE THREAD AT A TIME"],
  read: ["03 — READ", "PULL A THREAD"],
  map: ["04 — MAP", "THE CARD TABLE"],
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
}: {
  source: WorkbenchSource | null
  /** Landing tab for journey deep links (`/weave?tab=map`); validated below. */
  initialTab?: Tab
}) {
  const { data: session } = useSession()
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
  // The spread canvas is a full-screen overlay on top of this workbench — a
  // second way to read the same PDF, not another tab in the 00-04 sequence.
  const [canvasOpen, setCanvasOpen] = useState(false)

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

  if (isLoading) {
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

  return (
    <>
      <div className="scopebar">
        <Link href="/" className="scopeback">‹ readings</Link>
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
              <span className="scopedl" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button type="button" className="btn ghost compact" onClick={() => setCanvasOpen(true)}>
                  Read
                </button>
                <a className="btn ghost compact" href={`/api/readings/${source.id}?download=1`}>
                  Download PDF
                </a>
              </span>
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
      </div>

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

      <main>
        {source?.hasFile && (
          <div className={`panel ${activeTab === "reading" ? "active" : ""}`}>
            {activeTab === "reading" && (
              <PdfViewer
                url={`/api/readings/${source.id}`}
                sourceName={source.title}
                sourceId={source.id}
                initialPageNumber={pdfPage}
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
          {shouldRender("read") && <ReadTab />}
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

      {source?.hasFile && canvasOpen && (
        <SpreadCanvas
          url={`/api/readings/${source.id}`}
          sourceName={source.title}
          sourceId={source.id}
          onClose={() => setCanvasOpen(false)}
        />
      )}
    </>
  )
}
