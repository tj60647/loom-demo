/**
 * The rail layout, asserted without a browser.
 *
 * `layoutRail` decides where the margin concept cards sit beside a page
 * (01 · Reading, page mode). The failure this guards against: a card drifting
 * off the page, two cards painting over each other, or the layout answering
 * differently for the same input — each of which renders fine and reads as
 * "the rail is broken" only to the person whose captures it hides.
 *
 * Run: npx tsx scripts/check-rail-layout.ts   (part of `npm run check`)
 */
import { layoutRail, railScale } from "../src/lib/railLayout"

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

console.log("\nrail layout — cards sit beside their highlights and never collide")

const MAX_H = 800
const GAP = 12

// A lone card centers on its highlight: desired IS the top handed in.
{
  const placed = layoutRail([{ id: "a", desired: 300, h: 100 }], MAX_H, GAP)
  assert(placed.a === 300, "a singleton sits at its desired top", `got ${placed.a}`)
}

// Two overlapping cards merge into a cluster spread around the mean of their
// ideal tops — neither one simply wins.
{
  const placed = layoutRail(
    [
      { id: "a", desired: 300, h: 100 },
      { id: "b", desired: 320, h: 100 },
    ],
    MAX_H,
    GAP
  )
  const mean = (300 + (320 - (100 + GAP))) / 2
  assert(placed.a === mean, "an overlapping pair centers on the mean of ideals", `a at ${placed.a}, expected ${mean}`)
  assert(placed.b === placed.a + 100 + GAP, "the second card stacks below the first with the gap", `b at ${placed.b}`)
}

// No pair of placed cards overlaps, whatever the crowding.
{
  const items = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, desired: 380 + i * 4, h: 60 }))
  const placed = layoutRail(items, MAX_H, GAP)
  const rows = items
    .map((it) => ({ top: placed[it.id], bottom: placed[it.id] + it.h }))
    .sort((a, b) => a.top - b.top)
  const collision = rows.some((r, i) => i > 0 && r.top < rows[i - 1].bottom + GAP - 1e-9)
  assert(!collision, "a crowded cluster never overlaps a card onto another", "two cards share pixels")
  const inside = rows.every((r) => r.top >= 0 && r.bottom <= MAX_H)
  assert(inside, "a crowded cluster stays inside the page", "a card was clamped out of bounds")
}

// A cluster taller than the page pins to the top and grows downward — the
// top of the stack is always reachable.
{
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, desired: 400, h: 90 }))
  const placed = layoutRail(items, MAX_H, GAP)
  const minTop = Math.min(...items.map((it) => placed[it.id]))
  assert(minTop === 0, "an over-tall cluster pins to the top", `first card at ${minTop}`)
}

// Same input, same answer — the layout runs on every render and a wobble
// would read as cards trembling.
{
  const items = [
    { id: "a", desired: 120, h: 80 },
    { id: "b", desired: 130, h: 140 },
    { id: "c", desired: 700, h: 60 },
    { id: "d", desired: 705, h: 60 },
  ]
  const one = JSON.stringify(layoutRail(items, MAX_H, GAP))
  const two = JSON.stringify(layoutRail(items, MAX_H, GAP))
  assert(one === two, "the layout is deterministic", "two runs disagreed")
}

// Input order does not matter — items arrive in passage order but place by
// position.
{
  const items = [
    { id: "a", desired: 500, h: 80 },
    { id: "b", desired: 100, h: 80 },
  ]
  const fwd = layoutRail(items, MAX_H, GAP)
  const rev = layoutRail([...items].reverse(), MAX_H, GAP)
  assert(
    fwd.a === rev.a && fwd.b === rev.b,
    "placement ignores input order",
    `forward ${JSON.stringify(fwd)}, reversed ${JSON.stringify(rev)}`
  )
}

// Every placement is a finite number — NaN here becomes an invisible card.
{
  const placed = layoutRail(
    [
      { id: "a", desired: -50, h: 40 },
      { id: "b", desired: 900, h: 40 },
    ],
    MAX_H,
    GAP
  )
  assert(
    Object.values(placed).every((v) => Number.isFinite(v)),
    "edge-of-page desires still place finitely",
    JSON.stringify(placed)
  )
  assert(placed.a >= 0, "a desire above the page clamps to the top", `got ${placed.a}`)
  assert(placed.b <= MAX_H - 40, "a desire below the page clamps to the bottom", `got ${placed.b}`)
}

console.log("\nrail scale — a full rail shrinks its cards, never drops one")

assert(railScale([], GAP, MAX_H) === 1, "an empty rail does not scale", "")
assert(railScale([100, 100], GAP, MAX_H) === 1, "a rail with room does not scale", "")
{
  const heights = [300, 300, 300]
  const required = 900 + GAP * 2
  const s = railScale(heights, GAP, MAX_H)
  assert(s === MAX_H / required, "an overfull rail scales to exactly fit", `got ${s}`)
  assert(s > 0 && s < 1, "the scale is a real shrink factor", `got ${s}`)
}

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
