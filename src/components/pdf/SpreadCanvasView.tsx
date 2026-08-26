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
 * and the counter-scaling cards — `--k` holds a card at the size page mode
 * draws it however far you zoom, and cards grow inward over their own pages,
 * so at full zoom-out you are reading concepts, not the shrunken text.
 *
 * What deliberately does NOT carry over: the single/spread reading modes,
 * masks and snap-to-page (01 · Reading's page mode already IS the focused
 * spread — one answer per question). The branch's inline draft capture DID
 * land here (2026-08-19): the text layers are ordinary react-pdf layers inside
 * `.pdf-stage`, and what serves this view is the viewer's one selection
 * handler, one shared CaptureFields (drawn as the rail's draft card) and one
 * ReuseOffer — the 2.1 invariant is one shared reuse seam, not one modal.
 *
 * All geometry is derived for display and discarded (red line #7). The card
 * body is shared with page mode; this host owns its Canvas threshold,
 * counter-scale, position and leader.
 */

import React, { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { select, pointer } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type D3ZoomEvent, type ZoomTransform } from "d3-zoom";
import PageSlot, { type PageTier } from "./PageSlot";
import { type PdfDoc } from "./PageRaster";
import { spreadLayout, pageX } from "@/lib/spreadLayout";
import { layoutRail, railScale } from "@/lib/railLayout";
import { heatBand } from "@/lib/heatRects";
import { RailCardBody, RAIL_W } from "./ConceptRail";
import AddConceptCard from "@/components/cards/AddConceptCard";
import type { Concept, Passage } from "@/lib/types";

const CARD_GAP = 12;
const CARD_FALLBACK_H = 88;
/**
 * WHERE EDITING STOPS, MEASURED AGAINST THE SPREAD — not against one page.
 *
 * TJ, 2026-08-19: "here I am in canvas mode looking at a 2 page spread, I
 * expect the passage cards to look just as they would in the 2 page view in
 * terms of detail and editability and text selection. what am I missing?"
 *
 * Nothing — this was wrong. It was set earlier the same day against a page and
 * the rail beside it (1.35 page widths, so the line went at 1.6), which fixed
 * the case it was looking at: you could not read a page and edit its cards at
 * once. But a SPREAD with its two rails is `layout.unitW` = 2.72 page widths,
 * so viewing the thing this canvas is built out of still landed outside the
 * editable band. The unit was the mistake, not the margin.
 *
 * So the test is now against `spreadFitK` — the scale at which one spread
 * fills the stage — and that is a better rule than either number, for a reason
 * neither of them had: it is the same line counter-scaling begins at
 * (formerly `--invk`'s switch-on point; that variable was deleted 2026-08-19
 * and everything divides by `--k` now).
 * Counter-scaling begins the moment you zoom out past spread-fit, so the
 * invariant is now legible in one sentence — a card is editable exactly while
 * it is not being shrunk to stay readable. A counter-scaled card is a marker
 * on a map; a full-size one is a card beside a page, and page mode's 2-page
 * view is that same view by another route.
 *
 * It also fixes a case the width test could not express at all. spreadFitK is
 * `min(width fit, height fit)`, so on a tall page the spread fits by HEIGHT and
 * the viewport is then wider than unitW — the old comparison called that
 * zoomed-out and locked the cards, at the exact zoom the reader would call a
 * two-page spread.
 *
 * EDIT_FROM_SPREAD is a hair inside the fit, because landing exactly on a
 * threshold is how a card ends up read-only on one frame and editable the next.
 * EDITOR_CLOSE_AT keeps the old gap: one clamped pinch notch scales k by 1.149
 * (measured — see ZOOM_STEP_CLAMP), so 0.95 / 1.149^3 = 0.63 is three
 * deliberate notches, and a single slip cannot tear down an open editor.
 *
 * Between the two, a card shows no + and no ×, but an editor already open stays
 * open. That asymmetry is intended: opening new edits out there is the thing TJ
 * ruled against (2026-08-17, "zoomed out editing these things is a bad idea");
 * discarding a half-typed concept is not the same act.
 */
const EDIT_FROM_SPREAD = 0.95;
const EDITOR_CLOSE_AT = 0.63;
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

/**
 * Trackpad normalisation, for the wheel handler below.
 *
 * A WheelEvent's units are not pixels by contract — they depend on
 * `deltaMode` — and the same physical gesture reports differently per
 * browser. One mouse notch is deltaMode 0 deltaY 100 in Chrome and Edge and
 * deltaMode 1 deltaY 3 in Firefox on Windows, which is why a line is worth
 * 100/3 px here rather than a text line's height: the point of the constant
 * is that one notch moves the canvas the same distance in both browsers, not
 * that a line is 33px of anything. A trackpad reports in pixel mode too,
 * but as many small deltas per second rather than one large one per notch.
 *
 * ZOOM_STEP_CLAMP is the largest normalised delta ONE event may zoom by. It
 * exists for the wheel: a notch normalises to ~100, and unclamped that is a
 * 4x jump out of a single click of it — the defect that got the first
 * attempt at this idiom refused (docs/ui-cleanup-pass-1.md, item 12).
 *
 * It does not have to tell a pinch from a wheel to be safe for both, which
 * is why it is a clamp and not a device test. A pinch under the clamp passes
 * through untouched; a fast one above it is capped PER EVENT and still
 * compounds over the dozens of events a gesture sends, so it reaches the
 * ceiling in a fraction of a second either way. What a real trackpad's
 * per-frame deltas actually are is NOT verified here — this harness
 * synthesises wheel events and has no trackpad — and the clamp is chosen so
 * that it does not need to be.
 *
 * ZOOM_PER_PX is unchanged from the wheel-zoom this replaces, whose ctrl
 * branch was `2^(-deltaY × 0.002 × 10)` — so the pinch feel is the one that
 * was already here, and a clamped mouse notch lands on 2^0.2, the same ~15%
 * per notch that idiom gave a bare wheel.
 *
 * Both numbers are measured, not predicted: matrix-zoom.spec.ts was run with
 * the clamp in place and with it raised out of reach, and one deltaY-100 notch
 * moved the scale 1.149× clamped and 4.000× unclamped. The spec asserts the
 * clamped figure, so the 4× is a regression the suite catches rather than a
 * number in a comment.
 */
const LINE_PX = 100 / 3;
const ZOOM_STEP_CLAMP = 10;
const ZOOM_PER_PX = 0.02;

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

/** One rectangle mark.js actually painted, in canvas units. A passage that
 *  crosses lines is several of these, and mark.js may split one passage over
 *  several elements, so a passage owns a list rather than a box. */
type MarkRect = { x: number; y: number; w: number; h: number };
/** A heat rect carries its step, so the wash deepens with the count the same
 *  way the live text layer's `data-heat` does. */
type HeatMark = MarkRect & { level: number };

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
  onOpenConcept,
  onUnfile,
  onRemovePassage,
  onCreateConcept,
  onAddConcept,
  onEditConcept,
  onEditNote,
  draft,
  onAspect,
  heatRects = {},
  heatMax = 1,
  heatPeers = 0,
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
  /** A badge's destination: Your work, at that concept. */
  onOpenConcept?: (conceptId: string) => void;
  /** Take one concept off this passage, in place. */
  onUnfile?: (passageId: string, conceptId: string) => void;
  /** Delete the capture, after the shared confirm — see useRemovePassage. */
  onRemovePassage?: (passage: Passage) => void;
  onCreateConcept?: (label: string, def?: string) => Promise<Concept>;
  onAddConcept?: (passageId: string, conceptId: string) => Promise<Passage>;
  /** Fill a reused concept's empty description — see cards/AddConceptCard. */
  onEditConcept?: (conceptId: string, data: { def: string }) => Promise<void>;
  /** Write the passage's note from the card. Changes a card's height when it
   *  opens and closes, so the rail re-packs then and not while typing. */
  onEditNote?: (passageId: string, note: string) => void;
  /**
   * A capture in progress. The host places it like any other card — the
   * viewer has already painted a highlight on the selection under this
   * passage's id, so the anchor sweep found it the ordinary way — and knows
   * nothing about what the card contains. See PdfViewer's DRAFT_ID.
   */
  draft?: { passage: Passage; card: React.ReactNode } | null;
  onAspect: (a: number) => void;
  /** The toolbar's zoom multiplier (− / + / Fit drive it): 1 = the whole canvas fits the stage. */
  /**
   * WHERE THE COHORT MARKED, as rectangles normalized to the page box (0..1
   * on both axes), keyed by page number.
   *
   * Projected in the host from the overlay's character offsets — see
   * src/lib/heatRects.ts — which is what lets the canvas draw real passages
   * at fit-all, where no page has a text layer to walk (TJ, 2026-08-22: "i
   * want to be able to look at the canvas and see where everyone has been").
   * Normalized rather than in canvas units so this view can scale them to
   * whatever it happens to be drawing a page at, and so the same numbers
   * serve the paged views.
   */
  heatRects?: Record<number, { x: number; y: number; w: number; h: number; count: number }[]>;
  /** The densest run in the reading — the top of the shading scale. */
  heatMax?: number;
  /** How many people the band holds. One has no convergence to grade, so
   *  their marks sit at the top of their own scale — see heatBand. */
  heatPeers?: number;
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
  /** The rectangles mark.js painted, kept after the text layer that carried
   *  them is gone. See the merge in `measure`. */
  const [markRects, setMarkRects] = useState<Record<string, MarkRect[]>>({});
  /**
   * The same trick for SEARCH hits, keyed by page rather than by passage id
   * because a search mark has no identity — it is a word, not an object.
   *
   * Without this the canvas told two different stories at once (TJ,
   * 2026-08-19): zoom out to fit-all and every passage highlight survives, redrawn
   * from remembered geometry, while every search mark vanishes — and the panel
   * goes on listing the hits. Seven pages match, the drawing shows none.
   */
  const [searchRects, setSearchRects] = useState<Record<number, MarkRect[]>>({});

  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [passageCardHeights, setPassageCardHeights] = useState<Record<string, number>>({});
  const [activeAddPassageId, setActiveAddPassageId] = useState<string | null>(null);
  const restoreAddFocusFor = useRef<string | null>(null);
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

  // Multiplier 1 = the whole canvas in view; the counter-scale reference is
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
  /** Is the pointer on the canvas? See the space guard below. */
  const overRef = useRef(false);
  useEffect(() => {
    const setHeld = (on: boolean) => {
      if (spaceHeld.current === on) return;
      spaceHeld.current = on;
      viewportRef.current?.classList.toggle("space-pan", on);
    };
    /**
     * SPACE PANS WHEN THE POINTER IS ON THE READING (TJ, 2026-08-19: "when I
     * am over selectable text and press spacebar I should see the drag icon,
     * right? not the cursor?").
     *
     * It did not, and the CSS was never the reason — the .space-pan rules were
     * always there. The class simply never went on, because this guard treated
     * a focused BUTTON as "somebody is using the keyboard". Measured: on
     * arrival document.activeElement is the station nav button, so space-pan
     * was dead from the moment the reading opened and stayed dead until you
     * happened to click something that took focus to BODY. With focus blurred
     * it worked perfectly, which is why it looked intermittent rather than
     * broken.
     *
     * Text entry still wins outright and always will: a space typed into a
     * note is a space, never a pan. What changed is the button half. Space on
     * a focused control is a real activation and a keyboard user needs it, so
     * it is not simply dropped — it yields only while the POINTER is over the
     * reading surface, which is the one moment the reader has plainly said
     * where their attention is. A keyboard user with the mouse parked
     * elsewhere keeps space for the button, as they should.
     */
    const typing = (el: Element | null) =>
      !!el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat) return;
      if (typing(document.activeElement)) return;
      if (!overRef.current) return;
      e.preventDefault();
      setHeld(true);
    };
    const el = viewportRef.current;
    const onEnter = () => { overRef.current = true; };
    const onLeave = () => { overRef.current = false; setHeld(false); };
    el?.addEventListener("pointerenter", onEnter);
    el?.addEventListener("pointerleave", onLeave);
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
      el?.removeEventListener("pointerenter", onEnter);
      el?.removeEventListener("pointerleave", onLeave);
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

  // Whether more than one page is in view — see applyTransform.
  const wideRef = useRef(true);
  const [seesMoreThanASpread, setSeesMoreThanAPage] = useState(true);
  /** Tracks EDITOR_CLOSE_AT independently of the read-only flip above. */
  const farOutRef = useRef(true);

  const applyTransform = useCallback((t: ZoomTransform) => {
    tref.current = t;
    const el = canvasRef.current;
    if (!el) return;
    /**
     * "MORE THAN A SPREAD IN VIEW" — the line editing stops at (TJ, 2026-08-17:
     * "maybe at 'i see more than a page' no editing").
     *
     * It is the honest threshold because it is the reader's own experience of
     * the canvas rather than a number: while one page fills the view you are
     * reading a text and the card beside it is a margin note; once two pages
     * are in view you are reading a map, the cards are counter-scaled markers
     * over thumbnails, and a × is one mis-click from a pan.
     *
     * Comparing `t.k` against `spreadFitK` asks exactly that question — is
     * more than one spread in view. Set through state
     * only when it flips, because this runs on every pan frame.
     */
    const { spreadFitK: sfk } = live.current;
    if (sfk > 0) {
      const wide = t.k < sfk * EDIT_FROM_SPREAD;
      const farOut = t.k < sfk * EDITOR_CLOSE_AT;
      if (wide !== wideRef.current) {
        wideRef.current = wide;
        startTransition(() => setSeesMoreThanAPage(wide));
      }
      if (farOut !== farOutRef.current) {
        farOutRef.current = farOut;
        if (farOut) {
          startTransition(() => {
            restoreAddFocusFor.current = null;
            setActiveAddPassageId(null);
          });
        }
      }
    }
    el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    /**
     * THE SCALE, and the only counter-scaling variable left.
     *
     * There were two. `--invk` was max(1, spreadFitK / k): clamped at 1, so it
     * held card text at reading size as you zoomed OUT and did nothing at all
     * as you zoomed IN — which is how a card on a spread came to be twice the
     * size of the identical card in page mode (TJ, 2026-08-19). Everything that
     * rode it now divides by `--k` instead, which governs both halves with one
     * rule: a length written in screen px stays that many screen px.
     *
     * So --invk had no consumers left and is gone rather than kept as a second
     * way to say a worse version of the same thing.
     */
    el.style.setProperty("--k", String(t.k));
    // The minimap rides the same write: overview + detail must never drift,
    // so the view-rect is imperative like the canvas — zero React per frame.
    //
    // IT STANDS AT EVERY ZOOM (TJ, 2026-08-19: "can we keep min map always
    // visible?"). It used to hide itself at fit-all, on the reasoning that the
    // rect then IS the map and a map of where-you-already-are is furniture.
    // True as far as it goes, and it cost more than it saved: the control
    // appeared and vanished as you crossed a threshold you could not see, so
    // the one surface that says where you are was missing exactly when a
    // reader new to the canvas went looking for it. A standing inset also
    // reads as part of the furniture rather than as a thing that comes and
    // goes, which is what it is.
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
      mapEl.style.visibility = "visible";
    }
    live.current.onTransform?.();
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      retargetView();
      // Keep the toolbar's multiplier honest about where a gesture left the zoom.
      const { fitAllK, maxMultiplier, zoomMultiplier, onZoomMultiplier } = live.current;
      const m = Math.min(maxMultiplier, Math.max(0.5, Math.round((tref.current.k / fitAllK) * 10) / 10));
      if (Math.abs(m - zoomMultiplier) > 0.05) onZoomMultiplier(m);
    }, SETTLE_MS);
  }, [retargetView]);

  /**
   * The ONE way this component writes a transform.
   *
   * `zb.transform()` does NOT run the behaviour's `constrain` — only the
   * gesture handlers do. In the installed d3-zoom (3.0.0, `src/zoom.js`)
   * every `constrain(` call site is inside `wheeled`, `mousemoved`,
   * `touchmoved` or the `scaleBy`/`scaleTo`/`translateBy` helpers;
   * `zoom.transform` goes straight to `gesture.zoom`, whose whole body is
   * `this.that.__zoom = transform` and an emit. So Fit, − / +, "go to this
   * page" and the wheel's own chase loop could each park the canvas where no
   * drag is able to put it, and where the next drag hauls it back in a frame.
   *
   * Measured on the running app at 1536x900 (Object Worlds, canvas plane
   * 2970x953, stage 1536x816): zoomed out to 0.51x fit the plane is 777x249,
   * smaller than the stage on both axes, so the translate extent allows
   * exactly one position — x=379.5 y=283.3. Clicking a passage row in Your
   * work left it at x=688.6 y=347.6, and the next drag snapped it back 300px.
   *
   * Passing every write through the behaviour's own constrain — with the
   * extent d3 computes for this element, since `.extent()` is never set here
   * and the default reads clientWidth/clientHeight — makes that position
   * unreachable instead of merely unlikely.
   */
  const writeTransform = useCallback((t: ZoomTransform) => {
    const el = viewportRef.current;
    const zb = zbRef.current;
    if (!el || !zb) return;
    zb.transform(
      select(el),
      zb.constrain()(t, [[0, 0], [el.clientWidth, el.clientHeight]], zb.translateExtent())
    );
  }, []);

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
        if ((e.type === "mousedown" || e.type === "touchstart") && t.closest(".pdf-railcard-stack")) return false;
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
    // a pinch rest where the multiplier clamps lower, and its effect would
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
    // Figma-style trackpad (TJ, 2026-08-19, taking docs/ui-cleanup-pass-1.md
    // §12 — which refused the first attempt "as written", not the idiom):
    // two-finger scroll PANS, and only a pinch — ctrl/meta+wheel, which is how
    // every browser reports one — ZOOMS at the cursor. d3-zoom's own wheel
    // handler treats every wheel event as a zoom, so it is unbound.
    //
    // Both paths normalise deltaMode before reading a delta; see LINE_PX and
    // ZOOM_STEP_CLAMP above for why raw deltaY cannot be trusted and what the
    // clamp is protecting.
    sel.on("wheel.zoom", null);
    sel.on("wheel.figma", (e: WheelEvent) => {
      e.preventDefault();
      const { fitAllK, maxMultiplier, stage } = live.current;
      const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? stage.h : 1;

      if (!(e.ctrlKey || e.metaKey)) {
        // PAN — 1:1 and deliberately NOT eased. A two-finger drag is direct
        // manipulation: the canvas has to sit under the fingers, and the chase
        // loop the zoom uses below would leave it a frame or two behind them,
        // which is the "floaty" feel easing a pan always buys. A mouse notch
        // moves ~100px at once here, exactly as it does in any scroll
        // container; that is a scroll, not a jerk.
        //
        // Through the behaviour's own translateBy, so the translate extent
        // constrains it (writeTransform documents why bypassing it is a bug),
        // applyTransform still runs, and the will-change raster hint still
        // rides the start/end pair translateBy emits. At fit-all the extent
        // pins the plane — everything is already in view, there is nowhere to
        // pan to — so nothing moves until a pinch has zoomed in.
        const k = tref.current.k;
        zb.translateBy(sel, (-e.deltaX * unit) / k, (-e.deltaY * unit) / k);
        return;
      }

      // ZOOM. Clamp the step, not the coefficient: a real pinch is already
      // under the clamp and keeps the feel it had, while every mouse notch is
      // capped at 2^0.2 = 1.15× however large its delta claims to be.
      const step = Math.max(-ZOOM_STEP_CLAMP, Math.min(ZOOM_STEP_CLAMP, e.deltaY * unit));
      const factor = Math.pow(2, -step * ZOOM_PER_PX);
      // Each event moves a TARGET; a rAF loop eases the real transform toward
      // it, anchored at the cursor. That is what keeps zoom smooth rather than
      // abrupt: a discrete mouse notch lands over ~10 frames instead of one,
      // and a continuous pinch pays about two frames of lag for it.
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
          // Read fresh every frame. A pan that landed between two frames is
          // already in tref, and deriving the new x/y from it is what lets a
          // pan and a still-easing zoom compose instead of fighting.
          const t = tref.current;
          const target = wheelTarget.current;
          // Exponential chase: ~4 frames to close most of the gap.
          const next = t.k + (target - t.k) * 0.35;
          const done = Math.abs(target - next) / target < 0.002;
          const k = done ? target : next;
          const [px, py] = wheelAnchor.current;
          // The canvas point under the cursor stays under the cursor.
          writeTransform(zoomIdentity
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
      sel.on("wheel.figma", null);
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
   * writeTransform, so the translate extent constrains it and every consumer
   * of the transform (raster retarget, slider sync, the capture button's
   * reposition) hears about it the ordinary way.
   *
   * This comment used to say `zb.transform` was what kept the extent honest.
   * It never did — see writeTransform for the d3 source that shows why.
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
      writeTransform(zoomIdentity.translate(stage.w / 2 - cx * k, stage.h / 2 - cy * k).scale(k));
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
  }, [cancelWheel, writeTransform]);

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
    writeTransform(t2);
  }, [cancelWheel, writeTransform]);

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
  /**
   * A DRAFT PULLS THE VIEW IN FAR ENOUGH TO WRITE IN IT (TJ, 2026-08-19).
   *
   * Zoomed out past the editable line (EDIT_FROM_SPREAD × spreadFitK) you
   * can still select words, but out there a card is a counter-scaled marker
   * over a thumbnail — a draft would open at a size nobody can type into. So
   * capture is allowed to move the view, and only capture: the reader asked
   * for the move by selecting the words and pressing the button.
   *
   * The target is spread-fit, which is why this lives here rather than in the
   * viewer — only this component knows `spreadFitK`. It sits a hair above
   * EDIT_FROM_SPREAD, because landing exactly on a threshold is how you get a
   * card that is read-only on one frame and editable the next.
   *
   * It runs ONCE per draft, on the id changing, and never while one is open:
   * re-centring under someone who has started typing would be its own bug.
   * A capture begun inside the editable band moves nothing.
   */
  const draftId = draft?.passage.id ?? null;
  const prevDraft = useRef<string | null>(null);
  useEffect(() => {
    if (prevDraft.current === draftId) return;
    prevDraft.current = draftId;
    if (!draftId || !layout || !initedRef.current) return;
    const { stage, fitAllK, maxMultiplier, spreadFitK } = live.current;
    if (stage.w === 0 || fitAllK === 0 || spreadFitK === 0) return;
    const k = tref.current.k;
    // Spread-fit exactly: the state the reader calls "a two-page spread", and
    // since 2026-08-19 the state in which cards are full-size and editable. It
    // sits a hair above EDIT_FROM_SPREAD rather than on it, so the draft never
    // opens on the threshold itself.
    const needed = spreadFitK;
    if (k >= needed) return; // already close enough to write
    const to = Math.min(needed, fitAllK * maxMultiplier);
    // Through the multiplier, not writeTransform: the toolbar's − / + / Fit and
    // the settle sync all speak that unit, and a zoom they cannot see is one
    // the settle sync will yank back on its next pass.
    onZoomMultiplier(Math.min(maxMultiplier, Math.round((to / fitAllK) * 10) / 10));
  }, [draftId, layout, onZoomMultiplier]);

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
    writeTransform(zoomIdentity.translate(stage.w / 2 - cx * k, stage.h / 2 - cy * k).scale(k));
  }, [focusPage, layout, cancelWheel, writeTransform]);

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
    const nextRects: Record<string, MarkRect[]> = {};
    for (const mark of canvas.querySelectorAll<HTMLElement>(".loom-passage-highlight")) {
      const id = mark.getAttribute("data-loom-passage-id");
      if (!id) continue;
      const pageEl = mark.closest<HTMLElement>(".react-pdf__Page");
      const pageNum = Number(pageEl?.getAttribute("data-page-number"));
      if (!pageEl || !pageNum) continue;
      const spreadIdx = Math.floor((pageNum - 1) / 2);
      const s = layout.spreads[spreadIdx];
      if (!s) continue;
      const side: Anchor["side"] = pageNum % 2 === 1 ? "left" : "right";
      const pr = pageEl.getBoundingClientRect();
      const px = pageX(layout, s, pageNum, basePageWidth);
      // EVERY rectangle of every fragment, not just the anchor's first one:
      // this is the shape the mark actually has, and it is what gets redrawn
      // once the text layer is gone.
      for (const r of mark.getClientRects()) {
        if (r.width === 0 && r.height === 0) continue;
        (nextRects[id] ??= []).push({
          x: px + (r.left - pr.left) / k,
          y: s.y + (r.top - pr.top) / k,
          w: r.width / k,
          h: r.height / k,
        });
      }
      // The anchor stays the FIRST fragment's first rect, as it always was:
      // the leader line has one place to land.
      if (next[id]) continue;
      const rect = mark.getClientRects()[0];
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      next[id] = {
        spreadIdx,
        side,
        midY: s.y + (rect.top + rect.height / 2 - pr.top) / k,
        edgeX: px + ((side === "left" ? rect.left : rect.right) - pr.left) / k,
      };
    }
    /**
     * KEEP WHAT WAS MEASURED (TJ, 2026-08-18: it works "at almost 'fit', but
     * zoom out just a touch more and it breaks").
     *
     * The break is a cliff, not a drift: retargetView promotes nothing at all
     * once `t.k * basePageWidth` falls under TEXT_TIER_MIN_W, so one notch
     * takes every page in the document to the impostor tier at once. No text
     * layer means mark.js has nothing to mark, and this sweep — which reads
     * the DOM — found nothing and REPLACED the anchors with nothing. Measured
     * on Object Worlds at 1920x1080: basePageWidth 453, so the threshold sits
     * at k = 0.530 against a Fit of k = 0.506 — 1.05x Fit. Fit itself is
     * already under it.
     *
     * These coordinates are canvas units, and the type says why that matters:
     * transform-independent. A rect measured at reading zoom is still true at
     * fit-all — the page it sits on is a thumbnail of the same plane. So the
     * measurement is kept rather than discarded, and both the mark and the
     * card's leader line go on using real geometry instead of falling back to
     * analyticAnchors, whose arithmetic assumes one column filling the sheet
     * and is wrong on these two-column readings.
     *
     * Merge, never replace. An empty sweep is "the text layer went away", not
     * "the passages went away".
     */
    setMarkRects((prev) => (Object.keys(nextRects).length === 0 ? prev : { ...prev, ...nextRects }));
    /**
     * Search hits, measured in the same pass and REPLACED per page rather than
     * merged. A page whose layer is up is the authority on its own hits: if the
     * reader has changed the query, yesterday's rects for that page are wrong,
     * and merging would leave them on screen for ever. A page whose layer is
     * gone is not in `seen` at all, so its remembered rects survive untouched —
     * which is the whole point.
     */
    const nextSearch: Record<number, MarkRect[]> = {};
    const seen = new Set<number>();
    for (const layerEl of canvas.querySelectorAll<HTMLElement>(".react-pdf__Page__textContent")) {
      const n = Number(layerEl.closest<HTMLElement>(".react-pdf__Page")?.getAttribute("data-page-number"));
      if (n) seen.add(n);
    }
    for (const mark of canvas.querySelectorAll<HTMLElement>(".loom-search-hit")) {
      const pageEl = mark.closest<HTMLElement>(".react-pdf__Page");
      const pageNum = Number(pageEl?.getAttribute("data-page-number"));
      if (!pageEl || !pageNum) continue;
      const s2 = layout.spreads[Math.floor((pageNum - 1) / 2)];
      if (!s2) continue;
      const pr = pageEl.getBoundingClientRect();
      const px = pageX(layout, s2, pageNum, basePageWidth);
      for (const r of mark.getClientRects()) {
        if (r.width === 0 && r.height === 0) continue;
        (nextSearch[pageNum] ??= []).push({
          x: px + (r.left - pr.left) / k,
          y: s2.y + (r.top - pr.top) / k,
          w: r.width / k,
          h: r.height / k,
        });
      }
    }
    setSearchRects((prev) => {
      const merged = { ...prev };
      for (const n of seen) delete merged[n];
      return { ...merged, ...nextSearch };
    });

    // Heat is NOT measured here. It arrives projected from the offsets
    // themselves (`heatRects`), so it does not depend on a page having been
    // rendered — which is the whole reason the canvas can show it.
    setAnchors((prev) => {
      if (Object.keys(next).length === 0) return prev;
      const merged = { ...prev, ...next };
      const pk = Object.keys(prev);
      const mk = Object.keys(merged);
      if (
        pk.length === mk.length &&
        mk.every((id) => {
          const a = prev[id];
          const b = merged[id];
          return a && a.side === b.side && a.spreadIdx === b.spreadIdx &&
            Math.abs(a.midY - b.midY) < 0.5 && Math.abs(a.edgeX - b.edgeX) < 0.5;
        })
      ) {
        return prev;
      }
      return merged;
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
  }, [cardsOn, measure, passages, geomKey]);

  /**
   * A kept measurement is only true while the plane it was measured on is.
   *
   * Canvas units survive zoom — that is the whole point of them — but NOT a
   * change of geometry: a resize or a rail toggle re-derives basePageWidth,
   * and `layout` with it, so every spread's x and y move and a stored rect
   * now points somewhere else. geomKey is the same signal the recentre uses.
   * Cleared rather than rescaled, because the sweep above re-measures on this
   * key and will refill it from the DOM wherever a text layer is still up.
   */
  const prevMeasureGeom = useRef(geomKey);
  useEffect(() => {
    if (prevMeasureGeom.current === geomKey) return;
    prevMeasureGeom.current = geomKey;
    setMarkRects({});
    setSearchRects({});
    setAnchors({});
  }, [geomKey]);

  const cardEls = useRef(new Map<string, HTMLElement>());
  const cardIdByEl = useRef(new Map<Element, string>());
  const cardRO = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const next: Record<string, number> = {};
      const nextPassageCards: Record<string, number> = {};
      for (const [el, id] of cardIdByEl.current) {
        const host = el as HTMLElement;
        next[id] = host.offsetHeight;
        /**
         * WHATEVER CARD THIS STACK HOLDS — `.pdf-railcard` OR the draft's own
         * `.pdf-draftcard`. Querying only the former meant the capture form
         * never measured: the lookup returned null, the leader fell back to
         * CARD_FALLBACK_H, and it aimed at `top + 44` on a form 263px tall.
         * Measured on the running app at 1536: the line ended 87px above the
         * card it was pointing at, in open space — which is what a reader sees
         * as a stray line when the form opens (TJ, 2026-08-26: "the multiple
         * leaders when i click things is not [desired]").
         */
        nextPassageCards[id] =
          host.querySelector<HTMLElement>(".pdf-railcard, .pdf-draftcard")?.offsetHeight ?? CARD_FALLBACK_H;
      }
      setCardHeights((prev) => {
        const nk = Object.keys(next);
        if (Object.keys(prev).length === nk.length && nk.every((id) => prev[id] === next[id])) return prev;
        return next;
      });
      setPassageCardHeights((prev) => {
        const nk = Object.keys(nextPassageCards);
        if (Object.keys(prev).length === nk.length && nk.every((id) => prev[id] === nextPassageCards[id])) return prev;
        return nextPassageCards;
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
   * (cards counter-scale; a fit-all canvas reads as concepts
   * over pages — the rails are always on). Before this, cards existed only because every page carried
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

  /**
   * The passage's mark, redrawn where the text layer that carried it is gone.
   *
   * Not an approximation of one: these are the rectangles mark.js painted,
   * measured off the real text and kept in canvas units (see `measure`). A
   * page whose text layer is up needs nothing here — the real highlight is on
   * screen, and drawing over it would double the wash. `pageView[p]` is
   * absent exactly when the slot is an impostor, since PageSlot mounts text
   * for the "reading" and "native" tiers only.
   *
   * A passage whose page has never been promoted this session has nothing
   * kept, so it stays unmarked down here. That is the honest state: nothing
   * has measured it yet, and the alternative — arithmetic off the manifest's
   * text length — draws two-column pages in the wrong place.
   */
  const keptMarks = useMemo(() => {
    const out: MarkRect[] = [];
    for (const passage of passages) {
      const p = passage.pageNumber;
      if (!p || pageView[p]) continue;
      const rects = markRects[passage.id];
      if (rects) out.push(...rects);
    }
    return out;
  }, [passages, pageView, markRects]);

  /** Search hits for pages whose text layer is gone — the same rule keptMarks
   *  uses, and the same reason: at fit-all nothing is mounted to carry them. */
  const keptSearchMarks = useMemo(() => {
    const out: MarkRect[] = [];
    for (const [page, rects] of Object.entries(searchRects)) {
      if (pageView[Number(page)]) continue;
      out.push(...rects);
    }
    return out;
  }, [searchRects, pageView]);

  /**
   * WHERE THE MARKS ARE, WITHOUT READING THE WORDS.
   *
   * Every marked run on every page, at whatever size the page is being drawn —
   * no text layer, no rendering, no zoom threshold. The projection arrives
   * normalized to the page box, so placing it is one multiply per rect against
   * the slot the layout already computed.
   *
   * This replaces two stopgaps and is the reason both could go: rects scraped
   * off a live text layer (which only pages you had visited ever had) and a
   * flat wash over any page that had marks but no measurement (which said
   * "something happened on this page" and nothing about where). At fit-all the
   * words are unreadable, but the SHAPE of a marked paragraph is not — that is
   * what a reader is looking at a 60-page contact sheet to see.
   *
   * Rects are in CANVAS units, like every other overlay here, so they shrink
   * with the page under the zoom transform rather than being re-derived per
   * zoom step — a marked line stays exactly as tall as the line it covers at
   * every scale, which is what makes a marked paragraph read as a block on a
   * 60-page contact sheet.
   */
  const heatMarks = useMemo(() => {
    if (!layout) return [];
    const out: HeatMark[] = [];
    for (const [page, rects] of Object.entries(heatRects)) {
      const p = Number(page);
      const s2 = layout.spreads[Math.floor((p - 1) / 2)];
      if (!s2 || !rects.length) continue;
      const px = pageX(layout, s2, p, basePageWidth);
      for (const r of rects) {
        out.push({
          x: px + r.x * basePageWidth,
          y: s2.y + r.y * layout.unitH,
          w: r.w * basePageWidth,
          h: r.h * layout.unitH,
          level: heatBand(r.count, heatMax, heatPeers),
        });
      }
    }
    return out;
  // `heatPeers` belongs here: it changes every level when the band is one
  // person (heatBand), so a scope change with the same rects and the same
  // max would otherwise redraw the previous scope's steps. Caught in
  // review on #34.
  }, [heatRects, heatMax, heatPeers, layout, basePageWidth]);

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
    // The draft sits in the same rail, packed and scaled with everything else
    // — it is a card about a passage, and the rail has no reason to treat it
    // differently until it is saved and becomes one of the others.
    if (draft && mergedAnchors[draft.passage.id]) {
      out.push({ passage: draft.passage, concepts: [], anchor: mergedAnchors[draft.passage.id] });
    }
    return out.sort((a, b) => a.anchor.midY - b.anchor.midY);
  }, [cardsOn, layout, passages, concepts, mergedAnchors, draft]);

  /**
   * STAGE TWO OF OPENING A DRAFT: put the words and the card you are about to
   * write in on screen together.
   *
   * The zoom effect above is stage one, and on its own it was the whole bug
   * (TJ, 2026-08-19: "i am in canvas mode, select text, tap capture passage,
   * and then it goes weird"). applyMultiplier holds the STAGE CENTRE fixed
   * while it changes k — correct for the toolbar's − / +, where the centre is
   * what you are looking at — so a capture taken from anything off-centre
   * zoomed toward a point the reader had not chosen and left the highlight,
   * and the card anchored to it, outside the view. Measured before this:
   * capture at ratio 2.18 landed the view at 1.52 with the draft card off
   * screen entirely.
   *
   * It cannot be done in stage one because there is nothing to aim at yet:
   * the anchor comes from a mark that is painted after the draft is set, and
   * measured after that. So this waits for the anchor to exist and then
   * centres once.
   *
   * The target is NOT the highlight — it is the midpoint between the highlight
   * and the outer edge of the rail its card sits in. Centring the highlight
   * alone puts the card half a rail off the edge on a narrow stage, which is
   * the same failure in a smaller size.
   */
  const centredDraft = useRef<string | null>(null);
  const draftAnchor = draft ? mergedAnchors[draft.passage.id] : undefined;
  useEffect(() => {
    if (!draftId) { centredDraft.current = null; return; }
    if (!draftAnchor || !layout || centredDraft.current === draftId) return;
    const el = viewportRef.current;
    if (!el || !initedRef.current) return;
    const { stage } = live.current;
    if (stage.w === 0) return;
    centredDraft.current = draftId;
    const s = layout.spreads[draftAnchor.spreadIdx];
    if (!s) return;
    const railOuter = draftAnchor.side === "left" ? s.x : s.x + layout.unitW;
    const cx = (railOuter + draftAnchor.edgeX) / 2;
    const cy = draftAnchor.midY;
    const k = tref.current.k;
    cancelWheel();
    writeTransform(zoomIdentity.translate(stage.w / 2 - cx * k, stage.h / 2 - cy * k).scale(k));
  }, [draftId, draftAnchor, layout, cancelWheel, writeTransform]);

  const closeAddConcept = useCallback((passageId: string) => {
    restoreAddFocusFor.current = passageId;
    setActiveAddPassageId(null);
  }, []);

  const toggleAddConcept = useCallback((passageId: string) => {
    setActiveAddPassageId((active) => active === passageId ? null : passageId);
  }, []);

  useLayoutEffect(() => {
    if (activeAddPassageId || !restoreAddFocusFor.current) return;
    const passageId = restoreAddFocusFor.current;
    restoreAddFocusFor.current = null;
    canvasRef.current
      ?.querySelector<HTMLButtonElement>(`[data-add-concept-for="${passageId}"]`)
      ?.focus();
  }, [activeAddPassageId]);

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
      // The PASSAGE card is centred on the highlight; the stack's full height
      // is what the rail packs against. Two numbers because they stopped being
      // the same the moment the editor could open below the card: centring the
      // stack lifted the passage card by half the editor's height (~95px at
      // 1536) and bent the leader that the leader path still aims at the
      // passage card's middle. See passageCardHeights, measured in the same RO.
      const ph = group.map((c) => passageCardHeights[c.passage.id] ?? CARD_FALLBACK_H);
      const s = railScale(hs, CARD_GAP, layout.unitH);
      const placed = layoutRail(
        group.map((c, i) => ({
          id: c.passage.id,
          desired: c.anchor.midY - spreadY - (ph[i] * s) / 2,
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
  }, [cards, cardHeights, passageCardHeights, layout]);

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

        {/* Over the pages, under the leaders and the cards: it is a mark ON
            the page, not furniture above it. aria-hidden like the leaders —
            the passage is reachable from its card and from Your work, and
            this is a redraw of a mark, not a second control. */}
        {/* The cohort's marks, painted BEFORE the passage marks so a capture
            still sits on top of the wash — the same order the live text layer
            uses, where heat is marked first and own highlights nest inside
            it. */}
        {heatMarks.length > 0 && (
          <svg className="pdf-kept-heat" width={layout.canvasW} height={layout.canvasH} aria-hidden="true">
            {heatMarks.map((m, i) => (
              <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} data-heat={m.level} />
            ))}
          </svg>
        )}

        {keptMarks.length > 0 && (
          <svg className="pdf-kept-marks" width={layout.canvasW} height={layout.canvasH} aria-hidden="true">
            {keptMarks.map((m, i) => (
              <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} />
            ))}
          </svg>
        )}

        {/* Redrawn search hits. Separate from the passage marks above because
            they are a different claim — that is a capture, this is a word you
            asked for — and because they come and go with the search while a
            passage stays. */}
        {keptSearchMarks.length > 0 && (
          <svg className="pdf-kept-search" width={layout.canvasW} height={layout.canvasH} aria-hidden="true">
            {keptSearchMarks.map((m, i) => (
              <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} />
            ))}
          </svg>
        )}

        {cardsOn && (
          <svg className="pdf-rail-leaders" width={layout.canvasW} height={layout.canvasH} aria-hidden="true">
            {cards.map((c) => {
              const id = c.passage.id;
              const top = placement.tops[id];
              if (top == null) return null;
              const s = layout.spreads[c.anchor.spreadIdx];
              const cs = placement.scales[id] ?? 1;
              /* A card with nothing on it is not drawn (TJ, 2026-08-17: "if
                 empty, no note no concept then hide"). Zoomed out it would be
                 an empty bordered box over a thumbnail, saying only that
                 SOMETHING was captured here — which the highlight says better.
                 Close in it keeps its + and its invitation, so it stays. */
              if (!(draft && c.passage.id === draft.passage.id)
                  && seesMoreThanASpread && c.concepts.length === 0) return null;
              // Not drawn until measured — see the twin of this line in
              // ConceptRail: a leader aimed at CARD_FALLBACK_H flashes at a
              // place no card is, then snaps.
              const measured = passageCardHeights[id];
              if (measured == null) return null;
              const h = measured * cs;
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
              /* A card with nothing on it is not drawn (TJ, 2026-08-17: "if
                 empty, no note no concept then hide"). Zoomed out it would be
                 an empty bordered box over a thumbnail, saying only that
                 SOMETHING was captured here — which the highlight says better.
                 Close in it keeps its + and its invitation, so it stays. */
              const isDraft = !!draft && c.passage.id === draft.passage.id;
              // The empty-card rule cannot apply to a draft: it has no concept
              // and no note BY DEFINITION — that is what the reader is about
              // to supply — so the test that hides an empty card would hide
              // the one card that must be on screen.
              //
              // The note no longer counts as content out here (TJ, 2026-08-19),
              // because RailCardBody stopped drawing it at this threshold. A
              // card with a note and no concepts would otherwise pass this test
              // and then render as an empty bordered box over a thumbnail —
              // saying only that SOMETHING was captured here, which the
              // highlight says better. Zoomed out, a card IS its concepts.
              if (!isDraft && seesMoreThanASpread && c.concepts.length === 0) return null;
              // No first/chips split: every concept is a badge of equal
              // weight, the same as page mode's rail and the passage view.
              const style: React.CSSProperties = {
                top: placement.tops[id] ?? s.y,
                // RAIL_W, page mode's own rail, divided by the zoom: the card is
                // then that many SCREEN px wide at any k — the same box page mode
                // draws. Capped as before, because 220/k grows without bound as
                // you zoom out and a card may grow inward over its own page, no
                // further.
                width: `min(calc(${RAIL_W}px / var(--k, 1)), ${layout.railW + layout.gap + basePageWidth}px)`,
                // railScale shrinks a crowded side so every card stays visible.
                // The DRAFT is exempt: it is the thing being written, and
                // shrinking it because its neighbours are crowded is the one
                // case where "keep everything visible" costs the reader the
                // legibility that rule exists to protect. Measured on a rail at
                // scale 0.718 it took the card to 244px on screen where the
                // counter-scale had put it at 340. It overlaps its neighbours
                // instead, which is what its z-index is for, and it is gone as
                // soon as the capture is taken.
                transform: cs < 1 && !isDraft ? `scale(${cs})` : undefined,
                transformOrigin: c.anchor.side === "left" ? "top left" : "top right",
                ...(c.anchor.side === "left"
                  ? { left: s.x, right: "auto" }
                  : { right: layout.canvasW - (s.x + layout.unitW), left: "auto" }),
              };
              return (
                /* The same body as page mode's rail (ConceptRail), so the
                   two cards cannot drift again — the canvas was still drawing
                   a concept label and a gloss hours after the other stopped.
                   The host keeps what is genuinely the canvas's: the anchor,
                   the counter-scale, and the width that rides --k. It is no
                   longer a role="button" wrapper, because the body holds
                   controls and a control inside a control is unreachable in
                   keyboard order. */
                <div
                  key={id}
                  ref={(el) => registerCard(id, el)}
                  className="pdf-railcard-stack"
                  data-add-open={activeAddPassageId === id ? "true" : undefined}
                  data-draft={isDraft ? "true" : undefined}
                  data-side={c.anchor.side}
                  style={style}
                >
                  {isDraft ? draft!.card : (
                  <div className="pdf-railcard">
                    <RailCardBody
                      passage={c.passage}
                      concepts={c.concepts}
                      onOpenPassage={onOpenPassage}
                      onOpenConcept={onOpenConcept}
                      /* The + only exists when the editor it opens can (Open
                         Loom passes neither creator nor adder — the same gate
                         as page mode's rail, TJ 2026-08-21). */
                      onAddConcept={onCreateConcept && onAddConcept ? toggleAddConcept : undefined}
                      addConceptExpanded={activeAddPassageId === id}
                      addConceptControls={activeAddPassageId === id ? `canvas-add-concept-${id}` : undefined}
                      onUnfile={onUnfile}
                      onRemovePassage={onRemovePassage}
                      onEditNote={onEditNote}
                      readOnly={seesMoreThanASpread}
                    />
                  </div>
                  )}
                  {!isDraft && activeAddPassageId === id && onCreateConcept && onAddConcept ? (
                    <div id={`canvas-add-concept-${id}`} className="pdf-add-concept-host">
                      <AddConceptCard
                        passage={c.passage}
                        concepts={concepts}
                        onCreateConcept={onCreateConcept}
                        onAddConcept={onAddConcept}
                        onEditConcept={onEditConcept}
                        onClose={() => closeAddConcept(id)}
                        joined
                      />
                    </div>
                  ) : null}
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
