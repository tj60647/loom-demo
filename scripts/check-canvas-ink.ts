/**
 * Assertions for `isCanvasVisuallyBlank` in src/lib/canvasInk.ts — the test
 * that decides whether a rendered page is a page or a white rectangle.
 *
 *   npx tsx scripts/check-canvas-ink.ts
 *
 * Pure, no fixtures and no network, so it runs inside `npm run check`. It
 * earns that place because the cover renderer has always used this test and
 * the page renderer never did: on 2026-09-06 that difference stored 19 blank
 * page images for one reading and reported them rendered.
 */
import { createCanvas } from "@napi-rs/canvas"
import { isCanvasVisuallyBlank } from "../src/lib/canvasInk"

let failures = 0

function check(name: string, got: unknown, want: unknown) {
  const ok = got === want
  if (!ok) failures += 1
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`)
  if (!ok) console.log(`          got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

type Context2D = ReturnType<ReturnType<typeof createCanvas>["getContext"]>

/** A 400x400 page filled white, as both renderers fill theirs, then drawn on. */
function canvasWith(draw: (context: Context2D) => void) {
  const canvas = createCanvas(400, 400)
  const context = canvas.getContext("2d")
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, 400, 400)
  draw(context)
  return { context, width: canvas.width, height: canvas.height }
}

console.log("\nwhat production actually stored is recognised as blank")
{
  const { context, width, height } = canvasWith(() => {})
  check("a page of nothing but white", isCanvasVisuallyBlank(context, width, height), true)
}

console.log("\na page with ink on it is not blank")
{
  const { context, width, height } = canvasWith((c) => {
    c.fillStyle = "#000000"
    c.fillRect(0, 0, 400, 40)
  })
  check("a solid black band", isCanvasVisuallyBlank(context, width, height), false)
}

console.log("\nthe threshold is visible darkness, not any pixel differing")
{
  const { context, width, height } = canvasWith((c) => {
    // 250 is lighter than the 245 bar: paper texture, not ink.
    c.fillStyle = "rgb(250,250,250)"
    c.fillRect(0, 0, 400, 400)
  })
  check("a near-white fill still reads as blank", isCanvasVisuallyBlank(context, width, height), true)
}

console.log("\na few stray dark pixels are not a page")
{
  const { context, width, height } = canvasWith((c) => {
    c.fillStyle = "#000000"
    // Well under the 24-sample bar once the 16-pixel stride is applied.
    c.fillRect(0, 0, 2, 2)
  })
  check("a 2x2 speck", isCanvasVisuallyBlank(context, width, height), true)
}

console.log(failures === 0 ? "\nall ok\n" : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
