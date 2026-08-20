"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useSession } from "next-auth/react"
import { useLoom } from "@/components/providers/LoomProvider"
import OpenTab from "@/components/tabs/OpenTab"
import ThrowTab from "@/components/tabs/ThrowTab"
import ReadTab from "@/components/tabs/ReadTab"
import MapTab from "@/components/tabs/MapTab"
import ReadingPreview from "@/components/pdf/ReadingPreview"
import FirstRunWalkthrough from "@/components/ui/FirstRunWalkthrough"
import PrimaryNav from "@/components/ui/PrimaryNav"
import type { Byte } from "@/lib/types"

const PdfViewer = dynamic(() => import("@/components/pdf/PdfViewer"), { ssr: false })

export type WorkbenchSource = { id: string; title: string; author: string; week: number | null; hasFile: boolean; isPreview?: boolean }
export type StudioTool = "source" | "capture" | "connect" | "reflect" | "map"

const KEEP_ALIVE = new Set<StudioTool>(["capture", "connect", "reflect", "map"])

export default function Workbench({
  source, initialTool, initialSearch,
}: {
  source: WorkbenchSource | null
  initialTool?: StudioTool
  initialSearch?: string
}) {
  const { data: session, status } = useSession()
  const { isLoading, scoped } = useLoom()
  const hasReadingSurface = !!source && (source.hasFile || source.isPreview)
  const tools: StudioTool[] = source
    ? hasReadingSurface ? ["source", "capture", "connect", "reflect", "map"] : ["capture", "connect", "reflect", "map"]
    : ["connect", "reflect", "map"]
  const firstTool = initialTool && tools.includes(initialTool) ? initialTool : hasReadingSurface ? "source" : tools[0]
  const [activeTool, setActiveTool] = useState<StudioTool>(firstTool)
  const [visited, setVisited] = useState<ReadonlySet<StudioTool>>(() => new Set([firstTool]))
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfFocusByteId, setPdfFocusByteId] = useState<string | null>(null)
  const [openTargetByteId, setOpenTargetByteId] = useState<string | null>(null)

  const goTo = (tool: StudioTool) => {
    setActiveTool(tool)
    setVisited((seen) => seen.has(tool) ? seen : new Set(seen).add(tool))
    const url = new URL(window.location.href)
    url.searchParams.set("tool", tool)
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }
  const shouldRender = (tool: StudioTool) => !KEEP_ALIVE.has(tool) || visited.has(tool)
  const handleGotoByte = (byte: Byte) => {
    if (!hasReadingSurface) return
    setPdfPage(byte.pageNumber && byte.pageNumber > 0 ? byte.pageNumber : 1)
    setPdfFocusByteId(byte.id)
    goTo("source")
  }
  const handleGotoOpenByte = (byteId: string) => {
    setOpenTargetByteId(byteId)
    goTo("capture")
  }

  if (status === "loading" || (session && isLoading)) {
    return <><PrimaryNav studio={{ source, tools, activeTool, onTool: goTo }} /><main><div className="empty" style={{ marginTop: "100px" }}><h2>Loading your loom...</h2></div><FirstRunWalkthrough autoOpen={false} /></main></>
  }
  if (!session) {
    return <main><div className="empty" style={{ marginTop: "100px" }}><h2>Welcome to Loom.</h2><span className="cap">Please sign in to continue</span></div><FirstRunWalkthrough autoOpen={false} /></main>
  }

  return <>
    <PrimaryNav studio={{ source, tools, activeTool, onTool: goTo }} />
    <div className="workspacehead">
      {source ? <>
        <span className="scopetitle">{source.title}</span>
        {source.author && <span className="scopemeta">{source.author}</span>}
        <span className="scopemeta">{scoped.concepts.length} concept{scoped.concepts.length !== 1 ? "s" : ""} evidenced here{scoped.bridges.length ? ` · ${scoped.bridges.length} thread${scoped.bridges.length !== 1 ? "s" : ""} out` : ""}</span>
        {source.hasFile ? <a className="scopeback scopedl" href={`/api/readings/${source.id}?download=1`}>Download PDF</a> : source.isPreview ? <span className="scopemeta scopedl">front-end reading preview</span> : <span className="scopemeta scopedl">no source file attached</span>}
      </> : <><span className="scopetitle">Knowledge</span><span className="scopemeta">connections across every reading</span></>}
    </div>

    <main className={activeTool === "source" ? "station-reading" : undefined}>
      {source && !hasReadingSurface && activeTool === "capture" && <p className="hint">This reference has no source file attached; capture passages by hand.</p>}
      {hasReadingSurface && source && <div className={`panel ${activeTool === "source" ? "active" : ""}`}>
        {activeTool === "source" && (source.hasFile
          ? <PdfViewer url={`/api/readings/${source.id}`} sourceName={source.title} sourceId={source.id} initialPageNumber={pdfPage} initialSearch={initialSearch} focusByteId={pdfFocusByteId} onGotoOpenByte={handleGotoOpenByte} onClose={() => { setPdfFocusByteId(null); goTo("capture") }} />
          : <ReadingPreview sourceId={source.id} sourceName={source.title} author={source.author} onClose={() => goTo("capture")} />)}
      </div>}
      {source && <div className={`panel ${activeTool === "capture" ? "active" : ""}`}>
        {shouldRender("capture") && <OpenTab onGotoByte={handleGotoByte} focusByteId={openTargetByteId} onFocusHandled={() => setOpenTargetByteId(null)} />}
      </div>}
      <div className={`panel ${activeTool === "connect" ? "active" : ""}`}>{shouldRender("connect") && <ThrowTab />}</div>
      <div className={`panel ${activeTool === "reflect" ? "active" : ""}`}>{shouldRender("reflect") && <ReadTab />}</div>
      <div className={`panel ${activeTool === "map" ? "active" : ""}`}>{shouldRender("map") && <MapTab />}</div>
      <FirstRunWalkthrough />
    </main>
  </>
}
