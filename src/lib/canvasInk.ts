/**
 * Has anything been drawn here, or is this a white rectangle?
 *
 * Lived privately in pdfCover.ts from 2026-07-06, which is why the cover
 * renderer has always refused to store a blank and the page renderer has
 * always stored one. On 2026-09-06 that asymmetry put 19 pure-white images
 * into blob for a reading and reported them rendered — measured at
 * 1280x1657, one distinct colour, not one non-white pixel. Same code, moved
 * so both callers can reach it; the thresholds are unchanged.
 */
import type { createCanvas } from "@napi-rs/canvas"

type Context2D = ReturnType<ReturnType<typeof createCanvas>["getContext"]>

export function isCanvasVisuallyBlank(context: Context2D, width: number, height: number) {
  const { data } = context.getImageData(0, 0, width, height)
  let meaningfulPixels = 0
  const sampleStride = 16

  for (let index = 0; index < data.length; index += 4 * sampleStride) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const alpha = data[index + 3]

    if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) {
      meaningfulPixels += 1
      if (meaningfulPixels >= 24) {
        return false
      }
    }
  }

  return true
}
