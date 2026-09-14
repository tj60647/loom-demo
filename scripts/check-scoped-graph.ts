/**
 * A concept with no passage belongs in the reading it was named in — not
 * every reading. Unstamped empty-evidence still belongs in every warp.
 *
 * The failure this exists to catch is the one Adin's loom showed: naming a
 * graph on Chapter 1, then opening any other reading and seeing that graph
 * in Linking and the Knowledge Graph. `scopedGraph` is the one function the
 * tabs, the overlays' student-side twin, export, and the shelf tally all
 * read. If it is wrong, every surface is wrong the same way.
 *
 * Run: npx tsx scripts/check-scoped-graph.ts   (part of `npm run check`)
 */
import { scopedGraph, scopeOf, tallyByReading, WHOLE_WEAVE } from "../src/lib/scope"
import type { Concept, Edge, LoomState, Passage } from "../src/lib/types"

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

const at = new Date("2026-09-11T12:00:00Z")
const HERE = "reading-1"
const THERE = "reading-2"

const concept = (id: string, mintedInSourceId: string | null): Concept => ({
  id, courseId: null, userId: "u", label: id, def: "", note: "", mintedInSourceId, createdAt: at,
})
const passage = (id: string, conceptIds: string[], sourceId: string): Passage => ({
  id, courseId: null, userId: "u", conceptIds, source: "", sourceId, location: "",
  content: "text", pageNumber: null, startOffset: null, endOffset: null, pageContentHash: null,
  note: "", question: "", isPullQuote: false, tier: "", createdAt: at,
})
const edge = (id: string, fromId: string, toId: string): Edge => ({
  id, courseId: null, userId: "u", fromId, toId, handle: "", linkId: null, sentence: "", createdAt: at,
})

const state: LoomState = {
  concepts: [
    concept("c-here-evidenced", HERE),
    concept("c-there-evidenced", THERE),
    concept("c-minted-here", HERE),
    concept("c-minted-there", THERE),
    concept("c-unstamped", null),
    concept("c-minted-here-evidenced-there", HERE),
  ],
  passages: [
    passage("p-here", ["c-here-evidenced"], HERE),
    passage("p-there", ["c-there-evidenced"], THERE),
    passage("p-moved", ["c-minted-here-evidenced-there"], THERE),
  ],
  edges: [
    edge("e-minted-here", "c-minted-here", "c-here-evidenced"),
    edge("e-unstamped", "c-minted-here", "c-unstamped"),
    edge("e-minted-there", "c-minted-there", "c-there-evidenced"),
    edge("e-cross", "c-minted-here", "c-minted-there"),
  ],
  links: [], maps: [], cloths: [], views: { cardTable: { positions: {}, bends: {} } },
}

const here = scopedGraph(state, scopeOf([HERE]))
const there = scopedGraph(state, scopeOf([THERE]))
const labels = (graph: { concepts: Concept[] }) => graph.concepts.map((c) => c.id).sort().join(",")
const edgeIds = (graph: { edges: Edge[] }) => graph.edges.map((e) => e.id).sort().join(",")

console.log("\nscoped graph — name-ahead stays in the reading it was named in")

assert(
  labels(here) === "c-here-evidenced,c-minted-here,c-unstamped",
  "this reading holds its evidence, its own name-ahead, and unstamped empty-evidence",
  `got ${labels(here)}`
)
assert(
  labels(there) === "c-minted-here-evidenced-there,c-minted-there,c-there-evidenced,c-unstamped",
  "the other reading holds ITS evidence, ITS name-ahead, and the same unstamped row — not this reading's graph",
  `got ${labels(there)}`
)
assert(
  here.outside.map((c) => c.id).sort().join(",") === "c-minted-here-evidenced-there,c-minted-there,c-there-evidenced",
  "a name-ahead minted elsewhere is outside, not in the warp",
  `got ${here.outside.map((c) => c.id).join(",")}`
)
assert(
  !here.concepts.some((c) => c.id === "c-minted-here-evidenced-there"),
  "once a passage exists, origin stops placing: named here, evidenced only there, not in this warp",
  "origin leaked a concept that now lives elsewhere"
)
assert(
  edgeIds(here) === "e-minted-here,e-unstamped",
  "threads whose both ends belong here are internal, including one to the unstamped row",
  `got ${edgeIds(here)}`
)
assert(
  here.bridges.map((e) => e.id).join(",") === "e-cross",
  "a thread from this name-ahead to another reading's name-ahead is a bridge here, not an internal thread",
  `got ${here.bridges.map((e) => e.id).join(",")}`
)
assert(
  !there.edges.some((e) => e.id === "e-minted-here") && !there.bridges.some((e) => e.id === "e-minted-here"),
  "a thread whose both ends were named in this reading does not appear on the other reading at all",
  "Chapter 1's threads leaked"
)

const whole = scopedGraph(state, WHOLE_WEAVE)
assert(
  whole.concepts.length === state.concepts.length && whole.outside.length === 0 && whole.bridges.length === 0,
  "the whole weave is still everything, with no outside and no bridges",
  `concepts ${whole.concepts.length} outside ${whole.outside.length} bridges ${whole.bridges.length}`
)

const tallies = tallyByReading(state)
assert(
  tallies.get(HERE)?.concepts === here.concepts.length,
  "the shelf tally for this reading matches the warp",
  `tally ${tallies.get(HERE)?.concepts} warp ${here.concepts.length}`
)
assert(
  tallies.get(THERE)?.concepts === there.concepts.length,
  "the shelf tally for the other reading matches its warp",
  `tally ${tallies.get(THERE)?.concepts} warp ${there.concepts.length}`
)

console.log(`\n${checks} checks, ${failures} failing`)
if (failures) process.exit(1)
