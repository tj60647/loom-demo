"use client"
import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import CaptureModal, { type CaptureReuse } from './CaptureModal';
import PageSlot from './PageSlot';
import { type PdfDoc } from './PageRaster';
import SpreadCanvasView from './SpreadCanvasView';
import ConceptRails, { RAIL_W } from './ConceptRail';
import ReuseOffer from '@/components/ui/ReuseOffer';
import { useLoom } from '@/components/providers/LoomProvider';
import { useReadings } from '@/components/providers/ReadingsProvider';
import { searchReading, getPassagesOverlay } from '@/lib/reads';
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
type HighlightEntry = {
  passageId: string;
  conceptLabel: string;
  source: string;
  location: string;
  startOffset: number | null;
  endOffset: number | null;
};

export default function PdfViewer({ url, sourceName, sourceId, initialPageNumber, focusPassageId, initialSearch, onGotoOpenPassage, onPageChange, workOpen, onToggleWork, workPanel }: PdfViewerProps) {
  const { state, scoped } = useLoom();
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
  const [railsOn, setRailsOn] = useState(false);
  // Covers the whole window, chrome included — the reading takes the screen.
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Matrix zoom, as a multiple of the whole-canvas fit: 1 = every spread in
  // view. The − / + buttons and the canvas's own wheel/pinch drive the SAME
  // transform — SpreadCanvasView syncs this back when a gesture settles.
  // Fit has its own nonce: state alone can be stale mid-gesture, and a
  // panned view at multiplier 1 still needs recentring.
  const [zoom, setZoom] = useState(1);
  const [fitNonce, setFitNonce] = useState(0);
  // The pdf.js document proxy, kept for the matrix canvas's raster path.
  const [pdfProxy, setPdfProxy] = useState<PdfDoc | null>(null);
  // The document's height/width, measured off the first page that renders, so
  // the many-page views can reserve honest space before a page has drawn.
  const [aspect, setAspect] = useState(11 / 8.5);

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
  
  const [highlightRect, setHighlightRect] = useState<{top: number, left: number, text: string, pageNum?: number, startOffset?: number, endOffset?: number, pageContentHash?: string} | null>(null);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [captureData, setCaptureData] = useState<{text: string, pageNum?: number, startOffset?: number, endOffset?: number, pageContentHash?: string} | null>(null);

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
        conceptLabel: concept?.label || "Unlabeled passage",
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

    const onClick = (event: MouseEvent) => {
      event.stopPropagation();
      showFromEvent(event, true);
    };

    const onFocus = (event: FocusEvent) => showFromEvent(event, true);

    node.addEventListener("click", onClick);
    node.addEventListener("focus", onFocus);
    node.setAttribute("title", "Click highlight for actions");

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

    const applyHighlights = () => {
      const passages = passagesRef.current;
      const heatPages = overlayRef.current?.pages ?? [];
      if (passages.length === 0 && searchTermsRef.current.length === 0 && heatPages.length === 0) return;

      const textLayers = containerRef.current!.querySelectorAll('.react-pdf__Page__textContent');

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

              if (offsetsTrusted) {
                // Precision mode!
                instance.markRanges([{
                  start: passage.startOffset!,
                  length: passage.endOffset! - passage.startOffset!
                }], {
                  className: "loom-passage-highlight",
                  each: (node) => {
                    const concept = state.concepts.find((c) => c.id === passage.conceptIds[0]);
                    const a11y = `${concept?.label || "Unlabeled passage"}. ${passage.source || sourceName}${passage.location ? `, ${passage.location}` : ""}. Characters ${passage.startOffset ?? "?"}-${passage.endOffset ?? "?"}.`;
                    (node as HTMLElement).setAttribute("aria-label", a11y);
                    (node as HTMLElement).setAttribute("tabindex", "0");
                    bindHighlightNode(node as HTMLElement, passage.id);
                  },
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
                  each: (node) => {
                    const concept = state.concepts.find((c) => c.id === passage.conceptIds[0]);
                    const a11y = `${concept?.label || "Unlabeled passage"}. ${passage.source || sourceName}${passage.location ? `, ${passage.location}` : ""}. Characters ${passage.startOffset ?? "?"}-${passage.endOffset ?? "?"}.`;
                    (node as HTMLElement).setAttribute("aria-label", a11y);
                    (node as HTMLElement).setAttribute("tabindex", "0");
                    bindHighlightNode(node as HTMLElement, passage.id);
                  },
                  done: (count) => matches += count
                });
              }
            });
            if (matches > 0) console.log(`[Loom PDF] Applied ${matches} highlights on Page ${parsedPage}.`);

            // Search hits, marked after the passages so a passage that is both
            // captured and searched shows the search mark on top. The terms
            // are whole word forms from the document, so "exactly" marks the
            // word and not every substring echo of it.
            const searchWords = searchTermsRef.current;
            if (searchWords.length > 0) {
              instance.mark(searchWords, {
                className: "loom-search-hit",
                separateWordSearch: false,
                accuracy: "exactly",
                caseSensitive: false,
                diacritics: true,
                acrossElements: true,
              });
            }
          }
        });
      });
    };

    // 1. Run whenever this effect triggers (e.g. when state.passages changes)
    applyHighlights();

    // 2. Also observe the DOM for when react-pdf injects the text layer spans
    const observer = new MutationObserver((mutations) => {
      const hasTextLayerMutations = mutations.some(m => {
        return Array.from(m.addedNodes).some(node => 
          (node as HTMLElement).tagName === 'SPAN' || 
          (node as HTMLElement).classList?.contains('react-pdf__Page__textContent')
        );
      });
      
      if (hasTextLayerMutations) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyHighlights, 100);
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
  }, [state.passages, state.concepts, pageNumber, bindHighlightNode, sourceName, searchTerms, overlay, stageEl]); // Re-run when passages, page, search terms or the overlay change — and if the stage node itself is replaced

  const handleCaptureClick = () => {
    if (highlightRect) {
      setCaptureData({
        text: highlightRect.text,
        pageNum: highlightRect.pageNum,
        startOffset: highlightRect.startOffset,
        endOffset: highlightRect.endOffset,
        pageContentHash: highlightRect.pageContentHash
      });
      setShowCaptureModal(true);
      setHighlightRect(null);
    }
  };

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
      // an info panel, the walkthrough. Escape there is theirs, and `f` must
      // not throw a reader into fullscreen out from under one.
      if (showCaptureModal || document.querySelector(".info-scrim, .scrim.show")) return;

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
        else if (isFullscreen) setIsFullscreen(false);
        return;
      }

      if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setIsFullscreen((on) => !on);
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
  }, [canGoPrev, canGoNext, handlePrev, handleNext, hideHighlightTooltip, showCaptureModal, viewMode, isFullscreen, highlightTooltip, searchOpen, closeSearch, workOpen, requestToggleWork]);

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
        .pdf-stage.mode-page { overflow: auto; display: flex; justify-content: safe center; }
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
        .pdf-spread-canvas .pdf-railcard { z-index: 3; }
        /* Counter-scaling: card text never shrinks below its reading size as
           the canvas zooms out. Done via font-size — real layout, not a
           transform — so the card grows to hold it and the rail re-stacks. */
        .pdf-spread-canvas .pdf-railcard-label { font-size: calc(13px * var(--invk, 1)); }
        .pdf-spread-canvas .pdf-railcard-def { font-size: calc(12px * var(--invk, 1)); }
        .pdf-spread-canvas .pdf-railcard-note { font-size: calc(11px * var(--invk, 1)); }
        .pdf-spread-canvas .pdf-railcard-chip { font-size: calc(10px * var(--invk, 1)); }
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
        .pdf-modes { display: flex; background: var(--paper); border-radius: 4px; padding: 2px; border: 1px solid var(--rule); }
        .pdf-modes button { border: none; margin: 0; padding: 4px 9px; }
        .pdf-toolbar {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 10px 20px;
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
        .pdf-rail-leaders path {
          stroke: rgba(255, 204, 0, 0.8);
          stroke-width: 1.5;
          fill: none;
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
        .pdf-railcard-label { font-weight: 600; font-size: 13px; }
        .pdf-railcard-label.unlabeled {
          font-style: italic;
          font-weight: 400;
          color: var(--ink-soft);
        }
        .pdf-railcard-def { font-size: 12px; color: var(--ink-soft); margin-top: 4px; }
        .pdf-railcard-note { font-size: 11px; font-style: italic; color: var(--ink-soft); margin-top: 4px; }
        .pdf-railcard-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
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
          <div className="pdf-modes" role="group" aria-label="Page layout">
            <button
              className={`btn mini ${viewMode === "page" ? "" : "ghost"}`}
              onClick={() => setViewMode("page")}
              data-tip="one spread at a time"
              aria-pressed={viewMode === "page"}
            >Page</button>
            {/* Strip is HIDDEN, not deleted (TJ, 2026-08-10: "the new view
                supercedes it") — the matrix canvas is the continuous view
                now, and page mode holds the phone. The render branch and CSS
                stay, so restoring the button restores the mode. */}
            <button
              className={`btn mini ${viewMode === "matrix" ? "" : "ghost"}`}
              onClick={() => setViewMode("matrix")}
              data-tip="the whole reading at once — zoom in on any page"
              aria-pressed={viewMode === "matrix"}
            >Matrix</button>
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
              to everything-in-view. The wheel and pinch drive the same
              transform; these are the keyboard-and-tap path. */}
          {viewMode === "matrix" && (
            <div className="pdf-modes" role="group" aria-label="Canvas zoom">
              <button
                className="btn mini ghost"
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z / 1.4) * 100) / 100))}
                aria-label="Zoom out"
                data-tip="zoom out"
              >−</button>
              <button
                className="btn mini ghost"
                onClick={() => setZoom((z) => Math.min(8, Math.round((z * 1.4) * 100) / 100))}
                aria-label="Zoom in"
                data-tip="zoom in"
              >+</button>
              <button
                className="btn mini ghost"
                onClick={() => { setZoom(1); setFitNonce((n) => n + 1); }}
                aria-label="Fit the whole reading"
                data-tip="everything in view"
              >Fit</button>
            </div>
          )}

          {viewMode === "page" && !isNarrow && (
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }} className="label">
              <input
                type="checkbox"
                checked={isTwoPage}
                onChange={(e) => setIsTwoPage(e.target.checked)}
              />
              2-Page Spread
            </label>
          )}

          {/* The margin cards. A display toggle, not a mode: the pages, the
              capture flow and the keyboard are exactly the host view's. In
              page mode they flank the open spread; in the matrix they flank
              every spread and counter-scale, so zooming out reads as a
              concept map. */}
          {(viewMode === "page" || viewMode === "matrix") && !isNarrow && (
            <button
              className={`btn mini ${railsOn ? "" : "ghost"}`}
              onClick={() => setRailsOn((on) => !on)}
              aria-pressed={railsOn}
              aria-label="Cards in the margin"
              data-tip="your concepts beside the passages they came from"
            >Cards</button>
          )}

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
              data-tip="find a word or phrase in this reading"
              aria-pressed={searchOpen}
              aria-label="Search this reading"
            >
              {isNarrow ? "⌕" : "⌕ Search"}
            </button>
          )}

          <button
            className="btn ghost mini"
            onClick={() => setIsFullscreen((on) => !on)}
            data-tip={isFullscreen ? "back to the journey (esc)" : "give the reading the whole screen (f)"}
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            {isFullscreen ? (isNarrow ? "↙" : "↙ Exit full screen") : (isNarrow ? "⛶" : "⛶ Full screen")}
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
                      <span className="n">p. {hit.pageNumber}</span>
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
              >
                <div style={{ display: "flex", gap: "20px", justifyContent: "center", boxShadow: "0 0 20px rgba(0,0,0,0.05)" }}>
                  <Page
                    pageNumber={pageNumber}
                    {...calcPageProps()}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="pdf-page-shadow"
                    onLoadSuccess={(page) => { if (page.originalWidth) setAspect(page.originalHeight / page.originalWidth) }}
                  />
                  {isTwoPage && pageNumber + 1 <= (numPages || 1) && (
                    <Page
                      pageNumber={pageNumber + 1}
                      {...calcPageProps()}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      className="pdf-page-shadow"
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
                  onAspect={setAspect}
                />
              ))}
            </div>
          )}

          {/* Matrix: the whole document as 2-page spreads on one zoomable
              canvas. At the low end it is a contact sheet for finding your
              way — and, with Cards on, a concept map, because the cards
              counter-scale while the pages shrink; wind the zoom in and the
              same canvas becomes readable, and a passage can be taken from
              it. Pan by dragging or two-finger scroll; pinch or ctrl+wheel
              zooms; the toolbar slider drives the same transform. */}
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
              onAspect={setAspect}
              zoomMultiplier={zoom}
              onZoomMultiplier={setZoom}
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
