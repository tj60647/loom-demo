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

console.log(
  failures === 0
    ? `\n[check-import-compat] all ${checks} assertions passed`
    : `\n[check-import-compat] ${failures} of ${checks} FAILED`
)
process.exit(failures === 0 ? 0 : 1)
