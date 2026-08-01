// The whole weave — every reading at once. A real place on the shelf, not an
// escape hatch: week 11 mines the graph for final-project themes and weeks
// 12-14 quilt it (deployment notes §4). Its scopeKey is '', which is what every
// row written before scoping existed already means.

import Workbench, { type Tab } from "@/components/Workbench"
import { firstParam } from "@/lib/courses"

type WeavePageSearchParams = { tab?: string | string[] }

// The journey bar deep-links here (`/weave?tab=map`); anything else lands on
// the default first tab.
const WEAVE_TABS = new Set<Tab>(["throw", "read", "map"])

export default async function WeavePage({
  searchParams,
}: {
  searchParams: Promise<WeavePageSearchParams>
}) {
  const resolved = await searchParams
  const raw = firstParam(resolved.tab)
  const initialTab = raw && WEAVE_TABS.has(raw as Tab) ? (raw as Tab) : undefined
  return <Workbench source={null} initialTab={initialTab} />
}
