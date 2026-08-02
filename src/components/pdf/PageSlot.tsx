"use client"

import { useEffect, useRef, useState } from "react"
import { Page } from "react-pdf"

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
 * where the page sits or which view put it there.
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
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(eager)

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
      ) : (
        <div className="pdf-slot-holder" style={holder} />
      )}
      {label && <div className="pdf-slot-label">{pageNumber}</div>}
    </div>
  )
}
