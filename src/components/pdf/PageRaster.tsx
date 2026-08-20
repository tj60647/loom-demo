"use client"

import { type ComponentProps, memo, useEffect, useRef } from "react"
import { Document } from "react-pdf"
import { acquireRenderSlot } from "@/lib/renderQueue"

/** The pdf.js document proxy, typed off react-pdf's own callback so the two
 *  libraries can never disagree about whose proxy this is. */
export type PdfDoc = Parameters<NonNullable<ComponentProps<typeof Document>["onLoadSuccess"]>>[0]

/**
 * The most canvas pixels one page may take. pdf.js's own viewer refuses to
 * build a canvas past 2²⁵ device pixels; half that is plenty here — at a
 * 1536px stage it still allows past-native sharpness on a 300dpi scan, and it
 * turns "res 8 at a 2560px stage" from a 31MP/124MB allocation into a bounded
 * one. The render scale is reduced to fit, so the page stays sharp to the
 * cap and CSS-stretches beyond it instead of stalling the tab.
 */
const MAX_PAGE_PIXELS = 1 << 24

/**
 * One page's raster, rendered by pdf.js at `res` canvas pixels per CSS unit.
 * Re-renders happen into an offscreen canvas and land in one synchronous
 * resize-and-blit, so the previous raster stays on screen (CSS-stretched)
 * until the sharper one replaces it — no blank flash mid-render.
 *
 * Ported from the spread canvas (origin/spread-canvas-reading, reverted by
 * 41d5b50); the split it belongs to — our raster below, react-pdf's
 * never-re-rendered text layer above — is what lets the matrix zoom without
 * rebuilding forty text layers per slider step.
 *
 * Memoized: the matrix rebuilds its whole element array whenever any page's
 * res retargets, and without the bail-out every mounted raster re-rendered
 * (and re-ran its effect diffing) for one page's sharpening.
 */
export default memo(function PageRaster({ pdf, pageNumber, cssW, cssH, res, priority }: {
  pdf: PdfDoc
  pageNumber: number
  cssW: number
  cssH: number
  res: number
  /**
   * Render order among waiting pages; lower runs sooner. Sampled when a
   * render slot frees, so it should read the CURRENT view (distance from the
   * viewport centre), not a snapshot. Stable identity — it is deliberately
   * not an effect dep, so a moving view never re-renders pages over it.
   */
  priority?: (pageNumber: number) => number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const priorityRef = useRef(priority)
  priorityRef.current = priority

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    let release: (() => void) | null = null
    ;(async () => {
      // Wait for a slot BEFORE touching pdf.js: getPage + render both queue
      // work on the one shared worker, and the gate is what keeps a hundred
      // offscreen thumbnails from starving the spread the reader is on.
      release = await acquireRenderSlot(() => priorityRef.current?.(pageNumber) ?? 0)
      if (cancelled) return
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      let scale = (cssW / base.width) * res
      const raw = page.getViewport({ scale })
      if (raw.width * raw.height > MAX_PAGE_PIXELS) {
        scale *= Math.sqrt(MAX_PAGE_PIXELS / (raw.width * raw.height))
      }
      const viewport = page.getViewport({ scale })
      const off = document.createElement("canvas")
      off.width = Math.round(viewport.width)
      off.height = Math.round(viewport.height)
      const renderTask = page.render({ canvas: off, viewport })
      task = renderTask
      await renderTask.promise
      if (cancelled) return
      const c = canvasRef.current
      if (!c) return
      c.width = off.width
      c.height = off.height
      c.getContext("2d")!.drawImage(off, 0, 0)
    })()
      .catch(() => { /* cancelled render tasks reject; nothing to do */ })
      .finally(() => release?.())
    return () => {
      cancelled = true
      task?.cancel()
    }
    // cssH is a dep even though the render never reads it: React owns the
    // height attribute below, and when cssH moves (the shared aspect state
    // settling on a mixed-page document) React rewrites the attribute — which
    // per the HTML spec RESETS THE BITMAP. The effect re-running is what
    // paints the wiped canvas back. Drop cssH from here and every blitted
    // page goes permanently white the moment a differently-sized page loads.
  }, [pdf, pageNumber, cssW, cssH, res])

  return (
    <canvas
      ref={canvasRef}
      className="pdf-raster"
      // These shape the white placeholder and are diffed by React on every
      // render — a cssH change wipes the bitmap (see the effect deps above).
      width={Math.round(cssW)}
      height={Math.round(cssH)}
      style={{ width: cssW }}
    />
  )
})
