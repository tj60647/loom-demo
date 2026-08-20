"use client"
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import CaptureModal, { type CaptureReuse } from './CaptureModal';
import DraftCard from './DraftCard';
import PageSlot from './PageSlot';
import { type PdfDoc } from './PageRaster';
import SpreadCanvasView from './SpreadCanvasView';
import ConceptRails, { RAIL_W } from './ConceptRail';
import { useRemovePassage } from '@/components/cards/useRemovePassage';
import { conceptNameText } from "@/lib/conceptName";
import ReuseOffer from '@/components/ui/ReuseOffer';
import FullscreenIcon from '@/components/ui/FullscreenIcon';
import { useLoom } from '@/components/providers/LoomProvider';
import { useReadings } from '@/components/providers/ReadingsProvider';
import { searchReading, getPassagesOverlay, getReadingPageManifest } from '@/lib/reads';
import type { ReadingPageHit } from '@/actions/search';
import { overlayBlockMessage, type OverlayBand, type PassagesOverlay } from '@/lib/overlay';
import { hitTermsOf } from '@/lib/searchText';
import Snippet from '@/components/ui/Snippet';
import { Passage, Concept } from '@/lib/types';
import { hashText } from '@/lib/hash';
import Mark from 'mark.js';

// Served from our own origin, copied out of react-pdf's pdfjs-dist by
// scripts/copy-pdf-worker.mjs at prebuild/predev. This was `//unpkg.com/...`,
// which put a third party on the critical path of every reading: with unpkg
// unreachable — an ad blocker, a campus proxy, a room with no internet, a CDN
// outage — tab 00 showed "Failed to load PDF. Check file path." for every text
// in the course, blaming a file that was served fine from our own server.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Where the worker fetches its WASM codecs (JPX/JPEG2000 decode, ICC color),
// copied to public/pdf-wasm/ by the same script that copies the worker. A
// scanned reading is JPX images page after page, and without this option the
// text layer renders while every page image silently fails to decode — the
// reading opens as selectable text on blank paper. The trailing slash is
// load-bearing: pdf.js appends filenames to this string verbatim.
//
// Module-level constant, never inline: react-pdf treats a new `options`
// identity as a new document and reloads the PDF on every render.
const documentOptions = { wasmUrl: '/pdf-wasm/' };

interface PdfViewerProps {
  url: string;
  sourceName: string;
  sourceId?: string;
  initialPageNumber?: number;
  focusPassageId?: string | null;
  /** Opens the search panel pre-filled — how a shelf-search hit carries its
      query into the text it matched. */
  initialSearch?: string;
  onGotoOpenPassage?: (passageId: string) => void;
  /** Open Your work at a concept — a margin badge's destination. */
  onGotoOpenConcept?: (conceptId: string) => void;
  /**
   * The page the reader is looking at, as it changes. Capture-by-hand offers
   * it as the location so nobody retypes a page number the viewer already
   * knows exactly (TJ, 2026-08-09).
   */
  onPageChange?: (pageNumber: number) => void;
  /** Whether Your work — this reading's Capture Log — is slid out. */
  workOpen?: boolean;
  /** Slide it out, or send it back. Since the 2026-08-08 merge the text and
      the capture side are one station, so this opens a sheet over the reading
      rather than leaving for a tab. */
  onToggleWork: () => void;
  /**
   * What goes inside it. The viewer owns the sheet — its geometry, its
   * keyboard, its focus — because the sheet lives inside .pdf-shell so that
   * fullscreen carries it along; the workbench owns only what is written on it.
   */
  workPanel?: ReactNode;
}

/** One passage on the clicked span, as the highlight tooltip presents it. */
/**
 * What a capture needs to know about the words, before any of it is saved.
 * The modal and the rail draft take the same five facts; only where the
 * reader types them differs.
 */
export type CaptureTarget = {
  text: string;
  pageNum?: number;
  startOffset?: number;
  endOffset?: number;
  pageContentHash?: string;
};

/**
 * The id the in-progress capture wears while it is only a selection.
 *
 * A UUID would be wrong twice: it would collide with nothing, but it would
 * also be indistinguishable from a saved passage to every consumer that keys
 * off `data-loom-passage-id` — the rails, the tooltip, the mark sweep. A
 * reserved literal lets each of them ask the one question that matters.
 */
export const DRAFT_ID = "draft";

/**
 * The draft, shaped as the Passage the marking pass already knows how to
 * paint. Nothing here is written anywhere: it exists for the length of one
 * mark.js call, so the selection carries a real .loom-passage-highlight and
 * both rail hosts anchor a card on it with no idea a draft is involved.
 */
function draftAsPassage(d: CaptureTarget, sourceName: string): Passage {
  return {
    id: DRAFT_ID,
    courseId: null,
    userId: "",
    conceptIds: [],
    source: sourceName,
    sourceId: null,
    location: d.pageNum ? `p. ${d.pageNum}` : null,
    content: d.text,
    pageNumber: d.pageNum ?? null,
    startOffset: d.startOffset ?? null,
    endOffset: d.endOffset ?? null,
    pageContentHash: d.pageContentHash ?? null,
    note: "",
    question: "",
    isPullQuote: false,
    tier: "" as Passage["tier"],
    createdAt: new Date(0),
  } as Passage;
}

type HighlightEntry = {
  passageId: string;
  conceptLabel: string;
  source: string;
  location: string;
  startOffset: number | null;
  endOffset: number | null;
};

export default function PdfViewer({ url, sourceName, sourceId, initialPageNumber, focusPassageId, initialSearch, onGotoOpenPassage,
  onGotoOpenConcept, onPageChange, workOpen, onToggleWork, workPanel }: PdfViewerProps) {
  const { state, scoped, addConcept, editConcept, addPassageConcept, unfilePassage, editPassageNote } = useLoom();
  // The confirm and its wording live in the hook, so this button and Your
  // work's make the same promise about what a delete takes with it.
  const removePassageWithConfirm = useRemovePassage();
  // Drawn only for faculty and admins. Not a guard — `overlayViewer()` re-checks
  // on the server, so a student who forces the request gets an empty overlay.
  const readings = useReadings();
  const isStaff = !!readings.course?.isStaff;
  const courseSections = readings.course?.sections ?? [];
  // Which section is being compared; "" is every section — the cohort.
  const [overlaySection, setOverlaySection] = useState<string>("");
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isNarrow, setIsNarrow] = useState(false);
  // One passage can carry several passages — the same span re-filed under a
  // second concept, or overlapping captures. The tooltip lists every passage on
  // the clicked span, so no coding is hidden behind another.
  const [highlightTooltip, setHighlightTooltip] = useState<{
    entries: HighlightEntry[];
    x: number;
    y: number;
    sticky: boolean;
  } | null>(null);
  
  // Layout state
  const [isTwoPage, setIsTwoPage] = useState(true); // default to 2-page spread
  const [fitMode, setFitMode] = useState<"width" | "height">("height");
  const [containerWidth, setContainerWidth] = useState(800);

  /**
   * How the pages are laid out.
   *  - `page`   one spread at a time, turned with the arrows (what this was)
   *  - `strip`  every page in one horizontal run — HIDDEN since 2026-08-10
   *             (TJ: the canvas matrix supersedes it); no button sets it, the
   *             render branch stays for cheap restoration
   *  - `matrix` the whole document as 2-page spreads on one zoomable canvas
   * All of them render ordinary react-pdf pages with their text layers, so a
   * passage can be selected and captured in any of them.
   */
  const [viewMode, setViewMode] = useState<"page" | "strip" | "matrix">("page");
  /**
   * Margin cards (the spread canvas's rail, page mode only): each passage on
   * the open spread drawn as a card beside its page. Off by default and not
   * persisted — the same standing as viewMode itself.
   */
  // The rails stand permanently (TJ, 2026-08-17). The Cards toggle is gone:
  // a control that hides the margin is a control that hides where the work
  // is. Kept as a name rather than inlined `true` so the three places that
  // ask "are the margins showing?" still read as one decision.
  const railsOn = true;
  // Covers the whole window, chrome included — the reading takes the screen.
  const [isFullscreen, setIsFullscreen] = useState(false);
  /**
   * Enter or leave full screen — both halves of it, together.
   *
   * `.pdf-shell.fullscreen` hides LOOM's chrome; the Fullscreen API hides the
   * BROWSER's. Either alone leaves a bar of something else around the text,
   * which is why this used to be two buttons in two places.
   *
   * The request goes to `documentElement`, not to the shell. Fullscreening
   * the shell would stop rendering everything outside it — including the
   * practice guide's mask and rungs, which sit at z-index 6100–6103
   * deliberately above this mode (globals.css) and which
   * `check-practice-guide.ts` guards. Rooting it keeps that stack intact and
   * lets the existing CSS do the chrome-hiding it already does.
   *
   * The in-app half is set first and unconditionally: a browser that refuses
   * the request — a policy, a gesture it did not count — should still give
   * the reader the larger text, which is the part that matters here.
   */
  const setFullscreen = useCallback(async (next: boolean) => {
    setIsFullscreen(next);
    try {
      if (next) {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Not worth a dialog: the button simply does not carry the browser with it.
    }
  }, []);
  /**
   * Esc and F11 leave the browser's fullscreen without telling us. Without
   * this the shell would stay `position:fixed; inset:0` over a window that is
   * no longer full, and the only way out would be a button the chrome is
   * covering.
   */
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setIsFullscreen(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  // Matrix zoom, as a multiple of the whole-canvas fit: 1 = every spread in
  // view. The − / + buttons and the canvas's own pinch drive the SAME
  // transform — SpreadCanvasView syncs this back when a gesture settles.
  // Fit has its own nonce: state alone can be stale mid-gesture, and a
  // panned view at multiplier 1 still needs recentring.
  const [zoom, setZoom] = useState(1);
  const [fitNonce, setFitNonce] = useState(0);
  // How far + may go, reported by the canvas per document: the ceiling is
  // anchored to the spread (deep enough to fill the stage with a quarter of
  // one), not to fit-all — a fixed 8× fit-all reached print size on a short
  // paper and stalled at barely reading size on a 132-page scan.
  const [zoomMax, setZoomMax] = useState(8);
  // The pdf.js document proxy, kept for the matrix canvas's raster path.
  const [pdfProxy, setPdfProxy] = useState<PdfDoc | null>(null);
  // The document's height/width, measured off the first page that renders, so
  // the many-page views can reserve honest space before a page has drawn.
  const [aspect, setAspect] = useState(11 / 8.5);
  // Every page's own size and text length, stored at ingest and fetched once —
  // the layout is exact before anything renders. Null for readings extracted
  // before dimensions existed (the viewer measures for itself, as it always
  // did) and for viewers with no sourceId.
  const [manifest, setManifest] = useState<Awaited<ReturnType<typeof getReadingPageManifest>> | null>(null);
  // Where the pre-rendered page images live; null means render from the PDF.
  const pageImageBase = sourceId ? `/api/readings/${sourceId}/pages` : null;

  useEffect(() => {
    if (!sourceId) return;
    let cancelled = false;
    getReadingPageManifest(sourceId)
      .then((m) => {
        if (cancelled || m.pageCount === 0) return;
        setManifest(m);
        // Seed the shared aspect from the manifest — the MEDIAN page, so one
        // odd plate does not set the document's reserve.
        const aspects = m.pages
          .filter((p) => p.width && p.height)
          .map((p) => p.height! / p.width!)
          .sort((a, b) => a - b);
        if (aspects.length > 0) setAspect(aspects[Math.floor(aspects.length / 2)]);
      })
      .catch(() => { /* no manifest is a legal state, not an error */ });
    return () => { cancelled = true; };
  }, [sourceId]);

  // Per-page aspect off the manifest, for the page-mode slots.
  const pageAspects = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of manifest?.pages ?? []) {
      if (p.width && p.height) map.set(p.pageNumber, p.height / p.width);
    }
    return map;
  }, [manifest]);

  // Page mode always outranks the matrix's background sharpening in the
  // shared render queue: the spread in front of the reader renders first.
  const pageModePriority = useCallback(() => -1, []);

  // Measured aspect reports pass only when they differ by more than 3%:
  // scanned pages vary a percent or two each, and chasing them is the aspect
  // storm (every change re-laid the matrix grid and re-rendered every mounted
  // page). A real correction — a landscape document guessed portrait — still
  // lands.
  const acceptAspect = useCallback((a: number) => {
    setAspect((prev) => (Math.abs(a - prev) / prev > 0.03 ? a : prev));
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const workPanelRef = useRef<HTMLElement>(null);
  const workToggleRef = useRef<HTMLButtonElement>(null);
  const workWasOpen = useRef(false);
  /**
   * Was the reader working INSIDE the sheet when the close was asked for?
   * Read at the moment of the request and not in the effect below, because
   * `inert` blurs its subtree immediately — by the time an effect runs,
   * document.activeElement is already <body> and the answer is always "no".
   * Getting this wrong drops a keyboard reader at the top of the document,
   * silently, with nothing to show for it.
   */
  const workHadFocus = useRef(false);
  /**
   * The acknowledgement a capture gets, where the reader is actually looking.
   * One slot, not a stack: two captures inside the window read as "2 passages
   * captured" rather than climbing the corner of the page. `n` counts them so
   * the wording can say so; `passageId` is the LAST one, which is the row to open.
   */
  const [captureToast, setCaptureToast] = useState<{ passageId: string; label: string; n: number; reuse?: CaptureReuse } | null>(null);
  const toastTimer = useRef<number | null>(null);
  /**
   * The element that actually scrolls in every mode — the measuring stick for
   * page size and the root the slots check visibility against.
   *
   * Held in state as well as a ref: the slots need it *during* render to build
   * their observers, and a ref is null on the first pass, which would quietly
   * fall back to observing the viewport. That is the wrong box for a strip
   * that scrolls sideways inside it — every slot would look visible at once
   * and render the whole document.
   */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const attachStage = useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    setStageEl(node);
  }, []);
  const [stage, setStage] = useState({ w: 800, h: 600 });

  /**
   * Page-mode zoom, as a multiple of the fit (1 = the spread fits, exactly
   * what page mode always showed). Same economy as the matrix: the text
   * layer renders once at the fit width and zoom reaches it as CSS scale;
   * only the raster re-targets, 200ms after the zoom rests. Pan is the
   * stage's own scrolling — mode-page is already an overflow:auto box with
   * safe centring, so a zoomed spread scrolls like any oversized content.
   * 4× fit is print-size on this library's scans and inside every canvas cap.
   *
   * Sited below stageRef/stageEl on purpose: the wheel effect lists stageEl
   * in its deps, and a dep array reads its names at render time — the same
   * temporal dead zone requestToggleWork documents further down.
   */
  const PAGE_ZOOM_MAX = 4;
  const [pageZoom, setPageZoom] = useState(1);
  // Written by the two zoom paths below, never mirrored from render: wheel
  // notches arrive faster than commits, and each must compound on the value
  // the previous notch chose, not on the last committed one.
  const pageZoomRef = useRef(1);
  const [pageModeRes, setPageModeRes] = useState(1);
  // Where a zoom gesture anchored, applied to the scroll box after React
  // commits the new size — the content point under the cursor stays put.
  const zoomAnchorRef = useRef<{ ax: number; ay: number; sl: number; st: number; from: number; to: number } | null>(null);

  useEffect(() => {
    if (viewMode !== "page") return;
    const timer = window.setTimeout(() => {
      const dpr = window.devicePixelRatio || 1;
      setPageModeRes(Math.max(1, Math.min(6, Math.ceil(pageZoom * dpr * 2) / 2)));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [pageZoom, viewMode]);

  /** Zoom the spread about a stage point (or its centre), by ratio. */
  const zoomPageBy = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const el = stageRef.current;
    if (!el) return;
    const from = pageZoomRef.current;
    const to = Math.min(PAGE_ZOOM_MAX, Math.max(1, Math.round(from * factor * 100) / 100));
    if (to === from) return;
    const rect = el.getBoundingClientRect();
    const ax = clientX != null ? clientX - rect.left : el.clientWidth / 2;
    const ay = clientY != null ? clientY - rect.top : el.clientHeight / 2;
    zoomAnchorRef.current = { ax, ay, sl: el.scrollLeft, st: el.scrollTop, from, to };
    pageZoomRef.current = to;
    setPageZoom(to);
  }, [PAGE_ZOOM_MAX]);

  // ctrl/cmd + wheel zooms at the cursor — the same trackpad-pinch
  // convention the matrix speaks; a plain wheel keeps scrolling the stage.
  useEffect(() => {
    if (viewMode !== "page" || !stageEl) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const mult = e.deltaMode === 1 ? 0.05 : 0.002;
      zoomPageBy(Math.pow(2, -e.deltaY * mult * 10), e.clientX, e.clientY);
    };
    stageEl.addEventListener("wheel", onWheel, { passive: false });
    return () => stageEl.removeEventListener("wheel", onWheel);
  }, [viewMode, stageEl, zoomPageBy]);

  // The scroll correction, after the new size is in the DOM. Layout effect,
  // not effect: a frame between resize and correction reads as a lurch.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const el = stageRef.current;
    if (!anchor || !el || viewMode !== "page") return;
    zoomAnchorRef.current = null;
    const ratio = anchor.to / anchor.from;
    el.scrollLeft = (anchor.sl + anchor.ax) * ratio - anchor.ax;
    el.scrollTop = (anchor.st + anchor.ay) * ratio - anchor.ay;
  }, [pageZoom, viewMode]);

  /**
   * Grab-to-pan on the page stage — the matrix's gesture language, spoken
   * here so the two views feel like one instrument (TJ, 2026-08-14: "I want
   * to grab and pan, not move over to a scroll bar and then back"). Same
   * rules exactly: a drag on page TEXT selects (that is capture's territory),
   * a drag anywhere else pans, and space+drag pans from anywhere, text
   * included. The pan itself is just scroll arithmetic — the stage already
   * scrolls; this gives the scroll a hand.
   */
  const pageSpaceHeld = useRef(false);
  /** Is the pointer on the stage? See the space guard below. */
  const pageOverRef = useRef(false);
  useEffect(() => {
    if (viewMode !== "page") return;
    const setHeld = (on: boolean) => {
      if (pageSpaceHeld.current === on) return;
      pageSpaceHeld.current = on;
      stageRef.current?.classList.toggle("space-pan", on);
    };
    /**
     * SPACE PANS WHEN THE POINTER IS ON THE PAGE — the same rule the canvas
     * uses, and it moved for the same measured reason (TJ, 2026-08-19: "when I
     * am over selectable text and press spacebar I should see the drag icon").
     *
     * The .space-pan CSS was always right; the class never went on. This guard
     * counted a focused BUTTON as keyboard use, and on arrival
     * document.activeElement IS the station nav button — so space-pan was dead
     * from the moment the reading opened until something happened to move focus
     * to BODY. Blurred, it worked perfectly, which is why it read as flaky.
     *
     * Text entry still wins outright: a space typed into a note is a space.
     * Space on a focused button is a real activation too, so it is not dropped
     * — it yields only while the pointer is over the stage, which is the reader
     * saying where they are looking.
     */
    const typing = (el: Element | null) =>
      !!el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable);
    const onEnter = () => { pageOverRef.current = true; };
    const onLeave = () => { pageOverRef.current = false; setHeld(false); };
    stageRef.current?.addEventListener("pointerenter", onEnter);
    stageRef.current?.addEventListener("pointerleave", onLeave);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat) return;
      if (typing(document.activeElement)) return;
      if (!pageOverRef.current) return;
      e.preventDefault();
      setHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === " ") setHeld(false); };
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      stageRef.current?.removeEventListener("pointerenter", onEnter);
      stageRef.current?.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setHeld(false);
    };
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "page" || !stageEl) return;
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    let bodySelect = "";
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // The sheet, search panel and toast own their own pointers always.
      if (target.closest("[data-yourwork], .pdf-search-panel, .captoast, .loom-highlight-tooltip")) return;
      if (!pageSpaceHeld.current) {
        if (target.closest(".react-pdf__Page__textContent")) return; // selection's ground
        // .pdf-railcard-stack, not .pdf-railcard: the add-concept editor is a
        // SIBLING of the passage card inside the stack, so naming only the
        // passage card left the editor's own chrome — its legend, its padding —
        // starting a stage pan. SpreadCanvasView's d3 filter was widened to the
        // stack when the stack was introduced; this guard was not.
        if (target.closest("button, a, select, input, textarea, .pdf-railcard-stack")) return;
      }
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      startLeft = stageEl.scrollLeft; startTop = stageEl.scrollTop;
      stageEl.classList.add("panning");
      // d3's own trick in the matrix: no selection can start mid-pan.
      bodySelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      stageEl.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      stageEl.scrollLeft = startLeft - (e.clientX - startX);
      stageEl.scrollTop = startTop - (e.clientY - startY);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      stageEl.classList.remove("panning");
      document.body.style.userSelect = bodySelect;
      try { stageEl.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    };
    stageEl.addEventListener("pointerdown", onDown);
    stageEl.addEventListener("pointermove", onMove);
    stageEl.addEventListener("pointerup", onUp);
    stageEl.addEventListener("pointercancel", onUp);
    return () => {
      stageEl.removeEventListener("pointerdown", onDown);
      stageEl.removeEventListener("pointermove", onMove);
      stageEl.removeEventListener("pointerup", onUp);
      stageEl.removeEventListener("pointercancel", onUp);
      stageEl.classList.remove("panning", "space-pan");
      if (dragging) document.body.style.userSelect = bodySelect;
    };
  }, [viewMode, stageEl]);
  
  const [highlightRect, setHighlightRect] = useState<{top: number, left: number, text: string, pageNum?: number, startOffset?: number, endOffset?: number, pageContentHash?: string} | null>(null);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  /**
   * A CAPTURE IN PROGRESS, ON THE RAIL (TJ, 2026-08-19: "the capture passage is
   * currently a modal, i want it to go on the rail").
   *
   * The draft is a passage that does not exist yet, and it is deliberately
   * shaped like one: DRAFT_ID goes on a real highlight over the selection, so
   * both rail hosts' anchor sweeps find it the ordinary way and place a card
   * with a leader line without either of them learning what a draft is. The
   * card body is the only thing that differs.
   *
   * The modal has NOT gone. It still serves every surface with no rail to draw
   * on — the strip, and page mode below the width where rails are hidden —
   * because a capture path that disappears with the window is worse than two
   * that agree. Both end in the same addPassage and report through the same
   * onCaptured, so the shared ReuseOffer still sees every capture: that is the
   * 2.1 invariant. open-work.md 5.5's gated list once warned an inline draft
   * would break it — and now records (2026-08-19) that the conflict was not real.
   */
  const [draft, setDraft] = useState<CaptureTarget | null>(null);
  const draftRef = useRef<CaptureTarget | null>(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const [captureData, setCaptureData] = useState<CaptureTarget | null>(null);

  // Find in this reading. The query runs server-side against the canonical
  // page text (src/actions/search.ts) and comes back as page-ordered snippets;
  // the words Postgres marked are then re-marked on the rendered text layer,
  // so a hit looks the same on the page as it does in the list.
  const [searchOpen, setSearchOpen] = useState(!!initialSearch);
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? "");
  const [searchHits, setSearchHits] = useState<ReadingPageHit[] | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Monotonic request id: a slow early response never overwrites a later one.
  const searchRequestRef = useRef(0);
  // Read by the highlight applier (and its MutationObserver callback), which
  // must see the current terms without re-registering.
  const searchTermsRef = useRef<string[]>([]);

  // The Passages Overlay (ruling 28): where OTHER people in this band marked
  // the same pages, washed under the text in steps. Off by default — the page
  // is yours first, and the gate below means it cannot open at all until you
  // have captured a passage here yourself.
  const [overlayBand, setOverlayBand] = useState<OverlayBand | null>(null);
  const [overlay, setOverlay] = useState<PassagesOverlay | null>(null);
  const [overlayBusy, setOverlayBusy] = useState(false);
  // Same reason as searchTermsRef: the applier runs from a MutationObserver
  // and must see the current heat without being re-registered.
  const overlayRef = useRef<PassagesOverlay | null>(null);

  const hideHighlightTooltip = useCallback(() => {
    setHighlightTooltip(null);
  }, []);

  // Latest passages/concepts for click-time lookups. Overlapping captures nest
  // their <mark> elements, so the passage list for a span is read off the DOM at
  // click time rather than frozen per node at mark time.
  const passagesRef = useRef<Passage[]>([]);
  /**
   * gotoOpenPassage, through a ref, because bindHighlightNode must not depend
   * on it. That callback is a dep of the marking effect, and gotoOpenPassage
   * changes whenever the search panel opens or closes — depending on it
   * directly would re-mark every text layer in the reading on a keystroke in
   * the find field.
   */
  const gotoOpenPassageRef = useRef<((passageId: string) => void) | null>(null);
  const conceptsRef = useRef<Concept[]>([]);
  useEffect(() => {
    conceptsRef.current = state.concepts;
  }, [state.concepts]);

  /**
   * Every passage covering this node's span: the node's own passage plus the passages
   * of the ancestor marks it is nested inside. Ordered as the passages appear in
   * the capture list, so the tooltip is stable no matter which layer was
   * clicked.
   */
  const entriesForNode = useCallback((node: HTMLElement): HighlightEntry[] => {
    const ids: string[] = [];
    let el: HTMLElement | null = node.closest(".loom-passage-highlight");
    while (el) {
      const id = el.getAttribute("data-loom-passage-id");
      if (id && !ids.includes(id)) ids.push(id);
      el = el.parentElement ? el.parentElement.closest(".loom-passage-highlight") : null;
    }
    const orderOf = new Map(passagesRef.current.map((b, i) => [b.id, i]));
    ids.sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));
    return ids.flatMap((id) => {
      const passage = passagesRef.current.find((b) => b.id === id);
      if (!passage) return [];
      const concept = conceptsRef.current.find((c) => c.id === passage.conceptIds[0]);
      return [{
        passageId: passage.id,
        // An Unlabeled PASSAGE is one filed under nothing. A passage filed
        // under a Concept that has a Description and no Label is not that, and
        // saying so named the wrong object — so the concept's own placeholder
        // is used when a concept exists, and "Unlabeled passage" only when one
        // does not.
        conceptLabel: concept ? conceptNameText(concept) : "Unlabeled passage",
        source: passage.source || sourceName,
        location: passage.location || "",
        startOffset: passage.startOffset ?? null,
        endOffset: passage.endOffset ?? null,
      }];
    });
  }, [sourceName]);

  const bindHighlightNode = useCallback((node: HTMLElement, passageId: string) => {
    node.setAttribute("data-loom-passage-id", passageId);

    const showFromEvent = (event: MouseEvent | PointerEvent | FocusEvent, sticky = false) => {
      const target = (event.target as HTMLElement | null) ?? node;
      const entries = entriesForNode(target);
      if (!entries.length) return;
      const rect = target.getBoundingClientRect();
      const x = rect ? rect.left + rect.width / 2 : ("clientX" in event && event.clientX ? event.clientX : 0);
      const y = rect ? rect.top : ("clientY" in event && event.clientY ? event.clientY : 0);
      setHighlightTooltip({ entries, x, y, sticky });
    };

    /**
     * A CLICK ON A HIGHLIGHT OPENS THE PASSAGE (TJ, 2026-08-19: "clicking on
     * highlighted text should open the passage in Your work. now that we have
     * the rail card that makes sense").
     *
     * It used to open a sticky tooltip that named the concept, the source and
     * the location. That was the only way to learn what a highlight WAS, so it
     * had to say so in place. The rail card says all of it now, beside the
     * words, with a leader line drawn to them — so the tooltip was answering a
     * question the page had already answered, one click before the thing you
     * actually wanted.
     *
     * TWO CAPTURES CAN SHARE A SENTENCE, and then there is no "the" passage to
     * open. Marks nest, entriesForNode walks the ancestors, and the tooltip
     * survives for exactly that case — as a chooser rather than as a label. So
     * the rule is: one capture here, go to it; more than one, ask which.
     *
     * Focus still shows the tooltip and never navigates. Tabbing through a page
     * must not carry you off it, and the tooltip is how a keyboard reader gets
     * at the same facts.
     */
    const onClick = (event: MouseEvent) => {
      event.stopPropagation();
      const entries = entriesForNode((event.target as HTMLElement | null) ?? node);
      if (entries.length === 1) {
        hideHighlightTooltip();
        gotoOpenPassageRef.current?.(entries[0].passageId);
        return;
      }
      showFromEvent(event, true);
    };

    const onFocus = (event: FocusEvent) => showFromEvent(event, true);

    node.addEventListener("click", onClick);
    node.addEventListener("focus", onFocus);
    node.setAttribute("title", "Open this passage in your work");

    return () => {
      node.removeEventListener("click", onClick);
      node.removeEventListener("focus", onFocus);
    };
  }, [entriesForNode]);

  // Responsive sizing and layout detection
  useEffect(() => {
    const updateLayout = () => {
      const narrow = window.innerWidth < 900;
      setIsNarrow(narrow);
      // A spread needs two pages' width; on a phone that leaves each one
      // unreadable, so a narrow screen reads one page at a time.
      if (narrow) setIsTwoPage(false);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  /**
   * Measure the stage rather than guessing at it. This used to subtract a
   * hardcoded 250px of chrome from the window height, which was wrong the
   * moment the chrome wrapped, the toolbar grew a second row, or the viewer
   * went fullscreen. Measuring the box the pages actually sit in is what lets
   * every mode fill the space it really has.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.contentRect;
        setStage({ w: box.width, h: box.height });
        setContainerWidth(box.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, isFullscreen]);

  // Text selection listener
  useEffect(() => {
    if (!initialPageNumber || initialPageNumber < 1) return;
    const timer = window.setTimeout(() => setPageNumber(initialPageNumber), 0);
    return () => window.clearTimeout(timer);
  }, [initialPageNumber, sourceId, url]);

  useEffect(() => {
    if (!focusPassageId) return;
    const targetPassage = state.passages.find((b) => b.id === focusPassageId);
    if (targetPassage?.pageNumber && targetPassage.pageNumber > 0) {
      const timer = window.setTimeout(() => setPageNumber(targetPassage.pageNumber!), 0);
      return () => window.clearTimeout(timer);
    }
  }, [focusPassageId, state.passages]);

  useEffect(() => {
    if (numPages && pageNumber > numPages) {
      const timer = window.setTimeout(() => setPageNumber(numPages), 0);
      return () => window.clearTimeout(timer);
    }
  }, [numPages, pageNumber]);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const rawText = selection?.toString() ?? "";
      const text = rawText.trim();
      if (text && text.length > 0) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        
        let selectedPageNum = pageNumber;
        let startOffset: number | undefined;
        let endOffset: number | undefined;
        let pageContentHash: string | undefined;
        
        if (range) {
          // The page a boundary of the selection sits in.
          const pageOf = (boundary: Node | null): HTMLElement | null => {
            let node = boundary;
            while (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
            let element = node as HTMLElement | null;
            while (element) {
              if (element.classList?.contains('react-pdf__Page')) return element;
              element = element.parentElement;
            }
            return null;
          };

          const startPageNode = pageOf(range.startContainer);
          const endPageNode = pageOf(range.endContainer);

          /**
           * ONLY THE READING OFFERS A CAPTURE (TJ, 2026-08-17: "only text from
           * the reading should trigger the capture as passage. not text from
           * the ui").
           *
           * This listens on `document`, so any selection anywhere raised the
           * button — dragging across the teaching copy in Your work, a heading,
           * a log row — and offered to capture Loom's own words as a passage of
           * the text. It would have stored them too: the content is whatever
           * was selected, and with no page to anchor to it went down the fuzzy
           * path and simply never matched anything on the page.
           *
           * Neither boundary inside a `.react-pdf__Page` means the selection is
           * not in the reading. Either boundary is enough: a drag that begins
           * on a page caption and ends in the text is a real capture, and the
           * cross-page case below already handles the rest.
           */
          if (!startPageNode && !endPageNode) {
            setHighlightRect(null);
            return;
          }
          /**
           * The anchor is not always inside a page. In the matrix the page
           * caption sits between one page and the next, so a drag begun on it
           * is anchored outside every `.react-pdf__Page`. Name the passage by
           * the page it ENDS in rather than falling through to `pageNumber` —
           * nothing updates that while a continuous view is scrolled, so the
           * passage would be filed as "p. 1" whichever page it really came from,
           * and then only ever be looked for on page 1.
           */
          const pageNode = startPageNode ?? endPageNode;
          /**
           * A selection that starts on one page and ends on another. The strip
           * and the matrix put pages side by side, so this is now an easy drag
           * rather than a rarity — and the offset arithmetic below is only
           * meaningful within ONE text layer: it measures the start against
           * this page and then adds the length of the whole selection, which
           * for a two-page drag runs off the end of the page it is anchored
           * to. Worse, the content hash would still match, so the highlighter
           * would trust that overlong range and mark the wrong text.
           *
           * The passage itself is still exactly what the student selected. Only
           * the anchor is dropped, which puts the passage on the same fuzzy
           * matching path as every passage captured before anchoring existed.
           */
          const spansPages = !!pageNode && !!endPageNode && pageNode !== endPageNode;

          if (pageNode) {
            const pageStr = pageNode.getAttribute('data-page-number');
            if (pageStr) selectedPageNum = parseInt(pageStr, 10);

            const textLayer = pageNode.querySelector('.react-pdf__Page__textContent');
            // `startPageNode` is load-bearing, not tidiness: the offsets below
            // are measured from the start of THIS text layer, so an anchor
            // that lies outside it collapses the measurement to zero while the
            // page hash still matches — and a confidently-placed wrong
            // highlight is worse than no highlight.
            if (textLayer && startPageNode && !spansPages) {
              const preRange = range.cloneRange();
              preRange.selectNodeContents(textLayer);
              preRange.setEnd(range.startContainer, range.startOffset);
              const rawStartOffset = preRange.toString().length;
              /**
               * Measure the span with the RANGE, not the selection.
               *
               * `Range.prototype.toString()` concatenates text-node data only
               * — the same offset space mark.js walks (NodeFilter.SHOW_TEXT)
               * and that pdfText.ts builds server-side by joining item.str.
               * `selection.toString()` returns *rendered* text, and pdf.js
               * appends a <br role="presentation"> at every end-of-line item,
               * so it carries one "\n" per line that exists in neither offset
               * space.
               *
               * Using the selection's length here overshot endOffset by about
               * a character per line break — and because the page hash still
               * matched, the highlighter trusted the overlong range and marked
               * on into the following words. Every multi-line capture was
               * affected; it simply had nothing asserting on it.
               */
              const rangeText = range.toString();
              const leadingTrim = rangeText.length - rangeText.trimStart().length;
              const trailingTrim = rangeText.length - rangeText.trimEnd().length;
              startOffset = rawStartOffset + leadingTrim;
              endOffset = rawStartOffset + rangeText.length - trailingTrim;
              pageContentHash = hashText(textLayer.textContent || "");
            }
          }
        }

        if (rect) {
          setHighlightRect({
            top: rect.top,
            left: rect.left + rect.width / 2,
            text,
            pageNum: selectedPageNum,
            startOffset,
            endOffset,
            pageContentHash
          });
        }
      } else {
        setHighlightRect(null);
      }
    };
    
    /**
     * `mouseup` alone is a desktop-only contract. A phone selects text by
     * long-press and drag of the native handles, which fires `selectionchange`
     * and no mouse event at all — so on iOS Safari and Android Chrome the
     * Capture button simply never appeared, and tab 00 was read-only on the
     * device most likely to be doing the reading.
     *
     * Debounced because `selectionchange` fires on every handle movement:
     * settling first means the offsets are computed once, against the
     * selection the reader actually stopped on.
     */
    let selectionTimer: number | undefined;
    const onSelectionChange = () => {
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(handleSelection, 300);
    };

    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.clearTimeout(selectionTimer);
    };
  }, [pageNumber]);

  /**
   * The Capture button is positioned in viewport coordinates taken when the
   * selection was made, so anything that moves the pages under it leaves it
   * stranded — pointing at blank paper, or floating over the toolbar. The
   * continuous views scroll constantly, so it has to keep up: re-read the live
   * selection's rectangle, and stand down once the selection is gone.
   */
  // The matrix's canvas calls this on every transform write, so the button
  // follows a wheel-pan the same way it follows a strip scroll. Held in a
  // ref: the transform callback must stay identity-stable while the effect
  // below re-registers per selection.
  const repositionRef = useRef<(() => void) | null>(null);
  const handleCanvasTransform = useCallback(() => {
    repositionRef.current?.();
  }, []);

  useEffect(() => {
    if (!highlightRect) return;
    const stageEl2 = stageRef.current;
    let frame = 0;
    const reposition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        if (!text) { setHighlightRect(null); return; }
        const rect = sel?.getRangeAt(0).getBoundingClientRect();
        if (!rect) return;
        setHighlightRect((prev) => prev && ({ ...prev, top: rect.top, left: rect.left + rect.width / 2 }));
      });
    };
    stageEl2?.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    repositionRef.current = reposition;
    return () => {
      cancelAnimationFrame(frame);
      stageEl2?.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
      repositionRef.current = null;
    };
  }, [highlightRect]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".loom-passage-highlight") || target.closest(".loom-highlight-tooltip")) {
        return;
      }
      hideHighlightTooltip();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [hideHighlightTooltip]);

  function onDocumentLoadSuccess(pdf: PdfDoc): void {
    setNumPages(pdf.numPages);
    // The proxy itself, kept for the matrix's raster path: PageRaster renders
    // straight off pdf.js, so zooming re-rasters pages without touching the
    // react-pdf tree that owns the text layers.
    setPdfProxy(pdf);
  }

  // Keep passagesRef current (declared above, next to conceptsRef) so the
  // MutationObserver's applier never needs state.passages as a dependency.
  useEffect(() => {
    passagesRef.current = state.passages.filter(b => (sourceId && b.sourceId === sourceId) || b.source === sourceName);
  }, [state.passages, sourceName, sourceId]);

  /**
   * How many passages the student has captured in THIS reading. The gate is
   * enforced on the server, but this is what re-asks after the capture that
   * opens it: turn the overlay on before you have marked anything, capture
   * one, and the comparison should appear without a reload.
   */
  const ownCaptureCount = useMemo(
    () => (sourceId ? state.passages.filter((b) => b.sourceId === sourceId).length : 0),
    [state.passages, sourceId]
  );

  /**
   * Turn the overlay on, off, or over to the other band. Same discipline as
   * the search panel: state resets happen in the handler, never synchronously
   * in an effect body — so a stale wash never outlives the ask that fetched
   * it, and no cascading render is needed to clear one.
   */
  const chooseOverlayBand = useCallback((next: OverlayBand, sectionId?: string | null) => {
    setOverlayBusy(true);
    setOverlaySection(sectionId ?? "");
    setOverlayBand(next);
    setOverlay(null);
  }, []);

  // Re-runs on the chosen section too, so switching sections re-reads without
  // a reload. `busy` is set by the handler, so fresh heat replaces old heat in
  // place instead of flashing "reading…".
  useEffect(() => {
    if (!overlayBand || !sourceId) return;
    let cancelled = false;
    getPassagesOverlay(sourceId, overlayBand, overlaySection || null)
      .then((data) => { if (!cancelled) setOverlay(data); })
      .catch((error) => {
        // A failed comparison is not a failed reading: drop the heat, leave
        // the page and every own-highlight exactly as they were.
        console.error("[Loom overlay] the comparison failed", error);
        if (!cancelled) setOverlay(null);
      })
      .finally(() => { if (!cancelled) setOverlayBusy(false); });
    return () => { cancelled = true; };
  }, [overlayBand, overlaySection, sourceId, ownCaptureCount]);

  // Find in this reading: the effect only schedules the debounced fetch —
  // state resets happen in the handlers (close, clear), never synchronously
  // in an effect body.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!searchOpen || !sourceId || trimmed.length < 2) return;

    const requestId = ++searchRequestRef.current;
    const timer = window.setTimeout(() => {
      setSearchBusy(true);
      searchReading(sourceId, trimmed)
        .then(({ hits, truncated }) => {
          if (searchRequestRef.current !== requestId) return;
          setSearchHits(hits);
          setSearchTruncated(truncated);
          setSearchError(null);
        })
        .catch(() => {
          if (searchRequestRef.current !== requestId) return;
          setSearchError("could not search this reading just now");
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) setSearchBusy(false);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchOpen, searchQuery, sourceId]);

  /** Drop any in-flight request and empty the results (and their marks). */
  const resetSearchResults = useCallback(() => {
    searchRequestRef.current++;
    setSearchHits(null);
    setSearchTruncated(false);
    setSearchBusy(false);
    setSearchError(null);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    resetSearchResults();
  }, [resetSearchResults]);

  /**
   * The doors that jump straight to a passage's row in Your work — the margin
   * cards and the capture toast. They must close Find on the way, the same
   * rule requestToggleWork enforces: the sheet and the search panel share the
   * right edge, and whichever sits underneath is open, invisible, and eats
   * the first Escape.
   */
  const gotoOpenPassage = useCallback((passageId: string) => {
    if (searchOpen) closeSearch();
    onGotoOpenPassage?.(passageId);
  }, [searchOpen, closeSearch, onGotoOpenPassage]);
  useEffect(() => { gotoOpenPassageRef.current = gotoOpenPassage; }, [gotoOpenPassage]);

  /** The badge's destination: Your work, at that concept. Same courtesy. */
  const gotoOpenConcept = useCallback((conceptId: string) => {
    if (searchOpen) closeSearch();
    onGotoOpenConcept?.(conceptId);
  }, [searchOpen, closeSearch, onGotoOpenConcept]);

  /**
   * Every way of opening or closing Your work goes through here: the toolbar
   * button, the ✕ in its head bar, and Escape. Two things have to happen on
   * the way, and neither of them belongs to the workbench.
   *
   * Declared here, above the keyboard effect that lists it as a dependency —
   * a `const` sited below that effect is in the temporal dead zone when the
   * dep array is built, and the reading dies on first render.
   */
  const requestToggleWork = useCallback(() => {
    workHadFocus.current = !!workPanelRef.current?.contains(document.activeElement);
    // Find-in-reading and the sheet share the same strip of the right edge.
    // Two panels stacked there means the lower one is open, invisible, and
    // eats the first Escape.
    if (!workOpen && searchOpen) closeSearch();
    // The sheet and the toast say the same thing; the sheet says it better.
    if (!workOpen) setCaptureToast(null);
    onToggleWork();
  }, [workOpen, searchOpen, closeSearch, onToggleWork]);

  /** Clear the toast's countdown without clearing the toast. */
  const holdToast = useCallback(() => {
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
  }, []);

  /**
   * Start (or restart) the countdown. Six seconds: long enough to read eleven
   * words and decide, short enough that it is gone before it becomes furniture.
   * Restarted rather than stacked on a second capture — see captureToast.
   */
  const startToastTimer = useCallback(() => {
    holdToast();
    toastTimer.current = window.setTimeout(() => setCaptureToast(null), 6000);
  }, [holdToast]);

  const handleCaptured = useCallback((passageId: string, label: string, reuse?: CaptureReuse) => {
    // With the sheet already out, the row IS the acknowledgement — scroll to it
    // rather than covering it with a card that says it happened. A reuse still
    // has to be said, though: the sheet shows the passage under its concept and
    // nothing there reveals that the concept came from another reading.
    if (workOpen && !reuse) {
      onGotoOpenPassage?.(passageId);
      return;
    }
    setCaptureToast((prev) => ({ passageId, label, n: (prev?.n ?? 0) + 1, reuse }));
    // A toast carrying a DECISION does not count down. Six seconds is the
    // budget for reading an acknowledgement, not for deciding whether two
    // readings mean the same thing by a word — and a choice that expires is
    // a choice made for you, which is the whole thing this note exists to
    // avoid. It stays until dismissed or answered.
    if (reuse) holdToast(); else startToastTimer();
  }, [workOpen, onGotoOpenPassage, startToastTimer, holdToast]);

  // The countdown is state that outlives the component if nobody clears it.
  useEffect(() => () => holdToast(), [holdToast]);

  // Tell the workbench where we are. Deliberately NOT fed back in as
  // initialPageNumber — that prop drives the page, and a round trip would let
  // a stale render pull the reader back to a page they had already left.
  useEffect(() => { onPageChange?.(pageNumber); }, [pageNumber, onPageChange]);

  // The word forms Postgres marked in the snippets — the document's own words
  // (stemming happened server-side), so an exact, case-insensitive mark on the
  // text layer finds them again.
  const searchTerms = useMemo(
    () => (searchHits ? hitTermsOf(searchHits.map((hit) => hit.snippet)) : []),
    [searchHits]
  );

  // Robust highlight applier using MutationObserver + React useEffect.
  // Search-term marks ride the same pass as passage highlights: one unmark, then
  // passages, then search terms — two competing effects would race each other's
  // unmark and strip whichever finished first.
  useEffect(() => {
    searchTermsRef.current = searchTerms;
    overlayRef.current = overlay;
    if (!containerRef.current) return;
    let debounceTimer: NodeJS.Timeout;

    /**
     * Mark one set of layers, or every layer.
     *
     * Scoped, because the matrix mounts every page of the reading: during its
     * initial load the observer below fires once per landing text layer, and
     * re-marking ALL mounted layers each time was O(pages²) across the load —
     * on a 132-page scan, thousands of unmark/hash/re-mark passes to produce
     * marks that were already there. A state change (new capture, search,
     * overlay) still sweeps everything, because it can move marks on any page;
     * a NEW layer only needs its own marks.
     */
    const applyHighlights = (only?: Iterable<Element>) => {
      /**
       * The draft rides in as a passage with a reserved id, so ONE marking
       * pass paints it: a second pass would race this one's unmark and strip
       * whichever finished first, which is the same reason search terms ride
       * here rather than in an effect of their own.
       */
      const d = draftRef.current;
      const passages = d ? [...passagesRef.current, draftAsPassage(d, sourceName)] : passagesRef.current;
      const heatPages = overlayRef.current?.pages ?? [];
      /**
       * Nothing to mark is not nothing to DO: the unmark below lives inside
       * the loop, so returning here also skipped clearing whatever is already
       * on the page. Turning the passages overlay off left its 16 shaded spans
       * exactly where they were, for any reader with no passages of their own
       * in the reading — which is precisely the faculty viewer the overlay
       * exists for.
       *
       * The early return is still right for the case it was written for
       * (2026-08-15): the matrix mounts every page, the observer fires once
       * per landing text layer, and re-marking all of them each time was
       * O(pages²) across the load. That case always passes `only` — a NEW
       * layer, which by definition has no marks to clear. A sweep with no
       * `only` is a STATE change, and a state change that removes the last
       * mark is the one pass that must not be skipped.
       */
      if (passages.length === 0 && searchTermsRef.current.length === 0 && heatPages.length === 0) {
        if (only) return;
        Array.from(containerRef.current!.querySelectorAll('.react-pdf__Page__textContent'))
          .forEach((layer) => {
            const sweep = new Mark(layer as HTMLElement);
            for (const cls of ["loom-passage-highlight", "loom-overlay-heat", "loom-search-hit"]) {
              sweep.unmark({ className: cls });
            }
          });
        return;
      }

      const textLayers = only
        ? Array.from(only)
        : Array.from(containerRef.current!.querySelectorAll('.react-pdf__Page__textContent'));

      textLayers.forEach(layer => {
        // Skip empty text layers
        if (layer.children.length === 0) return;

        const pageStr = layer.parentElement?.getAttribute('data-page-number');
        const parsedPage = pageStr ? parseInt(pageStr, 10) : 0;
        const pagePassages = passages.filter(b => b.pageNumber === parsedPage || !b.pageNumber);
        const pageHeat = heatPages.find(p => p.pageNumber === parsedPage);
        if (pagePassages.length === 0 && searchTermsRef.current.length === 0 && !pageHeat) return;

        const instance = new Mark(layer as HTMLElement);
        instance.unmark({
          done: () => {
            let matches = 0;
            // Compute the live text layer's content hash once per page so we
            // can decide, per passage, whether the offsets we stored are still
            // trustworthy against what pdf.js actually rendered this time.
            const liveHash = hashText((layer as HTMLElement).textContent || "");

            // Other people's marks go down FIRST, so your own highlight nests
            // inside and paints over: the comparison is a wash under the page,
            // never something that covers what you captured.
            //
            // The hash gate is absolute here, with no fuzzy fallback — the
            // overlay carries offsets and never the other student's text, so
            // there is nothing to fuzzy-match against. A drifted page shades
            // nothing and says so in the status line rather than shading the
            // wrong sentence, which would be worse than shading none.
            if (pageHeat && pageHeat.spans.length > 0 && pageHeat.contentHash !== liveHash) {
              console.warn(`[Loom PDF] Page ${parsedPage} overlay not shaded: the rendered text layer has drifted from the canonical page text (${pageHeat.contentHash} vs ${liveHash}). The passages are still counted in the status line.`);
            }
            if (pageHeat && pageHeat.spans.length > 0 && pageHeat.contentHash === liveHash) {
              pageHeat.spans.forEach(span => {
                instance.markRanges([{ start: span.start, length: span.end - span.start }], {
                  className: "loom-overlay-heat",
                  each: (node) => {
                    const el = node as HTMLElement;
                    // Five steps: past five the shade stops darkening, so a
                    // popular sentence does not black out the words under it.
                    el.setAttribute("data-heat", String(Math.min(span.count, 5)));
                    // The count is reported in the status line, in words. A
                    // per-span label would put "3 people" between a screen
                    // reader and every sentence of the reading.
                    el.setAttribute("aria-hidden", "true");
                  },
                });
              });
            }

            pagePassages.forEach(passage => {
              const hasOffsets = passage.startOffset != null && passage.endOffset != null;
              const offsetsTrusted = hasOffsets && (
                // No stored hash (legacy passage captured before this check
                // existed) — fall back to trusting the offsets as before.
                passage.pageContentHash == null || passage.pageContentHash === liveHash
              );

              /**
               * ONE TAB STOP PER PASSAGE, not one per fragment.
               *
               * mark.js wraps a <mark> around each text-layer span the passage
               * crosses, and a passage crosses a lot of them: surveyed on the
               * seeded readings, 10 passages produced 106 marks — 3 at the
               * mildest, 23 at the worst. Every one of them used to carry
               * `tabindex="0"` and the SAME `aria-label`, so a keyboard user
               * crossing one highlighted sentence stopped on it up to 23 times
               * and heard the identical citation each time. Chromium's a11y
               * tree confirms these are live nodes (role=mark, not ignored,
               * focusable) — so this was the dominant experience of the
               * feature, not a theoretical one.
               *
               * mark.js walks the DOM forward and this call is scoped to ONE
               * passage, so the first node it hands us is the visually first:
               * that one is the door, and it alone is named and focusable.
               */
              const concept = state.concepts.find((c) => c.id === passage.conceptIds[0]);
              const a11y = `${concept ? conceptNameText(concept) : "Unlabeled passage"}. ${passage.source || sourceName}${passage.location ? `, ${passage.location}` : ""}. Characters ${passage.startOffset ?? "?"}-${passage.endOffset ?? "?"}.`;
              let isEntryPoint = true;
              const dressMark = (node: HTMLElement) => {
                // EVERY fragment gets these two. The rails resolve their cards
                // off `data-loom-passage-id` (ConceptRail, SpreadCanvasView),
                // and the tooltip has to open from wherever the pointer
                // actually is — hovering the fifth line of a passage is not a
                // different intention from hovering the first.
                bindHighlightNode(node, passage.id);
                if (!isEntryPoint) return;
                isEntryPoint = false;
                // The first fragment alone is named and reachable. A later one
                // keeping the label would make a browse-mode reader announce
                // the whole citation again in the middle of the sentence.
                node.setAttribute("aria-label", a11y);
                node.setAttribute("tabindex", "0");
              };

              if (offsetsTrusted) {
                // Precision mode!
                instance.markRanges([{
                  start: passage.startOffset!,
                  length: passage.endOffset! - passage.startOffset!
                }], {
                  className: "loom-passage-highlight",
                  each: (node) => dressMark(node as HTMLElement),
                  done: (count) => matches += count
                });
              } else {
                if (hasOffsets) {
                  console.warn(`[Loom PDF] Page ${parsedPage} text layer has drifted from the anchored content (hash mismatch); falling back to fuzzy matching for passage ${passage.id}.`);
                }
                // Legacy / drifted fuzzy mode
                instance.mark(passage.content, {
                  accuracy: "partially",
                  separateWordSearch: false,
                  className: "loom-passage-highlight",
                  acrossElements: true,
                  diacritics: true,
                  ignoreJoiners: true,
                  ignorePunctuation: [":", ";", ",", ".", "-", "—", " ", "\n", "\r", "\t", "”", "“", '"', "'", "(", ")", "[", "]"],
                  each: (node) => dressMark(node as HTMLElement),
                  done: (count) => matches += count
                });
              }
            });
            if (matches > 0) console.log(`[Loom PDF] Applied ${matches} highlights on Page ${parsedPage}.`);

            /**
             * SEARCH HITS, MARKED SPAN BY SPAN — and the "span by span" is the
             * whole fix (TJ, 2026-08-19, from a screenshot: "here the first
             * result is not identified on the left page").
             *
             * A pdf.js text layer concatenates its spans with NO separator, so
             * the layer's textContent runs words together across every span
             * boundary. Measured on Communities of Practice p.1: a heading
             * ending "…social structure" is immediately followed by a paragraph
             * beginning "Engagement", and the combined text reads
             * "structureEngagement". `accuracy: "exactly"` asks for a non-word
             * character before the term, finds a letter, and refuses — so the
             * word was in the text, in the term list, on a mounted layer, and
             * still unmarked. mark.js reported noMatch for every term while the
             * page plainly contained two of them.
             *
             * Marking each span as its own context makes the seam a boundary,
             * which is what it is: those are two different runs of text in the
             * document, and only the rendering ran them together. Measured after:
             * p.1 went 0 → 2 matches, and p.2 — which looked fine — went 4 → 6,
             * because it was losing two at seams as well.
             *
             * The cost is a word SPLIT across two spans, which acrossElements
             * used to catch and this cannot. That trade is the right way round:
             * pdf.js splits by style and position run, so a split mid-word is
             * rare, while a paragraph starting flush against the previous run is
             * every heading on every page. Passages do not have this problem at
             * all — they mark by offset through markRanges, against the same
             * projection check-text-parity asserts.
             *
             * "exactly" stays. It is what keeps a search for "engage" off every
             * "disengagement" on the page.
             */
            const searchWords = searchTermsRef.current;
            if (searchWords.length > 0) {
              new Mark(Array.from(layer.children) as HTMLElement[]).mark(searchWords, {
                className: "loom-search-hit",
                separateWordSearch: false,
                accuracy: "exactly",
                caseSensitive: false,
                diacritics: true,
                acrossElements: false,
              });
            }
          }
        });
      });
    };

    // 1. Run whenever this effect triggers (e.g. when state.passages changes)
    applyHighlights();

    // 2. Also observe the DOM for when react-pdf injects the text layer spans.
    //    The observer knows WHICH layer landed (the span's container, or the
    //    layer div inside the added subtree), so only that layer is marked —
    //    never the hundred that were already done.
    const pendingLayers = new Set<Element>();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          const el = node as HTMLElement;
          if (el.nodeType !== Node.ELEMENT_NODE) continue;
          if (el.tagName === 'SPAN') {
            const layer = (m.target as HTMLElement).closest?.('.react-pdf__Page__textContent');
            if (layer) pendingLayers.add(layer);
          } else if (el.classList?.contains('react-pdf__Page__textContent')) {
            pendingLayers.add(el);
          } else {
            for (const layer of el.querySelectorAll('.react-pdf__Page__textContent')) {
              pendingLayers.add(layer);
            }
          }
        }
      }
      if (pendingLayers.size > 0) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          // A layer can unmount between debounces (page turn); marking a
          // detached node is wasted work.
          const layers = Array.from(pendingLayers).filter((l) => l.isConnected);
          pendingLayers.clear();
          if (layers.length) applyHighlights(layers);
        }, 100);
      }
    });

    // Rooted on the STAGE, not the shell. Your work renders inside .pdf-shell
    // now and its rows are full of <span>s — which the predicate above cannot
    // tell from a new text layer — so every open, every expanded concept row
    // and every keystroke in the capture form would schedule a debounced unmark
    // and re-mark of every visible text layer. applyHighlights only ever
    // queries .react-pdf__Page__textContent, so nothing in the sheet was ever
    // going to be marked; only the cost would have been real.
    observer.observe(stageRef.current ?? containerRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearTimeout(debounceTimer);
    };
    // `pageNumber` is deliberately NOT a dep: the effect body never reads it,
    // and having it there made every page turn re-register the observer and
    // re-mark every mounted layer to update marks on the one page that changed
    // — which the observer already catches when that page's layer lands.
    // `draft` is a dep because the draft IS a mark: opening one has to repaint
    // the layer that carries the selection, or the rails never see an anchor
    // for it and no card appears. Closing one has to repaint too, or the
    // highlight outlives the capture it stood for. Twice per capture, against
    // an observer re-registration that costs one sweep — the same trade the
    // passages list already makes.
  }, [state.passages, state.concepts, bindHighlightNode, sourceName, searchTerms, overlay, stageEl, draft]); // Re-run when passages, search terms, the draft or the overlay change — and if the stage node itself is replaced

  /**
   * Is there a rail to draw the draft on?
   *
   * The strip has none, and page mode hides its rails below the width where
   * they would eat the page. Where there is nowhere to put a card, the modal
   * is still the capture — see the draft state's own note on why it stayed.
   */
  const railAvailable = railsOn && !isNarrow && (viewMode === "page" || viewMode === "matrix");

  const handleCaptureClick = () => {
    if (!highlightRect) return;
    const target: CaptureTarget = {
      text: highlightRect.text,
      pageNum: highlightRect.pageNum,
      startOffset: highlightRect.startOffset,
      endOffset: highlightRect.endOffset,
      pageContentHash: highlightRect.pageContentHash,
    };
    setHighlightRect(null);
    if (!railAvailable) {
      setCaptureData(target);
      setShowCaptureModal(true);
      return;
    }
    /**
     * The canvas comes in to a zoom the card can be typed into, and it does
     * that for itself (TJ, 2026-08-19). The multiplier needed is not a
     * constant this component could hold: the editable line is
     * EDIT_FROM_SPREAD × spreadFitK, and turning that into a zoom multiplier
     * needs fitAllK, which
     * depends on how many spreads the document lays out. SpreadCanvasView owns
     * that arithmetic, so it owns the move — see its draft effect, which also
     * centres the selection while it is in there.
     */
    setDraft(target);
  };

  /** The draft is abandoned, and the selection with it. */
  const cancelDraft = useCallback(() => {
    setDraft(null);
    document.getSelection()?.removeAllRanges();
  }, []);

  /**
   * The draft as the rails take it: the passage the marking pass painted, and
   * the card to draw in its place. Built here rather than in either host so
   * the two cannot drift, and so neither of them has to know a capture path
   * exists.
   */
  const railDraft = useMemo(() => {
    if (!draft) return null;
    return {
      passage: draftAsPassage(draft, sourceName),
      card: (
        <DraftCard
          text={draft.text}
          source={sourceName}
          sourceId={sourceId}
          location={`p. ${draft.pageNum ?? pageNumber}`}
          pageNumber={draft.pageNum}
          startOffset={draft.startOffset}
          endOffset={draft.endOffset}
          pageContentHash={draft.pageContentHash}
          onCaptured={handleCaptured}
          onCancel={cancelDraft}
        />
      ),
    };
  }, [draft, sourceName, sourceId, pageNumber, handleCaptured, cancelDraft]);

  /**
   * Peer passages on what is actually in front of you. Only the paged view has
   * a "here" to report — the strip and the matrix show many pages at once, so
   * the status line falls back to the whole-reading total there.
   */
  const overlayHereCount = useMemo(() => {
    if (!overlay?.pages.length || viewMode !== "page") return 0;
    const shown = isTwoPage ? [pageNumber, pageNumber + 1] : [pageNumber];
    return overlay.pages
      .filter((page) => shown.includes(page.pageNumber))
      .reduce((total, page) => total + page.count, 0);
  }, [overlay, viewMode, isTwoPage, pageNumber]);

  const advance = isTwoPage ? 2 : 1;
  const canGoPrev = pageNumber > 1;
  const canGoNext = numPages ? pageNumber + (isTwoPage ? 1 : 0) < numPages : false;

  // Warm the browser cache with the NEXT spread's images (and the previous
  // page's), so the placeholder above paints from cache the moment the turn
  // happens. A few tens of KB per turn against a turn that reads as instant.
  useEffect(() => {
    if (!pageImageBase || viewMode !== "page") return;
    const warm = [
      pageNumber + advance,
      ...(isTwoPage ? [pageNumber + advance + 1] : []),
      pageNumber - 1,
    ];
    for (const n of warm) {
      if (n < 1 || (numPages && n > numPages)) continue;
      const img = new Image();
      img.src = `${pageImageBase}/${n}?w=1280`;
    }
  }, [pageImageBase, viewMode, pageNumber, advance, isTwoPage, numPages]);

  const handlePrev = useCallback(() => {
    setPageNumber(p => Math.max(1, p - advance));
  }, [advance]);
  
  const handleNext = useCallback(() => {
    setPageNumber(p => Math.min(numPages || p, p + advance));
  }, [advance, numPages]);

  /**
   * In the strip a page is somewhere to scroll to, not something to turn to —
   * so "go to this passage's page" (and the initial page) brings the page
   * into view instead of swapping what is rendered. STRIP ONLY: the matrix
   * pans by transform inside clip-overflow boxes, so this scrollIntoView
   * would either no-op or (in a merely-hidden box) shift pixels the d3
   * transform never learns about; SpreadCanvasView's focusPage prop is the
   * matrix's version of this effect.
   */
  useEffect(() => {
    if (viewMode !== "strip") return;
    const stageEl = stageRef.current;
    if (!stageEl) return;
    const timer = window.setTimeout(() => {
      const slot = stageEl.querySelector(`[data-slot-page="${pageNumber}"]`);
      slot?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 60);
    return () => window.clearTimeout(timer);
    // numPages matters: on the first load the slots do not exist yet, so
    // without it this ran once against an empty stage and "go to this passage's
    // page" quietly did nothing until you changed page by hand.
  }, [pageNumber, viewMode, numPages]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // A dialog owns the keyboard while it is up — the capture modal, Loom's
      // confirm (which you can raise from inside the sheet: "remove concept"),
      // an info panel. Escape there is theirs, and `f` must
      // not throw a reader into fullscreen out from under one.
      if (showCaptureModal || document.querySelector(".info-scrim, .scrim.show")) return;

      /**
       * An OPEN DRAFT owns the keyboard the same way, even though it is not a
       * dialog and takes no scrim. The card handles Escape itself and stops it
       * there; this guard is for everything else the viewer binds — `f` for
       * fullscreen, the arrow keys for page turns — which would otherwise fire
       * from under someone typing a concept name into the rail. The card's own
       * fields already suppress most of it through the `typing` test below,
       * but the draft's Cancel and Save buttons are focusable and are not
       * inputs.
       */
      if (draftRef.current && (containerRef.current?.querySelector(".pdf-draftcard")?.contains(document.activeElement) ?? false)) return;

      const active = document.activeElement as HTMLElement | null;
      const typing =
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.tagName === "SELECT" ||
        !!active?.isContentEditable;
      const inWork = !!active?.closest?.("[data-yourwork]");
      // A field outside the sheet owns every key, Escape included — the search
      // input closes its own panel that way.
      if (typing && !inWork) return;
      // Inside the sheet nothing steers the reading. The guard used to name
      // INPUT and TEXTAREA only, so Left/Right on a <select> turned the page
      // under it, and `f` pressed on any button or <summary> in the log —
      // which is most of it — threw the reader into fullscreen. Escape is the
      // one key that gets out.
      if (inWork && e.key !== "Escape") return;

      if (e.key === 'Escape') {
        // One Escape, one thing: dismiss the tooltip if one is open, then the
        // search panel, then Your work, then fullscreen. Doing several at once
        // would take the reading away from someone who only meant to close a
        // label. Your work comes before fullscreen because it is the nearer
        // thing — Escape means the topmost surface, not the biggest one.
        if (highlightTooltip) hideHighlightTooltip();
        else if (searchOpen) closeSearch();
        else if (workOpen) requestToggleWork();
        else if (isFullscreen) setFullscreen(false);
        return;
      }

      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setFullscreen(!isFullscreen);
        return;
      }

      // Arrows turn the spread in paged mode; the continuous views scroll,
      // which the browser already does for a focused scroll container.
      if (viewMode !== "page") return;
      if (e.key === 'ArrowLeft' && canGoPrev) {
        handlePrev();
      } else if (e.key === 'ArrowRight' && canGoNext) {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoPrev, canGoNext, handlePrev, handleNext, hideHighlightTooltip, showCaptureModal, viewMode, isFullscreen, setFullscreen, highlightTooltip, searchOpen, closeSearch, workOpen, requestToggleWork]);

  /**
   * Your work is not a dialog: the reading stays live and selectable behind
   * it, so nothing is trapped and nothing is scrimmed. But the tab order has
   * to follow the eye. Opening seats focus on the sheet — it is the last thing
   * in the shell, so otherwise a keyboard reader tabs the entire text layer to
   * reach it. Closing hands focus back to the button that did it, but only if
   * the reader was in there: yanking focus out of the page because a panel
   * shut elsewhere is worse than leaving it be. The <body> check is the
   * fallback for the one close that does not come through requestToggleWork —
   * pressing "goto" on a passage, which closes the sheet from inside it.
   *
   * preventScroll on both: the sheet is its own scroller, and focus() would
   * jump it before the reader has seen the top.
   */
  useEffect(() => {
    if (!!workOpen === workWasOpen.current) return;   // not a transition; also skips mount
    workWasOpen.current = !!workOpen;
    if (workOpen) {
      // Next frame: focus() on a visibility:hidden element is a no-op.
      const raf = requestAnimationFrame(() =>
        workPanelRef.current?.focus({ preventScroll: true })
      );
      return () => cancelAnimationFrame(raf);
    }
    const active = document.activeElement;
    if (workHadFocus.current || !active || active === document.body) {
      workToggleRef.current?.focus({ preventScroll: true });
    }
    workHadFocus.current = false;
  }, [workOpen]);

  /**
   * Matrix page width: a contact sheet of four across on a desktop stage (two
   * on a phone) at zoom 1, scaled from there. The floor keeps a page legible
   * as a thumbnail; the ceiling stops a hard zoom from producing a page so
   * wide the grid can no longer be panned sensibly.
   */
  const matrixColumns = isNarrow ? 2 : 4;
  // The width matrix text layers render at, once, in canvas units — sized so
  // a spread-fit zoom reads like page mode. Zoom is a transform on the whole
  // canvas (SpreadCanvasView owns it); this number never moves with it, which
  // is what keeps the slider from re-rendering forty pages.
  const matrixBaseWidth = Math.min(
    Math.max((stage.w - 36) / matrixColumns - 18, 90),
    Math.max(stage.w * 2, 300)
  );

  // Calculate page dimensions based on fit mode
  // What the toggle carries when the sheet is shut. Cheap and permanent, and
  // it answers "did that save?" without opening anything.
  const workCount = scoped.passages.length;

  // The margin cards take real width beside the pages; fit-to-width hands it
  // to them here so the spread still fits without a sideways scroll. Fit-page
  // is left alone — height is unaffected, and "safe center" already lets an
  // overflowing spread scroll rather than clipping its start edge.
  const railSpace = railsOn && !isNarrow && viewMode === "page"
    ? (isTwoPage ? 2 : 1) * (RAIL_W + 12)
    : 0;

  const calcPageProps = () => {
    if (fitMode === "height") {
      // The stage is the real estate; the padding around the pages is the only
      // thing taken off it, so "fit page" genuinely fills the height available.
      const fitH = Math.max(320, stage.h - (isNarrow ? 24 : 48));
      if (railSpace > 0) {
        // With the cards out, width binds too: a height-fit spread plus two
        // rails would hang the right rail past the stage edge — reachable by
        // scroll, but reading as clipped. Smaller pages beside visible cards
        // beat full pages beside a card you have to go looking for.
        const perPage = isTwoPage
          ? (containerWidth - 248 - railSpace) / 2
          : containerWidth - (isNarrow ? 56 : 228) - railSpace;
        return { height: Math.max(320, Math.min(fitH, perPage * aspect)) };
      }
      return { height: fitH };
    } else {
      // fit to width
      // Non-page horizontal space:
      // Desktop: padding + side arrows + gaps. Mobile: tighter layout.
      const nonPageSpace = isNarrow ? 56 : 228;
      if (isTwoPage) {
        // Plus 20px gap between the two pages = 248px total non-page space
        const targetWidth = (containerWidth - 248 - railSpace) / 2;
        return { width: Math.max(targetWidth, 200) };
      } else {
        const targetWidth = containerWidth - nonPageSpace - railSpace;
        return { width: Math.max(targetWidth, 200) };
      }
    }
  };

  /**
   * The fitted width of ONE page in page mode — the base the slots render
   * their text layers at, once; pageZoom multiplies the DISPLAY width and
   * reaches the page as CSS scale, so zooming re-renders no text. Stepped to
   * 8px so a live window-resize nudges the base (and the text layer with it)
   * once per step, not once per pixel.
   */
  const fitProps: { height?: number; width?: number } = calcPageProps();
  const pageBaseWidth = Math.max(
    200,
    Math.round((fitProps.height != null ? fitProps.height / aspect : (fitProps.width ?? 200)) / 8) * 8
  );

  return (
    // In flow, not a fixed takeover: the header and the journey nav stay
    // visible and clickable above the text (ratified TJ 8/1 — the journey is
    // always in view; tab 00 is one of its stations).
    <div
      className={`pdf-shell${isFullscreen ? " fullscreen" : ""}`}
      ref={containerRef}
    >

      <style>{`
        .loom-passage-highlight {
          background-color: rgba(255, 204, 0, 0.4);
          border-bottom: 2px solid rgba(255, 204, 0, 0.8);
          color: inherit;
          cursor: help;
          pointer-events: auto;
        }
        /* A searched word on the page. Sage, not the passage yellow: a search
           hit is a place the text says something, never a passage anyone
           captured — the two must not be readable as each other. */
        .loom-search-hit {
          background-color: rgba(122, 138, 110, 0.4);
          outline: 1px solid rgba(122, 138, 110, 0.75);
          color: inherit;
        }
        /* The Passages Overlay: where other people marked, in steps. Slate —
           neither the passage yellow nor the search sage, because three different
           facts about a span must never read as each other. No cursor and no
           handlers: it is a comparison, and clicking it should do exactly what
           clicking the paper does. */
        .loom-overlay-heat {
          background-color: rgba(64, 84, 112, 0.12);
          /* A rule ABOVE the words as well as a wash behind them. Your own
             highlight nests inside this mark and paints its yellow over the
             wash — and "did anyone else mark the words I marked?" is the most
             interesting thing this view can answer, so the section's mark has
             to survive underneath your own. Yellow underlines; slate
             overlines; neither hides the other. */
          box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.40);
          color: inherit;
        }
        .loom-overlay-heat[data-heat="2"] {
          background-color: rgba(64, 84, 112, 0.20);
          box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.55);
        }
        .loom-overlay-heat[data-heat="3"] {
          background-color: rgba(64, 84, 112, 0.28);
          box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.70);
        }
        .loom-overlay-heat[data-heat="4"] {
          background-color: rgba(64, 84, 112, 0.36);
          box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.82);
        }
        .loom-overlay-heat[data-heat="5"] {
          background-color: rgba(64, 84, 112, 0.44);
          box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.95);
        }
        .pdf-overlay-ctl {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .pdf-overlay-bar {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px 14px;
          padding: 7px 20px;
          border-bottom: 1px solid var(--rule);
          background: rgba(64, 84, 112, 0.05);
          font-size: 13px;
          color: var(--ink-soft);
          flex: 0 0 auto;
        }
        .pdf-overlay-bar b { color: var(--ink); font-weight: 500; }
        .pdf-overlay-scale { display: flex; align-items: center; gap: 4px; }
        /* The same five steps the page uses, rule included. */
        .pdf-overlay-scale i {
          display: inline-block;
          width: 15px;
          height: 12px;
          background: rgba(64, 84, 112, 0.12);
          box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.40);
        }
        .pdf-overlay-scale i:nth-child(2) { background: rgba(64, 84, 112, 0.20); box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.55); }
        .pdf-overlay-scale i:nth-child(3) { background: rgba(64, 84, 112, 0.28); box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.70); }
        .pdf-overlay-scale i:nth-child(4) { background: rgba(64, 84, 112, 0.36); box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.82); }
        .pdf-overlay-scale i:nth-child(5) { background: rgba(64, 84, 112, 0.44); box-shadow: inset 0 2px 0 rgba(64, 84, 112, 0.95); }
        .pdf-search-panel {
          position: absolute;
          top: 64px;
          right: 12px;
          z-index: 20;
          width: min(340px, calc(100vw - 24px));
          max-height: min(56vh, 480px);
          display: flex;
          flex-direction: column;
          background: var(--paper-2);
          border: 1px solid var(--rule);
          border-radius: 4px;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
          padding: 10px 12px;
        }
        .pdf-search-row { display: flex; gap: 8px; align-items: center; }
        .pdf-search-row .tinput { flex: 1; }
        .pdf-search-tally { display: block; margin: 10px 0 6px; }
        .pdf-search-hits {
          list-style: none;
          margin: 0;
          padding: 0;
          overflow-y: auto;
          min-height: 0;
        }
        .pdf-search-hits li + li { border-top: 1px dotted var(--rule); }
        .pdf-search-hit {
          display: block;
          width: 100%;
          text-align: left;
          background: transparent;
          border: none;
          padding: 8px 4px;
          cursor: pointer;
          font-family: var(--body);
          color: var(--ink);
        }
        .pdf-search-hit:hover { background: rgba(122, 138, 110, 0.09); }
        .pdf-search-hit .n {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--grey);
          margin-right: 7px;
        }
        .pdf-search-snip { font-size: 13px; line-height: 1.45; color: var(--ink-soft); }
        .pdf-search-snip .snipmark {
          background: rgba(122, 138, 110, 0.28);
          color: inherit;
          padding: 0 1px;
          border-radius: 2px;
        }
        .loom-highlight-tooltip {
          position: fixed;
          z-index: 9500;
          max-width: min(320px, calc(100vw - 24px));
          background: rgba(26, 25, 22, 0.95);
          color: var(--paper);
          border: 1px solid rgba(255, 204, 0, 0.4);
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 12px;
          line-height: 1.4;
          white-space: pre-wrap;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(2px);
          pointer-events: auto;
        }
        .loom-highlight-tooltip .entry + .entry {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(0, 0, 0, 0.12);
        }
        .loom-highlight-tooltip .head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 2px;
        }
        .loom-highlight-tooltip .meta {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          opacity: 0.88;
          margin-bottom: 0;
          color: rgba(255, 204, 0, 0.9);
        }
        .loom-highlight-tooltip .close {
          margin: 0;
          padding: 0;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.4);
          background: transparent;
          color: rgba(255, 255, 255, 0.85);
          font-size: 10px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .loom-highlight-tooltip .close:hover {
          border-color: rgba(255, 255, 255, 0.75);
          color: #fff;
        }
        .loom-highlight-tooltip .coding {
          font-family: var(--display);
          font-size: 15px;
          color: var(--paper);
        }
        .loom-highlight-tooltip .foot {
          margin-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.18);
          padding-top: 6px;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.03em;
          color: rgba(255, 255, 255, 0.8);
        }
        .loom-highlight-tooltip button {
          margin-top: 8px;
          background: transparent;
          border: 1px solid rgba(255, 204, 0, 0.45);
          color: rgba(255, 204, 0, 0.98);
          border-radius: 4px;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 4px 7px;
          cursor: pointer;
        }
        .loom-highlight-tooltip button:hover {
          border-color: rgba(255, 204, 0, 0.95);
          color: #fff2cc;
        }
        /* Make sure the text layer passes pointer events down so we can select */
        .react-pdf__Page__textContent span {
          pointer-events: auto;
        }

        /* The shell fills whatever it is given; in fullscreen it takes the
           window, above the header and journey but below Loom's own overlays
           (.info-scrim is 10000, so capture still opens on top). */
        .pdf-shell {
          position: relative;
          background-color: var(--paper);
          display: flex;
          flex-direction: column;
          height: 100%;
          /* No min-height: main is overflow:hidden, so a shell taller than it
             puts its own bottom (the stage, and on a phone the paging bar)
             somewhere nothing can scroll to. A landscape phone leaves barely
             300px under the chrome — less than any floor worth setting — so
             the shell takes what it is given and the stage scrolls inside. */
          min-height: 0;
        }
        .pdf-shell.fullscreen {
          position: fixed;
          inset: 0;
          z-index: 6000;
          min-height: 0;
        }
        /* The stage is the only scrolling part of the viewer, so the toolbar
           stays put while the pages move under it. */
        .pdf-stage {
          flex: 1 1 auto;
          min-height: 0;
          background-color: #eef0f2;
          overscroll-behavior: contain;
        }
        /* "safe center" centres only while the content fits. Plain centring
           overflows equally in both directions, and a scroll container cannot
           reach content pushed off its start edge — so a spread or a zoomed
           page wider than the stage had its left side permanently unreachable.
           With safe, an overflowing item falls back to start-aligned and can
           be scrolled to. */
        .pdf-stage.mode-page { overflow: auto; display: flex; justify-content: safe center; cursor: grab; }
        /* The matrix's gesture language, spoken in page mode: the stage is
           grabbable everywhere except over text (selection) and controls —
           and with space held, over text too. */
        .pdf-stage.mode-page .react-pdf__Page__textContent { cursor: text; }
        .pdf-stage.mode-page.space-pan,
        .pdf-stage.mode-page.space-pan .react-pdf__Page__textContent { cursor: grab; }
        .pdf-stage.mode-page.panning,
        .pdf-stage.mode-page.panning .react-pdf__Page__textContent { cursor: grabbing; }
        .pdf-stage.mode-strip { overflow-x: auto; overflow-y: hidden; }
        /* The matrix pans by TRANSFORM, not by scroll — clip, not hidden,
           and the difference is the same one .pdf-body documents: "hidden"
           is still a scroll container, so a scrollIntoView or a Tab-focus
           onto an off-view highlight would scroll it by an offset the d3
           transform never learns about, permanently desyncing rastering,
           pinch anchoring and the slider's recenter. "clip" cannot scroll.
           PageSlot's IntersectionObserver still uses the stage as its root:
           an IO root clips without needing to scroll, and transforms move
           slots in and out of it just fine. position: relative because the
           spread viewport fills it with position:absolute/inset:0 — NOT
           height:100%, which resolves to 0 against a flex-stretched stage
           and silently clips every page. */
        .pdf-stage.mode-matrix { overflow: clip; position: relative; }

        /* The pages, and the sheet over them. No size of its own: it is the
           stage's old box, split off only so Your work has something to be
           absolute inside that is NOT the toolbar. Column, because the stage
           is flex:1 1 auto and was a column child of the shell — the stage's
           content box, and therefore the ResizeObserver, stage.w/h and
           containerWidth, must measure exactly what they measured before this
           refactor.

           overflow:clip, NOT overflow:hidden, and the difference is
           load-bearing. Closed, the sheet is parked a full panel-width off the
           right edge, and a transformed box still counts toward its ancestor's
           scrolling area. "hidden" would make this a scroll container holding
           440px of horizontal scroll with no scrollbar to warn you — so any
           focus() inside the parked sheet that did not pass preventScroll (a
           browser autoscroll, not our own call) would slide the whole reading
           sideways with no way back. "clip" makes no scroll container at all,
           so there is nothing to scroll. Note that scrollWidth still reports
           the overflow either way — the scrolling AREA is not the same
           question as whether the box scrolls — which is why
           tests/pdf-fit.spec.ts measures .pdf-stage and not this. */
        .pdf-body {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: clip;
        }

        .pdf-strip-run {
          display: flex;
          align-items: center;
          gap: 18px;
          height: 100%;
          padding: 12px 18px;
          width: max-content;
        }
        /* The matrix's spread canvas: one transformed plane holding every
           spread. The transform is written imperatively (SpreadCanvasView),
           so pan/zoom never re-renders a page. */
        .pdf-spread-viewport {
          position: absolute;
          inset: 0;
          /* clip, never hidden — same reason as the stage above. */
          overflow: clip;
          /* d3 owns every gesture here; without this, a touch pan scrolls
             the document instead of the canvas. */
          touch-action: none;
          cursor: grab;
        }
        .pdf-spread-viewport:active { cursor: grabbing; }
        /* Space held: the hand covers everything — the text layers' own
           cursor:text rule included, which needs the deeper selector to
           outweigh. Grabbing while the button is down. */
        .pdf-spread-viewport.space-pan,
        .pdf-spread-viewport.space-pan .pdf-spread-canvas .react-pdf__Page__textContent,
        .pdf-spread-viewport.space-pan .pdf-railcard { cursor: grab; }
        .pdf-spread-viewport.space-pan:active,
        .pdf-spread-viewport.space-pan:active .pdf-spread-canvas .react-pdf__Page__textContent,
        .pdf-spread-viewport.space-pan:active .pdf-railcard { cursor: grabbing; }
        /* NO standing will-change: it caches the whole canvas as one GPU
           layer rasterized once, so every zoom scales a stale bitmap and the
           cards and pages go pixelated no matter how sharp their own pixels
           are. SpreadCanvasView sets the hint imperatively for the duration
           of a gesture only — soft while moving, re-rasterized crisp the
           moment it settles. */
        .pdf-spread-canvas {
          position: absolute;
          top: 0;
          left: 0;
          transform-origin: 0 0;
        }
        .pdf-spread-canvas .react-pdf__Page__textContent { cursor: text; }
        .pdf-spread-rails {
          /* Not selectable: a drag that starts on a card anchors outside
             every page — same hazard as .pdf-slot-label. */
          user-select: none;
          -webkit-user-select: none;
        }
        /* Above the text layers: pdf.js gives .textLayer z-index 2, and a
           card growing inward over its own page must cover the page's marks,
           not wear them. */
        .pdf-spread-canvas .pdf-rail-leaders { z-index: 3; }
        .pdf-spread-canvas .pdf-railcard-stack { z-index: 3; }
        .pdf-spread-canvas .pdf-railcard-stack > .pdf-railcard {
          position: relative;
          left: auto;
          right: auto;
        }
        /* Counter-scaling: card text never shrinks below its reading size as
           the canvas zooms out. Done via font-size — real layout, not a
           transform — so the card grows to hold it and the rail re-stacks. */
        /* A CARD IS THE SAME SIZE IN THE HAND AT EVERY ZOOM (TJ, 2026-08-19: "why do
           the cards appear bigger on the canvas view showing a spread than they
           do in the 2 pages showing a spread?").

           Because they were drawn in CANVAS units and then scaled by the
           transform, while page mode's are plain screen px. Measured at
           1536x960, spread-fit (k = 1.97): the boxes matched almost exactly —
           232px against page mode's 220 — but the type did not, 21.7px against
           11.5px. Same box, twice the type, so every label wrapped and the card
           came out 275px tall against 87. One step further in it was worse
           still: 325px wide, 30px type, 386px tall.

           --invk could not fix it and was never meant to. It was
           max(1, spreadFitK / k) — clamped at 1 — so it held type at reading
           size as you zoom OUT and did nothing at all as you zoom IN. This is
           the zoom-in half, which nothing governed (--invk itself is deleted;
           everything divides by --k now).

           Dividing by --k instead governs both halves with one rule: every
           length here is screen px, so a card is the size page mode draws it,
           always. The base sizes are page mode's own (see .pdf-railcard-note
           and friends below) so the two cannot drift apart by a rounding.

           The WIDTH keeps its cap. 220/k grows without bound as k falls, and at
           fit-all that would be a card several times the spread it annotates;
           railW + gap + basePageWidth is the old ceiling and still the right one
           — a card may grow inward over its own page and no further. */
        .pdf-spread-canvas .pdf-railcard-note { font-size: calc(11.5px / var(--k, 1)); }
        .pdf-spread-canvas .pdf-railcard-note-edit {
          font-size: calc(11.5px / var(--k, 1));
          height: calc(68px / var(--k, 1));
        }
        .pdf-spread-canvas .pdf-railcard-rm { font-size: calc(9.5px / var(--k, 1)); }
        .pdf-spread-canvas .pdf-railcard-chip { font-size: calc(10px / var(--k, 1)); }
        .pdf-spread-canvas .pdf-railcard-add {
          width: calc(18px / var(--k, 1));
          height: calc(18px / var(--k, 1));
          font-size: calc(12px / var(--k, 1));
        }
        .pdf-spread-canvas .pchip-x { font-size: calc(12px / var(--k, 1)); }
        .pdf-spread-canvas .pdf-railcard { padding: calc(8px / var(--k, 1)) calc(10px / var(--k, 1)); }
        .pdf-spread-canvas .pdf-railcard-badges { gap: calc(4px / var(--k, 1)); }
        /* The lengths BETWEEN the type, which are as much of a card's size as
           the type is. Dividing only the font-sizes got the width exactly right
           (220px at every zoom, matching page mode) and left the heights
           drifting — measured 19px / 22.9px / 26px for the same chip at
           2-page, spread-fit and one step in, because every padding was still
           a canvas length multiplied by k. Anything that contributes to a
           card's box has to be in the same unit as the box. */
        .pdf-spread-canvas .pdf-railcard-chip { padding: calc(1px / var(--k, 1)) calc(7px / var(--k, 1)); }
        .pdf-spread-canvas .pdf-railcard-note {
          margin-top: calc(6px / var(--k, 1));
          padding: calc(4px / var(--k, 1)) calc(5px / var(--k, 1));
        }
        .pdf-spread-canvas .pdf-railcard-note-edit {
          margin-top: calc(6px / var(--k, 1));
          padding: calc(4px / var(--k, 1)) calc(5px / var(--k, 1));
        }
        .pdf-spread-canvas .pdf-railcard-stack { border-radius: calc(4px / var(--k, 1)); }
        .pdf-spread-canvas .pdf-railcard {
          border-radius: calc(4px / var(--k, 1));
          /* All four, not just the accent edge: a 1px rule drawn in canvas
             units is 2.8px on screen at capture zoom, and four of them is most
             of the height a chip was gaining. */
          border-width: calc(1px / var(--k, 1));
          border-left-width: calc(3px / var(--k, 1));
          /* The card's OWN size, which everything inside inherits unless it
             says otherwise — the badges row does not, and neither does a bare
             text node. Left alone it inherited the canvas's, which is the
             page's size: 46.9px on screen against page mode's 17. 17px is what
             page mode computes here, matched rather than guessed (measured by
             diffing computed styles across the two views). */
          font-size: calc(17px / var(--k, 1));
        }
        .pdf-spread-canvas .pdf-railcard-chip { border-width: calc(1px / var(--k, 1)); }
        /* Space-pan turns the whole canvas into a drag surface. The card's
           controls would otherwise take the press and start an unfile instead
           of a pan — the cursor already says grab, and this makes it true. */
        .pdf-spread-viewport.space-pan .pdf-railcard-stack :is(button, input, textarea) { pointer-events: none; }
        /* The matrix raster path: our canvas below, react-pdf's text layer
           laid absolutely over it — the Page div itself paints nothing. The
           scale wrapper clips to the slot's zoomed footprint so the transform
           never bleeds into a neighbouring cell. */
        .pdf-slot-scale { overflow: hidden; }
        .pdf-slot-inner { position: relative; background: #fff; }
        .pdf-raster { display: block; height: auto; }
        /* The Page div itself paints nothing; positioning lives on the
           .pdf-slot-text wrapper (inline, in PageSlot) because react-pdf
           puts position:relative INLINE on this div and no selector wins
           against that. */
        .pdf-slot-inner .react-pdf__Page { background: transparent; }

        /* Reserved space for a page that has not drawn yet: the same footprint
           the page will take, so the scrollbar never lies and nothing jumps. */
        .pdf-slot-holder {
          background: repeating-linear-gradient(45deg, #e7e9ec, #e7e9ec 10px, #e2e4e8 10px, #e2e4e8 20px);
          border: 1px solid var(--rule);
          border-radius: 2px;
        }
        .pdf-slot-label {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: .1em;
          color: var(--ink-soft);
          text-align: center;
          padding-top: 4px;
          /* Not selectable: it sits between two pages, so a drag that starts
             on it anchors outside every page — and its digits would otherwise
             land inside the captured passage. */
          user-select: none;
          -webkit-user-select: none;
        }
        /* The overview inset — "you are here" on the spread canvas. Sits on
           the stage, not the transformed plane; applyTransform writes the
           view-rect imperatively and shows the map only when the view is
           smaller than the whole (at fit-all it would be a map of everywhere).
           touch-action none: a drag here steers the view, never the page. */
        .pdf-minimap {
          position: absolute;
          right: 14px;
          bottom: 14px;
          z-index: 5;
          background: var(--paper-2);
          border: 1px solid var(--rule);
          border-radius: 4px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
          overflow: hidden;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          touch-action: none;
        }
        .pdf-minimap svg { display: block; }
        .pdf-minimap rect { fill: #fff; stroke: rgba(0, 0, 0, 0.10); }
        .pdf-minimap-view {
          position: absolute;
          top: 0;
          left: 0;
          border: 1.5px solid var(--ochre, #c8a03a);
          background: rgba(200, 154, 46, 0.16);
          border-radius: 2px;
          pointer-events: none;
        }
        .pdf-modes { display: flex; background: var(--paper); border-radius: 4px; padding: 1px; border: 1px solid var(--rule); }
        .pdf-modes button { border: none; margin: 0; padding: 4px 9px; }
        /* The floor this used to release is gone: .btn.mini carries no
           min-height since 2026-08-17, so a scoped override here would only
           shave a pixel of padding — and it outranked .btn.iconly, which
           turned the square full-screen button into a 34px box and put 7px
           back on the row it had been removed from.
           (No backticks in this block: styled-jsx template literal.) */
        .pdf-toolbar {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 4px 20px;
          border-bottom: 1px solid var(--rule);
          background-color: var(--paper-2);
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          z-index: 10;
          flex: 0 0 auto;
        }

        @media (max-width: 900px) {
          .pdf-strip-run { gap: 10px; padding: 8px 10px; }
          /* One row, no wrapping: the toolbar is a strip of controls the width
             of the screen, not a block that grows downward into the reading. */
          .pdf-toolbar {
            flex-wrap: nowrap;
            padding: 6px 8px;
            gap: 6px;
            overflow-x: auto;
            scrollbar-width: none;
          }
          .pdf-toolbar::-webkit-scrollbar { display: none; }
          .pdf-toolbar > div { flex: 0 0 auto; }
          .pdf-toolbar .btn.mini { padding: 6px 8px; min-height: 34px; font-size: 10px; }
          .pdf-modes button { padding: 6px 8px; min-height: 34px; }
        }

        /* The margin cards (page mode). The wrapper is the spread plus its
           rails: rails sit IN FLOW beside the pages — absolute children off a
           scroll container's start edge can never be scrolled to — and the
           leader lines paint over the whole group from one absolute SVG. */
        .pdf-spread-wrap {
          display: flex;
          align-items: stretch;
          gap: 12px;
          position: relative;
        }
        .pdf-rail {
          position: relative;
          width: 220px;
          flex: 0 0 220px;
          /* Not selectable: it sits beside the page, so a drag that starts
             here anchors outside every page — same hazard as .pdf-slot-label,
             and the card text would land inside the captured passage. */
          user-select: none;
          -webkit-user-select: none;
        }
        .pdf-rail-leaders {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: visible;
        }
        /* The kept mark: the rectangles mark.js painted, redrawn once the
           text layer that carried them has gone. Same 0.4 yellow fill as
           .loom-passage-highlight, because it is the same mark and must not
           read as a second kind of thing.
           The edge is an outline here rather than that rule's bottom-only
           border: down at the impostor tier a mark is a few pixels tall over
           a grey thumbnail, and an underline alone leaves it looking like a
           smudge. non-scaling-stroke keeps it one device pixel at any zoom,
           so it never thickens into the mark it is outlining.
           No pointer events: the real highlight carries a tooltip and a
           click; this is a picture of one. */
        .pdf-kept-marks {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: visible;
        }
        .pdf-kept-marks rect {
          fill: rgba(255, 204, 0, 0.4);
          stroke: rgba(255, 204, 0, 0.8);
          stroke-width: 1;
          vector-effect: non-scaling-stroke;
        }
        /* The redrawn search hits, in the SAME sage the live mark uses
           (.loom-search-hit) rather than the passage ochre — at fit-all the two
           kinds sit side by side on the plane, and a search hit wearing a
           capture's colour would be a lie about what it is. */
        .pdf-kept-search {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: visible;
        }
        .pdf-kept-search rect {
          fill: rgba(122, 138, 110, 0.4);
          stroke: rgba(122, 138, 110, 0.75);
          stroke-width: 1;
          vector-effect: non-scaling-stroke;
        }
        .pdf-rail-leaders path {
          stroke: rgba(255, 204, 0, 0.8);
          stroke-width: 1.5;
          fill: none;
        }
        .pdf-railcard-stack {
          position: absolute;
          left: 0;
          right: 0;
        }
        /* The open editor is flush against the card above it, so the card's
           bottom corners square off and the two read as one object with a
           rule across it. Set here rather than in the CSS module because the
           element that has to change is the PASSAGE card, which the module
           does not own. */
        .pdf-railcard-stack[data-add-open="true"] > .pdf-railcard {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
        }
        .pdf-rail > .pdf-railcard-stack > .pdf-railcard {
          position: relative;
          left: auto;
          right: auto;
        }
        .pdf-railcard {
          position: absolute;
          left: 0;
          right: 0;
          background: var(--paper);
          border: 1px solid var(--rule);
          border-left: 3px solid rgba(255, 204, 0, 0.8);
          border-radius: 4px;
          padding: 8px 10px;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .pdf-railcard:hover, .pdf-railcard:focus-visible {
          border-color: var(--ink-soft);
        }
        /* The card is badges and a note now (TJ, 2026-08-17). Its old
           label/def/chips/go rules were dead from that day and were deleted
           on 2026-08-20.
           (No backticks in this block: styled-jsx template literal.) */
        .pdf-railcard-badges { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
        /* A badge is one line. On the canvas the type is counter-scaled, so a
           long label wrapped INSIDE its own pill and dropped the × onto a
           second row — a remove control floating under the word it removes.
           The label truncates instead; the row still wraps between badges. */
        /* min-width:0 is what actually lets it shrink: a flex item refuses to
           go below its content width without it, so max-width alone left the
           badge — and its × — hanging off the card's edge.

           display:flex is the other half, and it was missing. The span is a
           flex ITEM of .pdf-railcard-badges, so it is blockified and its
           max-width does bind — measured at the zoom floor on Object Worlds
           at 1920x1080, chip box 588 canvas units inside a 607-unit card. But
           a BUTTON is inline-block, so .pdf-chip-open below shrink-to-fit its
           own label and nothing ever capped it: its overflow and ellipsis
           could not fire, and the same measurement put it at 1283 units —
           2.1x the card it lives in. Cards tile with 0.02 * pageW between the
           two halves of a spread (about 2px down there), so the label ran
           clean across its neighbour. Four of seven cards overflowed at the
           floor, two of seven at Fit.

           As a flex container the label becomes a shrinkable item and the
           ellipsis finally has a width to ellipsise against, which is what
           the note above this one always claimed. The × keeps its size. */
        .pdf-railcard-chip {
          display: flex; align-items: center;
          white-space: nowrap; max-width: 100%; min-width: 0;
        }
        /* Up to two lines, then the ellipsis (TJ, 2026-08-18: "why not wrap a
           bit?"). One line was the rule for a real reason, and the reason has
           gone: the chip was an inline box, so the label and the × flowed on
           the same line and a wrap pushed the × onto a second row, under the
           word it removes. In the flex row above, the × is an item BESIDE the
           label, centred against however many lines it takes — the old
           failure is not reachable. Measured at the zoom floor on Object
           Worlds, on the label "Mythology Construction": at 1280 one line
           showed 9 characters of it and two show 19; at 1920, 16 and then all
           22. The model allows a Label eight words.
           overflow-wrap:anywhere is for a label with no space to break at —
           the clamp cannot break a single long word on its own. */
        .pdf-chip-open {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          overflow: hidden;
          white-space: normal;
          overflow-wrap: anywhere;
          min-width: 0;
        }
        .pdf-chip-open {
          background: none; border: none; padding: 0; cursor: pointer;
          font: inherit; color: inherit; letter-spacing: inherit;
        }
        /* A hover, not an underline (TJ, 2026-08-17): underline reads as a
           link inside a pill that is already a control, and it moved the
           baseline by a hair on every hover. The badge lifts instead. */
        .pdf-railcard-chip:has(.pdf-chip-open:hover) { background: var(--paper-2); border-color: var(--ink-soft); }
        .pdf-chip-open:hover { color: var(--ink); }
        .pdf-railcard-add {
          background: none; border: 1px dashed var(--rule); border-radius: 999px;
          width: 18px; height: 18px; line-height: 1; padding: 0; cursor: pointer;
          color: var(--ink-soft); font-family: var(--mono); font-size: 12px;
        }
        .pdf-railcard-add:hover { border-color: var(--ink); color: var(--ink); }
        .pdf-railcard-note {
          display: block; width: 100%; margin-top: 6px; padding: 4px 5px;
          background: none; border: none; border-radius: 3px; cursor: pointer;
          text-align: left; font-family: var(--body); font-size: 11.5px;
          line-height: 1.4; color: var(--ink-soft); font-style: italic;
        }
        .pdf-railcard-note:hover { background: var(--paper-2); color: var(--ink); }
        /* The note, being written. Same type and metrics as the resting state
           so opening the field does not re-set the words, and a FIXED height —
           see the field's own comment in ConceptRail: a note that grew while
           you typed would re-pack the rail and rescale the card under the
           cursor. 68px is four lines at this line-height, which is about what
           the resting card shows before short() truncates at 140 chars, so the
           card barely moves when the field opens. */
        /* THE DRAFT CARD — the capture form, in a rail card's clothes.
           Wider than a passage card (a rail is 0.33 of a page and the naming
           assist does not fit in it) and capped in height with its own scroll,
           because ConceptNamingAssist is 248.5px on its own and 422.8 with the
           ladder open. It is absolutely placed by the same rail arithmetic as
           every other card, so the width here is a max, not a layout. */
        /* THE DRAFT GROWS AWAY FROM THE PAGE. A rail is 0.33 of a page wide
           and this card is 340px, so it overhangs whatever it is put in — and
           the direction of that overhang is the whole question, because the
           one thing it must never cover is the passage it is about. The margin
           is negative by exactly the overhang (100% is the rail's width), so
           the edge NEAREST the page stays pinned to the rail and the card
           spills outward into the margin. In flow, not absolute: the rails
           measure stack heights to pack and to draw leaders, and an absolute
           card would measure zero. */
        .pdf-railcard-stack[data-draft="true"][data-side="left"] .pdf-draftcard {
          margin-left: calc(100% - 340px);
        }
        .pdf-railcard-stack[data-draft="true"][data-side="right"] .pdf-draftcard {
          margin-right: calc(100% - 340px);
        }
        .pdf-draftcard {
          background: var(--paper);
          border: 1px solid var(--rule);
          border-left: 3px solid var(--ochre, rgba(255, 204, 0, 0.9));
          border-radius: 4px;
          padding: 10px 12px;
          width: 340px;
          max-width: 46vw;
          max-height: 62vh;
          overflow-y: auto;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
          font-family: var(--body);
        }
        .pdf-draftcard-head {
          font-family: var(--mono, var(--body));
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-bottom: 6px;
        }
        /* The quotation keeps a cap of its own: a full-page capture must not
           push the fields out of a card that is already scrolling. */
        .pdf-draftcard .passage { max-height: 8.4em; overflow-y: auto; font-size: 12px; }
        .pdf-draftcard .src { font-size: 10.5px; }
        .pdf-draftcard .form-row { margin-top: 8px; }
        .pdf-draftcard textarea, .pdf-draftcard input { width: 100%; font-size: 12px; }
        /* Sticky for the same reason the modal's footer is: the card scrolls,
           and the commit must not scroll away with it. */
        .capturefoot-rail {
          position: sticky;
          bottom: -10px;
          display: flex;
          /* No justify-content: the halves fill the row (globals: .capturefoot>.btn). */
          gap: 8px;
          padding: 8px 0 0;
          margin-top: 8px;
          background: linear-gradient(to bottom, transparent, var(--paper) 30%);
        }
        /* The draft stack sits above its neighbours: it is taller than a
           passage card and overlaps them while it is open, and the thing being
           written must not be the thing underneath. */
        .pdf-railcard-stack[data-draft="true"] { z-index: 30; }
        /* ON THE CANVAS THE DRAFT CARD IS COUNTER-SCALED TO SCREEN SIZE.

           Everything in .pdf-spread-canvas is drawn in canvas units and then
           scaled by the transform, which is right for pages and for the cards
           that annotate them — a passage card takes its width from the rail
           (0.33 of a page) so it grows and shrinks WITH the page it belongs to.
           This card does not belong to the page. It is a form, and a form that
           doubles in size because you zoomed in is a bug: measured at capture
           zoom (k = 2.0) the 340px card came out 680px on screen, twice the
           width of the passage cards beside it, with its footer pushed off the
           bottom of the viewport.

           Dividing by --k (set in applyTransform) makes it land at 340px in the
           hand whatever the zoom. This was the first thing to need --k; the
           passage cards followed on 2026-08-19, when the clamped --invk they
           had been riding turned out to have the same defect in the same
           direction, and --invk went with it.

           The origin is the edge nearest the page, so shrinking pulls the card
           toward the words its leader points at rather than away from them. */
        .pdf-spread-canvas .pdf-draftcard {
          font-size: 12px;
          transform: scale(calc(1 / var(--k, 1)));
        }
        .pdf-spread-canvas .pdf-railcard-stack[data-draft="true"][data-side="left"] .pdf-draftcard {
          transform-origin: top right;
        }
        .pdf-spread-canvas .pdf-railcard-stack[data-draft="true"][data-side="right"] .pdf-draftcard {
          transform-origin: top left;
        }

        .pdf-railcard-note-edit {
          display: block; width: 100%; margin-top: 6px; padding: 4px 5px;
          height: 68px; resize: none; overflow: auto;
          background: var(--paper-2); color: var(--ink);
          border: 1px solid var(--rule); border-radius: 3px;
          font-family: var(--body); font-size: 11.5px; line-height: 1.4;
          font-style: italic;
        }
        .pdf-railcard-note-edit:focus {
          outline: 2px solid rgba(255, 204, 0, 0.8); outline-offset: -1px;
        }
        /* Smaller than the note above it and quieter than the badges: the one
           act on this card that destroys something should be the last thing
           the eye reaches, not a target it lands on. The same quiet mono
           register Your work uses for the identical button.
           (No backticks in here — this block is a template literal.) */
        .pdf-railcard-rm {
          display: block; margin-top: 6px; padding: 2px 5px;
          background: none; border: none; cursor: pointer;
          font-family: var(--mono); font-size: 9.5px; letter-spacing: .04em;
          color: var(--dot); text-align: left;
        }
        .pdf-railcard-rm:hover, .pdf-railcard-rm:focus-visible { color: var(--red); }
        .pdf-railcard-note.empty { color: var(--dot); }
        /* .pdf-railcard-note CAME BACK (2026-08-19): the note returned to the
           margin card, editable in place (ConceptRail draws it; cd56ce6). An
           earlier version of this comment said the rule was dead and should go
           with the markup — it is load-bearing now. The dead siblings that sat
           here — label, def, go, the chips container — went on 2026-08-20;
           nothing had rendered them since the card became badges and a note
           (2026-08-17). The chip rule below stays: ConceptRail draws it, and
           the canvas counter-scale divides its numbers. */
        .pdf-railcard-chip {
          font-family: var(--mono);
          font-size: 10px;
          border: 1px solid var(--rule);
          border-radius: 999px;
          padding: 1px 7px;
        }

        .pdf-side-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: transparent;
          border: none;
          color: var(--ink-soft);
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .pdf-side-nav:hover:not(:disabled) {
          background: rgba(0,0,0,0.05);
          color: var(--ink);
          transform: scale(1.1);
        }
        .pdf-side-nav:disabled {
          opacity: 0.1;
          cursor: not-allowed;
        }
      `}</style>

      {/* Toolbar. On a phone this is one compact row: every control that has
          somewhere else to live goes there, because a toolbar that wraps to
          four rows was taking a third of the screen away from the reading. The
          page count already sits in the bottom bar on a narrow screen, and the
          labels shorten rather than the buttons shrinking below thumb size. */}
      <div className="pdf-toolbar">
        <div>
          {/* The one door to Your work, and it never moves: the sheet covers
              the reading, never this toolbar, so the way out is exactly where
              the way in was. `aria-expanded` + `aria-controls`, not
              `aria-pressed` — this is a disclosure, not a setting.
              The count replaces the old ‹/› chevrons, which were rail
              semantics: they said which way the text would be pushed, and
              nothing is pushed any more. It also does more work than they did
              — a student who has just captured a passage can see that it
              exists without opening anything. Labelled only when the label is
              a glyph on its own; with the words visible they are the name.
              The label does NOT change to "Hide your work" when it opens, and
              that is deliberate: it used to, and the button went from a narrow
              ghost to a wide filled one, reflowing the toolbar under the
              reader's eye at the exact moment their attention was already
              moving. Filled-vs-ghost says which state it is in — the same way
              Page/Strip/Matrix do — and aria-expanded says it properly. */}
          <button
            id="yourwork-toggle"
            ref={workToggleRef}
            className={`btn mini${workOpen ? "" : " ghost"}`}
            onClick={requestToggleWork}
            aria-expanded={!!workOpen}
            aria-controls="yourwork"
            aria-label={isNarrow ? "Your work" : undefined}
            data-tip="your passages from this reading, filed by concept"
          >
            {isNarrow
              ? (workCount ? `☰ ${workCount}` : "☰")
              : (workCount ? `Your work · ${workCount}` : "Your work")}
          </button>
        </div>

        {!isNarrow && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="label" style={{ minWidth: "120px", textAlign: "center" }}>
              {viewMode === "page"
                ? `${isTwoPage ? `Pages ${pageNumber}-${Math.min(pageNumber + 1, numPages || pageNumber)}` : `Page ${pageNumber}`} of ${numPages || '?'}`
                : `${numPages || '?'} pages`}
            </span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* How the pages are laid out. Three ways of holding the same text:
              one spread, one long run, or the whole thing at once. */}
          {/* One control, three states (TJ, 2026-08-17). This used to be a
              Page/Matrix pair PLUS a separate "2-Page Spread" checkbox, so
              choosing a spread meant combining two controls in your head.
              The three ways of holding the text are three buttons; the state
              underneath is unchanged (viewMode + isTwoPage).

              "Canvas", not "Matrix", in the label only: state, CSS, the render
              branch and matrix-zoom.spec.ts keep the July name per AGENTS.md.
              "Matrix" named the grid the view draws; "Canvas" names what you
              do on it, which is what the student is choosing between.

              Strip stays HIDDEN, not deleted (TJ, 2026-08-10) — no button,
              but the render branch and CSS remain. */}
          <div className="pdf-modes" role="group" aria-label="Page layout">
            <button
              className={`btn mini ${viewMode === "page" && !isTwoPage ? "" : "ghost"}`}
              onClick={() => { setViewMode("page"); setIsTwoPage(false); }}
              data-tip="one page at a time"
              aria-pressed={viewMode === "page" && !isTwoPage}
            >1 page</button>
            <button
              className={`btn mini ${viewMode === "page" && isTwoPage ? "" : "ghost"}`}
              onClick={() => { setViewMode("page"); setIsTwoPage(true); }}
              data-tip="facing pages, the way the book opens"
              aria-pressed={viewMode === "page" && isTwoPage}
            >2 pages</button>
            <button
              className={`btn mini ${viewMode === "matrix" ? "" : "ghost"}`}
              onClick={() => setViewMode("matrix")}
              data-tip="the whole reading at once — two-finger scroll or drag to pan, pinch to zoom; hold space to pan from anywhere"
              aria-pressed={viewMode === "matrix"}
            >Canvas</button>
          </div>

          {viewMode === "page" && (
            <div className="pdf-modes" role="group" aria-label="Page size">
              {/* The accessible name stays "Fit Page"/"Fit Width" at every
                  width, and the narrow label is a substring of it — a name
                  that does not contain the visible words is one a voice user
                  cannot ask for, and it silently renamed the control for
                  anything matching on it. */}
              <button
                className={`btn mini ${fitMode === "height" ? "" : "ghost"}`}
                onClick={() => setFitMode("height")}
                aria-pressed={fitMode === "height"}
                aria-label="Fit Page"
              >{isNarrow ? "Page" : "Fit Page"}</button>
              <button
                className={`btn mini ${fitMode === "width" ? "" : "ghost"}`}
                onClick={() => setFitMode("width")}
                aria-pressed={fitMode === "width"}
                aria-label="Fit Width"
              >{isNarrow ? "Width" : "Fit Width"}</button>
            </div>
          )}

          {/* Map-canvas zoom controls (TJ, 2026-08-10, replacing the slider):
              − / + step multiplicatively about the view centre, Fit returns
              to everything-in-view. The trackpad — two-finger scroll to pan,
              pinch to zoom — drives the same transform; these are the
              keyboard-and-tap path. Page mode holds
              the same three buttons over its own zoom — 1 = the fitted
              spread, Fit returns to it — so zoom means one thing everywhere. */}
          {viewMode === "matrix" && (
            <div className="pdf-modes" role="group" aria-label="Canvas zoom">
              <button
                className="btn mini ghost"
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z / 1.4) * 100) / 100))}
                aria-label="Zoom out"
                data-tip="zoom out (pinch or ctrl+scroll)"
              >−</button>
              <button
                className="btn mini ghost"
                onClick={() => setZoom((z) => Math.min(zoomMax, Math.round((z * 1.4) * 100) / 100))}
                aria-label="Zoom in"
                data-tip="zoom in (pinch or ctrl+scroll)"
              >+</button>
              <button
                className="btn mini ghost"
                onClick={() => { setZoom(1); setFitNonce((n) => n + 1); }}
                aria-label="Fit the whole reading"
                data-tip="everything in view"
              >Fit</button>
            </div>
          )}
          {viewMode === "page" && (
            <div className="pdf-modes" role="group" aria-label="Spread zoom">
              <button
                className="btn mini ghost"
                onClick={() => zoomPageBy(1 / 1.4)}
                aria-label="Zoom out"
                data-tip="zoom out (ctrl+scroll)"
              >−</button>
              <button
                className="btn mini ghost"
                onClick={() => zoomPageBy(1.4)}
                aria-label="Zoom in"
                data-tip="zoom in (ctrl+scroll)"
              >+</button>
              <button
                className="btn mini ghost"
                onClick={() => { zoomAnchorRef.current = null; pageZoomRef.current = 1; setPageZoom(1); }}
                aria-label="Fit the spread"
                data-tip="back to the fitted spread"
              >Fit</button>
            </div>
          )}

          {/* The "2-Page Spread" checkbox and the "Cards" toggle both stood
              here. The first is now the middle state of the layout group
              above; the second is gone because the rails stand permanently. */}

          {/* Overlay (ruling 28) — a read-only comparison with a discussion
              section or the whole cohort. **Faculty and admins only** (TJ,
              2026-08-08): students do not get this at all, and faculty meet it
              here because they hold their own learner surfaces alongside the
              faculty view. No names and no third band, so nothing here
              resolves to a person. Off until asked for. */}
          {sourceId && isStaff && (
            <div className="pdf-overlay-ctl" role="group" aria-label="Compare your marks with others">
              {!isNarrow && <span className="label">Overlay</span>}
              {/* A picker, not two buttons (TJ, 2026-08-08): faculty teach across
                  sections, so "your section" had no referent for them — they sit
                  in the Faculty Section, which the peer query excludes. */}
              <select
                className="tinput inline"
                aria-label="Which section to compare"
                value={overlayBand ? overlaySection : "off"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "off") { setOverlayBand(null); setOverlay(null); return; }
                  setOverlaySection(v === "all" ? "" : v);
                  chooseOverlayBand(v === "all" ? "cohort" : "section", v === "all" ? null : v);
                }}
              >
                <option value="off">off</option>
                <option value="all">All sections</option>
                {courseSections.map((sec) => (
                  <option key={sec.id} value={sec.id}>{sec.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Only where there is canonical page text to search — a viewer
              without a sourceId has no pages on record to ask. */}
          {sourceId && (
            <button
              className={`btn mini ${searchOpen ? "" : "ghost"}`}
              // Find and Your work share the right edge, so opening either
              // sends the other back. Without the symmetry the lower one sits
              // there open and invisible, eating the first Escape.
              onClick={() => {
                if (searchOpen) { closeSearch(); return; }
                if (workOpen) onToggleWork();
                setSearchOpen(true);
              }}
              // "In the text", not "Search" (TJ, 2026-08-17). The journey bar
              // carries a search too, and until now both were named for the
              // reading — this one "Search this reading", that one "⌕ this
              // reading" — while covering different things: these are the
              // PDF's own words, that is the whole record of the reading
              // (pages, cloth, projections, concepts, links, passages). Their
              // coverage overlaps on the pages, so neither name helped anyone
              // choose. The repo had already noticed sideways: concept-rail's
              // spec has to scope its selector to `.pdf-toolbar` because the
              // two buttons answered the same name. Each says its own subject
              // now, and neither needs the other to make sense.
              // Same shape as the journey bar's tip (TJ, 2026-08-17): the
              // verb first, then what it reaches. "find a word or phrase on
              // these pages" said what any magnifier says; this says which
              // pages, and what you get back — the two things that tell you
              // whether to press this one or "your cloth" beside it.
              data-tip="search the text — every page of this reading, marked where it appears"
              aria-pressed={searchOpen}
              aria-label="Search the text of this reading"
            >
              {isNarrow ? "⌕" : "⌕ In the text"}
            </button>
          )}

          {/* Download PDF, rehomed from the scope bar when that band went
              (TJ, 2026-08-17). It belongs beside the text it downloads more
              than it belonged in a strip above the journey — and it is only
              ever drawn where there is a file, which is the one condition the
              old band had to spell out ("your own card — no pdf here").

              An <a download>, not a button: the route sets the disposition,
              and a link is the thing a browser already knows how to resume,
              copy and open in a new tab. `.btn.mini` so it sits in the row as
              a peer of its neighbours rather than as prose wearing a border. */}
          {sourceId && (
            <a
              className="btn ghost mini"
              href={`/api/readings/${sourceId}?download=1`}
              data-tip="the original file, as it was uploaded"
              // The visible label is a glyph and two letters, so the
              // accessible name has to be the whole act — "down arrow PDF" is
              // what a screen reader made of it otherwise. library-verify
              // looks for this name too, and was right to.
              aria-label="Download PDF"
            >
              {isNarrow ? "↓" : "↓ PDF"}
            </a>
          )}

          {/* Full screen — one control, the whole screen (TJ, 2026-08-17),
              superseding "Just the text" (TJ, 2026-08-12).

              It used to be an in-app mode ONLY: `.pdf-shell.fullscreen` hid
              Loom's chrome but left the browser's tab strip and URL bar, so
              getting the text onto the actual screen took this button AND the
              header's. Two controls for one intention, and the name had to
              apologise for it. Now this one does both — the in-app mode plus
              the browser's Fullscreen API — which is what a document viewer
              is expected to do, and what makes the name honest.

              "Full screen text", not "Full screen": the header carries "full
              screen app", which gives LOOM the screen and keeps the journey
              bar. This one gives the TEXT the screen and takes Loom's chrome
              with it. Only one of the two is ever visible at a time — this
              mode covers the header — so the exit label needs no qualifier. */}
          <button
            className="btn ghost mini iconly"
            onClick={() => setFullscreen(!isFullscreen)}
            data-tip={isFullscreen ? "back to the journey (esc)" : "the text fills the screen (f)"}
            aria-pressed={isFullscreen}
            // Icon only (TJ, 2026-08-17), so the words live here and in the
            // tip. The header's control wears the same glyph and means the
            // app rather than the text — they never share a screen, because
            // the reading station is exactly where the header stands down.
            aria-label={isFullscreen ? "Exit full screen" : "Full screen — the text fills the screen"}
          >
            <FullscreenIcon exit={isFullscreen} />
          </button>
        </div>
      </div>

      {/* What the shading means, and what it cannot show. Every refusal below
          is a sentence rather than an empty page: a comparison showing nothing
          without saying why reads as a broken feature, and the commonest
          reason here — you have not coded this reading yet — is the point of
          the gate rather than a fault. */}
      {overlayBand && sourceId && (
        <div className="pdf-overlay-bar" role="status">
          {!overlay && overlayBusy && (
            <span>reading {overlayBand === "section" ? "that section" : "the cohort"}…</span>
          )}
          {!overlay && !overlayBusy && <span>The comparison could not be loaded just now.</span>}
          {overlay?.blocked && <span>{overlayBlockMessage(overlay.blocked, overlay.band)}</span>}
          {overlay && !overlay.blocked && overlay.contributors === 0 && (
            <span>
              Nobody in {overlay.band === "section" ? "that section" : "the cohort"} has
              marked this reading yet.
            </span>
          )}
          {overlay && !overlay.blocked && overlay.contributors > 0 && (
            <>
              <span>
                <b>{overlay.contributors}</b> of {overlay.peers} in{" "}
                {overlay.band === "section" ? "that section" : "the cohort"}{" "}
                {overlay.contributors === 1 ? "has" : "have"} marked this reading —{" "}
                <b>{overlay.passages}</b> passage{overlay.passages !== 1 ? "s" : ""}
                {viewMode === "page" && (
                  <>
                    , <b>{overlayHereCount}</b> on this {isTwoPage ? "spread" : "page"}
                  </>
                )}.
              </span>
              <span className="pdf-overlay-scale">
                <span className="cap">fewer</span>
                <i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" />
                <i aria-hidden="true" /><i aria-hidden="true" />
                <span className="cap">more marked the same words</span>
              </span>
              {overlay.unanchored > 0 && (
                <span className="cap">
                  {overlay.unanchored} not placed on the page
                </span>
              )}
              {overlay.droppedSpans > 0 && (
                <span className="cap">{overlay.droppedSpans} runs past the display limit</span>
              )}
              <span className="cap">counted, not judged · no names</span>
            </>
          )}
        </div>
      )}

      {/* Find in this reading. A panel over the stage's edge, not a bar above
          it: the text keeps its room, and the hits are doors — click one and
          the page turns (or scrolls) to it with the words marked. */}
      {searchOpen && sourceId && (
        <div className="pdf-search-panel" role="search" aria-label="Search this reading">
          <div className="pdf-search-row">
            <input
              type="search"
              className="tinput"
              value={searchQuery}
              onChange={(e) => {
                const value = e.target.value;
                setSearchQuery(value);
                // Below the two-character floor there is nothing to ask, so
                // the old results (and their page marks) go now, not later.
                if (value.trim().length < 2) resetSearchResults();
              }}
              onKeyDown={(e) => {
                // The window handler ignores keys while an input is focused,
                // so the panel closes itself.
                if (e.key === "Escape") closeSearch();
              }}
              placeholder='a word, or a "phrase"'
              aria-label="Search this reading for a word or phrase"
              autoFocus
            />
            <button
              className="btn ghost mini"
              onClick={closeSearch}
              aria-label="Close search"
            >✕</button>
          </div>

          {searchError && <p className="hint" style={{ color: "var(--red)", margin: "8px 0 0" }}>{searchError}</p>}
          {!searchError && searchBusy && !searchHits && (
            <p className="hint" style={{ margin: "8px 0 0" }}>searching…</p>
          )}
          {!searchError && searchHits && searchHits.length === 0 && !searchBusy && (
            <p className="hint" style={{ margin: "8px 0 0" }}>no page says that</p>
          )}

          {!searchError && searchHits && searchHits.length > 0 && (
            <>
              <span className="cap pdf-search-tally">
                {searchHits.length}{searchTruncated ? "+" : ""} page{searchHits.length !== 1 ? "s" : ""}
                {searchTruncated ? ` — first ${searchHits.length} shown` : ""}
              </span>
              <ol className="pdf-search-hits">
                {searchHits.map((hit) => (
                  <li key={hit.pageNumber}>
                    <button
                      className="pdf-search-hit"
                      onClick={() => setPageNumber(hit.pageNumber)}
                      aria-label={`Go to page ${hit.pageNumber}`}
                    >
                      {/* The page's REAL total, not the snippet's (TJ,
                          2026-08-19). The headline carries four windows at
                          most, so a page with six matches read as a page with
                          two — the list said less than the page showed. Silent
                          at 1, where a count is noise. */}
                      <span className="n">
                        p. {hit.pageNumber}
                        {hit.matches > 1 && <span className="pdf-search-n"> · {hit.matches}</span>}
                      </span>
                      <span className="pdf-search-snip"><Snippet text={hit.snippet} /></span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {/* The pages, and Your work over them. This wrapper exists for one
          reason: it is the sheet's containing block, so the sheet covers the
          reading and stops at the toolbar. The frame of the reading — modes,
          fit, find, fullscreen, and the overlay bar above — stays reachable
          while your work is out. The stage is still the only measured box, and
          it measures exactly what it measured before. */}
      <div className="pdf-body">

      {/* Main Content Area — one <Document> for all three layouts, so
          switching views never re-fetches or re-parses the PDF. */}
      <div ref={attachStage} className={`pdf-stage mode-${viewMode}`}>
        <Document
          file={url}
          options={documentOptions}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="hint" style={{ padding: 24 }}>Loading PDF...</div>}
          error={<div className="hint" style={{ padding: 24, color: "var(--red)" }}>Failed to load PDF. Check file path.</div>}
        >
          {viewMode === "page" && (
            <div style={{ display: "flex", alignItems: "center", gap: "20px", padding: isNarrow ? "12px" : "24px", minHeight: "100%" }}>
              {!isNarrow && <button
                className="pdf-side-nav"
                onClick={handlePrev}
                disabled={!canGoPrev}
                aria-label="Previous Page"
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>}

              <ConceptRails
                enabled={railsOn && !isNarrow}
                twoPage={isTwoPage && pageNumber + 1 <= (numPages || 1)}
                passages={scoped.passages}
                concepts={state.concepts}
                onOpenPassage={gotoOpenPassage}
                onOpenConcept={gotoOpenConcept}
                onUnfile={unfilePassage}
                onRemovePassage={removePassageWithConfirm}
                onCreateConcept={addConcept}
                onAddConcept={addPassageConcept}
                onEditConcept={editConcept}
                onEditNote={editPassageNote}
                draft={railDraft}
              >
                <div style={{ display: "flex", gap: "20px", justifyContent: "center", boxShadow: "0 0 20px rgba(0,0,0,0.05)" }}>
                  {/* The same slot the matrix reads through, at native tier:
                      the pre-rendered image paints the turn instantly (it was
                      prefetched), the text layer renders once at the fitted
                      base width, and the pdf.js raster sharpens over the
                      image through the shared queue — page mode always
                      outranks the matrix's background work in it. Keyed by
                      page so a turn starts the slot's state (measured aspect,
                      image readiness) fresh for the page it now holds. */}
                  <PageSlot
                    key={pageNumber}
                    pageNumber={pageNumber}
                    width={pageBaseWidth * pageZoom}
                    aspect={aspect}
                    eager
                    onAspect={acceptAspect}
                    pdf={pdfProxy}
                    baseWidth={pageBaseWidth}
                    res={pageModeRes}
                    tier="native"
                    pageAspect={pageAspects.get(pageNumber) ?? null}
                    pageImageBase={pageImageBase}
                    priority={pageModePriority}
                    annotations
                  />
                  {isTwoPage && pageNumber + 1 <= (numPages || 1) && (
                    <PageSlot
                      key={pageNumber + 1}
                      pageNumber={pageNumber + 1}
                      width={pageBaseWidth * pageZoom}
                      aspect={aspect}
                      eager
                      pdf={pdfProxy}
                      baseWidth={pageBaseWidth}
                      res={pageModeRes}
                      tier="native"
                      pageAspect={pageAspects.get(pageNumber + 1) ?? null}
                      pageImageBase={pageImageBase}
                      priority={pageModePriority}
                      annotations
                    />
                  )}
                </div>
              </ConceptRails>

              {!isNarrow && <button
                className="pdf-side-nav"
                onClick={handleNext}
                disabled={!canGoNext}
                aria-label="Next Page"
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>}
            </div>
          )}

          {/* Strip: the reading as one continuous run, read by scrolling
              sideways. Pages are full stage height, so a passage is as legible
              here as in the paged view — this is a reading view, not an index. */}
          {viewMode === "strip" && (
            <div className="pdf-strip-run">
              {Array.from({ length: numPages ?? 0 }, (_, i) => (
                <PageSlot
                  key={i + 1}
                  pageNumber={i + 1}
                  height={Math.max(280, stage.h - (isNarrow ? 16 : 24))}
                  aspect={aspect}
                  root={stageEl}
                  eager={i === 0}
                  onAspect={acceptAspect}
                />
              ))}
            </div>
          )}

          {/* Matrix: the whole document as 2-page spreads on one zoomable
              canvas. At the low end it is a contact sheet for finding your
              way — and a concept map, because the cards (the rails are always
              on) counter-scale while the pages shrink; wind the zoom in and the
              same canvas becomes readable, and a passage can be taken from
              it. Pan by dragging or two-finger scroll; pinch or ctrl+wheel
              zooms; the toolbar's − / + / Fit drive the same transform. */}
          {viewMode === "matrix" && (
            <SpreadCanvasView
              pdf={pdfProxy}
              numPages={numPages ?? 0}
              basePageWidth={matrixBaseWidth}
              aspect={aspect}
              stage={stage}
              stageEl={stageEl}
              cardsOn={railsOn && !isNarrow}
              passages={scoped.passages}
              concepts={state.concepts}
              onOpenPassage={gotoOpenPassage}
              onOpenConcept={gotoOpenConcept}
              onUnfile={unfilePassage}
              onRemovePassage={removePassageWithConfirm}
              onCreateConcept={addConcept}
              onAddConcept={addPassageConcept}
              onEditConcept={editConcept}
              onEditNote={editPassageNote}
              draft={railDraft}
              onAspect={acceptAspect}
              manifest={manifest}
              pageImageBase={pageImageBase}
              zoomMultiplier={zoom}
              onZoomMultiplier={setZoom}
              onZoomRange={setZoomMax}
              focusPage={pageNumber}
              fitNonce={fitNonce}
              onTransform={handleCanvasTransform}
            />
          )}
        </Document>
      </div>

      {/* Your work — the reading-scoped Capture Log. ("Capture Log" stays the
          model's name for the object; "Your work" is the student's name for
          the surface.) ALWAYS mounted, parked off the right edge when closed:
          a half-typed hand capture, an opened concept row and where you had
          scrolled to all survive the toggle, and a capture that has just
          landed has a row with real layout to scroll to — OpenTab does that
          40ms later, and scrollIntoView on an element with no layout box
          silently does nothing, which is how someone who pressed "In your
          work" landed at the top of the list instead of on their passage. */}
      {workPanel && (
        <aside
          id="yourwork"
          className="yourwork"
          data-yourwork=""
          data-open={workOpen ? "true" : "false"}
          aria-labelledby="yourwork-title"
          inert={!workOpen}
          tabIndex={-1}
          ref={workPanelRef}
        >
          <div className="yourwork-head">
            <h2 id="yourwork-title">Your work</h2>
            <span className="n">
              {scoped.passages.length
                ? `${scoped.passages.length} passage${scoped.passages.length === 1 ? "" : "s"} · ${scoped.concepts.length} concept${scoped.concepts.length === 1 ? "" : "s"}`
                : "nothing captured here yet"}
            </span>
            <button
              type="button"
              className="btn ghost mini compact yourwork-close"
              onClick={requestToggleWork}
              aria-label="Close your work"
            >✕</button>
          </div>
          <div className="yourwork-body">{workPanel}</div>
        </aside>
      )}

      {/* The capture said so. A small card in the corner of the page, for six
          seconds — the everyday acknowledgement, so that opening the sheet
          becomes something you do to BROWSE rather than something you do to
          check that your work survived. Held open while the pointer is on it,
          because six seconds is short if you are still reading the sentence.
          role=status on the sentence only: a live region wrapping the button
          would re-announce the whole card every time the count changes. */}
      {captureToast && (
        <div
          className="captoast"
          onPointerEnter={holdToast}
          onPointerLeave={startToastTimer}
        >
          <p role="status">
            {captureToast.n > 1
              ? `${captureToast.n} passages captured.`
              : captureToast.label
                ? <>Passage captured — filed under <b>{captureToast.label}</b>.</>
                // An unlabeled capture is a whole act, not a half one (TJ,
                // 2026-08-12) — so the toast reports it as done rather than
                // as missing something.
                : <>Passage captured — <b>unlabeled</b>. Name it in Your work whenever the word arrives.</>}
          </p>
          {/* The seam, in the toast rather than as its own card (TJ,
              2026-08-09: the PDF path should be the QUIETER of the two).
              Same component the capture form renders, so the busiest path in
              the app and the hand path cannot say different things about the
              same event. */}
          {captureToast.reuse && (
            <ReuseOffer
              className="captoast-seam"
              passageId={captureToast.passageId}
              conceptId={captureToast.reuse.conceptId}
              label={captureToast.reuse.label}
              where={captureToast.reuse.whereIds.map(readings.titleOf)}
              filledDescription={captureToast.reuse.filledDescription}
              onResolved={() => setCaptureToast(null)}
            />
          )}
          <button
            type="button"
            className="btn ghost mini compact"
            onClick={() => {
              const target = captureToast.passageId;
              setCaptureToast(null);
              holdToast();
              gotoOpenPassage(target);
            }}
          >
            In your work ›
          </button>
          <button
            type="button"
            className="btn ghost mini compact captoast-x"
            aria-label="Dismiss"
            onClick={() => { holdToast(); setCaptureToast(null); }}
          >✕</button>
        </div>
      )}
      </div>

      {/* Paging bar, phone only — and only where there are pages to turn. The
          strip and the matrix are scrolled, so a Prev/Next pair there would be
          a control for something the view does not do, sitting on top of the
          reading. Gone while Your work is out: it is fixed to the WINDOW at
          z-index 8000, so it would cut a bar across the bottom of the sheet,
          to turn a page nobody can see. */}
      {isNarrow && viewMode === "page" && !workOpen && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
            background: "rgba(237, 235, 227, 0.95)",
            borderTop: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 8000,
            backdropFilter: "blur(4px)",
          }}
        >
          <button className="btn ghost mini" onClick={handlePrev} disabled={!canGoPrev} aria-label="Previous Page">
            Prev
          </button>
          <span className="label" style={{ fontSize: "10px" }}>
            {isTwoPage ? `Pages ${pageNumber}-${Math.min(pageNumber + 1, numPages || pageNumber)}` : `Page ${pageNumber}`} of {numPages || "?"}
          </span>
          <button className="btn ghost mini" onClick={handleNext} disabled={!canGoNext} aria-label="Next Page">
            Next
          </button>
        </div>
      )}

      {/* Floating Capture Button */}
      {highlightRect && (
        <button 
          id="captureNow"
          className="btn mini"
          style={{
            position: "fixed",
            top: `${highlightRect.top - 45}px`,
            left: `${highlightRect.left}px`,
            transform: "translateX(-50%)",
            zIndex: 9000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            backgroundColor: "var(--ochre)",
            color: "#000"
          }}
          onClick={handleCaptureClick}
        >
          Capture as Passage
        </button>
      )}

      {/* Capture Modal */}
      {showCaptureModal && captureData && (
        <CaptureModal 
          passage={captureData.text}
          source={sourceName}
          sourceId={sourceId}
          location={`p. ${captureData.pageNum || pageNumber}`}
          pageNumber={captureData.pageNum}
          startOffset={captureData.startOffset}
          endOffset={captureData.endOffset}
          pageContentHash={captureData.pageContentHash}
          onCaptured={handleCaptured}
          onClose={() => {
            setShowCaptureModal(false);
            setCaptureData(null);
            document.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {highlightTooltip && (
        <div
          className="loom-highlight-tooltip"
          style={{
            left: `${highlightTooltip.x}px`,
            top: `${highlightTooltip.y - 12}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="head">
            <div className="meta">
              {highlightTooltip.entries.length > 1
                ? `${highlightTooltip.entries.length} captures on this passage`
                : "passage"}
            </div>
            <button
              type="button"
              className="close"
              aria-label="Close highlight details"
              onClick={(event) => {
                event.stopPropagation();
                hideHighlightTooltip();
              }}
            >
              ×
            </button>
          </div>
          {highlightTooltip.entries.map((entry) => (
            <div className="entry" key={entry.passageId}>
              <div className="coding">{entry.conceptLabel}</div>
              <div className="foot">
                {entry.source}
                {entry.location ? ` | ${entry.location}` : ""}
                {` | chars ${entry.startOffset ?? "?"}-${entry.endOffset ?? "?"}`}
              </div>
              {onGotoOpenPassage ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    // Find and the sheet share the right edge; this one opens
                    // the sheet, so the other has to go.
                    if (searchOpen) closeSearch();
                    onGotoOpenPassage(entry.passageId);
                    hideHighlightTooltip();
                  }}
                >
                  In your work ›
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
