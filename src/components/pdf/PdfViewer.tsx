"use client"
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import CaptureModal from './CaptureModal';
import PageSlot from './PageSlot';
import { useLoom } from '@/components/providers/LoomProvider';
import { searchReading, type ReadingPageHit } from '@/actions/search';
import { hitTermsOf } from '@/lib/searchText';
import Snippet from '@/components/ui/Snippet';
import { Byte, Concept } from '@/lib/types';
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
  focusByteId?: string | null;
  /** Opens the search panel pre-filled — how a shelf-search hit carries its
      query into the text it matched. */
  initialSearch?: string;
  onGotoOpenByte?: (byteId: string) => void;
  onClose: () => void;
}

/** One byte on the clicked span, as the highlight tooltip presents it. */
type HighlightEntry = {
  byteId: string;
  conceptLabel: string;
  source: string;
  location: string;
  startOffset: number | null;
  endOffset: number | null;
};

export default function PdfViewer({ url, sourceName, sourceId, initialPageNumber, focusByteId, initialSearch, onGotoOpenByte, onClose }: PdfViewerProps) {
  const { state } = useLoom();
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isNarrow, setIsNarrow] = useState(false);
  // One passage can carry several bytes — the same span re-filed under a
  // second concept, or overlapping captures. The tooltip lists every byte on
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
   *  - `strip`  every page in one horizontal run, scrolled sideways
   *  - `matrix` every page on a grid you can zoom into and pan
   * All three render ordinary react-pdf pages with their text layers, so a
   * passage can be selected and captured in any of them.
   */
  const [viewMode, setViewMode] = useState<"page" | "strip" | "matrix">("page");
  // Covers the whole window, chrome included — the reading takes the screen.
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Matrix zoom, as a multiple of the base thumbnail width.
  const [zoom, setZoom] = useState(1);
  // The document's height/width, measured off the first page that renders, so
  // the many-page views can reserve honest space before a page has drawn.
  const [aspect, setAspect] = useState(11 / 8.5);

  const containerRef = useRef<HTMLDivElement>(null);
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

  const hideHighlightTooltip = useCallback(() => {
    setHighlightTooltip(null);
  }, []);

  // Latest bytes/concepts for click-time lookups. Overlapping captures nest
  // their <mark> elements, so the byte list for a span is read off the DOM at
  // click time rather than frozen per node at mark time.
  const bytesRef = useRef<Byte[]>([]);
  const conceptsRef = useRef<Concept[]>([]);
  useEffect(() => {
    conceptsRef.current = state.concepts;
  }, [state.concepts]);

  /**
   * Every byte covering this node's span: the node's own byte plus the bytes
   * of the ancestor marks it is nested inside. Ordered as the bytes appear in
   * the capture list, so the tooltip is stable no matter which layer was
   * clicked.
   */
  const entriesForNode = useCallback((node: HTMLElement): HighlightEntry[] => {
    const ids: string[] = [];
    let el: HTMLElement | null = node.closest(".loom-byte-highlight");
    while (el) {
      const id = el.getAttribute("data-loom-byte-id");
      if (id && !ids.includes(id)) ids.push(id);
      el = el.parentElement ? el.parentElement.closest(".loom-byte-highlight") : null;
    }
    const orderOf = new Map(bytesRef.current.map((b, i) => [b.id, i]));
    ids.sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));
    return ids.flatMap((id) => {
      const byte = bytesRef.current.find((b) => b.id === id);
      if (!byte) return [];
      const concept = conceptsRef.current.find((c) => c.id === byte.conceptId);
      return [{
        byteId: byte.id,
        conceptLabel: concept?.label || "Unlabeled byte",
        source: byte.source || sourceName,
        location: byte.location || "",
        startOffset: byte.startOffset ?? null,
        endOffset: byte.endOffset ?? null,
      }];
    });
  }, [sourceName]);

  const bindHighlightNode = useCallback((node: HTMLElement, byteId: string) => {
    node.setAttribute("data-loom-byte-id", byteId);

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
    if (!focusByteId) return;
    const targetByte = state.bytes.find((b) => b.id === focusByteId);
    if (targetByte?.pageNumber && targetByte.pageNumber > 0) {
      const timer = window.setTimeout(() => setPageNumber(targetByte.pageNumber!), 0);
      return () => window.clearTimeout(timer);
    }
  }, [focusByteId, state.bytes]);

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
           * byte would be filed as "p. 1" whichever page it really came from,
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
           * the anchor is dropped, which puts the byte on the same fuzzy
           * matching path as every byte captured before anchoring existed.
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
    return () => {
      cancelAnimationFrame(frame);
      stageEl2?.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
    };
  }, [highlightRect]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".loom-byte-highlight") || target.closest(".loom-highlight-tooltip")) {
        return;
      }
      hideHighlightTooltip();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [hideHighlightTooltip]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  // Keep bytesRef current (declared above, next to conceptsRef) so the
  // MutationObserver's applier never needs state.bytes as a dependency.
  useEffect(() => {
    bytesRef.current = state.bytes.filter(b => (sourceId && b.sourceId === sourceId) || b.source === sourceName);
  }, [state.bytes, sourceName, sourceId]);

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

  // The word forms Postgres marked in the snippets — the document's own words
  // (stemming happened server-side), so an exact, case-insensitive mark on the
  // text layer finds them again.
  const searchTerms = useMemo(
    () => (searchHits ? hitTermsOf(searchHits.map((hit) => hit.snippet)) : []),
    [searchHits]
  );

  // Robust highlight applier using MutationObserver + React useEffect.
  // Search-term marks ride the same pass as byte highlights: one unmark, then
  // bytes, then search terms — two competing effects would race each other's
  // unmark and strip whichever finished first.
  useEffect(() => {
    searchTermsRef.current = searchTerms;
    if (!containerRef.current) return;
    let debounceTimer: NodeJS.Timeout;

    const applyHighlights = () => {
      const bytes = bytesRef.current;
      if (bytes.length === 0 && searchTermsRef.current.length === 0) return;

      const textLayers = containerRef.current!.querySelectorAll('.react-pdf__Page__textContent');

      textLayers.forEach(layer => {
        // Skip empty text layers
        if (layer.children.length === 0) return;

        const pageStr = layer.parentElement?.getAttribute('data-page-number');
        const parsedPage = pageStr ? parseInt(pageStr, 10) : 0;
        const pageBytes = bytes.filter(b => b.pageNumber === parsedPage || !b.pageNumber);
        if (pageBytes.length === 0 && searchTermsRef.current.length === 0) return;

        const instance = new Mark(layer as HTMLElement);
        instance.unmark({
          done: () => {
            let matches = 0;
            // Compute the live text layer's content hash once per page so we
            // can decide, per byte, whether the offsets we stored are still
            // trustworthy against what pdf.js actually rendered this time.
            const liveHash = hashText((layer as HTMLElement).textContent || "");
            pageBytes.forEach(byte => {
              const hasOffsets = byte.startOffset != null && byte.endOffset != null;
              const offsetsTrusted = hasOffsets && (
                // No stored hash (legacy byte captured before this check
                // existed) — fall back to trusting the offsets as before.
                byte.pageContentHash == null || byte.pageContentHash === liveHash
              );

              if (offsetsTrusted) {
                // Precision mode!
                instance.markRanges([{
                  start: byte.startOffset!,
                  length: byte.endOffset! - byte.startOffset!
                }], {
                  className: "loom-byte-highlight",
                  each: (node) => {
                    const concept = state.concepts.find((c) => c.id === byte.conceptId);
                    const a11y = `${concept?.label || "Unlabeled byte"}. ${byte.source || sourceName}${byte.location ? `, ${byte.location}` : ""}. Characters ${byte.startOffset ?? "?"}-${byte.endOffset ?? "?"}.`;
                    (node as HTMLElement).setAttribute("aria-label", a11y);
                    (node as HTMLElement).setAttribute("tabindex", "0");
                    bindHighlightNode(node as HTMLElement, byte.id);
                  },
                  done: (count) => matches += count
                });
              } else {
                if (hasOffsets) {
                  console.warn(`[Loom PDF] Page ${parsedPage} text layer has drifted from the anchored content (hash mismatch); falling back to fuzzy matching for byte ${byte.id}.`);
                }
                // Legacy / drifted fuzzy mode
                instance.mark(byte.content, {
                  accuracy: "partially",
                  separateWordSearch: false,
                  className: "loom-byte-highlight",
                  acrossElements: true,
                  diacritics: true,
                  ignoreJoiners: true,
                  ignorePunctuation: [":", ";", ",", ".", "-", "—", " ", "\n", "\r", "\t", "”", "“", '"', "'", "(", ")", "[", "]"],
                  each: (node) => {
                    const concept = state.concepts.find((c) => c.id === byte.conceptId);
                    const a11y = `${concept?.label || "Unlabeled byte"}. ${byte.source || sourceName}${byte.location ? `, ${byte.location}` : ""}. Characters ${byte.startOffset ?? "?"}-${byte.endOffset ?? "?"}.`;
                    (node as HTMLElement).setAttribute("aria-label", a11y);
                    (node as HTMLElement).setAttribute("tabindex", "0");
                    bindHighlightNode(node as HTMLElement, byte.id);
                  },
                  done: (count) => matches += count
                });
              }
            });
            if (matches > 0) console.log(`[Loom PDF] Applied ${matches} highlights on Page ${parsedPage}.`);

            // Search hits, marked after the bytes so a passage that is both
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

    // 1. Run whenever this effect triggers (e.g. when state.bytes changes)
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

    observer.observe(containerRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearTimeout(debounceTimer);
    };
  }, [state.bytes, state.concepts, pageNumber, bindHighlightNode, sourceName, searchTerms]); // Re-run when bytes, page, or search terms change

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
   * In the continuous views a page is somewhere to scroll to, not something to
   * turn to — so "go to this byte's page" (and the initial page) brings the
   * page into view instead of swapping what is rendered.
   */
  useEffect(() => {
    if (viewMode === "page") return;
    const stageEl = stageRef.current;
    if (!stageEl) return;
    const timer = window.setTimeout(() => {
      const slot = stageEl.querySelector(`[data-slot-page="${pageNumber}"]`);
      slot?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 60);
    return () => window.clearTimeout(timer);
    // numPages matters: on the first load the slots do not exist yet, so
    // without it this ran once against an empty stage and "go to this byte's
    // page" quietly did nothing until you changed page by hand.
  }, [pageNumber, viewMode, numPages]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a modal or input
      if (showCaptureModal || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;

      if (e.key === 'Escape') {
        // One Escape, one thing: dismiss the tooltip if one is open, then the
        // search panel, then fullscreen. Doing several at once would take the
        // reading away from someone who only meant to close a label.
        if (highlightTooltip) hideHighlightTooltip();
        else if (searchOpen) closeSearch();
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
  }, [canGoPrev, canGoNext, handlePrev, handleNext, hideHighlightTooltip, showCaptureModal, viewMode, isFullscreen, highlightTooltip, searchOpen, closeSearch]);

  /**
   * Matrix page width: a contact sheet of four across on a desktop stage (two
   * on a phone) at zoom 1, scaled from there. The floor keeps a page legible
   * as a thumbnail; the ceiling stops a hard zoom from producing a page so
   * wide the grid can no longer be panned sensibly.
   */
  const matrixColumns = isNarrow ? 2 : 4;
  const matrixPageWidth = Math.min(
    Math.max(((stage.w - 36) / matrixColumns - 18) * zoom, 90),
    Math.max(stage.w * 2, 300)
  );

  // Calculate page dimensions based on fit mode
  const calcPageProps = () => {
    if (fitMode === "height") {
      // The stage is the real estate; the padding around the pages is the only
      // thing taken off it, so "fit page" genuinely fills the height available.
      return { height: Math.max(320, stage.h - (isNarrow ? 24 : 48)) };
    } else {
      // fit to width
      // Non-page horizontal space:
      // Desktop: padding + side arrows + gaps. Mobile: tighter layout.
      const nonPageSpace = isNarrow ? 56 : 228;
      if (isTwoPage) {
        // Plus 20px gap between the two pages = 248px total non-page space
        const targetWidth = (containerWidth - 248) / 2;
        return { width: Math.max(targetWidth, 200) };
      } else {
        const targetWidth = containerWidth - nonPageSpace;
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
        .loom-byte-highlight {
          background-color: rgba(255, 204, 0, 0.4);
          border-bottom: 2px solid rgba(255, 204, 0, 0.8);
          color: inherit;
          cursor: help;
          pointer-events: auto;
        }
        /* A searched word on the page. Sage, not the byte yellow: a search
           hit is a place the text says something, never a passage anyone
           captured — the two must not be readable as each other. */
        .loom-search-hit {
          background-color: rgba(122, 138, 110, 0.4);
          outline: 1px solid rgba(122, 138, 110, 0.75);
          color: inherit;
        }
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
        .pdf-stage.mode-matrix { overflow: auto; }

        .pdf-strip-run {
          display: flex;
          align-items: center;
          gap: 18px;
          height: 100%;
          padding: 12px 18px;
          width: max-content;
        }
        .pdf-matrix-grid {
          display: flex;
          flex-wrap: wrap;
          align-content: flex-start;
          justify-content: safe center;
          gap: 18px;
          padding: 18px;
        }
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
          .pdf-matrix-grid { gap: 10px; padding: 10px; }
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
          {/* This closes the text and lands on 01 Open — where the passage you
              just captured is waiting — not on the readings list. */}
          {/* Labelled only when the label is an arrow on its own; with the
              words visible they are the name. */}
          <button className="btn ghost mini" onClick={onClose} aria-label={isNarrow ? "Back to 01 · Open" : undefined}>
            {isNarrow ? "←" : "← Back to 01 · Open"}
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
            <button
              className={`btn mini ${viewMode === "strip" ? "" : "ghost"}`}
              onClick={() => setViewMode("strip")}
              data-tip="every page in one run — scroll sideways"
              aria-pressed={viewMode === "strip"}
            >Strip</button>
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

          {viewMode === "matrix" && (
            <label className="label" style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              Zoom
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                aria-label="Zoom the page matrix"
                style={{ width: isNarrow ? 90 : 130 }}
              />
            </label>
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

          {/* Only where there is canonical page text to search — a viewer
              without a sourceId has no pages on record to ask. */}
          {sourceId && (
            <button
              className={`btn mini ${searchOpen ? "" : "ghost"}`}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
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

          {/* Matrix: every page at once, zoomable. At the low end it is a
              contact sheet for finding your way; wind the zoom up and the same
              grid becomes readable, and a passage can be taken from it. */}
          {viewMode === "matrix" && (
            <div className="pdf-matrix-grid">
              {Array.from({ length: numPages ?? 0 }, (_, i) => (
                <PageSlot
                  key={i + 1}
                  pageNumber={i + 1}
                  width={matrixPageWidth}
                  aspect={aspect}
                  root={stageEl}
                  eager={i === 0}
                  onAspect={setAspect}
                  label
                />
              ))}
            </div>
          )}
        </Document>
      </div>

      {/* Paging bar, phone only — and only where there are pages to turn. The
          strip and the matrix are scrolled, so a Prev/Next pair there would be
          a control for something the view does not do, sitting on top of the
          reading. */}
      {isNarrow && viewMode === "page" && (
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
          Capture as Byte
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
                ? `${highlightTooltip.entries.length} bytes on this passage`
                : "byte"}
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
            <div className="entry" key={entry.byteId}>
              <div className="coding">{entry.conceptLabel}</div>
              <div className="foot">
                {entry.source}
                {entry.location ? ` | ${entry.location}` : ""}
                {` | chars ${entry.startOffset ?? "?"}-${entry.endOffset ?? "?"}`}
              </div>
              {onGotoOpenByte ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onGotoOpenByte(entry.byteId);
                    hideHighlightTooltip();
                  }}
                >
                  Goto Coding Log
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
