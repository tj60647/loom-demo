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
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { FLOWS, toMermaid, type Flow } from "../src/lib/workflows"
import { CAPABILITIES } from "../src/lib/capabilities"
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

/**
 * Three people and one machine. The fourth flow is the reading's own text —
 * the pipeline that turns an upload into something quotable — and it is here
 * because its absence is what let a detector sit wired to nothing and a write
 * halve a scan's resolution, both unseen. AGENTS.md's rule covers the three
 * human flows; this one earns the same treatment for the same reason.
 */
assert(
  FLOWS.length === 4,
  "four flows: student, faculty, admin, and the reading's text",
  `got ${FLOWS.length}`
)
assert(
  FLOWS.some((f) => f.key === "pipeline"),
  "the pipeline flow is present",
  "the only diagram of how a PDF becomes text went missing"
)
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

/**
 * The role/capability matrix — the same contract as the flows above.
 *
 * The rot guarded against here is the one that matters most for a matrix about
 * ACCESS: someone renames a gate, the matrix keeps naming the old one, and the
 * page carries on stating a fact that stopped being true. A wrong row about
 * who can see what is worse than no row at all.
 *
 * `gate.line` is deliberately NOT asserted. Line numbers rot on every edit,
 * and a checker that cries wolf is a checker somebody switches off.
 */
console.log("\ncapabilities — every row names a gate that still exists")

const repoRoot = join(__dirname, "..")

assert(
  new Set(CAPABILITIES.map((c) => c.id)).size === CAPABILITIES.length,
  "capability ids are unique",
  "two rows share an id"
)

for (const cap of CAPABILITIES) {
  const abs = join(repoRoot, cap.gate.file)
  if (!existsSync(abs)) {
    fail(`${cap.id} — gate file exists`, `${cap.gate.file} is not on disk`)
    continue
  }
  assert(
    readFileSync(abs, "utf8").includes(cap.gate.symbol),
    `${cap.id} — ${cap.gate.symbol} still in ${cap.gate.file}`,
    "renamed or removed, and the matrix would keep naming it"
  )
}

// A hole must say what it is, or it reads as an ordinary row.
for (const cap of CAPABILITIES.filter((c) => c.enforcement === "ui-only")) {
  assert(!!cap.hole, `${cap.id} — a ui-only row explains its hole`, "set `hole`")
}

// "qualified" is a promise that the note says how.
let unexplained = 0
for (const cap of CAPABILITIES) {
  for (const access of [cap.student, cap.faculty, cap.admin]) {
    if (access.verdict === "qualified" && !access.note) unexplained++
  }
}
assert(
  unexplained === 0,
  "every qualified verdict explains itself",
  `${unexplained} bare "qualified" verdicts tell a reader nothing`
)

/**
 * The pipeline's ORDER, asserted — not just that its graph connects.
 *
 * A picture that connects can still describe the wrong sequence, and the
 * sequence is the part that carries the guarantees: nothing is read before it
 * is proposed, nothing is written before it is judged and gated, and every
 * write is followed by a re-score. These read the graph rather than the prose,
 * so reordering the pipeline in code and not here fails the build.
 */
console.log("\nthe pipeline's order of events")

const pipeline = FLOWS.find((f) => f.key === "pipeline")
if (!pipeline) {
  assert(false, "the pipeline flow exists to be ordered", "no flow with key 'pipeline'")
} else {
  /** Every node reachable from `from` by forward (non-back) edges. */
  const forwardFrom = (start: string) => {
    const seen = new Set<string>()
    const queue = [start]
    while (queue.length) {
      const at = queue.shift()!
      for (const edge of pipeline.edges) {
        if (edge.from !== at || edge.back) continue
        if (seen.has(edge.to)) continue
        seen.add(edge.to)
        queue.push(edge.to)
      }
    }
    return seen
  }
  const precedes = (before: string, after: string) => forwardFrom(before).has(after)

  const ORDER: [string, string, string][] = [
    ["upload", "extract", "a PDF is extracted before anything judges it"],
    ["extract", "probe", "the text is extracted before the file is probed"],
    ["probe", "score", "the probe informs the score"],
    ["score", "damaged", "the score decides whether the text is damaged"],
    ["damaged", "propose", "only a damaged reading proposes pages"],
    ["propose", "read", "no page is read by the panel before it is proposed and cropped"],
    ["read", "vote", "the panel is read before its readings are voted on"],
    ["vote", "accept", "nothing is accepted before the vote"],
    ["accept", "gates", "nothing reaches the gates before it is accepted"],
    ["gates", "write", "NOTHING IS WRITTEN BEFORE THE GATES"],
    ["write", "reingest", "a write is always followed by re-ingestion"],
  ]
  for (const [before, after, why] of ORDER) {
    assert(precedes(before, after), `${before} → … → ${after}: ${why}`, `${after} is not reachable from ${before}`)
  }

  // The guarantees that are about what must NOT happen.
  assert(!precedes("propose", "score"), "proposing does not loop back into scoring within a pass", "a cycle would re-score mid-repair")
  assert(!precedes("read", "propose"), "reading never selects its own pages", "the panel would choose what it reads")
  assert(
    pipeline.edges.some((e) => e.from === "reingest" && e.to === "score" && e.back),
    "the loop closes: a written revision is re-scored",
    "a repair that is never re-measured cannot be known to have helped"
  )
  assert(
    pipeline.edges.some((e) => e.from === "gates" && e.to === "held"),
    "the gates can refuse, and a refusal has somewhere to go",
    "a gate with no refusal path is not a gate"
  )

  /**
   * Detectors the system runs and does not act on. Drawn as `noted` dead ends
   * on purpose — this asserts they STAY visible, so the next person meets them
   * in the picture rather than by measuring a library and finding out.
   */
  const noted = pipeline.nodes.filter((n) => n.kind === "noted").map((n) => n.id)
  assert(noted.length > 0, "measurements that lead nowhere are drawn, not hidden", "a detector wired to nothing is invisible in code")
  for (const id of noted) {
    assert(
      !pipeline.edges.some((e) => e.from === id),
      `${id} is drawn as a dead end, because it is one`,
      `${id} now leads somewhere — make it a step and say where`
    )
  }
}

console.log(
  failures === 0
    ? `\n[check-workflows] all ${checks} assertions passed`
    : `\n[check-workflows] ${failures} of ${checks} FAILED`
)
process.exit(failures === 0 ? 0 : 1)
