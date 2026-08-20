/**
 * Assertions for src/lib/overlay.ts — the arithmetic under the student
 * Overlays (refactor spec P3.14, ruling 28).
 *
 * A plain script rather than a suite, following the `scripts/check-*` idiom
 * already here: run it, read the output, non-zero exit on failure.
 *
 *   npx tsx scripts/check-overlay.ts
 *
 * What is worth asserting is the sweep line and the counting unit. The sweep
 * line is easy to write in a way that looks right and double-counts a shared
 * boundary; and the unit of an overlay count is PEOPLE, not rows — a student
 * who files the same label under four passages must not read as four people
 * agreeing with themselves.
 */
import { groupTerms, heatSpans, overlayKey } from "../src/lib/overlay"

let failures = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${name}` +
      (ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`)
  )
}

console.log("\nheatSpans — overlapping captures into disjoint runs with depth")
check("nothing marked is no heat", heatSpans([]), [])
check("one capture is one run at depth 1", heatSpans([{ start: 10, end: 20 }]), [
  { start: 10, end: 20, count: 1 },
])
check(
  "two people on exactly the same span read as one run at depth 2 — not two runs",
  heatSpans([
    { start: 10, end: 20 },
    { start: 10, end: 20 },
  ]),
  [{ start: 10, end: 20, count: 2 }]
)
check(
  "a partial overlap splits into three runs",
  heatSpans([
    { start: 0, end: 10 },
    { start: 5, end: 15 },
  ]),
  [
    { start: 0, end: 5, count: 1 },
    { start: 5, end: 10, count: 2 },
    { start: 10, end: 15, count: 1 },
  ]
)
check(
  "abutting captures stay separate runs at depth 1, coalesced into one",
  heatSpans([
    { start: 0, end: 10 },
    { start: 10, end: 20 },
  ]),
  [{ start: 0, end: 20, count: 1 }]
)
check(
  "a gap between captures is not shaded",
  heatSpans([
    { start: 0, end: 5 },
    { start: 12, end: 15 },
  ]),
  [
    { start: 0, end: 5, count: 1 },
    { start: 12, end: 15, count: 1 },
  ]
)
check(
  "a capture wholly inside another nests to depth 2 in the middle",
  heatSpans([
    { start: 0, end: 30 },
    { start: 10, end: 20 },
  ]),
  [
    { start: 0, end: 10, count: 1 },
    { start: 10, end: 20, count: 2 },
    { start: 20, end: 30, count: 1 },
  ]
)
check("an empty span contributes nothing", heatSpans([{ start: 7, end: 7 }]), [])
check(
  "a reversed pair is read as the run it spans, not dropped",
  heatSpans([{ start: 20, end: 10 }]),
  [{ start: 10, end: 20, count: 1 }]
)
check(
  "a fractional pair widens to whole characters",
  heatSpans([{ start: 10.4, end: 19.2 }]),
  [{ start: 10, end: 20, count: 1 }]
)
check("a non-finite offset is ignored", heatSpans([{ start: NaN, end: 10 }]), [])
check(
  "a negative offset floors at the start of the page",
  heatSpans([{ start: -5, end: 4 }]),
  [{ start: 0, end: 4, count: 1 }]
)
check(
  "three captures sharing a start step down as each ends",
  heatSpans([
    { start: 0, end: 30 },
    { start: 0, end: 20 },
    { start: 0, end: 10 },
  ]),
  [
    { start: 0, end: 10, count: 3 },
    { start: 10, end: 20, count: 2 },
    { start: 20, end: 30, count: 1 },
  ]
)

console.log("\noverlayKey — the same words, however they were typed")
check("case does not separate", overlayKey("Boundary Objects"), "boundary objects")
check("surrounding space does not separate", overlayKey("  boundary objects "), "boundary objects")
check("run-together spacing does not separate", overlayKey("boundary   objects"), "boundary objects")
check("different words do separate", overlayKey("boundary object"), "boundary object")

console.log("\ngroupTerms — counted by person, never by row")
const fourPassagesOneStudent = groupTerms([
  { userId: "u1", label: "boundary objects" },
  { userId: "u1", label: "boundary objects" },
  { userId: "u1", label: "boundary objects" },
  { userId: "u1", label: "boundary objects" },
])
check("one student filing four times counts as one person", fourPassagesOneStudent.terms, [
  { label: "boundary objects", count: 1, descriptions: [], moreDescriptions: 0 },
])

const threeStudents = groupTerms([
  { userId: "u1", label: "Boundary Objects" },
  { userId: "u2", label: "boundary objects" },
  { userId: "u3", label: "boundary  objects" },
])
check("the same words typed three ways count as three people", threeStudents.terms[0].count, 3)
check(
  "the surface form shown is the most common one",
  groupTerms([
    { userId: "u1", label: "boundary objects" },
    { userId: "u2", label: "boundary objects" },
    { userId: "u3", label: "Boundary Objects" },
  ]).terms[0].label,
  "boundary objects"
)
check(
  "a tie on surface form breaks by code point, so the row does not move with the server's collation",
  groupTerms([
    { userId: "u1", label: "Boundary Objects" },
    { userId: "u2", label: "boundary objects" },
  ]).terms[0].label,
  "Boundary Objects"
)

check(
  "an empty label is not a term",
  groupTerms([{ userId: "u1", label: "   " }, { userId: "u2", label: "articulation work" }]).terms
    .length,
  1
)

const ordered = groupTerms([
  { userId: "u1", label: "infrastructure" },
  { userId: "u2", label: "articulation work" },
  { userId: "u3", label: "articulation work" },
])
check(
  "terms sort by how many people used them, then by label",
  ordered.terms.map((term) => `${term.label}:${term.count}`),
  ["articulation work:2", "infrastructure:1"]
)

const described = groupTerms([
  { userId: "u1", label: "boundary objects", description: "holds two groups together" },
  { userId: "u2", label: "boundary objects", description: "Holds two groups together" },
  { userId: "u3", label: "boundary objects", description: "plastic enough to travel" },
])
check(
  "descriptions de-duplicate on the same words and keep capture order",
  described.terms[0].descriptions,
  ["holds two groups together", "plastic enough to travel"]
)
check("a blank description is not one", groupTerms([
  { userId: "u1", label: "x", description: "  " },
]).terms[0].descriptions, [])

const capped = groupTerms(
  [1, 2, 3, 4, 5].map((n) => ({ userId: `u${n}`, label: "x", description: `gloss ${n}` })),
  { maxDescriptions: 2 }
)
check("descriptions past the cap are reported, not dropped in silence", capped.terms[0], {
  label: "x",
  count: 5,
  descriptions: ["gloss 1", "gloss 2"],
  moreDescriptions: 3,
})

const manyTerms = groupTerms(
  [1, 2, 3, 4, 5].map((n) => ({ userId: `u${n}`, label: `concept ${n}` })),
  { maxTerms: 2 }
)
check("terms past the cap are reported too", manyTerms.moreTerms, 3)

check(
  "a long description is elided rather than truncated silently",
  groupTerms([{ userId: "u1", label: "x", description: "a".repeat(50) }], {
    maxDescriptionChars: 10,
  }).terms[0].descriptions,
  ["aaaaaaaaa…"]
)

console.log(
  failures === 0
    ? "\n[check-overlay] all assertions passed\n"
    : `\n[check-overlay] ${failures} FAILED\n`
)
process.exit(failures === 0 ? 0 : 1)
