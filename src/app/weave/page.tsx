// The whole weave — every reading at once. A real place on the shelf, not an
// escape hatch: week 11 mines the graph for final-project themes and weeks
// 12-14 quilt it (deployment notes §4). Its scopeKey is '', which is what every
// row written before scoping existed already means.

import { redirect } from "next/navigation"

type WeavePageSearchParams = { tab?: string | string[] }
const firstParam = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

// Legacy journey links still deep-link here; anything else lands on Studio.
const WEAVE_TOOLS: Record<string, string> = { throw: "connect", read: "reflect", map: "map" }

export default async function WeavePage({
  searchParams,
}: {
  searchParams: Promise<WeavePageSearchParams>
}) {
  const resolved = await searchParams
  const tool = WEAVE_TOOLS[firstParam(resolved.tab) ?? ""]
  redirect(tool ? `/studio/weave?tool=${tool}` : "/studio/weave")
}
