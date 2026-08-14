"use client";

/**
 * The matrix as a spread canvas: the whole document laid out as 2-page
 * spreads on a near-square grid under ONE zoom/pan transform — Lingxiu's
 * spread canvas (origin/spread-canvas-reading, reverted by 41d5b50), rebuilt
 * as the matrix's rendering rather than a second surface beside it.
 *
 * What carries over from the branch: spreadLayout's grid, the imperative
 * transform (pan/zoom never re-renders forty pdf pages per frame), the
 * Figma-style trackpad wheel handling, the settle-then-retarget rastering,
 * and the counter-scaling cards — `--invk` keeps concept titles at reading
 * size however far out you zoom, and cards grow inward over their own pages,
 * so at full zoom-out you are reading concepts, not the shrunken text.
 *
 * What deliberately does NOT carry over: the single/spread reading modes,
 * masks and snap-to-page (01 · Reading's page mode already IS the focused
 * spread — one answer per question), and the branch's own capture path (the
 * text layers here are ordinary react-pdf layers inside `.pdf-stage`, so the
 * viewer's one selection handler, one CaptureModal and one ReuseOffer serve
 * this view like every other — the 2.1 invariant).
 *
 * All geometry is derived for display and discarded (red line #7). Cards are
 * read-only doors to Your work, exactly as in page mode.
 */

import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { select, pointer } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type D3ZoomEvent, type ZoomTransform } from "d3-zoom";
import PageSlot, { type PageTier } from "./PageSlot";
import { type PdfDoc } from "./PageRaster";
import { spreadLayout, pageX } from "@/lib/spreadLayout";
import { layoutRail, railScale } from "@/lib/railLayout";
import { short } from "@/lib/clothMath";
import type { Concept, Passage } from "@/lib/types";

const CARD_GAP = 12;
const CARD_FALLBACK_H = 88;
const MEASURE_MS = 120;
const SETTLE_MS = 200;
const MAX_RES = 8;
/**
 * The LOD thresholds and budgets.
 *
 * TEXT_TIER_MIN_W: apparent on-screen page width (CSS px) below which no text
 * layer mounts. Under ~240px a page's body text is beneath legibility, so
 * selection is not a real activity there — and NOT mounting text is the whole
 * economy: a 132-page scan at fit-all otherwise carries ~47,000 positioned
 * spans for pages rendered 61px wide.
 *
 * TEXT_MOUNT_PAGES / DEMOTE_MARGIN_PAGES: how far beyond the view text
 * layers mount and how much further they survive. Mounting runs AHEAD of a
 * pan (1.5 pages of lead) so a page's text is live before the reader
 * arrives, and demotion trails well behind (6 pages) — hysteresis wide
 * enough that panning around a neighbourhood never mounts and unmounts the
 * same page per settle, which read as popping. A kept page is ~360 spans;
 * a dozen kept pages are noise next to the 47,000 this replaced.
 *
 * RASTER_BUDGET: total canvas pixels across all native-tier pages. pdf.js's
 * viewer caps a single canvas; a tiled view needs a cap on the SUM — six
 * pages at res 8 on a large stage is otherwise a quarter-gigabyte of RGBA
 * re-blitted per settle. When the in-view set would exceed it, the shared
 * res steps down; sharpness degrades before memory does. Only pages within
 * half a page of the view sharpen at all — text mounts wide, pixels stay
 * narrow.
 */
const TEXT_TIER_MIN_W = 240;
const TEXT_MOUNT_PAGES = 1.5;
const DEMOTE_MARGIN_PAGES = 6;
const RASTER_BUDGET = 72e6;

/** One page's manifest facts, as the viewer's props carry them. */
export type ManifestPage = {
  pageNumber: number;
  width: number | null;
  height: number | null;
  textLength: number;
};

type Anchor = {
  spreadIdx: number;
  side: "left" | "right";
  /** Canvas-unit coordinates — transform-independent, so zoom never forces a re-measure. */
  midY: number;
  edgeX: number;
};

export default function SpreadCanvasView({
  pdf,
  numPages,
  basePageWidth,
  aspect,
  manifest,
  pageImageBase,
  stage,
  stageEl,
  cardsOn,
  passages,
  concepts,
  onOpenPassage,
  onAspect,
  zoomMultiplier,
  onZoomMultiplier,
  onZoomRange,
  focusPage,
  fitNonce,
  onTransform,
}: {
  pdf: PdfDoc | null;
  numPages: number;
  /** Page width in canvas units — the width text layers render at, once. */
  basePageWidth: number;
  aspect: number;
  /** Per-page dimensions and text lengths, when the reading has them stored.
   *  With this the grid is exact from the first frame — no aspect feedback,
   *  no re-layout as pages load. */
  manifest?: { pageCount: number; pages: ManifestPage[] } | null;
  /** `/api/readings/{id}/pages`, or null when there is nothing to serve. */
  pageImageBase: string | null;
  stage: { w: number; h: number };
  stageEl: HTMLDivElement | null;
  cardsOn: boolean;
  passages: Passage[];
  concepts: Concept[];
  onOpenPassage?: (passageId: string) => void;
  onAspect: (a: number) => void;
  /** The toolbar slider's value: 1 = the whole canvas fits the stage. */
  zoomMultiplier: number;
  onZoomMultiplier: (m: number) => void;
  /** Reports this document's zoom ceiling (a multiplier), so the toolbar's
   *  + button and the gesture extent can never disagree about the top. */
  onZoomRange?: (max: number) => void;
  /** "Go to this page": a CHANGE here centers that page at the current zoom.
   *  The scroll-based effect the other views use cannot serve a transformed
   *  canvas — its scrollIntoView would shift a hidden-overflow box by an
   *  offset the transform never learns about. */
  focusPage?: number;
  /** Fit, unconditionally: a CHANGE here refits and recenters even when the
   *  multiplier already reads 1 — the state can be stale mid-gesture (the
   *  settle sync is 200ms behind), and a panned-but-unzoomed view has
   *  nothing else to recenter it. */
  fitNonce?: number;
  /** Fires on every transform write — the viewer re-seats anything it
   *  positioned in viewport coordinates (the floating capture button). */
  onTransform?: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const tref = useRef<ZoomTransform>(zoomIdentity);
  const zbRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  // The smoothed wheel: notches move the target, the rAF loop chases it.
  const wheelTarget = useRef(1);
  const wheelAnchor = useRef<[number, number]>([0, 0]);
  const wheelFrame = useRef(0);
  const initedRef = useRef(false);
  const [pageView, setPageView] = useState<Record<number, { tier: Exclude<PageTier, "impostor">; res: number }>>({});
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  // The whole-document sheet 404s until its first compose lands (readings
  // ingested before it existed); the slots' own images carry the view then.
  // Loaded is tracked too: a slot only defers to the sheet once the sheet
  // has actual pixels to defer to.
  const [sheetFailed, setSheetFailed] = useState(false);
  const [sheetLoaded, setSheetLoaded] = useState(false);

  // The manifest's facts, keyed for the render and the anchor fallback.
  const pageInfo = useMemo(() => {
    const map = new Map<number, { aspect: number | null; textLength: number }>();
    for (const page of manifest?.pages ?? []) {
      map.set(page.pageNumber, {
        aspect: page.width && page.height ? page.height / page.width : null,
        textLength: page.textLength,
      });
    }
    return map;
  }, [manifest]);

  // The grid cell's aspect: the TALLEST page when the manifest knows them all
  // (so no page overflows its row), the shared guess otherwise. With a
  // manifest this never moves — which is precisely what ends the aspect
  // storm: no page load can re-lay the grid.
  const gridAspect = useMemo(() => {
    let max = 0;
    for (const info of pageInfo.values()) {
      if (info.aspect && info.aspect > max) max = info.aspect;
    }
    return max > 0 ? max : aspect;
  }, [pageInfo, aspect]);

  const basePageHeight = basePageWidth * gridAspect;
  // Rails are ALWAYS reserved, cards on or off (TJ, 2026-08-10: hiding cards
  // must not change the matrix layout) — toggling draws into standing margins
  // instead of re-laying the grid and re-centering under the reader's eye.
  const layout = useMemo(
    () => (numPages > 0 && basePageWidth > 0 ? spreadLayout(numPages, basePageWidth, basePageHeight, true) : null),
    [numPages, basePageWidth, basePageHeight]
  );

  // 1 on the slider = the whole canvas in view; the counter-scale reference is
  // the two-page fit, so "reading size" means the same thing as page mode.
  const fitAllK = useMemo(
    () => (layout && stage.w > 0 ? Math.min(stage.w / (layout.canvasW + 24), stage.h / (layout.canvasH + 24)) : 1),
    [layout, stage.w, stage.h]
  );
  const spreadFitK = useMemo(
    () => (layout && stage.w > 0 ? Math.min((stage.w - 16) / layout.unitW, (stage.h - 24) / layout.unitH) : 1),
    [layout, stage.w, stage.h]
  );

  /**
   * The zoom ceiling, as a multiple of fit-all — and the reason it cannot BE
   * a fixed multiple of fit-all: fit-all shrinks as documents grow, so
   * "8 × fit" reached print size on a 9-page paper and stalled at barely
   * reading size on a 132-page scan (TJ, 2026-08-14: "the zoom seems
   * constrained"). The ceiling is anchored to the spread instead — deep
   * enough that a QUARTER of one spread fills the stage, whatever the
   * document's length — and expressed as a multiplier only because the
   * toolbar, the gesture extent and the settle sync all speak that unit.
   * Those three and the wheel clamp must all use THIS number: the extent and
   * the clamp disagreeing is the yank-back bug the old comment warned about.
   */
  const maxMultiplier = useMemo(
    () => (fitAllK > 0 ? Math.max(8, Math.ceil((spreadFitK * 4) / fitAllK)) : 8),
    [fitAllK, spreadFitK]
  );

  /**
   * The overview map — the "you are here" inset every deep-zoom surface
   * grows once it can out-zoom its own fit (maps, Figma, Miro; TJ asked for
   * it 2026-08-14, the same day the ceiling rose). Geometry only: the canvas
   * scaled into a corner box, spread cells drawn schematically (at ~2% scale
   * a page image is noise; a cell is a fact), and a viewport rect written
   * imperatively from applyTransform so it can never lag the real view.
   */
  const minimap = useMemo(() => {
    if (!layout) return null;
    const scale = Math.min(168 / layout.canvasW, 112 / layout.canvasH);
    return { scale, w: Math.ceil(layout.canvasW * scale), h: Math.ceil(layout.canvasH * scale) };
  }, [layout]);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const minimapViewRef = useRef<HTMLDivElement | null>(null);

  // The latest of everything the imperative handlers need, without
  // re-registering them (the branch's resDeps pattern).
  const live = useRef({ layout, stage, fitAllK, spreadFitK, maxMultiplier, minimap, basePageWidth, zoomMultiplier, onZoomMultiplier, onTransform });
  useEffect(() => {
    live.current = { layout, stage, fitAllK, spreadFitK, maxMultiplier, minimap, basePageWidth, zoomMultiplier, onZoomMultiplier, onTransform };
  });

  // Tell the toolbar how far + may go for THIS document.
  useEffect(() => {
    onZoomRange?.(maxMultiplier);
  }, [maxMultiplier, onZoomRange]);

  // Read by retargetView's hysteresis without re-registering it.
  const pageViewRef = useRef<Record<number, { tier: Exclude<PageTier, "impostor">; res: number }>>({});

  /**
   * Space-to-pan — the whiteboard convention (FigJam, Miro, Photoshop all
   * agree on this one): hold space and the pointer becomes a hand, so a drag
   * pans from ANYWHERE, page text included; release and the text cursor is
   * back. A held mode, not a toggle — it cannot strand anyone in a pan tool.
   * Without it, panning at reading zoom meant hunting for a gutter, because
   * the text layers cover the pages and a drag on them selects (TJ,
   * 2026-08-14).
   *
   * The guard leaves space alone when focus sits on anything interactive —
   * an input takes the character, a focused button takes the click; only the
   * unfocused reading surface gives space to the hand.
   */
  const spaceHeld = useRef(false);
  useEffect(() => {
    const setHeld = (on: boolean) => {
      if (spaceHeld.current === on) return;
      spaceHeld.current = on;
      viewportRef.current?.classList.toggle("space-pan", on);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat) return;
      const active = document.activeElement as HTMLElement | null;
      const interactive =
        !!active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.tagName === "BUTTON" ||
          active.tagName === "A" ||
          active.tagName === "SUMMARY" ||
          active.isContentEditable);
      if (interactive) return;
      e.preventDefault();
      setHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setHeld(false);
    };
    // A window blur mid-hold (alt-tab with space down) would otherwise leave
    // the hand stuck on with no keyup ever arriving.
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setHeld(false);
    };
  }, []);

  /**
   * After a settle: decide what every page IS at this zoom — the LOD ladder.
   *
   * Below reading zoom nothing is promoted at all: every page is its
   * pre-rendered image (the impostor), which is how a 132-page contact sheet
   * costs 132 cached thumbnails instead of 132 live pages. At reading zoom,
   * pages near the viewport mount their text layer over the larger image; at
   * native zoom the pdf.js raster joins them, at a res that respects the
   * total pixel budget. Analytic, off the layout — no DOM sweep. Pages keep
   * their promotion until they are DEMOTE_MARGIN_PAGES beyond the promote
   * margin, so panning along a boundary does not churn text layers.
   */
  const retargetView = useCallback(() => {
    const { layout, stage, basePageWidth } = live.current;
    if (!layout || stage.w === 0) return;
    const t = tref.current;
    const dpr = window.devicePixelRatio || 1;
    let target = Math.max(1, Math.min(MAX_RES, Math.ceil(t.k * dpr * 2) / 2));
    const apparentW = t.k * basePageWidth;

    const inRegion = (p: number, s: (typeof layout.spreads)[number], margin: number) => {
      const px = pageX(layout, s, p, basePageWidth);
      const vx = -t.x / t.k - margin;
      const vy = -t.y / t.k - margin;
      const vw = stage.w / t.k + margin * 2;
      const vh = stage.h / t.k + margin * 2;
      return px < vx + vw && px + basePageWidth > vx && s.y < vy + vh && s.y + layout.unitH > vy;
    };

    const next: Record<number, { tier: Exclude<PageTier, "impostor">; res: number }> = {};
    if (apparentW >= TEXT_TIER_MIN_W) {
      // Three rings. Text mounts out to mountMargin — AHEAD of a pan, so a
      // page is selectable before the reader reaches it. It survives out to
      // keepMargin. Native pixels are spent only inside resMargin: text is
      // cheap enough to carry wide, rasters are not.
      const mountMargin = basePageWidth * TEXT_MOUNT_PAGES;
      const keepMargin = basePageWidth * DEMOTE_MARGIN_PAGES;
      const resMargin = basePageWidth / 2;
      const mounted: number[] = [];
      const sharp: number[] = [];
      for (const s of layout.spreads) {
        for (const p of s.rightPage ? [s.leftPage, s.rightPage] : [s.leftPage]) {
          const inMount = inRegion(p, s, mountMargin);
          const held = !inMount && pageViewRef.current[p] && inRegion(p, s, keepMargin);
          if (inMount || held) {
            mounted.push(p);
            if (inRegion(p, s, resMargin)) sharp.push(p);
          }
        }
      }
      // The budget: native rasters cost pageArea × res² each. Step the shared
      // res down until the sharp set fits.
      if (target > 1 && sharp.length > 0) {
        const pageArea = basePageWidth * layout.unitH;
        const maxRes = Math.sqrt(RASTER_BUDGET / (sharp.length * pageArea));
        target = Math.max(1, Math.min(target, Math.floor(maxRes * 2) / 2));
      }
      const sharpSet = new Set(sharp);
      for (const p of mounted) {
        next[p] =
          target > 1 && sharpSet.has(p)
            ? { tier: "native", res: target }
            : { tier: "reading", res: 1 };
      }
    }

    pageViewRef.current = next;
    // A transition, deliberately: promoting a handful of pages mounts text
    // layers and rasters in one commit, and as an urgent update that commit
    // landed BETWEEN pan frames — the hang TJ felt. Interruptible, it yields
    // to the next pointer event and the pan stays fluid; the text arrives a
    // frame or two later, which the mount margin already hides.
    startTransition(() => {
      setPageView((prev) => {
        const nk = Object.keys(next);
        if (
          Object.keys(prev).length === nk.length &&
          nk.every((k) => prev[+k] && prev[+k].tier === next[+k].tier && prev[+k].res === next[+k].res)
        ) {
          return prev;
        }
        return next;
      });
    });
  }, []);

  const applyTransform = useCallback((t: ZoomTransform) => {
    tref.current = t;
    const el = canvasRef.current;
    if (!el) return;
    el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    el.style.setProperty("--invk", String(Math.max(1, live.current.spreadFitK / t.k)));
    // The minimap rides the same write: overview + detail must never drift,
    // so the view-rect is imperative like the canvas — zero React per frame.
    // Visible only when there is somewhere else to be: at fit-all the rect
    // IS the map, and a map of where-you-already-are is furniture.
    const mm = live.current.minimap;
    const mapEl = minimapRef.current;
    const viewEl = minimapViewRef.current;
    if (mm && mapEl && viewEl) {
      const { stage } = live.current;
      const vw = (stage.w / t.k) * mm.scale;
      const vh = (stage.h / t.k) * mm.scale;
      viewEl.style.transform = `translate(${(-t.x / t.k) * mm.scale}px, ${(-t.y / t.k) * mm.scale}px)`;
      viewEl.style.width = `${vw}px`;
      viewEl.style.height = `${vh}px`;
      mapEl.style.visibility = vw >= mm.w - 1 && vh >= mm.h - 1 ? "hidden" : "visible";
    }
    live.current.onTransform?.();
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      retargetView();
      // Keep the toolbar slider honest about where a gesture left the zoom.
      const { fitAllK, maxMultiplier, zoomMultiplier, onZoomMultiplier } = live.current;
      const m = Math.min(maxMultiplier, Math.max(0.5, Math.round((tref.current.k / fitAllK) * 10) / 10));
      if (Math.abs(m - zoomMultiplier) > 0.05) onZoomMultiplier(m);
    }, SETTLE_MS);
  }, [retargetView]);

  // --- the zoom behaviour: always freeform ---
  // will-change lives only around movement: standing, it makes Chrome scale
  // a once-rasterized bitmap of the whole canvas (pixelated cards and
  // pages); absent, every pan frame re-rasters (jank). The release is
  // DELAYED, not immediate: d3 ends a wheel gesture 150ms after the last
  // notch, and zb.transform emits a start/end pair per call, so an eager
  // removal made every scroll burst de-promote and re-rasterize the whole
  // canvas between notches — the jerk TJ felt. The hint now survives a
  // burst and lets go 300ms after the last write.
  const hintTimer = useRef<number | undefined>(undefined);
  const hintOn = useCallback(() => {
    window.clearTimeout(hintTimer.current);
    canvasRef.current?.style.setProperty("will-change", "transform");
  }, []);
  const hintRelease = useCallback(() => {
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(
      () => canvasRef.current?.style.removeProperty("will-change"),
      300
    );
  }, []);
  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  useEffect(() => {
    zbRef.current = zoom<HTMLDivElement, unknown>()
      .on("start.raster", hintOn)
      .on("end.raster", hintRelease)
      .filter((e: Event & { button?: number }) => {
        // A MOUSE drag that starts on page text selects text — but only a
        // mouse drag: on touch, selection is long-press, not drag, so
        // filtering touchstart here left phones with no way to pan a zoomed
        // canvas at all (text layers cover the whole page and touch-action is
        // none). Touch pans everywhere; a tap on a card still clicks it.
        // With SPACE held the hand owns every mouse drag — text and cards
        // included; that is the whole point of the mode.
        const t = e.target as HTMLElement;
        if (e.type === "mousedown" && spaceHeld.current) return !e.button;
        if (e.type === "mousedown" && t.closest(".react-pdf__Page__textContent")) return false;
        if ((e.type === "mousedown" || e.type === "touchstart") && t.closest(".pdf-railcard")) return false;
        return !e.button;
      })
      .on("zoom", (e: D3ZoomEvent<HTMLDivElement, unknown>) => applyTransform(e.transform));
  }, [applyTransform, hintOn, hintRelease]);

  useEffect(() => {
    const zb = zbRef.current;
    if (!zb || !layout || stage.w === 0) return;
    const pad = layout.spreadGap * 4;
    // The gesture range IS the slider range — [0.5, maxMultiplier] × fit-all,
    // exactly. A gesture ceiling wider than the settle sync's clamp would let
    // a pinch rest where the slider clamps lower, and the slider effect would
    // then yank the view back out on its own — the extent and the clamp must
    // never disagree, which is why both read maxMultiplier.
    zb.scaleExtent([fitAllK * 0.5, fitAllK * maxMultiplier])
      .translateExtent([[-pad, -pad], [layout.canvasW + pad, layout.canvasH + pad]]);
  }, [layout, stage.w, fitAllK, maxMultiplier]);

  useEffect(() => {
    const el = viewportRef.current;
    const zb = zbRef.current;
    if (!el || !zb) return;
    const sel = select(el);
    sel.call(zb);
    sel.on("dblclick.zoom", null); // double-click zoom jumps are hostile mid-reading
    // Wheel = zoom at the cursor, drag = pan — the map-canvas idiom (TJ,
    // 2026-08-10). But NOT d3's default wheel handler: that one applies each
    // wheel notch instantly, a ~15% scale snap per click of the wheel, which
    // reads as jerky. Each notch here moves a TARGET; a rAF loop eases the
    // real transform toward it, anchored at the cursor — the Google-Maps
    // feel. A trackpad pinch (ctrl+wheel by convention) rides the same path
    // with d3's own 10x factor so pinching stays 1:1 rather than glacial.
    sel.on("wheel.zoom", null);
    sel.on("wheel.smooth", (e: WheelEvent) => {
      e.preventDefault();
      const { fitAllK, maxMultiplier } = live.current;
      const mult = e.deltaMode === 1 ? 0.05 : 0.002; // line-scrolling mice report lines
      const factor = Math.pow(2, -e.deltaY * mult * (e.ctrlKey || e.metaKey ? 10 : 1));
      if (!wheelFrame.current) wheelTarget.current = tref.current.k;
      wheelTarget.current = Math.max(
        fitAllK * 0.5,
        Math.min(fitAllK * maxMultiplier, wheelTarget.current * factor)
      );
      wheelAnchor.current = pointer(e, el);
      hintOn();
      if (!wheelFrame.current) {
        const tick = () => {
          const zbNow = zbRef.current;
          const elNow = viewportRef.current;
          if (!zbNow || !elNow) { wheelFrame.current = 0; return; }
          const t = tref.current;
          const target = wheelTarget.current;
          // Exponential chase: ~4 frames to close most of the gap.
          const next = t.k + (target - t.k) * 0.35;
          const done = Math.abs(target - next) / target < 0.002;
          const k = done ? target : next;
          const [px, py] = wheelAnchor.current;
          // The canvas point under the cursor stays under the cursor.
          zbNow.transform(select(elNow), zoomIdentity
            .translate(px - (px - t.x) * (k / t.k), py - (py - t.y) * (k / t.k))
            .scale(k));
          wheelFrame.current = done ? 0 : requestAnimationFrame(tick);
          if (done) hintRelease();
        };
        wheelFrame.current = requestAnimationFrame(tick);
      }
    });
    return () => {
      sel.on(".zoom", null);
      sel.on("wheel.smooth", null);
      cancelAnimationFrame(wheelFrame.current);
      wheelFrame.current = 0;
    };
  }, [layout != null]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A programmatic transform owns the canvas: the wheel's chase loop must
   *  stand down first, or it keeps steering toward its stale target and
   *  Fit/goto lose the race one frame later. */
  const cancelWheel = useCallback(() => {
    cancelAnimationFrame(wheelFrame.current);
    wheelFrame.current = 0;
  }, []);

  /**
   * Click (or drag) the overview: the view centre goes to that canvas point
   * at the CURRENT zoom — navigation, never a zoom change. Driven through
   * zb.transform so the translate extent still constrains it and every
   * consumer of the transform (raster retarget, slider sync, the capture
   * button's reposition) hears about it the ordinary way.
   */
  const onMinimapPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = minimapRef.current;
    const zb = zbRef.current;
    const vp = viewportRef.current;
    const mm = live.current.minimap;
    if (!el || !zb || !vp || !mm) return;
    e.preventDefault();
    cancelWheel();
    const moveTo = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      const cx = (clientX - r.left) / mm.scale;
      const cy = (clientY - r.top) / mm.scale;
      const { stage } = live.current;
      const k = tref.current.k;
      zb.transform(select(vp), zoomIdentity.translate(stage.w / 2 - cx * k, stage.h / 2 - cy * k).scale(k));
    };
    moveTo(e.clientX, e.clientY);
    el.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => moveTo(ev.clientX, ev.clientY);
    const done = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", done);
      el.removeEventListener("pointercancel", done);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", done);
    el.addEventListener("pointercancel", done);
  }, [cancelWheel]);

  /** Set k = m·fitAllK, keeping the canvas point at the stage centre fixed. */
  const applyMultiplier = useCallback((m: number, recenter = false) => {
    cancelWheel();
    const el = viewportRef.current;
    const zb = zbRef.current;
    const { layout, stage, fitAllK } = live.current;
    if (!el || !zb || !layout || stage.w === 0) return;
    const k = m * fitAllK;
    const t = tref.current;
    let t2: ZoomTransform;
    if (recenter || !initedRef.current) {
      t2 = zoomIdentity
        .translate((stage.w - layout.canvasW * k) / 2, (stage.h - layout.canvasH * k) / 2)
        .scale(k);
    } else {
      const cx = (stage.w / 2 - t.x) / t.k;
      const cy = (stage.h / 2 - t.y) / t.k;
      t2 = zoomIdentity.translate(stage.w / 2 - cx * k, stage.h / 2 - cy * k).scale(k);
    }
    zb.transform(select(el), t2);
  }, [cancelWheel]);

  // First fit, and the toolbar's − / + / Fit. The 0.05 tolerance breaks the
  // loop with the settle-time sync above. Fit (exactly 1) recenters: "1 =
  // everything in view" means centered, not wherever the zoom-out landed.
  useEffect(() => {
    if (!layout || stage.w === 0) return;
    if (!initedRef.current) {
      applyMultiplier(zoomMultiplier, true);
      initedRef.current = true;
      return;
    }
    if (Math.abs(zoomMultiplier - tref.current.k / fitAllK) > 0.05) {
      applyMultiplier(zoomMultiplier, zoomMultiplier === 1);
    }
  }, [zoomMultiplier, layout, stage.w, fitAllK, applyMultiplier]);

  // A resize or a rail toggle moves every coordinate: keep the multiplier,
  // re-center the canvas.
  const geomKey = `${stage.w}x${stage.h}:${layout?.canvasW ?? 0}x${layout?.canvasH ?? 0}`;
  const prevGeom = useRef(geomKey);
  useEffect(() => {
    if (prevGeom.current === geomKey) return;
    prevGeom.current = geomKey;
    if (initedRef.current) applyMultiplier(live.current.zoomMultiplier, true);
  }, [geomKey, applyMultiplier]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // Fit, driven by its own nonce so it can never be a no-op against stale
  // state (see the prop's comment).
  const prevFit = useRef(fitNonce);
  useEffect(() => {
    if (prevFit.current === fitNonce) return;
    prevFit.current = fitNonce;
    if (initedRef.current) applyMultiplier(1, true);
  }, [fitNonce, applyMultiplier]);

  // "Go to this page" — a CHANGE in focusPage (a Find hit, a passage's goto)
  // centers that page's spot at the current zoom. Entering the matrix does
  // not jump: the ref starts at whatever page the reading was already on.
  const prevFocus = useRef(focusPage);
  useEffect(() => {
    if (prevFocus.current === focusPage) return;
    prevFocus.current = focusPage;
    if (!focusPage || !layout || !initedRef.current) return;
    const el = viewportRef.current;
    const zb = zbRef.current;
    if (!el || !zb) return;
    const s = layout.spreads[Math.floor((focusPage - 1) / 2)];
    if (!s) return;
    const { stage, basePageWidth } = live.current;
    const k = tref.current.k;
    const cx = pageX(layout, s, focusPage, basePageWidth) + basePageWidth / 2;
    const cy = s.y + layout.unitH / 2;
    cancelWheel();
    zb.transform(select(el), zoomIdentity.translate(stage.w / 2 - cx * k, stage.h / 2 - cy * k).scale(k));
  }, [focusPage, layout, cancelWheel]);

  /** Render-queue priority: this page's distance from the CURRENT viewport
   *  centre, in canvas units — sampled when a render slot frees, so the
   *  nearest waiting page always sharpens first however the view has moved
   *  since it queued. Stable identity; reads only refs. */
  const renderPriority = useCallback((p: number) => {
    const { layout, stage, basePageWidth } = live.current;
    if (!layout || stage.w === 0) return 0;
    const t = tref.current;
    const s = layout.spreads[Math.floor((p - 1) / 2)];
    if (!s) return 0;
    const cx = pageX(layout, s, p, basePageWidth) + basePageWidth / 2;
    const cy = s.y + layout.unitH / 2;
    const vx = (stage.w / 2 - t.x) / t.k;
    const vy = (stage.h / 2 - t.y) / t.k;
    return Math.hypot(cx - vx, cy - vy);
  }, []);

  // --- pages ---
  const pagesEl = useMemo(() => {
    if (!layout) return null;
    return layout.spreads.flatMap((s) =>
      (s.rightPage ? [s.leftPage, s.rightPage] : [s.leftPage]).map((p) => (
        <div
          key={p}
          className="pdf-spread-page"
          style={{ position: "absolute", left: pageX(layout, s, p, basePageWidth), top: s.y, width: basePageWidth }}
        >
          <PageSlot
            pageNumber={p}
            width={basePageWidth}
            aspect={gridAspect}
            root={stageEl}
            eager={p === 1}
            onAspect={onAspect}
            label
            pdf={pdf}
            baseWidth={basePageWidth}
            res={pageView[p]?.res ?? 1}
            tier={pageView[p]?.tier ?? "impostor"}
            pageAspect={pageInfo.get(p)?.aspect ?? null}
            pageImageBase={pageImageBase}
            sheetBehind={sheetLoaded && !sheetFailed}
            priority={renderPriority}
          />
        </div>
      ))
    );
  }, [layout, pdf, basePageWidth, gridAspect, stageEl, onAspect, pageView, pageInfo, pageImageBase, sheetLoaded, sheetFailed, renderPriority]);

  // --- cards: anchors off the mark.js layer, in canvas units ---
  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const { layout, basePageWidth } = live.current;
    if (!canvas || !layout) return;
    const k = tref.current.k;
    if (k === 0) return;
    const next: Record<string, Anchor> = {};
    for (const mark of canvas.querySelectorAll<HTMLElement>(".loom-passage-highlight")) {
      const id = mark.getAttribute("data-loom-passage-id");
      if (!id || next[id]) continue;
      const pageEl = mark.closest<HTMLElement>(".react-pdf__Page");
      const pageNum = Number(pageEl?.getAttribute("data-page-number"));
      if (!pageEl || !pageNum) continue;
      const rect = mark.getClientRects()[0];
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      const spreadIdx = Math.floor((pageNum - 1) / 2);
      const s = layout.spreads[spreadIdx];
      if (!s) continue;
      const side: Anchor["side"] = pageNum % 2 === 1 ? "left" : "right";
      const pr = pageEl.getBoundingClientRect();
      const px = pageX(layout, s, pageNum, basePageWidth);
      next[id] = {
        spreadIdx,
        side,
        midY: s.y + (rect.top + rect.height / 2 - pr.top) / k,
        edgeX: px + ((side === "left" ? rect.left : rect.right) - pr.left) / k,
      };
    }
    setAnchors((prev) => {
      const pk = Object.keys(prev);
      const nk = Object.keys(next);
      if (
        pk.length === nk.length &&
        nk.every((id) => {
          const a = prev[id];
          const b = next[id];
          return a && a.side === b.side && a.spreadIdx === b.spreadIdx &&
            Math.abs(a.midY - b.midY) < 0.5 && Math.abs(a.edgeX - b.edgeX) < 0.5;
        })
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!cardsOn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, MEASURE_MS);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(canvas, { childList: true, subtree: true });
    schedule();
    return () => {
      window.clearTimeout(timer);
      mo.disconnect();
    };
  }, [cardsOn, measure, passages]);

  const cardEls = useRef(new Map<string, HTMLElement>());
  const cardIdByEl = useRef(new Map<Element, string>());
  const cardRO = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const next: Record<string, number> = {};
      for (const [el, id] of cardIdByEl.current) next[id] = (el as HTMLElement).offsetHeight;
      setCardHeights((prev) => {
        const nk = Object.keys(next);
        if (Object.keys(prev).length === nk.length && nk.every((id) => prev[id] === next[id])) return prev;
        return next;
      });
    });
    cardRO.current = ro;
    return () => ro.disconnect();
  }, []);
  const registerCard = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      cardEls.current.set(id, el);
      cardIdByEl.current.set(el, id);
      cardRO.current?.observe(el);
    } else {
      const old = cardEls.current.get(id);
      if (old) {
        cardRO.current?.unobserve(old);
        cardIdByEl.current.delete(old);
        cardEls.current.delete(id);
      }
    }
  }, []);

  /**
   * Anchors for passages whose page has NO live text layer — every impostor
   * page, which at fit-all is every page. The exact anchor comes off the
   * rendered mark's rect; this one is arithmetic: the passage's start offset
   * as a fraction of the page's text, placed down the page's height. Wrong by
   * a line or two, invisible at the zooms where impostors exist — and the
   * cards this feeds are exactly the concept-map reading of the far zoom
   * (cards counter-scale; a fit-all matrix with Cards on reads as concepts
   * over pages). Before this, cards existed only because every page carried
   * a text layer; the LOD ladder removes those, so the cards needed their own
   * geometry. DOM-measured anchors win wherever both exist.
   */
  const analyticAnchors = useMemo(() => {
    const out: Record<string, Anchor> = {};
    if (!cardsOn || !layout || pageInfo.size === 0) return out;
    for (const passage of passages) {
      const p = passage.pageNumber;
      if (!p || passage.startOffset == null) continue;
      const info = pageInfo.get(p);
      if (!info || info.textLength <= 0) continue;
      const spreadIdx = Math.floor((p - 1) / 2);
      const s = layout.spreads[spreadIdx];
      if (!s) continue;
      const side: Anchor["side"] = p % 2 === 1 ? "left" : "right";
      const pageH = basePageWidth * (info.aspect ?? gridAspect);
      const frac = Math.min(1, Math.max(0, passage.startOffset / info.textLength));
      out[passage.id] = {
        spreadIdx,
        side,
        midY: s.y + frac * pageH,
        edgeX: pageX(layout, s, p, basePageWidth) + (side === "left" ? 0 : basePageWidth),
      };
    }
    return out;
  }, [cardsOn, layout, pageInfo, passages, basePageWidth, gridAspect]);

  const mergedAnchors = useMemo(
    () => ({ ...analyticAnchors, ...anchors }),
    [analyticAnchors, anchors]
  );

  const cards = useMemo(() => {
    if (!cardsOn || !layout) return [];
    const out: { passage: Passage; concepts: Concept[]; anchor: Anchor }[] = [];
    for (const passage of passages) {
      const anchor = mergedAnchors[passage.id];
      if (!anchor) continue;
      out.push({
        passage,
        concepts: passage.conceptIds
          .map((id) => concepts.find((c) => c.id === id))
          .filter((c): c is Concept => !!c),
        anchor,
      });
    }
    return out.sort((a, b) => a.anchor.midY - b.anchor.midY);
  }, [cardsOn, layout, passages, concepts, mergedAnchors]);

  const placement = useMemo(() => {
    const tops: Record<string, number> = {};
    const scales: Record<string, number> = {};
    if (!layout) return { tops, scales };
    const groups = new Map<string, typeof cards>();
    for (const c of cards) {
      const key = `${c.anchor.spreadIdx}:${c.anchor.side}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    for (const group of groups.values()) {
      const spreadY = layout.spreads[group[0].anchor.spreadIdx].y;
      const hs = group.map((c) => cardHeights[c.passage.id] ?? CARD_FALLBACK_H);
      const s = railScale(hs, CARD_GAP, layout.unitH);
      const placed = layoutRail(
        group.map((c, i) => ({
          id: c.passage.id,
          desired: c.anchor.midY - spreadY - (hs[i] * s) / 2,
          h: hs[i] * s,
        })),
        layout.unitH,
        CARD_GAP * s
      );
      for (const c of group) {
        tops[c.passage.id] = spreadY + placed[c.passage.id];
        scales[c.passage.id] = s;
      }
    }
    return { tops, scales };
  }, [cards, cardHeights, layout]);

  if (!layout) return null;

  return (
    <>
    <div className="pdf-spread-viewport" ref={viewportRef}>
      <div
        className="pdf-spread-canvas"
        ref={canvasRef}
        style={{ width: layout.canvasW, height: layout.canvasH }}
      >
        {/* The tile above the page: the whole contact sheet as ONE image,
            under every slot. At fit the matrix is readable the moment this
            one cached fetch paints; the slots' own thumbs then cover their
            cells with the same pixels as they arrive. Stretched to the
            client layout's box — the ~0.1% proportional drift between the
            server's compose and this layout is beneath notice at any zoom
            where the sheet is still visible. */}
        {pageImageBase && !sheetFailed && (
          <img
            className="pdf-spread-sheet"
            src={`${pageImageBase}/sheet`}
            alt=""
            draggable={false}
            decoding="async"
            onLoad={() => setSheetLoaded(true)}
            onError={() => setSheetFailed(true)}
            style={{ position: "absolute", left: 0, top: 0, width: layout.canvasW, height: layout.canvasH }}
          />
        )}
        {pagesEl}

        {cardsOn && (
          <svg className="pdf-rail-leaders" width={layout.canvasW} height={layout.canvasH} aria-hidden="true">
            {cards.map((c) => {
              const id = c.passage.id;
              const top = placement.tops[id];
              if (top == null) return null;
              const s = layout.spreads[c.anchor.spreadIdx];
              const cs = placement.scales[id] ?? 1;
              const h = (cardHeights[id] ?? CARD_FALLBACK_H) * cs;
              const x2 = c.anchor.side === "left" ? s.x + layout.railW : s.x + layout.unitW - layout.railW;
              return <path key={id} d={`M ${c.anchor.edgeX} ${c.anchor.midY} L ${x2} ${top + h / 2}`} />;
            })}
          </svg>
        )}

        {cardsOn && (
          <div className="pdf-spread-rails">
            {cards.map((c) => {
              const id = c.passage.id;
              const s = layout.spreads[c.anchor.spreadIdx];
              const cs = placement.scales[id] ?? 1;
              const first = c.concepts[0];
              const chips = c.concepts.slice(1);
              const name = first ? first.label : "Unlabeled passage";
              // Cards keep their rail-edge anchor and grow inward — over their
              // own page — as the canvas zooms out (width rides --invk), so at
              // full zoom-out you are reading concepts, not the shrunken text.
              // Both offsets set explicitly: the shared .pdf-railcard class
              // says left:0/right:0 (correct inside page mode's rail), and an
              // over-constrained absolute box resolves left+width and IGNORES
              // right — which pinned every right-side card to the canvas's
              // left edge until the unused side was released with "auto".
              const style: React.CSSProperties = {
                top: placement.tops[id] ?? s.y,
                width: `min(calc(${layout.railW}px * var(--invk, 1)), ${layout.railW + layout.gap + basePageWidth}px)`,
                transform: cs < 1 ? `scale(${cs})` : undefined,
                transformOrigin: c.anchor.side === "left" ? "top left" : "top right",
                ...(c.anchor.side === "left"
                  ? { left: s.x, right: "auto" }
                  : { right: layout.canvasW - (s.x + layout.unitW), left: "auto" }),
              };
              return (
                <div
                  key={id}
                  ref={(el) => registerCard(id, el)}
                  className="pdf-railcard"
                  style={style}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${name} in your work`}
                  onClick={() => onOpenPassage?.(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenPassage?.(id);
                    }
                  }}
                >
                  <div className={`pdf-railcard-label${first ? "" : " unlabeled"}`}>{name}</div>
                  {chips.length > 0 && (
                    <div className="pdf-railcard-chips">
                      {chips.map((chip) => (
                        <span key={chip.id} className="pdf-railcard-chip">{chip.label}</span>
                      ))}
                    </div>
                  )}
                  {first?.def ? <div className="pdf-railcard-def">{short(first.def, 140)}</div> : null}
                  {!first && <div className="pdf-railcard-def">{short(c.passage.content, 110)}</div>}
                  {c.passage.note ? <div className="pdf-railcard-note">{short(c.passage.note, 110)}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    {minimap && (
      // The overview inset. aria-hidden and unfocusable by design: it is a
      // pointer shortcut over state the toolbar (+/−/Fit) and the transform
      // already expose; a keyboard reader loses nothing. Starts hidden —
      // applyTransform shows it the moment the view is smaller than the map.
      <div
        className="pdf-minimap"
        ref={minimapRef}
        style={{ width: minimap.w, height: minimap.h, visibility: "hidden" }}
        onPointerDown={onMinimapPointerDown}
        aria-hidden="true"
        data-testid="matrix-minimap"
      >
        <svg width={minimap.w} height={minimap.h} aria-hidden="true">
          {layout.spreads.flatMap((s) =>
            (s.rightPage ? [s.leftPage, s.rightPage] : [s.leftPage]).map((p) => (
              <rect
                key={p}
                x={pageX(layout, s, p, basePageWidth) * minimap.scale}
                y={s.y * minimap.scale}
                width={basePageWidth * minimap.scale}
                height={layout.unitH * minimap.scale}
              />
            ))
          )}
        </svg>
        {/* The sheet doubles as the minimap's texture — real pages over the
            schematic cells, which remain the fallback while it loads or if
            it 404s (a reading the compose has not reached yet). */}
        {pageImageBase && !sheetFailed && (
          <img
            className="pdf-minimap-img"
            src={`${pageImageBase}/sheet`}
            alt=""
            draggable={false}
            decoding="async"
            onError={() => setSheetFailed(true)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          />
        )}
        <div className="pdf-minimap-view" ref={minimapViewRef} />
      </div>
    )}
    </>
  );
}
