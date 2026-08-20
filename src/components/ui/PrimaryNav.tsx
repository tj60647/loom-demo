"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useReadings } from "@/components/providers/ReadingsProvider"

type Tool = "source" | "capture" | "connect" | "reflect" | "map"

const TOOL_LABEL: Record<Tool, string> = {
  source: "Source", capture: "Capture", connect: "Connect", reflect: "Reflect", map: "Map",
}
export default function PrimaryNav({ studio }: {
  studio?: {
    source: { id: string; title: string; hasFile: boolean } | null
    tools: Tool[]
    activeTool: Tool
    onTool: (tool: Tool) => void
  }
}) {
  const pathname = usePathname() ?? ""
  const { currentReading } = useReadings()
  const [expanded, setExpanded] = useState(false)
  const inLibrary = pathname.startsWith("/library") || pathname === "/"
  const inWeave = pathname.startsWith("/studio/weave")
  const inFiles = pathname.startsWith("/files")
  const remembered = studio?.source ?? currentReading
  const rememberedHasFile = remembered && ("hasFile" in remembered ? remembered.hasFile : !!remembered.storageKey)

  return (
    <aside className={`primarynav${studio ? " studio-tools" : ""}`} data-expanded={expanded}>
      <button className="navtoggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>Navigation</button>
      <nav className="primarynavbody" aria-label="Main navigation">
        <section>
          <span className="navgroup">Read</span>
          <Link className={inLibrary ? "active" : ""} href="/library">Library</Link>
        </section>

        {remembered && <section>
          <span className="navgroup">Current reading</span>
          <span className="navcontext">{remembered.title}</span>
          {studio?.source
            ? studio.tools.map((tool) => <button key={tool} className={studio.activeTool === tool ? "active" : ""} onClick={() => studio.onTool(tool)}>{TOOL_LABEL[tool]}</button>)
            : ([...(rememberedHasFile ? ["source" as const] : []), "capture" as const, "connect" as const, "reflect" as const, "map" as const]).map((tool) => <Link key={tool} className="navtool" href={`/studio/reading/${remembered.id}?tool=${tool}`}>{TOOL_LABEL[tool]}</Link>)}
        </section>}

        <section>
          <span className="navgroup">Synthesize</span>
          {studio && !studio.source ? <>
            <span className="navcontext">Whole weave</span>
            {studio.tools.map((tool) => <button key={tool} className={studio.activeTool === tool ? "active" : ""} onClick={() => studio.onTool(tool)}>{TOOL_LABEL[tool]}</button>)}
          </> : <Link className={inWeave ? "active" : ""} href="/studio/weave">Whole weave</Link>}
        </section>

        <section className="navutility">
          <span className="navgroup">Utility</span>
          <Link className={inFiles ? "active" : ""} href="/files">Export &amp; backup</Link>
        </section>
      </nav>
    </aside>
  )
}
