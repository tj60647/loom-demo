/**
 * Old exports still import.
 *
 * On 2026-08-09 `bytes` was renamed to `passages` throughout, including the
 * export contract's JSON key. Every .json a student had already downloaded says
 * `bytes` — and red line 5 is "the student's work is never inaccessible or
 * partial: whole-artifact export always available; nothing lost on refresh."
 * An import that silently returned zero passages from a file full of them would
 * break that promise in the worst way: quietly, and only for people who had
 * been using Loom the longest.
 *
 * No test would have caught it, because no test imports an OLD file — the suite
 * round-trips what the current code emits, which is exactly the shape that
 * cannot detect a key rename. Hence this.
 *
 * `parseImport` is pure (text in, shape out), so this needs no database and no
 * browser.
 *
 * Run: npx tsx scripts/check-import-compat.ts   (part of `npm run check`)
 */
import { parseImport } from "../src/lib/graphExport"

let failures = 0
let checks = 0

function assert(condition: boolean, label: string, detail: string) {
  checks++
  if (condition) {
    console.log(`  ok    ${label}`)
  } else {
    failures++
    console.log(`  FAIL  ${label}\n        ${detail}`)
  }
}

/** One concept, one passage under it, in whichever key the era used. */
const file = (key: "bytes" | "passages") =>
  JSON.stringify({
    student: "Test User A",
    concepts: [{ id: "c1", label: "boundary objects", def: "a gloss" }],
    [key]: [
      {
        id: "b1",
        conceptIds: ["c1"],
        source: "Star & Griesemer",
        location: "p. 393",
        content: "…plastic enough to adapt to local needs…",
      },
    ],
    edges: [],
  })

console.log("\nimport compatibility — a file exported before the rename still opens")

const old = parseImport(file("bytes"))
const now = parseImport(file("passages"))

assert(
  old.passages.length === 1,
  "a pre-rename file's passages survive the import",
  `got ${old.passages.length}; the "bytes" key is being dropped, so every export taken before 2026-08-09 would import as an empty cloth`
)
assert(
  now.passages.length === 1,
  "a post-rename file's passages survive the import",
  `got ${now.passages.length}`
)
assert(
  JSON.stringify(old.passages) === JSON.stringify(now.passages),
  "both eras parse to exactly the same passages",
  "the two keys are taking different paths, so one of them is losing a field"
)
assert(
  old.passages[0]?.conceptKeys.length === 1,
  "the passage keeps its concept pointer across the old key",
  "a passage that imports without its concept becomes an Unlabeled Passage — legal, and wrong"
)
assert(
  old.concepts.length === 1 && old.concepts[0].label === "boundary objects",
  "concepts are unaffected by the passage key",
  "the concept list changed, which means the sniff is reading the wrong branch"
)

/**
 * The import confirm must not describe a file by what survived reading it.
 *
 * `parseImport` drops a concept with a blank label, and then drops any link
 * left dangling by that drop. Both arrays it returns are therefore counts of
 * what LANDS — and Keep's confirm quoted them as "It holds N concepts …", on
 * the branch that replaces the student's cloth outright. `dropped` is what
 * lets the dialog say the other number, so it is asserted here rather than
 * trusted: the losses are invisible by construction, and a round-trip test
 * cannot see them because the current code never EMITS a blank-label concept.
 */
console.log("\nimport losses — the file's contents and what arrives are different numbers")

const lossy = parseImport(
  JSON.stringify({
    student: "Test User A",
    concepts: [
      { id: "c1", label: "boundary objects" },
      { id: "c2", label: "   " }, // blank after trim — dropped
      { id: "c3", label: "" }, // blank — dropped
    ],
    passages: [
      { id: "b1", conceptIds: ["c1"], content: "kept" },
      { id: "b2", conceptIds: ["c1"], content: "" }, // no text — dropped
    ],
    edges: [
      { id: "e1", fromId: "c1", toId: "c1", sentence: "kept" },
      { id: "e2", fromId: "c1", toId: "c2", sentence: "dangles onto a dropped concept" },
      { id: "e3", fromId: "c3", toId: "c1", sentence: "dangles the other way" },
    ],
  })
)

assert(
  lossy.concepts.length === 1 && lossy.dropped.concepts === 2,
  "a blank-label concept is dropped, and the drop is counted",
  `arrived ${lossy.concepts.length}, reported dropped ${lossy.dropped.concepts}; expected 1 and 2`
)
assert(
  lossy.edges.length === 1 && lossy.dropped.edges === 2,
  "a link left dangling by that drop goes too, and is counted",
  `arrived ${lossy.edges.length}, reported dropped ${lossy.dropped.edges}; expected 1 and 2`
)
assert(
  lossy.passages.length === 1 && lossy.dropped.passages === 1,
  "a text-less passage is dropped, and is counted",
  `arrived ${lossy.passages.length}, reported dropped ${lossy.dropped.passages}; expected 1 and 1`
)
assert(
  now.dropped.concepts === 0 && now.dropped.edges === 0 && now.dropped.passages === 0,
  "a clean file reports no losses, so the dialog stays quiet",
  `got ${JSON.stringify(now.dropped)}; a false loss would warn on every ordinary import`
)

console.log(
  failures === 0
    ? `\n[check-import-compat] all ${checks} assertions passed`
    : `\n[check-import-compat] ${failures} of ${checks} FAILED`
)
process.exit(failures === 0 ? 0 : 1)
