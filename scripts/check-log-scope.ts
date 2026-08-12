/**
 * The Capture Log, read per reading — asserted without a browser.
 *
 * The Log is the one record of a student's work that appears in no export
 * (until now) and cannot be reconstructed, so what it SHOWS is load-bearing.
 * Two failures matter and neither would look broken: showing another
 * reading's acts (the log stops being this reading's), and dropping acts
 * that belong (the log quietly under-reports the work, which is the same
 * stranding the move to 03 exists to end).
 *
 * Run: npx tsx scripts/check-log-scope.ts   (part of `npm run check`)
 */
import { readFileSync } from "node:fs"
import { eventBelongsToReading, eventsForReading } from "../src/lib/logScope"
import type { GraphEvent, LoomState, Passage } from "../src/lib/types"

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

const at = new Date("2026-08-10T12:00:00Z")
const HERE = "reading-1"
const THERE = "reading-2"

const passage = (id: string, conceptIds: string[], sourceId: string | null): Passage => ({
  id, courseId: null, userId: "u", conceptIds, source: "", sourceId, location: "",
  content: "text", pageNumber: null, startOffset: null, endOffset: null, pageContentHash: null,
  note: "", question: "", isPullQuote: false, tier: "", createdAt: at,
})

const state: LoomState = {
  concepts: [],
  passages: [
    passage("p-here", ["c-here"], HERE),
    passage("p-there", ["c-there"], THERE),
    passage("p-both", ["c-both"], HERE),
    passage("p-both2", ["c-both"], THERE),
    passage("p-loose", [], HERE),
  ],
  edges: [
    { id: "e-here", courseId: null, userId: "u", fromId: "c-here", toId: "c-both", handle: "", linkId: null, sentence: "", createdAt: at },
    { id: "e-cross", courseId: null, userId: "u", fromId: "c-here", toId: "c-there", handle: "", linkId: null, sentence: "", createdAt: at },
  ],
  links: [], maps: [], cloths: [], views: { cardTable: { positions: {}, bends: {} } },
}

const ev = (kind: string, entityType: GraphEvent["entityType"], entityId: string | null, payload: Record<string, unknown> | null): GraphEvent => ({
  id: `ev-${kind}-${entityId ?? "x"}-${JSON.stringify(payload ?? {}).length}`,
  courseId: null, userId: "u", kind, entityType, entityId, payload, at,
})

const here = (e: GraphEvent) => eventBelongsToReading(e, HERE, state)

console.log("\nlog scope — this reading's acts, and only this reading's")

// 1. The act said so.
assert(here(ev("passage.capture", "passage", "p1", { sourceId: HERE })), "a stamped act in this reading belongs", "stamp ignored")
assert(!here(ev("passage.capture", "passage", "p2", { sourceId: THERE })), "a stamped act elsewhere does NOT", "another reading leaked in")
assert(
  !here(ev("passage.capture", "passage", "p3", { sourceId: null })),
  "a stamped NULL means no reading — capturing an untethered passage belongs nowhere",
  "an untethered capture was placed in a reading"
)
assert(
  here(ev("concept.create", "concept", "c-brand-new", { label: "named ahead", sourceId: HERE })),
  "naming a concept BEFORE any evidence still appears — the act was stamped (TJ, 2026-08-10)",
  "the name-ahead act was dropped, which is the stranding this move exists to end"
)

// 2. Its scope said so.
assert(here(ev("cloth.update", "cloth", "cl1", { scopeKey: HERE })), "a cloth act placed by its scope", "scopeKey ignored")
assert(!here(ev("map.create", "map", "m1", { scopeKey: THERE })), "another scope's projection stays out", "foreign scope leaked")
assert(!here(ev("map.create", "map", "m2", { scopeKey: "" })), "a whole-weave projection is not this reading's", "whole weave leaked in")

// 3. The evidence says so — events from before the stamp.
assert(here(ev("concept.create", "concept", "c-here", { label: "x" })), "an unstamped concept placed by its evidence", "evidence rule failed")
assert(!here(ev("concept.create", "concept", "c-there", { label: "y" })), "a concept evidenced only elsewhere stays out", "foreign concept leaked")
assert(here(ev("concept.create", "concept", "c-both", { label: "z" })), "a concept evidenced in BOTH appears in both", "shared concept dropped")
assert(
  !here(ev("concept.create", "concept", "c-orphan", { label: "no evidence anywhere" })),
  "an unstamped concept with no evidence anywhere cannot be placed — and is why new acts are stamped",
  "an unplaceable act was placed"
)
assert(here(ev("edge.throw", "edge", "e-here", null)), "a thread with BOTH ends evidenced here belongs", "thread dropped")
assert(
  !here(ev("edge.throw", "edge", "e-cross", null)),
  "a thread reaching out of this reading is not this reading's (ThrowTab's own rule)",
  "a cross-reading thread leaked in"
)
assert(here(ev("passage.delete", "passage", "p-here", { conceptIds: [] })), "an unstamped passage act placed by its live row", "row lookup failed")
assert(!here(ev("passage.delete", "passage", "p-there", { conceptIds: [] })), "…and not another reading's", "foreign passage leaked")
assert(
  !here(ev("passage.delete", "passage", "p-gone", { conceptIds: [] })),
  "an unstamped act whose row is gone cannot be placed — the stamp is what fixes this going forward",
  "a deleted-row act was placed anyway"
)

// Whole-loom acts.
assert(here(ev("graph.reset", "graph", null, { concepts: 3 })), "a whole-loom act touched this reading too", "reset hidden")
assert(here(ev("graph.example", "graph", null, {})), "the worked example counts as touching every reading", "example hidden")

// The list keeps the record's order and drops nothing else.
{
  const all = [
    ev("passage.capture", "passage", "a", { sourceId: HERE }),
    ev("passage.capture", "passage", "b", { sourceId: THERE }),
    ev("concept.create", "concept", "c-here", { label: "x" }),
  ]
  const mine = eventsForReading(all, HERE, state)
  assert(mine.length === 2, "the filtered list holds exactly what belongs", `got ${mine.length}`)
  assert(mine[0].entityId === "a" && mine[1].entityId === "c-here", "and keeps the record's own order", JSON.stringify(mine.map((m) => m.entityId)))
}

// An unknown kind must not be guessed into a reading.
assert(
  !here(ev("something.new", "graph", null, null)),
  "an unrecognised act is not placed by guesswork",
  "an unknown kind leaked into a reading"
)

// --- every act says which reading it happened in (2026-08-11) ---
//
// TJ ruled the whole weave out of the app, and named what must not be lost
// with it: "reading, passage capture, concept labeling, link labeling,
// building threads, organizing concepts and threads, and building projections
// from a readings cloth". Every one of those is an act in a reading. Before
// this, five of them placed only by EVIDENCE and two placed nowhere at all —
// so sharpening a concept you had named ahead of its evidence, or coining a
// word for a relation, left no trace in any reading's log.
//
// Two halves, and the second is the one that rots: the placement rule has to
// honour the stamp, AND the emitters have to write it. A server action that
// quietly stops passing it type-checks and renders and loses the act.
{
  for (const [kind, entity] of [
    ["concept.rename", "concept"],
    ["concept.update", "concept"],
    ["concept.merge", "concept"],
    ["concept.delete", "concept"],
    ["edge.coin", "edge"],
    ["edge.update", "edge"],
    ["edge.delete", "edge"],
    ["link.coin", "link"],
    ["link.update", "link"],
  ] as const) {
    // Deliberately an id the evidence rule could never place: no passage, no
    // live row. The stamp has to be doing all the work.
    const e = ev(kind, entity, "unevidenced", { sourceId: HERE })
    const elsewhere = ev(kind, entity, "unevidenced", { sourceId: THERE })
    assert(
      here(e) && !here(elsewhere),
      `${kind} places where the student did it, with no evidence to lean on`,
      `${kind}: here=${here(e)} elsewhere=${here(elsewhere)}`
    )
  }
}

{
  const loom = readFileSync("src/actions/loom.ts", "utf8")
  // Each emitter must carry a sourceId into its payload. The payload is read
  // from the kind literal up to whatever comes first — the next recordEvent
  // call or 400 characters — so a one-line call and a wrapped one both work,
  // and a sourceId belonging to the NEXT emitter cannot be mistaken for this
  // one's.
  // EVERY recordEvent call naming the kind, not just the first — `edge.coin`
  // has two emitters (typing a label, and tapping one you already own) and a
  // stamp on one of them is not a stamp on the act.
  const emittersOf = (kind: string) =>
    [...loom.matchAll(new RegExp(`recordEvent\\([^)]{0,80}?"${kind.replace(/\./g, "\\.")}"`, "g"))]
      .map((m) => loom.slice(m.index!, m.index! + 400))

  for (const kind of [
    "concept.delete", "concept.merge", "edge.coin", "edge.delete", "link.coin", "link.update",
  ]) {
    const calls = emittersOf(kind)
    assert(
      calls.length > 0 && calls.every((c) => c.includes("sourceId")),
      `every ${kind} emitter stamps the reading (${calls.length} found)`,
      calls.length === 0
        ? `no recordEvent call for ${kind} — this guard has gone blind`
        : `${calls.filter((c) => !c.includes("sourceId")).length} of ${calls.length} calls for ${kind} carry no sourceId — the act would place only by evidence, or not at all`
    )
  }
  // The two kinds whose payload is built from a variable `kind` need their
  // own look: concept.rename/update share one call, edge.update shares with
  // edge.coin.
  assert(
    /const kind = data\.label !== undefined \? "concept\.rename"[\s\S]{0,200}?sourceId/.test(loom),
    "concept.rename and concept.update stamp the reading",
    "the shared concept edit emitter dropped its sourceId"
  )
  assert(
    /const kind = data\.handle !== undefined \? "edge\.coin"[\s\S]{0,260}?sourceId/.test(loom),
    "edge.coin and edge.update stamp the reading",
    "the shared thread edit emitter dropped its sourceId"
  )
  // Coining by TYPING a label on a thread mints the Link inside resolveLink.
  // That path recorded nothing at all until 2026-08-11 — the commonest way a
  // vocabulary grows, invisible in the record of growing it.
  assert(
    /async function resolveLink[\s\S]{0,1200}?recordEvent\([^)]*"link\.coin"/.test(loom),
    "minting a Link by typing a label records the coining",
    "resolveLink inserts a link with no event — the word appears in the vocabulary with nothing in the log saying it was coined"
  )
}

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
