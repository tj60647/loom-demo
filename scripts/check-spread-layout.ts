/**
 * The spread-canvas geometry, asserted without a browser.
 *
 * `spreadLayout` places every page of a reading on the matrix canvas; a wrong
 * coordinate here renders as pages painted over each other or a canvas whose
 * fit math scrolls to nothing — both of which look like "the matrix is
 * broken" with no error anywhere.
 *
 * Run: npx tsx scripts/check-spread-layout.ts   (part of `npm run check`)
 */
import { spreadLayout, pageX } from "../src/lib/spreadLayout"

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

console.log("\nspread layout — a near-square grid of spreads that never overlaps")

const W = 400
const H = 520

// A 40-page document is 20 spreads in a 5x4 grid — the near-square rule.
{
  const l = spreadLayout(40, W, H)
  assert(l.spreads.length === 20, "40 pages make 20 spreads", `got ${l.spreads.length}`)
  assert(l.cols === 5, "20 spreads sit 5 across", `got ${l.cols}`)
  assert(l.canvasW === 5 * l.unitW + 4 * l.spreadGap, "canvas width is cols units plus gaps", `got ${l.canvasW}`)
}

// An odd page count leaves the last spread's right page empty, never page 0.
{
  const l = spreadLayout(9, W, H)
  assert(l.spreads.length === 5, "9 pages make 5 spreads", `got ${l.spreads.length}`)
  const last = l.spreads[l.spreads.length - 1]
  assert(last.leftPage === 9 && last.rightPage === null, "the odd last page sits alone on the left", `got ${last.leftPage}/${last.rightPage}`)
}

// Rails exist only when asked for — a rail-less matrix wastes no width.
{
  const withR = spreadLayout(10, W, H, true)
  const noR = spreadLayout(10, W, H, false)
  assert(withR.railW === W * 0.33, "rails reserve a third of a page each", `got ${withR.railW}`)
  assert(noR.railW === 0, "no rails when the cards are off", `got ${noR.railW}`)
  assert(noR.unitW < withR.unitW, "a rail-less spread is narrower", `${noR.unitW} vs ${withR.unitW}`)
}

// No two spreads overlap and everything sits inside the canvas.
{
  const l = spreadLayout(23, W, H)
  const boxes = l.spreads.map((s) => ({ x: s.x, y: s.y, r: s.x + l.unitW, b: s.y + l.unitH }))
  let overlap = false
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      if (a.x < b.r && a.r > b.x && a.y < b.b && a.b > b.y) overlap = true
    }
  }
  assert(!overlap, "no spread paints over another", "two spreads share pixels")
  assert(
    boxes.every((b) => b.x >= 0 && b.y >= 0 && b.r <= l.canvasW && b.b <= l.canvasH),
    "every spread sits inside the canvas",
    "a spread hangs off the canvas edge"
  )
}

// Page x-coordinates: left page after the left rail, right page one page and
// a gap further — and both inside their spread.
{
  const l = spreadLayout(4, W, H)
  const s = l.spreads[1]
  const lx = pageX(l, s, 3, W)
  const rx = pageX(l, s, 4, W)
  assert(lx === s.x + l.railW + l.gap, "left page sits after the left rail", `got ${lx}`)
  assert(rx === lx + W + l.gap, "right page sits one page and a gap further", `got ${rx}`)
  assert(rx + W + l.gap + l.railW === s.x + l.unitW, "the right rail closes the unit exactly", `unit ends at ${s.x + l.unitW}`)
}

// Deterministic: the layout runs on every render.
{
  const one = JSON.stringify(spreadLayout(17, W, H))
  const two = JSON.stringify(spreadLayout(17, W, H))
  assert(one === two, "the layout is deterministic", "two runs disagreed")
}

// Degenerate sizes still produce finite geometry.
{
  const l = spreadLayout(1, W, H)
  assert(l.spreads.length === 1 && l.spreads[0].rightPage === null, "a one-page document is one half-spread", JSON.stringify(l.spreads))
  assert(Number.isFinite(l.canvasW) && Number.isFinite(l.canvasH), "canvas dimensions are finite", `${l.canvasW}x${l.canvasH}`)
}

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
