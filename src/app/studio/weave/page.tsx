import type { Metadata } from "next"
import Workbench, { type StudioTool } from "@/components/Workbench"

type SearchParams = { tool?: string | string[] }
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
const TOOLS = new Set<StudioTool>(["connect", "reflect", "map"])

export const metadata: Metadata = { title: "Knowledge" }

export default async function WeaveStudioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawTool = first((await searchParams).tool)
  return <Workbench source={null} initialTool={rawTool && TOOLS.has(rawTool as StudioTool) ? rawTool as StudioTool : undefined} />
}
