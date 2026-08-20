import Link from "next/link"
import Workbench, { type StudioTool } from "@/components/Workbench"
import { frontendReadings } from "@/lib/frontendFixture"

type SearchParams = { tool?: string | string[]; q?: string | string[] }
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
const TOOLS = new Set<StudioTool>(["source", "capture", "connect", "reflect", "map"])

export default async function ReadingStudioPage({ params, searchParams }: { params: Promise<{ sourceId: string }>; searchParams: Promise<SearchParams> }) {
  const { sourceId } = await params
  const query = await searchParams
  const source = frontendReadings.find((reading) => reading.id === sourceId)
  if (!source) return <main><div className="empty" style={{ marginTop: "100px" }}><h2>That reading isn&apos;t in your library.</h2><p style={{ marginTop: 18 }}><Link className="btn ghost mini" href="/library">‹ back to library</Link></p></div></main>
  const rawTool = first(query.tool)
  return <Workbench key={source.id} initialTool={rawTool && TOOLS.has(rawTool as StudioTool) ? rawTool as StudioTool : undefined} initialSearch={first(query.q)?.trim() || undefined} source={{ id: source.id, title: source.title, author: source.author ?? "", week: source.week, hasFile: !!source.storageKey }} />
}
