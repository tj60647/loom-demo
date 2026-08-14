"use client"

import { memo, useEffect, useRef, useState } from "react"
import { Page } from "react-pdf"
import PageRaster, { type PdfDoc } from "./PageRaster"

/** What a matrix page is, at the current zoom — the LOD ladder.
 *  - `impostor`: the pre-rendered image alone. No canvas, no text layer.
 *    Below reading zoom the text is not legible, so nothing selectable is
 *    lost; the counter-scaling cards carry the meaning (they already do).
 *  - `reading`: the larger image plus the react-pdf text layer — selection,
 *    capture and highlights all live.
 *  - `native`: the text layer plus our own pdf.js raster on top of the
 *    image, for zoom past what the pre-rendered image can serve sharply.
 */
export type PageTier = "impostor" | "reading" | "native"

/**
 * One page in a many-page view.
 *
 * Two regimes, one component:
 *
 *  - STRIP (no `tier` prop): rendered only when it comes near the viewport,
 *    via IntersectionObserver — the slot reserves honest space, and once a
 *    page has rendered it stays rendered.
 *
 *  - MATRIX (`tier` given): SpreadCanvasView is the frustum — it says
 *    analytically, per settle, what each page should be, and the slot just
 *    renders that tier. No observer: at fit-all zoom every slot intersects
 *    the viewport anyway, which is exactly how the observer version came to
 *    mount 132 full pages to paint one contact sheet.
 *
 * The reserved box uses the page's OWN aspect when the manifest knows it
 * (`pageAspect`), the document-wide guess otherwise. Manifest-known pages
 * never report back through onAspect — the feedback loop that re-laid the
 * grid per loading page (the aspect storm) only remains for readings
 * extracted before dimensions were stored.
 *
 * Capture keeps working because what lands in the DOM is an ordinary
 * react-pdf <Page> with its text layer: PdfViewer's selection handler walks
 * up to `.react-pdf__Page` and reads `data-page-number`, and the highlight
 * applier sweeps every `.react-pdf__Page__textContent` it can find. That
 * holds for every tier that mounts text — only `impostor` drops the text
 * layer, deliberately, below the zoom where selection is usable.
 */
export default memo(function PageSlot({
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
  tier,
  pageAspect,
  pageImageBase,
  sheetBehind = false,
  annotations = false,
  priority,
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
   * given, the slot draws its own raster via pdf.js and lays react-pdf's text
   * layer over it at `baseWidth`; zoom then reaches the page as a CSS
   * transform, so dragging the slider re-renders nothing. `res` is canvas
   * pixels per CSS unit, retargeted by PdfViewer after a zoom settles.
   */
  pdf?: PdfDoc | null
  /** Zoom-independent width the text layer renders at, once. */
  baseWidth?: number
  /** Raster resolution for this page; absent pages sit at base (1). */
  res?: number
  /** This page's LOD tier (matrix only; strip has no tiers). */
  tier?: PageTier
  /** This page's own height ÷ width from the manifest, when known. */
  pageAspect?: number | null
  /** `/api/readings/{id}/pages` — null when the reading has no file or the
   *  viewer has no sourceId; the slot then renders from the PDF alone. */
  pageImageBase?: string | null
  /** The whole-document sheet is painted under this slot. When true, a slot
   *  whose own image is missing stays TRANSPARENT at impostor tier — the
   *  sheet carries the cell — instead of white-boxing it and falling back
   *  to a pdf.js render nobody needs at thumbnail size. */
  sheetBehind?: boolean
  /** Render link/form annotations over the text layer. Page mode wants them
   *  (a born-digital PDF's links should stay clickable); the matrix leaves
   *  them off — they cost a layer per page and are not part of coding. */
  annotations?: boolean
  /** Render-queue priority for this page's raster; see PageRaster. */
  priority?: (pageNumber: number) => number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(eager)
  // The raster branch clips to its box, so the box must be THIS page's true
  // ratio once known — the shared `aspect` is the document-wide guess, and
  // sizing an odd page by it would crop the tail off a long scanned plate,
  // unreachable by selection. Seeded from the manifest when it knows.
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null)
  const ownAspect = pageAspect ?? measuredAspect
  // The pre-rendered image failed (404 while ingest's render still runs, or a
  // page whose render failed for good). Fall back to drawing from the PDF —
  // slower, never wrong.
  const [imgFailed, setImgFailed] = useState(false)

  const tiered = tier !== undefined

  /**
   * Which image the slot shows — and it only ever ratchets UP. Tying the src
   * to the tier swapped 1280 back to 320 at the pan's trailing edge (a
   * visible re-decode pop, to save bytes the browser had already spent), and
   * swapped 320 → 1280 in place at the leading edge, which flashes while the
   * big one decodes. So: a slot that mounts promoted starts at 1280; a slot
   * promoted later PRELOADS the 1280 off-DOM and swaps only once it is
   * decoded; a slot demoted keeps what it has.
   */
  const [srcW, setSrcW] = useState(tiered && tier !== "impostor" ? 1280 : 320)
  // Until this slot's own image has painted, its box stays TRANSPARENT so
  // the whole-document sheet (SpreadCanvasView lays it under every slot)
  // shows through — the matrix is readable off one cached image while the
  // per-page thumbs stream in over their own cells.
  const [imgLoaded, setImgLoaded] = useState(false)
  useEffect(() => {
    if (!pageImageBase || srcW >= 1280 || !tiered || tier === "impostor") return
    let dead = false
    const upgrade = new Image()
    upgrade.onload = () => { if (!dead) setSrcW(1280) }
    upgrade.src = `${pageImageBase}/${pageNumber}?w=1280`
    return () => { dead = true }
  }, [tiered, tier, srcW, pageImageBase, pageNumber])

  useEffect(() => {
    // The matrix is its own frustum; only the strip watches the viewport.
    if (tiered || seen || !ref.current) return
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
  }, [tiered, seen, root])

  // Whichever dimension was not given is derived, so the reserved box is the
  // size the page will actually be. Without this the placeholder has no width
  // in the strip (or no height in the matrix), every slot collapses to nothing,
  // and they all "intersect" at once — which is the stall the slot exists to
  // avoid.
  const boxW = width ?? (height ? height / aspect : undefined)
  const boxH = height ?? (width ? width * aspect : undefined)
  const holder = { width: boxW, height: boxH }

  const raster = pdf && baseWidth && width
  const innerH = baseWidth ? baseWidth * (ownAspect ?? aspect) : 0
  const showImg = tiered && !!pageImageBase && !imgFailed
  // The PDF-drawn canvas: always in the untiered raster path (strip-era
  // behaviour), and in the tiered path wherever the image cannot serve —
  // native zoom needs more pixels than 1280, and a missing image needs a
  // fallback at reading zoom and above. At IMPOSTOR tier a missing image
  // falls back to the sheet underneath when there is one: decoding a PDF
  // page to paint a thumbnail is the exact cost this architecture retired.
  const showCanvas =
    raster &&
    (!tiered || tier === "native" || (!showImg && !(tier === "impostor" && sheetBehind)))
  const showText = raster && (!tiered || tier === "reading" || tier === "native")

  return (
    <div
      ref={ref}
      className="pdf-slot"
      data-slot-page={pageNumber}
      style={{ width: boxW, flex: "0 0 auto", position: "relative" }}
    >
      {(tiered || seen) ? (
        raster ? (
          // The zoomed footprint is the slot's honest size; inside it the page
          // renders at baseWidth and is scaled up as pure CSS. The raster
          // below re-sharpens when `res` changes; the text layer above never
          // re-renders — its width prop never moves.
          <div className="pdf-slot-scale" style={{ width: boxW, height: width * (ownAspect ?? aspect) }}>
            <div
              className="pdf-slot-inner pdf-page-shadow"
              style={{
                width: baseWidth,
                height: innerH,
                transform: width !== baseWidth ? `scale(${width / baseWidth})` : undefined,
                transformOrigin: "top left",
                // White paper only once something paints here; transparent
                // before that (and on image failure with a sheet behind),
                // so the sheet underneath carries the cell.
                background:
                  !tiered || imgLoaded || showCanvas || (imgFailed && !sheetBehind)
                    ? undefined
                    : "transparent",
              }}
            >
              {showImg && (
                // The pre-rendered page. Absolute under everything: the
                // native raster blits over it, and until that lands (or when
                // there is no raster at all) this IS the page. Sized by the
                // box, not the image — the manifest's aspect and the render's
                // agree, both being the page's own.
                <img
                  className="pdf-slot-img"
                  src={`${pageImageBase}/${pageNumber}?w=${srcW}`}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgFailed(true)}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                />
              )}
              {showCanvas && (
                <PageRaster
                  pdf={pdf}
                  pageNumber={pageNumber}
                  cssW={baseWidth}
                  cssH={innerH}
                  res={res ?? 1}
                  priority={priority}
                />
              )}
              {/* Our own positioned box, NOT a stylesheet rule on the Page
                  div: react-pdf sets `position: relative` INLINE there, which
                  beats any selector — with renderMode="none" the Page has no
                  in-flow content, so it sat BELOW the raster at height 0 and
                  the whole text layer (selection, highlights, heat) painted
                  one page-height too low and clipped to invisibility. */}
              {showText && (
                <div className="pdf-slot-text" style={{ position: "absolute", inset: 0 }}>
                  <Page
                    pageNumber={pageNumber}
                    width={baseWidth}
                    renderMode="none"
                    renderTextLayer
                    renderAnnotationLayer={annotations}
                    onLoadSuccess={(page) => {
                      if (page.originalWidth) {
                        const a = page.originalHeight / page.originalWidth
                        setMeasuredAspect(a)
                        // Manifest-known pages stay out of the shared-aspect
                        // feedback loop — that loop is the aspect storm.
                        if (pageAspect == null) onAspect?.(a)
                      }
                    }}
                    loading={null}
                  />
                </div>
              )}
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
})
