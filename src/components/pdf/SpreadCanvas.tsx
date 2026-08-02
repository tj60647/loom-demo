"use client"
/**
 * The spread canvas: a second way to read a library PDF, separate from
 * PdfViewer. The whole document is laid out once as 2-page spreads on a
 * near-square canvas, with concept cards (name + working definition) stacked
 * in rails to the left and right of each spread, Google-Docs-comment style.
 *
 * Reading mode and freeform mode are the same canvas under one d3-zoom
 * transform — reading is just the transform constrained to fit one spread,
 * with masks and prev/next buttons overlaid. Nothing remounts on toggle, so
 * highlighting and editing behave identically in both modes.
 *
 * Data is the existing graph: a highlight is a concept (label + def) plus a
 * byte (page number + character offsets against the pdf.js text layer). This
 * component is only an interface on that data — no new tables, no new view
 * state persisted (card stacking is computed at render, red line #7).
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform, type D3ZoomEvent } from 'd3-zoom'
import { select, pointer } from 'd3-selection'
import { useLoom } from '@/components/providers/LoomProvider'
import { useDialog } from '@/components/providers/DialogProvider'
import { hashText } from '@/lib/hash'
import type { Byte, Concept } from '@/lib/types'

// The proxy react-pdf hands to onLoadSuccess — typed via react-pdf itself so
// it tracks the pdfjs-dist version react-pdf actually bundles.
type PdfDoc = Parameters<NonNullable<React.ComponentProps<typeof Document>['onLoadSuccess']>>[0]

// Same self-hosted worker as PdfViewer — copied out of pdfjs-dist by
// scripts/copy-pdf-worker.mjs at prebuild/predev.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type Rect = { x: number; y: number; w: number; h: number }

type Spread = { i: number; x: number; y: number; leftPage: number; rightPage: number | null }

export type SpreadLayout = {
  railW: number
  gap: number
  spreadGap: number
  unitW: number
  unitH: number
  cols: number
  spreads: Spread[]
  canvasW: number
  canvasH: number
}

/** Lay spreads out as a near-square grid, all in canvas units (pdf points). */
export function spreadLayout(numPages: number, pageW: number, pageH: number): SpreadLayout {
  const railW = pageW * 0.33
  const gap = Math.round(pageW * 0.02)
  const spreadGap = Math.round(pageW * 0.08)
  const unitW = railW * 2 + pageW * 2 + gap * 3
  const unitH = pageH
  const spreadCount = Math.max(1, Math.ceil(numPages / 2))
  const cols = Math.ceil(Math.sqrt(spreadCount))
  const rows = Math.ceil(spreadCount / cols)
  const spreads: Spread[] = []
  for (let i = 0; i < spreadCount; i++) {
    spreads.push({
      i,
      x: (i % cols) * (unitW + spreadGap),
      y: Math.floor(i / cols) * (unitH + spreadGap),
      leftPage: i * 2 + 1,
      rightPage: i * 2 + 2 <= numPages ? i * 2 + 2 : null,
    })
  }
  return {
    railW, gap, spreadGap, unitW, unitH, cols, spreads,
    canvasW: cols * unitW + (cols - 1) * spreadGap,
    canvasH: rows * unitH + (rows - 1) * spreadGap,
  }
}

/**
 * Place cards along a rail. Each card sits centered on its highlight (so its
 * leader line runs horizontal) when nothing crowds it. Cards that would
 * overlap merge into a cluster that spreads up AND down around the mean of
 * their ideal positions, clamped inside the page; only a cluster taller than
 * the page itself pins to the top and grows downward.
 */
export function layoutRail(
  items: { id: string; desired: number; h: number }[],
  maxH: number,
  gap = 12
): Record<string, number> {
  type Placed = { id: string; desired: number; off: number }
  const clampTop = (t: number, h: number) => (h >= maxH ? 0 : Math.min(Math.max(t, 0), maxH - h))
  const clusters: { items: Placed[]; height: number; top: number }[] = []
  for (const it of [...items].sort((a, b) => a.desired - b.desired)) {
    let cur = {
      items: [{ id: it.id, desired: it.desired, off: 0 }],
      height: it.h,
      top: clampTop(it.desired, it.h),
    }
    while (clusters.length > 0) {
      const prev = clusters[clusters.length - 1]
      if (prev.top + prev.height + gap <= cur.top) break
      clusters.pop()
      const merged = [...prev.items, ...cur.items.map(x => ({ ...x, off: x.off + prev.height + gap }))]
      const height = prev.height + gap + cur.height
      const top = clampTop(merged.reduce((s, x) => s + (x.desired - x.off), 0) / merged.length, height)
      cur = { items: merged, height, top }
    }
    clusters.push(cur)
  }
  const out: Record<string, number> = {}
  for (const c of clusters) for (const p of c.items) out[p.id] = c.top + p.off
  return out
}

/** Rebuild a DOM Range from character offsets against a text layer's concatenated text nodes. */
function rangeFromOffsets(root: Element, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let pos = 0
  let startSet = false
  let node: Node | null
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0
    if (!startSet && pos + len > start) {
      range.setStart(node, start - pos)
      startSet = true
    }
    if (startSet && pos + len >= end) {
      range.setEnd(node, end - pos)
      return range
    }
    pos += len
  }
  return null
}

type Capture = {
  pageNum: number
  start: number
  end: number
  hash: string
  text: string
  rects: Rect[] // relative to the page element, canvas units
  buttonX: number // screen coords for the floating button
  buttonY: number
}

type Draft = Omit<Capture, 'buttonX' | 'buttonY'> & {
  // Set once the draft has auto-committed. The byte is real from then on, but
  // the draft card keeps rendering in its place until focus leaves, so the
  // caret never jumps mid-thought.
  committedByteId?: string
}

type CardModel = {
  id: string // byte id, or 'draft'
  byte: Byte | null
  concept: Concept | null
  spreadIdx: number
  side: 'left' | 'right'
  anchor: { x: number; y: number } // canvas coords of the highlight edge
  rects: Rect[] // canvas coords
}

const GUTTER = 36 // reading-mode side masks that hold the prev/next buttons
const CARD_FALLBACK_H = 96

// Zoom-aware rendering: pages rasterize at BASE_RES (canvas pixels per canvas
// unit) and the ones in view re-render to match the zoom once a gesture
// settles. Quantized to half-steps so tiny zoom changes don't re-render.
const BASE_RES = 1
// High enough that the raster stays sharp at max zoom (8× spread fit on a
// retina display); the self-balancing budget means only a page-fraction ever
// renders at this level. Well under the browser's ~16k canvas dimension cap.
const MAX_RES = 12
const SETTLE_MS = 200


interface SpreadCanvasProps {
  url: string
  sourceName: string
  sourceId: string
  onClose: () => void
}

export default function SpreadCanvas({ url, sourceName, sourceId, onClose }: SpreadCanvasProps) {
  const { state, addConcept, editConcept, addByte, removeByte } = useLoom()
  const { confirm } = useDialog()

  const [numPages, setNumPages] = useState<number>()
  const [pageSize, setPageSize] = useState<{ w: number; h: number }>()
  const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null)
  // Per-page raster resolution targets; pages absent from the map sit at
  // BASE_RES. Recomputed when a zoom/fit gesture settles.
  const [pageRes, setPageRes] = useState<Record<number, number>>({})
  const [mode, setMode] = useState<'single' | 'spread' | 'freeform'>('spread')
  const [focusPage, setFocusPage] = useState(1)
  const [viewport, setViewport] = useState<{ w: number; h: number }>()
  const [textLayerTick, setTextLayerTick] = useState(0)
  const [byteRects, setByteRects] = useState<Record<string, Rect[]>>({})
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({})
  const [capture, setCapture] = useState<Capture | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [ready, setReady] = useState(false)
  const [docError, setDocError] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const tref = useRef<ZoomTransform>(zoomIdentity)
  const zbRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null)
  const fitKRef = useRef(1)
  const cardEls = useRef(new Map<string, HTMLDivElement>())

  const layout = useMemo(
    () => (numPages && pageSize ? spreadLayout(numPages, pageSize.w, pageSize.h) : null),
    [numPages, pageSize]
  )

  // ponytail: bytes without precise offsets (legacy fuzzy captures) are not
  // shown here; PdfViewer's mark.js fallback still covers them.
  const sourceBytes = useMemo(
    () => state.bytes.filter(b =>
      b.sourceId === sourceId && b.pageNumber != null && b.startOffset != null && b.endOffset != null
    ),
    [state.bytes, sourceId]
  )

  // The transform is applied imperatively so pan/zoom never re-renders ~40 pdf
  // pages per frame. --invk counter-scales concept titles (requirement: titles
  // never shrink below their reading-view size when zoomed out).
  // After a settle: pages intersecting the view (plus half a page of margin)
  // get resolution matching the zoom; everything else drops back to BASE_RES.
  // The budget is self-balancing — high targets only ever apply to the few
  // pages visible at high zoom, so rendered pixels stay near one screenful.
  const resDeps = useRef({ layout, pageSize, viewport, numPages })
  useEffect(() => {
    resDeps.current = { layout, pageSize, viewport, numPages }
  })
  const retargetRes = useCallback(() => {
    const { layout, pageSize, viewport, numPages } = resDeps.current
    if (!layout || !pageSize || !viewport || !numPages) return
    const t = tref.current
    const dpr = window.devicePixelRatio || 1
    const target = Math.max(BASE_RES, Math.min(MAX_RES, Math.ceil(t.k * dpr * 2) / 2))
    const margin = pageSize.w / 2
    const vx = -t.x / t.k - margin
    const vy = -t.y / t.k - margin
    const vw = viewport.w / t.k + margin * 2
    const vh = viewport.h / t.k + margin * 2
    const next: Record<number, number> = {}
    for (const s of layout.spreads) {
      for (const p of s.rightPage ? [s.leftPage, s.rightPage] : [s.leftPage]) {
        const px = s.x + layout.railW + layout.gap + (p % 2 === 0 ? pageSize.w + layout.gap : 0)
        const inView = px < vx + vw && px + pageSize.w > vx && s.y < vy + vh && s.y + layout.unitH > vy
        if (inView && target > BASE_RES) next[p] = target
      }
    }
    setPageRes(prev => {
      const nk = Object.keys(next)
      if (Object.keys(prev).length === nk.length && nk.every(k => prev[+k] === next[+k])) return prev
      return next
    })
  }, [])

  const settleTimer = useRef<number | undefined>(undefined)
  const applyTransform = useCallback((t: ZoomTransform) => {
    tref.current = t
    const el = canvasRef.current
    if (!el) return
    el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`
    el.style.setProperty('--invk', String(Math.max(1, fitKRef.current / t.k)))
    // When the transform stops moving, re-target raster resolutions. Until
    // then the previous rasters just CSS-stretch — that's the interim display.
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(retargetRes, SETTLE_MS)
  }, [retargetRes])

  // --- pdf load ---

  const onDocLoad = useCallback((pdf: PdfDoc) => {
    setPdfDoc(pdf)
    setNumPages(pdf.numPages)
    // ponytail: page 1's size stands in for every page; mixed-size documents
    // render each page at unit width and simply differ a little in height.
    pdf.getPage(1).then(p => {
      const v = p.getViewport({ scale: 1 })
      setPageSize({ w: v.width, h: v.height })
    })
  }, [])

  const onTextLayer = useCallback(() => setTextLayerTick(t => t + 1), [])

  // --- viewport tracking ---

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setViewport({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // --- zoom behaviour ---

  useEffect(() => {
    zbRef.current = zoom<HTMLDivElement, unknown>()
      .filter((e: Event & { button?: number }) => {
        // A drag that starts on page text selects text; a drag on a card hits
        // its inputs. Everything else (margins, page whitespace edges) pans.
        if (e.type === 'mousedown' || e.type === 'touchstart') {
          const t = e.target as HTMLElement
          if (t.closest('.react-pdf__Page__textContent') || t.closest('.sc-card')) return false
        }
        return !e.button
      })
      .on('zoom', (e: D3ZoomEvent<HTMLDivElement, unknown>) => applyTransform(e.transform))
  }, [applyTransform])

  // The reading-mode transform for the focused page or spread — pure math
  // reused by both the imperative apply and the mask geometry below.
  const fit = useMemo(() => {
    if (!layout || !viewport || !pageSize || !numPages) return null
    const page = Math.min(focusPage, numPages)
    const s = layout.spreads[Math.floor((page - 1) / 2)]
    const rect =
      mode === 'single'
        ? {
            // One page plus its own rail: left pages annotate leftward, right
            // pages rightward, so the pair travels together.
            x: page % 2 === 1 ? s.x : s.x + layout.railW + layout.gap + pageSize.w + layout.gap,
            y: s.y,
            w: layout.railW + layout.gap + pageSize.w,
            h: layout.unitH,
          }
        : { x: s.x, y: s.y, w: layout.unitW, h: layout.unitH }
    const k = Math.min((viewport.w - GUTTER * 2 - 16) / rect.w, (viewport.h - 24) / rect.h)
    return {
      t: zoomIdentity
        .translate((viewport.w - rect.w * k) / 2 - rect.x * k, (viewport.h - rect.h * k) / 2 - rect.y * k)
        .scale(k),
      k,
      rect,
      spread: s,
      page,
    }
  }, [layout, viewport, pageSize, numPages, mode, focusPage])

  // Titles counter-scale against the two-page fit regardless of current mode,
  // so "reading size" means the same thing everywhere.
  const spreadFitK = useMemo(
    () => (layout && viewport
      ? Math.min((viewport.w - GUTTER * 2 - 16) / layout.unitW, (viewport.h - 24) / layout.unitH)
      : null),
    [layout, viewport]
  )

  useEffect(() => {
    if (!spreadFitK) return
    fitKRef.current = spreadFitK
    applyTransform(tref.current) // refresh --invk if the reference scale moved
  }, [spreadFitK, applyTransform])

  useEffect(() => {
    const zb = zbRef.current
    if (!zb || !layout || !viewport || !spreadFitK) return
    const pad = layout.spreadGap * 4
    const minK = Math.min(viewport.w / (layout.canvasW + pad), viewport.h / (layout.canvasH + pad))
    zb.scaleExtent([Math.min(minK, spreadFitK), spreadFitK * 8])
      .translateExtent([[-pad, -pad], [layout.canvasW + pad, layout.canvasH + pad]])
  }, [layout, viewport, spreadFitK])

  // Attach gestures only in freeform; reading mode is the same canvas with the
  // transform driven programmatically (and animated via CSS).
  useEffect(() => {
    const el = viewportRef.current
    const zb = zbRef.current
    if (!el || !zb) return
    const sel = select(el)
    if (mode === 'freeform') {
      if (canvasRef.current) canvasRef.current.style.transition = 'none'
      sel.call(zb)
      sel.on('dblclick.zoom', null) // double-click zoom jumps are hostile mid-reading
      // Figma-style trackpad: two-finger scroll pans, pinch zooms. d3-zoom's
      // default treats every wheel event as zoom, so replace its wheel handler.
      // A trackpad pinch reaches the browser as a wheel event with ctrlKey set
      // (macOS convention); everything else is a scroll and becomes a pan.
      sel.on('wheel.zoom', null)
      sel.on('wheel.figma', (e: WheelEvent) => {
        e.preventDefault()
        const scale = e.deltaMode === 1 ? 16 : 1 // line-scrolling mice report lines, not pixels
        if (e.ctrlKey || e.metaKey) {
          zb.scaleBy(sel, Math.pow(2, -e.deltaY * scale * 0.01), pointer(e, el))
        } else {
          const k = tref.current.k
          zb.translateBy(sel, (-e.deltaX * scale) / k, (-e.deltaY * scale) / k)
        }
      })
    } else {
      sel.on('.zoom', null)
      sel.on('wheel.figma', null)
    }
    return () => {
      sel.on('.zoom', null)
      sel.on('wheel.figma', null)
    }
  }, [mode])

  useEffect(() => {
    if (mode === 'freeform' || !fit || !viewportRef.current || !zbRef.current) return
    if (canvasRef.current) {
      canvasRef.current.style.transition = ready ? 'transform 350ms ease' : 'none'
    }
    // Route through the behaviour so freeform picks up exactly where reading left off.
    zbRef.current.transform(select(viewportRef.current), fit.t)
    setReady(true)
  }, [mode, fit, ready])

  const toMode = useCallback((m: 'single' | 'spread' | 'freeform') => {
    // Leaving freeform snaps to whichever page is nearest the middle of the
    // view; single↔spread keeps the focused page.
    if (m !== 'freeform' && mode === 'freeform' && layout && viewport && pageSize) {
      const t = tref.current
      const cx = (viewport.w / 2 - t.x) / t.k
      const cy = (viewport.h / 2 - t.y) / t.k
      let best = 1
      let bd = Infinity
      for (const s of layout.spreads) {
        for (const p of s.rightPage ? [s.leftPage, s.rightPage] : [s.leftPage]) {
          const px = s.x + layout.railW + layout.gap + (p % 2 === 0 ? pageSize.w + layout.gap : 0) + pageSize.w / 2
          const d = Math.hypot(px - cx, s.y + layout.unitH / 2 - cy)
          if (d < bd) { bd = d; best = p }
        }
      }
      setFocusPage(best)
    }
    setMode(m)
  }, [mode, layout, viewport, pageSize])

  // --- text selection → capture button ---

  useEffect(() => {
    const onUp = () => {
      const sel = window.getSelection()
      const raw = sel?.toString() ?? ''
      const text = raw.trim()
      if (!sel || !text || sel.rangeCount === 0) { setCapture(null); return }
      const range = sel.getRangeAt(0)
      const pageOf = (n: Node | null): HTMLElement | null => {
        while (n && n.nodeType === Node.TEXT_NODE) n = n.parentNode
        return (n as HTMLElement | null)?.closest?.('.react-pdf__Page') ?? null
      }
      const pageEl = pageOf(range.startContainer)
      if (!pageEl || !canvasRef.current?.contains(pageEl) || pageOf(range.endContainer) !== pageEl) {
        setCapture(null)
        return
      }
      const pageNum = parseInt(pageEl.getAttribute('data-page-number') || '0', 10)
      const textLayer = pageEl.querySelector('.react-pdf__Page__textContent')
      if (!pageNum || !textLayer || !pageSize) { setCapture(null); return }

      const pre = range.cloneRange()
      pre.selectNodeContents(textLayer)
      pre.setEnd(range.startContainer, range.startOffset)
      const rawStart = pre.toString().length
      const start = rawStart + (raw.length - raw.trimStart().length)
      const end = rawStart + raw.length - (raw.length - raw.trimEnd().length)

      // Measured, not read from the zoom state: the page's on-screen width vs
      // its canvas width gives the true current scale even mid-transition.
      const pr = pageEl.getBoundingClientRect()
      const k = pr.width / pageSize.w
      const rects = Array.from(range.getClientRects())
        .filter(r => r.width > 1 && r.height > 1)
        .map(r => ({ x: (r.left - pr.left) / k, y: (r.top - pr.top) / k, w: r.width / k, h: r.height / k }))
      if (rects.length === 0) { setCapture(null); return }
      const first = range.getBoundingClientRect()
      setCapture({
        pageNum, start, end, text,
        hash: hashText(textLayer.textContent || ''),
        rects,
        buttonX: first.left + first.width / 2,
        buttonY: Math.max(52, first.top),
      })
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [pageSize])

  // --- highlight rect resolution for saved bytes ---

  useEffect(() => {
    if (!canvasRef.current || !pageSize) return
    const next: Record<string, Rect[]> = {}
    for (const b of sourceBytes) {
      const pageEl = canvasRef.current.querySelector<HTMLElement>(`.react-pdf__Page[data-page-number="${b.pageNumber}"]`)
      const tl = pageEl?.querySelector('.react-pdf__Page__textContent')
      if (!pageEl || !tl || tl.childElementCount === 0) continue
      // ponytail: offsets are applied without re-checking pageContentHash — the
      // server reconciled them against canonical page text at capture time. If
      // a byte's text has drifted, its range simply fails to resolve and the
      // card renders at the top of the rail without a highlight.
      const range = rangeFromOffsets(tl, b.startOffset!, b.endOffset!)
      if (!range) continue
      const pr = pageEl.getBoundingClientRect()
      if (pr.width === 0) continue
      const k = pr.width / pageSize.w
      const rects = Array.from(range.getClientRects())
        .filter(r => r.width > 1 && r.height > 1)
        .map(r => ({ x: (r.left - pr.left) / k, y: (r.top - pr.top) / k, w: r.width / k, h: r.height / k }))
      if (rects.length > 0) next[b.id] = rects
    }
    setByteRects(prev => {
      const pk = Object.keys(prev)
      const nk = Object.keys(next)
      if (pk.length === nk.length && nk.every(id =>
        prev[id] && prev[id].length === next[id].length &&
        prev[id].every((r, i) => Math.abs(r.x - next[id][i].x) < 0.5 && Math.abs(r.y - next[id][i].y) < 0.5)
      )) return prev
      return next
    })
  }, [sourceBytes, textLayerTick, pageSize])

  // --- card models + rail stacking ---

  const cards = useMemo<CardModel[]>(() => {
    if (!layout || !pageSize) return []
    const out: CardModel[] = []
    const build = (id: string, byte: Byte | null, pageNum: number, rects: Rect[]): CardModel | null => {
      const sIdx = Math.floor((pageNum - 1) / 2)
      const spread = layout.spreads[sIdx]
      if (!spread) return null
      const side: 'left' | 'right' = pageNum % 2 === 1 ? 'left' : 'right'
      const pageX = spread.x + layout.railW + layout.gap + (side === 'right' ? pageSize.w + layout.gap : 0)
      const abs = rects.map(r => ({ x: pageX + r.x, y: spread.y + r.y, w: r.w, h: r.h }))
      const r0 = abs[0]
      return {
        id, byte,
        concept: byte ? state.concepts.find(c => c.id === byte.conceptId) ?? null : null,
        spreadIdx: sIdx, side,
        anchor: r0
          ? { x: side === 'left' ? r0.x : r0.x + r0.w, y: r0.y + r0.h / 2 }
          : { x: pageX, y: spread.y },
        rects: abs,
      }
    }
    for (const b of sourceBytes) {
      // The draft card stands in for its own byte until focus leaves — both
      // under the byte's final id and, while the save is still in flight,
      // under the optimistic temp row (matched by its anchor).
      if (draft && (
        b.id === draft.committedByteId ||
        (b.pageNumber === draft.pageNum && b.startOffset === draft.start && b.endOffset === draft.end)
      )) continue
      const card = build(b.id, b, b.pageNumber!, byteRects[b.id] ?? [])
      if (card) out.push(card)
    }
    if (draft) {
      const card = build('draft', null, draft.pageNum, draft.rects)
      if (card) out.push(card)
    }
    return out
  }, [layout, pageSize, sourceBytes, byteRects, draft, state.concepts])

  const railPlacement = useMemo(() => {
    const tops: Record<string, number> = {}
    const scales: Record<string, number> = {}
    if (!layout) return { tops, scales }
    const groups = new Map<string, CardModel[]>()
    for (const c of cards) {
      const key = `${c.spreadIdx}:${c.side}`
      groups.set(key, [...(groups.get(key) ?? []), c])
    }
    const GAP = 12
    for (const group of groups.values()) {
      const spreadY = layout.spreads[group[0].spreadIdx].y
      const hs = group.map(c => cardHeights[c.id] ?? CARD_FALLBACK_H)
      // When a rail holds more card than page, the cards themselves shrink
      // (whole entity, via transform) until the stack fits — every concept
      // stays visible instead of overflowing. Heights are measured unscaled,
      // so this never feeds back into itself; zooming out grows the measured
      // heights, and the factor tightens to keep the stack inside the page.
      const required = hs.reduce((a, b) => a + b, 0) + GAP * Math.max(0, group.length - 1)
      const s = Math.min(1, layout.unitH / required)
      const placed = layoutRail(
        group.map((c, i) => ({
          // Ideal top centers the card on its highlight — horizontal leader.
          id: c.id,
          desired: c.anchor.y - spreadY - (hs[i] * s) / 2,
          h: hs[i] * s,
        })),
        layout.unitH,
        GAP * s
      )
      for (const c of group) {
        tops[c.id] = spreadY + placed[c.id]
        scales[c.id] = s
      }
    }
    return { tops, scales }
  }, [cards, cardHeights, layout])
  const cardTops = railPlacement.tops
  const cardScales = railPlacement.scales

  // Stacking needs real card heights (the definition textarea grows with its
  // content), so every card element is watched by one shared ResizeObserver.
  const cardIdByEl = useRef(new Map<Element, string>())
  const cardRO = useRef<ResizeObserver | null>(null)
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const next: Record<string, number> = {}
      for (const [el, id] of cardIdByEl.current) next[id] = (el as HTMLElement).offsetHeight
      setCardHeights(prev => {
        const nk = Object.keys(next)
        if (Object.keys(prev).length === nk.length && nk.every(id => prev[id] === next[id])) return prev
        return next
      })
    })
    cardRO.current = ro
    return () => ro.disconnect()
  }, [])

  const registerCard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardEls.current.set(id, el)
      cardIdByEl.current.set(el, id)
      cardRO.current?.observe(el)
    } else {
      const old = cardEls.current.get(id)
      if (old) {
        cardRO.current?.unobserve(old)
        cardIdByEl.current.delete(old)
        cardEls.current.delete(id)
      }
    }
  }, [])

  // --- actions ---

  const startDraft = useCallback(() => {
    if (!capture) return
    setDraft({ pageNum: capture.pageNum, start: capture.start, end: capture.end, hash: capture.hash, text: capture.text, rects: capture.rects })
    setCapture(null)
    window.getSelection()?.removeAllRanges()
  }, [capture])

  const commitDraft = useCallback(async (label: string, def: string) => {
    const name = label.trim()
    if (!name || !draft) throw new Error('nothing to save')
    // One label is one concept (spec §2): re-highlighting under a known name
    // files the byte under the existing concept instead of minting a twin.
    const existing = state.concepts.find(c => c.label.toLowerCase() === name.toLowerCase())
    const concept = existing ?? await addConcept(name, def.trim())
    if (existing && def.trim() && def.trim() !== (existing.def ?? '')) {
      await editConcept(existing.id, { def: def.trim() })
    }
    const byte = await addByte(concept.id, sourceName, `p. ${draft.pageNum}`, draft.text, draft.pageNum, draft.start, draft.end, sourceId, draft.hash)
    setDraft(d => (d ? { ...d, committedByteId: byte.id } : d))
    return { id: concept.id, label: name, def: def.trim() }
  }, [draft, state.concepts, addConcept, editConcept, addByte, sourceName, sourceId])

  // Not flagged danger: removing a highlight is small-stakes (re-highlighting
  // recreates it) and the concept itself is untouched.
  const deleteCard = useCallback(async (byte: Byte, label: string) => {
    const ok = await confirm({
      title: 'Remove this highlight?',
      body: `"${label}" stays in your loom.`,
      confirmLabel: 'Remove',
    })
    if (ok) removeByte(byte.id)
  }, [confirm, removeByte])

  // --- keyboard ---

  // Navigation steps by page in single mode and by spread (anchored to the
  // spread's left page) in spread mode.
  const leftPage = focusPage - ((focusPage - 1) % 2)
  const canPrev = (mode === 'single' ? focusPage : leftPage) > 1
  const canNext = numPages ? (mode === 'single' ? focusPage < numPages : leftPage + 2 <= numPages) : false
  const goPrev = useCallback(() => {
    setFocusPage(p => Math.max(1, mode === 'single' ? p - 1 : p - ((p - 1) % 2) - 2))
  }, [mode])
  const goNext = useCallback(() => {
    setFocusPage(p => {
      const next = mode === 'single' ? p + 1 : p - ((p - 1) % 2) + 2
      return Math.min(numPages ?? p, next)
    })
  }, [mode, numPages])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') { setDraft(null); setCapture(null); return }
      if (mode === 'freeform') return
      if (e.key === 'ArrowLeft' && canPrev) goPrev()
      else if (e.key === 'ArrowRight' && canNext) goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, canPrev, canNext, goPrev, goNext])

  // --- render ---

  const pagesEl = useMemo(() => {
    if (!layout || !pageSize || !pdfDoc) return null
    return layout.spreads.map(s => {
      const pages = [{ n: s.leftPage, right: false }, ...(s.rightPage ? [{ n: s.rightPage, right: true }] : [])]
      return pages.map(p => (
        <div
          key={p.n}
          className="sc-page"
          style={{
            position: 'absolute',
            left: s.x + layout.railW + layout.gap + (p.right ? pageSize.w + layout.gap : 0),
            top: s.y,
            width: pageSize.w,
          }}
        >
          {/* The raster and the text layer are split on purpose: the raster
              re-renders as zoom demands, while the text layer (selection +
              highlight anchoring) renders once and is never touched again. */}
          <PageRaster pdf={pdfDoc} pageNumber={p.n} cssW={pageSize.w} cssH={pageSize.h} res={pageRes[p.n] ?? BASE_RES} />
          <Page
            pageNumber={p.n}
            width={pageSize.w}
            renderMode="none"
            renderTextLayer={true}
            renderAnnotationLayer={false}
            onRenderTextLayerSuccess={onTextLayer}
            loading={null}
          />
        </div>
      ))
    })
  }, [layout, pageSize, pdfDoc, pageRes, onTextLayer])

  const maskRects = useMemo(() => {
    if (mode === 'freeform' || !fit || !viewport) return null
    const sx = fit.t.applyX(fit.rect.x)
    const sy = fit.t.applyY(fit.rect.y)
    const sw = fit.rect.w * fit.k
    const sh = fit.rect.h * fit.k
    return {
      left: { width: Math.max(GUTTER, sx) },
      right: { left: Math.min(viewport.w - GUTTER, sx + sw), width: Math.max(GUTTER, viewport.w - sx - sw) },
      top: { left: sx, width: sw, height: Math.max(0, sy) },
      bottom: { left: sx, width: sw, top: sy + sh, height: Math.max(0, viewport.h - sy - sh) },
    }
  }, [mode, fit, viewport])

  const indicator = fit
    ? mode === 'single' || !fit.spread.rightPage
      ? `page ${mode === 'single' ? fit.page : fit.spread.leftPage} of ${numPages}`
      : `pages ${fit.spread.leftPage}–${fit.spread.rightPage} of ${numPages}`
    : ''

  return (
    <div className="sc-root">
      <style>{scStyles}</style>

      <div className="sc-topbar">
        <button className="btn ghost mini" onClick={onClose}>← Back</button>
        <span className="label sc-title" title={sourceName}>{sourceName}</span>
        <div className="sc-topbar-right">
          {mode !== 'freeform' && <span className="label sc-indicator">{indicator}</span>}
          <div className="sc-toggle">
            <button
              className={`btn mini ${mode === 'single' ? '' : 'ghost'}`}
              onClick={() => toMode('single')}
            >
              Single
            </button>
            <button
              className={`btn mini ${mode === 'spread' ? '' : 'ghost'}`}
              onClick={() => toMode('spread')}
            >
              Spread
            </button>
            <button
              className={`btn mini ${mode === 'freeform' ? '' : 'ghost'}`}
              onClick={() => toMode('freeform')}
            >
              Freeform
            </button>
          </div>
        </div>
      </div>

      <div className="sc-viewport" ref={viewportRef} data-mode={mode}>
        <Document
          file={url}
          onLoadSuccess={onDocLoad}
          onLoadError={() => setDocError(true)}
          loading={null}
          error={<div className="hint sc-loading" style={{ color: 'var(--red)' }}>Failed to load PDF.</div>}
        >
          {layout && pageSize && (
            <div
              className="sc-canvas"
              ref={canvasRef}
              style={{
                width: layout.canvasW,
                height: layout.canvasH,
                opacity: ready ? 1 : 0,
              }}
            >
              {pagesEl}

              <svg className="sc-overlay" width={layout.canvasW} height={layout.canvasH}>
              {cards.map(c => (
                <g key={c.id}>
                  {c.rects.map((r, i) => (
                    <rect
                      key={i}
                      x={r.x} y={r.y} width={r.w} height={r.h}
                      className={c.id === 'draft' ? 'sc-hl sc-hl-draft' : 'sc-hl'}
                    />
                  ))}
                  {cardTops[c.id] != null && c.rects.length > 0 && (
                    <path
                      className="sc-leader"
                      d={`M ${c.anchor.x} ${c.anchor.y} L ${
                        c.side === 'left'
                          ? layout.spreads[c.spreadIdx].x + layout.railW * (cardScales[c.id] ?? 1)
                          : layout.spreads[c.spreadIdx].x + layout.unitW - layout.railW * (cardScales[c.id] ?? 1)
                      } ${cardTops[c.id] + ((cardHeights[c.id] ?? CARD_FALLBACK_H) * (cardScales[c.id] ?? 1)) / 2}`}
                    />
                  )}
                </g>
              ))}
            </svg>

            {cards.map(c => {
              const s = layout.spreads[c.spreadIdx]
              // Cards keep their rail-edge anchor and grow inward — over their
              // own page — as the canvas zooms out (width rides --invk), so at
              // full zoom-out you are reading concepts, not the shrunken text.
              const style: React.CSSProperties = {
                top: cardTops[c.id] ?? s.y,
                width: `min(calc(${layout.railW}px * var(--invk, 1)), ${layout.railW + layout.gap + pageSize.w}px)`,
                transform: `scale(${cardScales[c.id] ?? 1})`,
                transformOrigin: c.side === 'left' ? 'top left' : 'top right',
                ...(c.side === 'left'
                  ? { left: s.x }
                  : { right: layout.canvasW - (s.x + layout.unitW) }),
              }
              if (c.id === 'draft' && draft) {
                return (
                  <DraftCard
                    key="draft"
                    style={style}
                    registerEl={el => registerCard('draft', el)}
                    onCommit={commitDraft}
                    onUpdate={editConcept}
                    onClose={() => setDraft(null)}
                  />
                )
              }
              if (!c.byte || !c.concept) return null
              return (
                <ConceptCard
                  key={c.id}
                  style={style}
                  byte={c.byte}
                  concept={c.concept}
                  registerEl={el => registerCard(c.id, el)}
                  onEdit={editConcept}
                  onDelete={deleteCard}
                />
              )
            })}
            </div>
          )}
        </Document>

        {!ready && !docError && <span className="hint sc-loading">Loading PDF...</span>}

        {maskRects && (
          <>
            <div className="sc-mask sc-mask-left" style={{ width: maskRects.left.width }}>
              <button className="sc-nav" onClick={goPrev} disabled={!canPrev} aria-label="Previous Spread">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            </div>
            <div className="sc-mask sc-mask-right" style={{ left: maskRects.right.left, width: maskRects.right.width }}>
              <button className="sc-nav" onClick={goNext} disabled={!canNext} aria-label="Next Spread">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
            <div className="sc-mask" style={{ left: maskRects.top.left, width: maskRects.top.width, top: 0, height: maskRects.top.height }} />
            <div className="sc-mask" style={{ left: maskRects.bottom.left, width: maskRects.bottom.width, top: maskRects.bottom.top, height: maskRects.bottom.height }} />
          </>
        )}
      </div>

      {capture && !draft && (
        <button
          className="sc-capture-btn"
          style={{ left: capture.buttonX, top: capture.buttonY - 44 }}
          onClick={startDraft}
        >
          +
        </button>
      )}
    </div>
  )
}

/**
 * One page's raster, rendered by pdf.js at `res` canvas pixels per canvas
 * unit. Re-renders happen into an offscreen canvas and land in one synchronous
 * resize-and-blit, so the previous raster stays on screen (CSS-stretched)
 * until the sharper one replaces it — no blank flash mid-render.
 */
function PageRaster({ pdf, pageNumber, cssW, cssH, res }: {
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
      const off = document.createElement('canvas')
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
      c.getContext('2d')!.drawImage(off, 0, 0)
    })().catch(() => { /* cancelled render tasks reject; nothing to do */ })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageNumber, cssW, res])

  return (
    <canvas
      ref={canvasRef}
      className="sc-raster"
      // Initial backing size only shapes the white placeholder; renders set
      // the real backing imperatively and React never writes these again.
      width={Math.round(cssW)}
      height={Math.round(cssH)}
      style={{ width: cssW }}
    />
  )
}

function ConceptCard({ style, byte, concept, registerEl, onEdit, onDelete }: {
  style: React.CSSProperties
  byte: Byte
  concept: Concept
  registerEl: (el: HTMLDivElement | null) => void
  onEdit: (id: string, data: Partial<{ label: string; def: string }>) => Promise<void>
  onDelete: (byte: Byte, label: string) => void
}) {
  // Local drafts of the fields, re-adopted from the graph whenever the saved
  // value changes underneath (e.g. the same concept edited from another card).
  const [label, setLabel] = useState(concept.label)
  const [def, setDef] = useState(concept.def ?? '')
  const [prevLabel, setPrevLabel] = useState(concept.label)
  const [prevDef, setPrevDef] = useState(concept.def ?? '')
  if (prevLabel !== concept.label) {
    setPrevLabel(concept.label)
    setLabel(concept.label)
  }
  if (prevDef !== (concept.def ?? '')) {
    setPrevDef(concept.def ?? '')
    setDef(concept.def ?? '')
  }

  // The definition saves while you type (700ms pause) — it isn't identity, so
  // partial states are harmless. The name commits on blur/Enter only: labels
  // are concept identity (spec §2) and mid-typed names would collide and spam
  // rename events into the graph history.
  useEffect(() => {
    if (def === (concept.def ?? '')) return
    const t = window.setTimeout(() => onEdit(concept.id, { def }), 700)
    return () => window.clearTimeout(t)
  }, [def, concept.id, concept.def, onEdit])

  return (
    <div className="sc-card" ref={registerEl} style={style}>
      <button
        className="sc-card-close"
        aria-label={`Remove highlight for ${concept.label}`}
        onClick={() => onDelete(byte, concept.label)}
      >
        ×
      </button>
      <div className="sc-card-title">
        <textarea
          value={label}
          rows={1}
          placeholder="concept name"
          onChange={e => setLabel(e.target.value.replace(/\n/g, ''))}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
          onBlur={() => {
            const v = label.trim()
            if (v && v !== concept.label) onEdit(concept.id, { label: v })
            else setLabel(concept.label)
          }}
        />
      </div>
      <textarea
        className="sc-card-def"
        value={def}
        placeholder="working definition"
        rows={1}
        onChange={e => setDef(e.target.value)}
        onBlur={() => { if (def !== (concept.def ?? '')) onEdit(concept.id, { def }) }}
      />
    </div>
  )
}

function DraftCard({ style, registerEl, onCommit, onUpdate, onClose }: {
  style: React.CSSProperties
  registerEl: (el: HTMLDivElement | null) => void
  onCommit: (label: string, def: string) => Promise<{ id: string; label: string; def: string }>
  onUpdate: (conceptId: string, data: Partial<{ label: string; def: string }>) => Promise<void>
  onClose: () => void
}) {
  const elRef = useRef<HTMLDivElement | null>(null)
  const [label, setLabel] = useState('')
  const [def, setDef] = useState('')
  const [error, setError] = useState<string | null>(null)
  const savedRef = useRef<{ id: string; label: string; def: string } | null>(null)
  const committingRef = useRef(false)

  const commit = useCallback(async (lbl: string, d: string) => {
    if (committingRef.current || savedRef.current || !lbl.trim()) return
    committingRef.current = true
    try {
      savedRef.current = await onCommit(lbl, d)
      setError(null)
      // If focus left while the save was in flight, hand over to the saved card.
      const el = elRef.current
      if (el && !el.contains(document.activeElement)) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not save')
    } finally {
      committingRef.current = false
    }
  }, [onCommit, onClose])

  // Save-while-editing: a 700ms pause commits the draft once it has a name;
  // after that the definition keeps saving on the same pause. The card swaps
  // to its saved form only when focus leaves, so the caret never jumps.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = savedRef.current
      if (!s) void commit(label, def)
      else if (def !== s.def) {
        s.def = def
        void onUpdate(s.id, { def })
      }
    }, 700)
    return () => window.clearTimeout(t)
  }, [label, def, commit, onUpdate])

  // Unmounting (back to library, closing the canvas) with a named, uncommitted
  // draft fires the save rather than dropping the student's typing.
  const latest = useRef({ label, def, commit })
  useEffect(() => {
    latest.current = { label, def, commit }
  })
  useEffect(() => () => {
    const { label: l, def: d, commit: c } = latest.current
    if (!savedRef.current && l.trim()) void c(l, d)
  }, [])

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    const s = savedRef.current
    if (s) {
      const v = label.trim()
      if (v && v !== s.label) {
        s.label = v
        void onUpdate(s.id, { label: v })
      }
      onClose()
    } else if (label.trim()) {
      void commit(label, def) // hands over on resolve — focus is already gone
    } else {
      onClose() // nameless and abandoned: discard
    }
  }

  return (
    <div
      className="sc-card sc-card-draft"
      ref={el => { elRef.current = el; registerEl(el) }}
      style={style}
      onBlur={handleBlur}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose() // committed work stays; an unnamed draft is discarded
        }
      }}
    >
      <div className="sc-card-title">
        <textarea
          autoFocus
          value={label}
          rows={1}
          placeholder="concept name"
          onChange={e => setLabel(e.target.value.replace(/\n/g, ''))}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
        />
      </div>
      <textarea
        className="sc-card-def"
        value={def}
        placeholder="working definition"
        rows={1}
        onChange={e => setDef(e.target.value)}
      />
      {error && <div className="sc-card-error">{error}</div>}
    </div>
  )
}

const scStyles = `
.sc-root {
  position: fixed;
  inset: 0;
  background: var(--paper);
  z-index: 5000;
  display: flex;
  flex-direction: column;
}
.sc-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 12px;
  border-bottom: 1px solid var(--rule);
  background: var(--paper-2);
  z-index: 10;
}
/* .btn.mini ships min-height:36px — that, not padding, was the bar's height */
.sc-topbar .btn { padding: 4px 9px; min-height: 0; }
.sc-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc-topbar-right { display: flex; align-items: center; gap: 14px; }
.sc-indicator { min-width: 130px; text-align: right; }
.sc-toggle {
  display: flex;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 1px;
}
.sc-toggle .btn { border: none; margin: 0; padding: 4px 9px; }
.sc-viewport {
  position: relative;
  flex: 1;
  overflow: hidden;
  touch-action: none;
  cursor: default;
}
.sc-viewport[data-mode="freeform"] { cursor: grab; }
.sc-viewport[data-mode="freeform"]:active { cursor: grabbing; }
.sc-canvas {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.sc-page {
  background: #fff;
  box-shadow: 0 2px 14px rgba(0,0,0,0.10);
}
.sc-raster { display: block; height: auto; }
/* The text layer overlays the raster; the Page div itself paints nothing. */
.sc-page .react-pdf__Page {
  position: absolute;
  inset: 0;
  background: transparent;
}
.sc-page .react-pdf__Page__textContent span { pointer-events: auto; }
.sc-overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}
.sc-hl { fill: rgba(255, 204, 0, 0.35); }
.sc-hl-draft { fill: rgba(111, 125, 92, 0.30); }
.sc-leader {
  stroke: var(--rule);
  stroke-width: 1.2;
  fill: none;
}
.sc-card {
  position: absolute;
  background: var(--paper-2);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 8px 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-sizing: border-box;
}
.sc-card-draft { border-color: var(--sage); }
/* The title alone counter-scales (via font-size, so it stays real layout and
   the card grows to hold it) and concept names remain legible however far the
   canvas is zoomed out; the rest of the card shrinks with the page. */
.sc-card-title textarea {
  width: 100%;
  border: none;
  background: transparent;
  font-family: var(--display);
  font-size: calc(15px * var(--invk, 1));
  font-weight: 600;
  line-height: 1.2;
  color: var(--ink);
  padding: 0;
  outline: none;
  resize: none;
  field-sizing: content;
  /* One line when one line is enough, growing to four; longer names scroll.
     min-height beats globals.css's blanket textarea { min-height: 62px }. */
  min-height: 0;
  max-height: 4.8em;
  overflow-y: auto;
  box-sizing: border-box;
}
.sc-card-title textarea::placeholder { color: var(--ink-soft); font-weight: 400; }
.sc-card-def {
  width: 100%;
  border: none;
  border-top: 1px solid var(--rule);
  background: transparent;
  font-family: var(--body);
  font-size: 13px;
  line-height: 1.4;
  color: var(--ink);
  padding: 6px 0 0;
  outline: none;
  resize: none;
  field-sizing: content;
  min-height: 0;
  box-sizing: border-box;
}
.sc-card-close {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--rule);
  background: var(--paper);
  color: var(--ink-soft);
  font-size: 10px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.sc-card-close:hover {
  background: var(--red);
  border-color: var(--red);
  color: var(--paper);
}
.sc-card-title { padding-right: 14px; }
.sc-card-error { font-size: 11px; color: var(--red); }
.sc-mask {
  position: absolute;
  background: var(--paper);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sc-mask-left { left: 0; top: 0; bottom: 0; }
.sc-mask-right { top: 0; bottom: 0; }
.sc-nav {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.sc-nav:hover:not(:disabled) { background: rgba(0,0,0,0.05); color: var(--ink); }
.sc-nav:disabled { opacity: 0.12; cursor: not-allowed; }
.sc-capture-btn {
  position: fixed;
  transform: translateX(-50%);
  z-index: 9000;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  background-color: var(--ochre);
  color: #000;
  border: none;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}
.sc-capture-btn:hover { opacity: 0.88; }
.sc-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
`
