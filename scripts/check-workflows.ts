/**
 * The workflow diagrams, asserted without a browser.
 *
 * These exist so the diagrams on /admin/workflows cannot rot quietly. The
 * failure they guard against is specific: someone refactors a workflow, edits
 * `src/lib/workflows.ts` half-way, and the picture keeps rendering — just
 * wrong. A dangling edge id silently drops a connector; an orphan node draws a
 * box nothing reaches. Both look fine.
 *
 * Run: npx tsx scripts/check-workflows.ts   (part of `npm run check`)
 */
import { FLOWS, toMermaid, type Flow } from "../src/lib/workflows"
import { danglingEdgeIds, orphanNodeIds, layoutFlow, nodeDepths, wrapText } from "../src/lib/flowLayout"

let failures = 0
let checks = 0

function ok(label: string) {
  checks++
  console.log(`  ok    ${label}`)
}

function fail(label: string, detail: string) {
  checks++
  failures++
  console.log(`  FAIL  ${label}\n        ${detail}`)
}

function assert(condition: boolean, label: string, detail: string) {
  if (condition) ok(label)
  else fail(label, detail)
}

console.log("\nworkflows — the diagrams describe a graph that actually connects")

assert(FLOWS.length === 3, "three flows: student, faculty, admin", `got ${FLOWS.length}`)
assert(
  new Set(FLOWS.map((f) => f.key)).size === FLOWS.length,
  "flow keys are unique",
  "two flows share a key, so the picker would show one twice"
)

for (const flow of FLOWS as Flow[]) {
  console.log(`\n  ${flow.title}`)

  const dupes = flow.nodes
    .map((n) => n.id)
    .filter((id, i, all) => all.indexOf(id) !== i)
  assert(dupes.length === 0, "node ids are unique", `duplicated: ${dupes.join(", ")}`)

  const dangling = danglingEdgeIds(flow)
  assert(
    dangling.length === 0,
    "every edge names nodes that exist",
    `edges point at missing nodes: ${dangling.join(", ")} — the connector would be dropped silently`
  )

  const orphans = orphanNodeIds(flow)
  assert(
    orphans.length === 0,
    "every node is wired to something",
    `unreachable boxes: ${orphans.join(", ")} — a step someone added and forgot to connect`
  )

  assert(
    flow.nodes.some((n) => n.kind === "start"),
    "the flow says where the person comes in",
    "no node is kind 'start'"
  )

  // A back edge is a return, and the router assumes it: it runs the horizontal
  // legs through the gaps above and below its endpoints' rows. One marked
  // `back` that actually points downhill has no lane to run in and falls back
  // to a plain curve, which can cross a box — so catch it here instead.
  const depth = nodeDepths(flow)
  const wrongWay = flow.edges
    .filter((e) => e.back && (depth.get(e.from) ?? 0) <= (depth.get(e.to) ?? 0))
    .map((e) => `${e.from}→${e.to}`)
  assert(
    wrongWay.length === 0,
    "every edge marked `back` actually goes back",
    `these point downhill or sideways: ${wrongWay.join(", ")} — drop the back flag or re-wire them`
  )

  const laid = layoutFlow(flow)
  assert(
    laid.nodes.length === flow.nodes.length,
    "every node is placed",
    `${flow.nodes.length} nodes in, ${laid.nodes.length} laid out`
  )
  assert(
    laid.edges.length === flow.edges.length,
    "every edge is drawn",
    `${flow.edges.length} edges in, ${laid.edges.length} drawn — a dangling id drops one`
  )
  assert(
    laid.width > 0 && laid.height > 0 && Number.isFinite(laid.width) && Number.isFinite(laid.height),
    "the canvas has a finite size",
    `got ${laid.width} x ${laid.height}`
  )

  // Boxes must not overlap: the layout centres each row, so an overlap means
  // the row arithmetic drifted rather than that a label is long.
  const overlapping: string[] = []
  for (let i = 0; i < laid.nodes.length; i++) {
    for (let j = i + 1; j < laid.nodes.length; j++) {
      const a = laid.nodes[i]
      const b = laid.nodes[j]
      const hit =
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      if (hit) overlapping.push(`${a.node.id}/${b.node.id}`)
    }
  }
  assert(overlapping.length === 0, "no two boxes overlap", `overlaps: ${overlapping.join(", ")}`)

  // A forward edge that skips a row runs straight through whatever sits
  // between its ends unless it is routed around — and since nodes paint over
  // edges, it disappears, label and all. Routed paths have corners; a plain
  // one-curve path does not.
  const hidden = flow.edges
    .filter((e) => !e.back && (depth.get(e.to) ?? 0) - (depth.get(e.from) ?? 0) > 1)
    .filter((e) => {
      const drawn = laid.edges.find((l) => l.edge === e)
      return !drawn || !drawn.path.includes("Q")
    })
    .map((e) => `${e.from}→${e.to}`)
  assert(
    hidden.length === 0,
    "an edge that skips a row is routed around, not drawn under the box between",
    `would be invisible: ${hidden.join(", ")}`
  )

  assert(
    flow.sources.length > 0,
    "the flow points at the code behind it",
    "sources is empty — a reader cannot check the picture against the thing"
  )

  const mermaid = toMermaid(flow)
  assert(
    mermaid.startsWith("flowchart TD") &&
      flow.nodes.every((n) => mermaid.includes(n.id)) &&
      !mermaid.includes('""'),
    "mermaid export carries every node",
    "the derived Mermaid source is missing nodes or has an empty label"
  )
}

console.log("\nwrapText — deterministic, so server and client agree")
assert(
  wrapText("one two three", 7).join("|") === "one two|three",
  "wraps on whole words",
  wrapText("one two three", 7).join("|")
)
assert(
  wrapText("supercalifragilistic", 8).every((l) => l.length <= 8),
  "breaks a word too long for the line rather than overflowing",
  wrapText("supercalifragilistic", 8).join("|")
)
assert(wrapText("", 10).length === 0, "empty text is no lines", "got lines for an empty string")
assert(
  wrapText("a b c d e f g h i j k l m n o p", 3, 2).length === 2,
  "respects the line cap",
  "exceeded maxLines"
)

console.log(
  failures === 0
    ? `\n[check-workflows] all ${checks} assertions passed`
    : `\n[check-workflows] ${failures} of ${checks} FAILED`
)
process.exit(failures === 0 ? 0 : 1)
