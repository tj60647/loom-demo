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
import { groupTerms, heatSpans, mergeIntervals, overlayKey } from "../src/lib/overlay"
import { heatBand, placeItems, projectHeatSpans, textLayerString } from "../src/lib/heatRects"

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
/**
 * THE COUNTING UNIT, on the passages side.
 *
 * The header above says the unit of an overlay count is PEOPLE, not rows, and
 * the vocabulary overlay has always honoured it — `groupTerms` counts distinct
 * people. The passages overlay did not: it dropped the userId before the sweep
 * and drew the number of overlapping CAPTURES. Measured on the dev database
 * 2026-08-23, 11 runs drew more than the number of people who marked them, the
 * worst drawing 5 for 3 students.
 *
 * These assert the fix at the level it was made: one student's own captures
 * are unioned before the sweep sees them, so depth is people.
 */
console.log("\nmergeIntervals — one student's own captures, unioned")
check("nothing is nothing", mergeIntervals([]), [])
check(
  "two overlapping captures by one student are one run",
  mergeIntervals([
    { start: 10, end: 30 },
    { start: 20, end: 40 },
  ]),
  [{ start: 10, end: 40 }]
)
check(
  "captures that merely touch are one run",
  mergeIntervals([
    { start: 10, end: 20 },
    { start: 20, end: 30 },
  ]),
  [{ start: 10, end: 30 }]
)
check(
  "a capture wholly inside another disappears into it",
  mergeIntervals([
    { start: 10, end: 40 },
    { start: 15, end: 20 },
  ]),
  [{ start: 10, end: 40 }]
)
check(
  "captures with a gap between them stay two runs",
  mergeIntervals([
    { start: 10, end: 20 },
    { start: 25, end: 30 },
  ]),
  [
    { start: 10, end: 20 },
    { start: 25, end: 30 },
  ]
)
check("it is order-independent", mergeIntervals([
  { start: 25, end: 30 },
  { start: 10, end: 20 },
  { start: 15, end: 26 },
]), [{ start: 10, end: 30 }])
check("the same repairs heatSpans makes", mergeIntervals([{ start: 20.6, end: 10.2 }]), [
  { start: 10, end: 21 },
])
check("an empty capture contributes nothing", mergeIntervals([{ start: 7, end: 7 }]), [])

/**
 * AND THE TWO TOGETHER, which is the claim the page actually makes. Three
 * students on one sentence, one of whom marked it twice: the run is three
 * deep, not four.
 */
const twiceMarked = [
  [{ start: 10, end: 40 }, { start: 20, end: 50 }], // one student, two captures
  [{ start: 15, end: 45 }],
  [{ start: 15, end: 45 }],
]
check(
  "a student who marked the same words twice counts once",
  heatSpans(twiceMarked.flatMap((runs) => mergeIntervals(runs))).reduce(
    (top, span) => Math.max(top, span.count),
    0
  ),
  3
)
check(
  "and without the union it was four — the bug, kept as a witness",
  heatSpans(twiceMarked.flat()).reduce((top, span) => Math.max(top, span.count), 0),
  4
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

console.log("\nheatRects — offsets into geometry, without rendering the page")

/**
 * Two lines of two items each, at a page height of 100. The offsets a capture
 * carries index the concatenation of these strings and nothing else, which is
 * the whole premise of the projection.
 */
const items = [
  { str: "Hello ", transform: [1, 0, 0, 10, 10, 80], width: 30, height: 10 },
  { str: "world", transform: [1, 0, 0, 10, 40, 80], width: 25, height: 10 },
  { str: "again", transform: [1, 0, 0, 10, 10, 60], width: 25, height: 10 },
]

check("the text layer string is the item strings, joined by nothing", textLayerString(items), "Hello worldagain")

/** An unrotated page anchored at the origin: what the naive formula assumed. */
const PLAIN = { width: 100, height: 100 }

check("an item knows its own offsets", placeItems(items, PLAIN).map((i) => [i.start, i.end]), [
  [0, 6],
  [6, 11],
  [11, 16],
])

check(
  "the box is measured DOWN from the top, not up from the baseline",
  placeItems(items, PLAIN)[0].top,
  100 - 80 - 10
)

/**
 * THE CROPBOX OFFSET, which is the bug this file did not catch the first time.
 *
 * A page whose box does not start at the origin carries the shift in its
 * viewport transform, and pdf.js's own text layer goes through that transform.
 * The first version of placeItems read the text matrix as page coordinates
 * directly, so on this library's scans every rect sat 2.4% of the page width
 * right of its words — measured against mark.js on the live text layer, and
 * invisible to a test that only ever passed an origin-anchored page.
 *
 * Here the box starts 14.7pt in, exactly what the flip's translation carries.
 */
const CROPPED = { width: 100, height: 100, transform: [1, 0, 0, -1, -14.7, 100] }
check(
  "a page box that does not start at the origin shifts the boxes with it",
  +placeItems(items, CROPPED)[0].left.toFixed(4),
  +(10 - 14.7).toFixed(4)
)
check(
  "and does not disturb the vertical, which the flip already carried",
  placeItems(items, CROPPED)[0].top,
  placeItems(items, PLAIN)[0].top
)

/** A page rotated 90 degrees: width and height swap, and x/y trade places. */
check(
  "a rotated page is not read as an upright one",
  placeItems(items, { width: 100, height: 100, transform: [0, 1, 1, 0, 0, 0] })[0],
  { start: 0, end: 6, left: 80, top: 0, width: 30, height: 10 }
)

/** An empty item still advances nothing, and must not shift what follows. */
check(
  "a zero-length item does not move the offsets after it",
  placeItems([{ str: "ab", transform: [1, 0, 0, 1, 0, 1], width: 2, height: 1 }, { str: "" }, { str: "cd", transform: [1, 0, 0, 1, 2, 1], width: 2, height: 1 }], { width: 10, height: 10 })
    .map((i) => [i.start, i.end]),
  [[0, 2], [2, 4]]
)

check("nothing marked projects to nothing", projectHeatSpans(items, PLAIN, []), [])

check(
  "a run across two items on one line comes back as ONE rect",
  projectHeatSpans(items, PLAIN, [{ start: 0, end: 11, count: 1 }]),
  [{ x: 0.1, y: 0.1, w: 0.55, h: 0.1, count: 1 }]
)

check(
  "a run across a line break does not — two lines are two rects",
  projectHeatSpans(items, PLAIN, [{ start: 0, end: 16, count: 1 }]).length,
  2
)

check(
  "runs of DIFFERENT depth stay apart even when they touch",
  projectHeatSpans(items, PLAIN, [
    { start: 0, end: 6, count: 1 },
    { start: 6, end: 11, count: 3 },
  ]).map((r) => r.count),
  [1, 3]
)

/**
 * NOTHING LEAVES THE PAGE. On the canvas a rect that runs past its page runs
 * across the gutter and over its neighbours — TJ, 2026-08-23, of a hairline
 * crossing three pages: "it should not bridge pages, correct?"
 *
 * The projection can produce one honestly: `item.width` is whatever the PDF's
 * text layer claims, and on a scan it is sometimes an advance that overruns
 * the page box. Here the item claims to be twice the page wide.
 */
const OVERRUN = [{ str: "wide", transform: [1, 0, 0, 10, 10, 80], width: 200, height: 10 }]
const bled = projectHeatSpans(OVERRUN, PLAIN, [{ start: 0, end: 4, count: 1 }])[0]
check("a rect never starts past the page", bled.x >= 0 && bled.x <= 1, true)
check("a rect never ends past the page", +(bled.x + bled.w).toFixed(4) <= 1, true)

/** …and merging must not put back the overrun the clamp just took out. */
const MERGED = [
  { str: "ab", transform: [1, 0, 0, 10, 10, 80], width: 20, height: 10 },
  { str: "cd", transform: [1, 0, 0, 10, 30, 80], width: 400, height: 10 },
]
const joined = projectHeatSpans(MERGED, PLAIN, [{ start: 0, end: 4, count: 1 }])
check(
  "merging stops at the page edge too",
  joined.every((r) => +(r.x + r.w).toFixed(4) <= 1),
  true
)

check(
  "a partial item is sliced by character, not taken whole",
  projectHeatSpans(items, PLAIN, [{ start: 0, end: 3, count: 1 }]),
  [{ x: 0.1, y: 0.1, w: 0.15, h: 0.1, count: 1 }]
)

console.log("\nheatBand — five steps over THIS reading's range")
check("nobody is no step", heatBand(0, 10), 0)
/**
 * FULLY RELATIVE (TJ, 2026-08-22): the densest run in a reading is the darkest
 * step, whatever number it happens to be. These are the lines that changed
 * when the hybrid went — under it, two-of-two painted step 2, so a quiet
 * reading could never reach the top of its own scale and two readings could be
 * compared by colour at small counts but not at large ones.
 */
check("two of two is the top step, not step 2", heatBand(2, 2), 5)
check("three of three is the top step too", heatBand(3, 3), 5)
check("five of five is the top step", heatBand(5, 5), 5)
check("one against a peak of three is still the faintest", heatBand(1, 3), 1)

/**
 * NO RANGE TO GRADE is the one case the rule cannot be followed literally.
 * Everyone marked alone, so every run is simultaneously the densest — and
 * painting a whole reading at the top step would say they converged
 * everywhere, when what happened is the opposite.
 */
check("nobody agreeing with anybody is the faintest, not the darkest", heatBand(1, 1), 1)
/**
 * The case this is built for: ~60 looms on one reading (TJ, 2026-08-22). The
 * ramp must not saturate — the old absolute min(count, 5) painted 5 people and
 * 60 identically — and it must not spend four fifths of the scale on the tail.
 */
check("the densest run in the reading is always the top step", heatBand(37, 37), 5)
check("a single marker is always the faintest", heatBand(1, 37), 1)
/**
 * The step boundaries against a 37-person densest run, computed rather than
 * guessed (an earlier version of these two lines asserted 2 and 4 and was
 * wrong): steps change at counts 3, 6, 11 and 18, so the middle of the ramp
 * lands on the counts a real cohort actually produces, and only genuine
 * convergence — half the people who marked the reading at all — reaches the
 * darkest step.
 */
check("two people is still the faintest step", heatBand(2, 37), 1)
check("the middle of the distribution reaches the middle of the scale", heatBand(6, 37), 3)
check("agreement by a third of a large cohort is near the top", heatBand(12, 37), 4)
check("the top step is earned around half the densest run", heatBand(18, 37), 5)
check("a count past the top is clamped, never a sixth step", heatBand(99, 37), 5)

console.log(
  failures === 0
    ? "\n[check-overlay] all assertions passed\n"
    : `\n[check-overlay] ${failures} FAILED\n`
)
process.exit(failures === 0 ? 0 : 1)
