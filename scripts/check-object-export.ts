/**
 * Download at the object, asserted without a browser.
 *
 * These files are the student's artifact once Keep is gone — the only way
 * their work leaves Loom (red line 5, read per object: each one exports
 * WHOLE). The failure that matters is silent: a builder that quietly drops
 * unlabeled passages, or names a thread's ends as ids, still produces a file
 * that downloads and opens. Nobody notices until someone needs the work back.
 *
 * Run: npx tsx scripts/check-object-export.ts   (part of `npm run check`)
 */
import {
  buildClothExport,
  buildClothMarkdown,
  buildThreadsExport,
  buildThreadsMarkdown,
  buildVocabularyExport,
  buildVocabularyMarkdown,
  objectExportFilename,
  fileStamp,
  provenanceOf,
} from "../src/lib/objectExport"
import { scopeOf } from "../src/lib/scope"
import type { Cloth, Concept, Edge, LoomMap, LoomState, Passage } from "../src/lib/types"

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
const READING = "src-1"
const OTHER = "src-2"
const scopeKey = scopeOf([READING]).key

const concept = (id: string, label: string): Concept => ({
  id, courseId: null, userId: "u", label, def: `${label} in my words`, note: "", createdAt: at,
})
const passage = (id: string, conceptIds: string[], sourceId: string | null, content: string): Passage => ({
  id, courseId: null, userId: "u", conceptIds, source: "Src", sourceId, location: "p. 1",
  content, pageNumber: 1, startOffset: null, endOffset: null, pageContentHash: null,
  note: "", question: "", isPullQuote: false, tier: "", createdAt: at,
})
const edge = (id: string, fromId: string, toId: string, handle: string): Edge => ({
  id, courseId: null, userId: "u", fromId, toId, handle, linkId: null, sentence: "one holds the other", createdAt: at,
})
const cloth = (key: string, title: string): Cloth => ({
  id: `cl-${key}`, courseId: null, userId: "u", scopeKey: key, title,
  description: "what I make of it", createdAt: at, updatedAt: at,
})
const map = (id: string, key: string, name: string): LoomMap => ({
  id, courseId: null, userId: "u", scopeKey: key, name, read: "the read", essence: "the one-line",
  tiers: { c1: "p" }, createdAt: at, updatedAt: at,
})

const state: LoomState = {
  concepts: [concept("c1", "boundary objects"), concept("c2", "translation"), concept("c3", "elsewhere only")],
  passages: [
    passage("p1", ["c1"], READING, "  a  quoted   line  "),
    passage("p2", [], READING, "an unlabeled capture"),
    passage("p3", ["c3"], OTHER, "from another reading"),
    passage("p4", ["c1"], OTHER, "the same concept, met again"),
  ],
  edges: [edge("e1", "c1", "c2", "constrains")],
  // A Link the student uses, and one nothing uses yet (5.1 / TJ 2026-08-10) —
  // the second is the state the object exists for, and the export must carry
  // it or the file disagrees with the list it came from.
  links: [
    { id: "lk1", courseId: null, userId: "u", label: "constrains", description: "one bounds the other", createdAt: at },
    { id: "lk2", courseId: null, userId: "u", label: "coined, unused", description: "", createdAt: at },
  ],
  maps: [map("m1", scopeKey, "Object worlds, sorted"), map("m2", "", "whole weave one")],
  cloths: [cloth(scopeKey, "My reading of it")],
  views: { cardTable: { positions: {}, bends: {} } },
}

const prov = provenanceOf("Test Student", "Design Frameworks", "Section 1")

console.log("\nobject export — each object leaves whole")

// --- the cloth ---
{
  const c = buildClothExport(state, scopeKey, prov)
  assert(c.cloth.title === "My reading of it", "the cloth carries its own title", JSON.stringify(c.cloth))
  assert(c.cloth.description !== "", "the cloth carries its description", "description lost")
  assert(c.graph.passages.length === 2, "only this reading's passages travel", `got ${c.graph.passages.length}`)
  assert(
    c.graph.passages.some((p) => p.conceptIds.length === 0),
    "an UNLABELED passage travels — it is a legal capture, not a gap",
    "the unlabeled passage was dropped"
  )
  assert(c.graph.edges.length === 1, "the threads between its concepts travel", `got ${c.graph.edges.length}`)
  assert(c.projections.length === 1 && c.projections[0].name === "Object worlds, sorted",
    "its OWN projections travel, and no other scope's", JSON.stringify(c.projections.map((p) => p.name)))
  assert(c.projections[0].read === "the read" && c.projections[0].essence === "the one-line",
    "a projection's words travel with it", "essence or read lost")
  assert(!!c.provenance.course && !!c.provenance.section && !!c.provenance.exportedAt,
    "the file says who, where and when", JSON.stringify(c.provenance))
}

// --- the cloth, readable ---
{
  const md = buildClothMarkdown(state, scopeKey, prov)
  assert(md.includes("# My reading of it"), "the outline leads with the cloth's title", md.slice(0, 60))
  assert(md.includes("boundary objects"), "concepts appear", "concept missing")
  assert(md.includes("Unlabeled passages (1)"), "unlabeled captures are named, not hidden", "no unlabeled section")
  assert(md.includes('"a quoted line"'), "quoted text is tidied, not raw", "whitespace not collapsed")
  assert(!md.includes("from another reading"), "another reading's work stays out", "leaked a foreign passage")
  assert(md.includes("Design Frameworks"), "provenance is on the page", "course missing from markdown")
}

// --- threads ---
{
  const t = buildThreadsExport(state, scopeKey, prov)
  assert(t.threads.length === 1, "the scope's threads travel", `got ${t.threads.length}`)
  assert(
    t.threads[0].from === "boundary objects" && t.threads[0].to === "translation",
    "both ends are NAMED, not id references — an id says nothing away from Loom",
    JSON.stringify(t.threads[0])
  )
  const md = buildThreadsMarkdown(state, scopeKey, prov)
  assert(md.includes("constrains"), "the label reads in the outline", md)
  const empty = buildThreadsMarkdown({ ...state, edges: [] }, scopeKey, prov)
  assert(empty.includes("No threads here yet"), "an empty file says so rather than lying blank", empty)
}

// --- vocabulary ---
{
  const v = buildVocabularyExport(state, prov)
  assert(v.concepts.length === 3, "every concept the student owns, across all readings", `got ${v.concepts.length}`)
  const c1 = v.concepts.find((c) => c.label === "boundary objects")!
  assert(c1.passages === 2, "passage count is across readings", `got ${c1.passages}`)
  assert(c1.readings === 2, "recurrence counts DISTINCT readings", `got ${c1.readings}`)
  assert(v.linkLabels.length === 2, "every Link the student owns travels", JSON.stringify(v.linkLabels))
  const used = v.linkLabels.find((l) => l.label === "constrains")!
  assert(used.uses === 1, "a Link carries its thread count", JSON.stringify(used))
  assert(used.description === "one bounds the other", "the Link's own gloss travels — it is not the thread's sentence", JSON.stringify(used))
  const unused = v.linkLabels.find((l) => l.label === "coined, unused")!
  assert(!!unused && unused.uses === 0,
    "a Link NO thread uses is in the file at zero — TJ's case survives the download",
    JSON.stringify(v.linkLabels))
  const md = buildVocabularyMarkdown(state, prov)
  assert(md.indexOf("boundary objects") < md.indexOf("elsewhere only"), "concepts read A–Z", "not alphabetical")
  assert(!/\b(should|must|try to|consider)\b/i.test(md), "no advice in the file — counted, never judged (red line 3)", md)
}

// --- degenerate ---
{
  const blank: LoomState = { concepts: [], passages: [], edges: [], links: [], maps: [], cloths: [], views: { cardTable: { positions: {}, bends: {} } } }
  const c = buildClothExport(blank, scopeKey, prov)
  assert(c.graph.concepts.length === 0 && c.projections.length === 0, "an empty cloth exports empty, not broken", JSON.stringify(c.graph))
  assert(typeof buildVocabularyMarkdown(blank, prov) === "string", "an empty vocabulary still renders", "threw")
}

// --- filenames ---
{
  // Stamped with the minute it was taken (TJ, 2026-08-12), LAST: a folder
  // sorts student → object → kind, so every take of one thing sits together
  // in the order it was taken.
  const at = new Date(2026, 7, 12, 22, 15)
  assert(
    objectExportFilename("Test Student", "cloth", "Object Worlds", "json", at) === "test_student-object_worlds.cloth.2608122215.json",
    "filename is student-slug.kind.yymmddhhmm.ext — the stamp last, so like files group",
    objectExportFilename("Test Student", "cloth", "Object Worlds", "json", at)
  )
  assert(
    /^\d{10}$/.test(fileStamp(at)) && fileStamp(at) === "2608122215",
    "the stamp is yymmddhhmm in the student's own clock",
    fileStamp(at)
  )
  // Letters stay letters — a student named Díaz gets their name spelled
  // right. What must never survive is whitespace and punctuation.
  const awkward = objectExportFilename("Ana Díaz", "threads", "Étude / notes", "md")
  assert(
    !/[^\p{L}\p{N}_.-]/u.test(awkward),
    "spaces and punctuation never reach the filesystem, accents do",
    awkward
  )
  assert(/\.threads\.\d{10}\.md$/.test(awkward), "the kind, the stamp and the extension survive an awkward name", awkward)
}

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
