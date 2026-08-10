"use client"

import { useEffect, useRef, useState } from "react"
import { Page } from "react-pdf"
import PageRaster, { type PdfDoc } from "./PageRaster"

/**
 * One page in a many-page view, rendered only when it comes near the viewport.
 *
 * The strip and matrix views put every page of a reading on screen at once. A
 * course PDF runs to forty pages and each rendered page costs a canvas AND a
 * text layer of positioned spans, so rendering them all would stall the tab.
 * The slot reserves the right space immediately — so the scrollbar is honest
 * and nothing jumps as you scroll — and swaps in the real page when it is
 * close enough to matter.
 *
 * The reserved box uses the document's own aspect ratio, measured off the
 * first page that loads. Every reading in this library is a single scanned or
 * typeset document with one page size, so one ratio holds; a page that turns
 * out different simply re-sizes its own slot when it renders.
 *
 * Capture keeps working because what lands in the DOM is an ordinary react-pdf
 * <Page> with its text layer: PdfViewer's selection handler walks up to
 * `.react-pdf__Page` and reads `data-page-number`, and the highlight applier
 * sweeps every `.react-pdf__Page__textContent` it can find. Neither cares
 * where the page sits or which view put it there. That holds for BOTH render
 * paths below — the raster variant drops react-pdf's canvas
 * (renderMode="none") but keeps its text layer, rendered once at a
 * zoom-independent base width and never rebuilt; only a mode that dropped the
 * text layer too would lose highlights and capture.
 */
export default function PageSlot({
  pageNumber,
  width,
  height,
  aspect,
  root,
  eager = false,
  onAspect,
  label,
  pdf,
  baseWidth,
  res,
}: {
  pageNumber: number
  /** Fixed width, for the matrix. Give exactly one of width/height. */
  width?: number
  /** Fixed height, for the strip. */
  height?: number
  /** height ÷ width of the document, used to reserve the other dimension. */
  aspect: number
  /** The scrolling ancestor to measure against; null observes the viewport. */
  root?: HTMLElement | null
  /** Render immediately, without waiting to be seen (the first page). */
  eager?: boolean
  /** Reports the document's height/width ratio once this page has rendered. */
  onAspect?: (aspect: number) => void
  /** Shown under the page in the matrix. */
  label?: boolean
  /**
   * The raster variant (matrix zoom). With all three of pdf/baseWidth/width
   * given, the slot draws its own canvas via pdf.js and lays react-pdf's text
   * layer over it at `baseWidth`; zoom then reaches the page as a CSS
   * transform, so dragging the slider re-renders nothing. `res` is canvas
   * pixels per CSS unit, retargeted by PdfViewer after a zoom settles.
   */
  pdf?: PdfDoc | null
  /** Zoom-independent width the text layer renders at, once. */
  baseWidth?: number
  /** Raster resolution for this page; absent pages sit at base (1). */
  res?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(eager)
  // The raster branch clips to its box, so the box must be THIS page's true
  // ratio once known — the shared `aspect` is the document-wide guess, and
  // sizing an odd page by it would crop the tail off a long scanned plate,
  // unreachable by selection. The plain-<Page> branch never clips (the page
  // grows its own slot), so only the raster path needs this.
  const [ownAspect, setOwnAspect] = useState<number | null>(null)

  useEffect(() => {
    if (seen || !ref.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        // Once rendered a page stays rendered: re-rendering on every scroll
        // past would rebuild its text layer, and the highlight applier would
        // have to re-mark it each time.
        if (entries.some((e) => e.isIntersecting)) setSeen(true)
      },
      // A screen of slack on every side, so a page is ready before it is
      // looked at. It must be every side, not top and bottom: the strip
      // scrolls sideways, and a 0 margin on the right gave the pages you are
      // scrolling *towards* no lead time at all — they popped in blank.
      { root: root ?? null, rootMargin: "100% 100% 100% 100%" }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [seen, root])

  // Whichever dimension was not given is derived, so the reserved box is the
  // size the page will actually be. Without this the placeholder has no width
  // in the strip (or no height in the matrix), every slot collapses to nothing,
  // and they all "intersect" at once — which is the stall the slot exists to
  // avoid.
  const boxW = width ?? (height ? height / aspect : undefined)
  const boxH = height ?? (width ? width * aspect : undefined)
  const holder = { width: boxW, height: boxH }

  return (
    <div
      ref={ref}
      className="pdf-slot"
      data-slot-page={pageNumber}
      style={{ width: boxW, flex: "0 0 auto", position: "relative" }}
    >
      {seen ? (
        pdf && baseWidth && width ? (
          // The zoomed footprint is the slot's honest size; inside it the page
          // renders at baseWidth and is scaled up as pure CSS. The raster
          // below re-sharpens when `res` changes; the text layer above never
          // re-renders — its width prop never moves.
          <div className="pdf-slot-scale" style={{ width: boxW, height: width * (ownAspect ?? aspect) }}>
            <div
              className="pdf-slot-inner pdf-page-shadow"
              style={{
                width: baseWidth,
                height: baseWidth * (ownAspect ?? aspect),
                transform: width !== baseWidth ? `scale(${width / baseWidth})` : undefined,
                transformOrigin: "top left",
              }}
            >
              <PageRaster
                pdf={pdf}
                pageNumber={pageNumber}
                cssW={baseWidth}
                cssH={baseWidth * (ownAspect ?? aspect)}
                res={res ?? 1}
              />
              {/* Our own positioned box, NOT a stylesheet rule on the Page
                  div: react-pdf sets `position: relative` INLINE there, which
                  beats any selector — with renderMode="none" the Page has no
                  in-flow content, so it sat BELOW the raster at height 0 and
                  the whole text layer (selection, highlights, heat) painted
                  one page-height too low and clipped to invisibility. */}
              <div className="pdf-slot-text" style={{ position: "absolute", inset: 0 }}>
                <Page
                  pageNumber={pageNumber}
                  width={baseWidth}
                  renderMode="none"
                  renderTextLayer
                  renderAnnotationLayer={false}
                  onLoadSuccess={(page) => {
                    if (page.originalWidth) {
                      const a = page.originalHeight / page.originalWidth
                      setOwnAspect(a)
                      onAspect?.(a)
                    }
                  }}
                  loading={null}
                />
              </div>
            </div>
          </div>
        ) : (
        <Page
          pageNumber={pageNumber}
          width={width}
          height={height}
          renderTextLayer
          // Annotations are link/form overlays. They are not part of coding a
          // passage and cost a second layer per page, so the many-page views
          // leave them off; the paged view still draws them.
          renderAnnotationLayer={false}
          className="pdf-page-shadow"
          onLoadSuccess={(page) => {
            if (onAspect && page.originalWidth) onAspect(page.originalHeight / page.originalWidth)
          }}
          loading={<div className="pdf-slot-holder" style={holder} />}
        />
        )
      ) : (
        <div className="pdf-slot-holder" style={holder} />
      )}
      {label && <div className="pdf-slot-label">{pageNumber}</div>}
    </div>
  )
}
