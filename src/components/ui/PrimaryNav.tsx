"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { OPEN_READING_LIMIT, useReadings } from "@/components/providers/ReadingsProvider"

type Tool = "source" | "capture" | "connect" | "reflect" | "map"

const TOOL_LABEL: Record<Tool, string> = {
  source: "Read", capture: "Capture", connect: "Connections", reflect: "Reflection", map: "Map",
}
const KNOWLEDGE_TOOLS: Tool[] = ["connect", "reflect", "map"]
export default function PrimaryNav({ studio }: {
  studio?: {
    source: { id: string; title: string; hasFile: boolean } | null
    tools: Tool[]
    activeTool: Tool
    onTool: (tool: Tool) => void
  }
}) {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const { openReadings, closeReading } = useReadings()
  const [expanded, setExpanded] = useState(false)
  const inLibrary = pathname.startsWith("/library") || pathname === "/"
  const inFiles = pathname.startsWith("/files")
  const deskReadings = openReadings

  return (
    <aside className={`primarynav${studio ? " studio-tools" : ""}`} data-expanded={expanded} data-open-count={openReadings.length}>
      <button className="navtoggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>Menu</button>
      <nav className="primarynavbody" aria-label="Main navigation">
        <section className="navsection">
          <span className="navgroup">Readings</span>
          <Link className={`navitem ${inLibrary ? "active" : ""}`} aria-current={inLibrary ? "page" : undefined} href="/library">Browse all</Link>

          <div className="navsubgroup">
            <span className="navgroup">Open readings <span>{deskReadings.length}/{OPEN_READING_LIMIT}</span></span>
            {deskReadings.length > 0
              ? <div className="navreadings">{deskReadings.map((reading) => <div className="navreading" key={reading.id}>
              <div className="navreadinghead">
                <Link className={`navitem ${studio?.source?.id === reading.id ? "current" : ""}`} aria-current={studio?.source?.id === reading.id ? "page" : undefined} href={`/studio/reading/${reading.id}`}>{reading.title}</Link>
                <button
                  className="navclose"
                  aria-label={`Close ${reading.title}`}
                  title="Remove from open readings"
                  onClick={() => {
                    closeReading(reading.id)
                    if (studio?.source?.id === reading.id) router.push("/library")
                  }}
                >×</button>
              </div>
              {studio?.source?.id === reading.id && <div className="navtools">
                {studio.tools.map((tool) => <button key={tool} className={studio.activeTool === tool ? "active" : ""} onClick={() => studio.onTool(tool)}>{TOOL_LABEL[tool]}</button>)}
              </div>}
            </div>)}</div>
              : <span className="navempty">No readings open</span>}
          </div>
        </section>

        <section className="navsection">
          <span className="navgroup">Knowledge</span>
          {studio && !studio.source
            ? studio.tools.map((tool) => <button key={tool} className={studio.activeTool === tool ? "active" : ""} onClick={() => studio.onTool(tool)}>{TOOL_LABEL[tool]}</button>)
            : KNOWLEDGE_TOOLS.map((tool) => <Link key={tool} href={`/studio/weave?tool=${tool}`}>{TOOL_LABEL[tool]}</Link>)}
        </section>

        <Link className={`navdestination navutility ${inFiles ? "active" : ""}`} href="/files">Export &amp; backup</Link>
      </nav>
    </aside>
  )
}
