"use client"

import { type ComponentProps, useEffect, useRef } from "react"
import { Document } from "react-pdf"

/** The pdf.js document proxy, typed off react-pdf's own callback so the two
 *  libraries can never disagree about whose proxy this is. */
export type PdfDoc = Parameters<NonNullable<ComponentProps<typeof Document>["onLoadSuccess"]>>[0]

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
 */
export default function PageRaster({ pdf, pageNumber, cssW, cssH, res }: {
  pdf: PdfDoc
  pageNumber: number
  cssW: number
  cssH: number
  res: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: (cssW / base.width) * res })
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
    })().catch(() => { /* cancelled render tasks reject; nothing to do */ })
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
}
