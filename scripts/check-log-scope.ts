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
    { id: "e-here", courseId: null, userId: "u", fromId: "c-here", toId: "c-both", handle: "", sentence: "", createdAt: at },
    { id: "e-cross", courseId: null, userId: "u", fromId: "c-here", toId: "c-there", handle: "", sentence: "", createdAt: at },
  ],
  maps: [], cloths: [], views: { cardTable: { positions: {}, bends: {} } },
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

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
