import { redirect } from "next/navigation"

type SearchParams = { tab?: string | string[]; q?: string | string[] }
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
const TOOLS: Record<string, string> = { reading: "source", open: "capture", throw: "connect", read: "reflect", map: "map" }

export default async function LegacyReadingPage({ params, searchParams }: { params: Promise<{ sourceId: string }>; searchParams: Promise<SearchParams> }) {
  const { sourceId } = await params
  const query = await searchParams
  const tool = TOOLS[first(query.tab) ?? ""]
  const q = first(query.q)?.trim()
  const suffix = new URLSearchParams({ ...(tool ? { tool } : {}), ...(q ? { q } : {}) }).toString()
  redirect(`/studio/reading/${encodeURIComponent(sourceId)}${suffix ? `?${suffix}` : ""}`)
}
