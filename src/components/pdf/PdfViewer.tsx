"use client"
import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import CaptureModal from './CaptureModal';
import { useLoom } from '@/components/providers/LoomProvider';
import { Byte } from '@/lib/types';
import Mark from 'mark.js';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  sourceName: string;
  onClose: () => void;
}

export default function PdfViewer({ url, sourceName, onClose }: PdfViewerProps) {
  const { state } = useLoom();
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  
  // Layout state
  const [isTwoPage, setIsTwoPage] = useState(true); // default to 2-page spread
  const [fitMode, setFitMode] = useState<"width" | "height">("height");
  const [pageHeight, setPageHeight] = useState(800);
  const [containerWidth, setContainerWidth] = useState(800);
  
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [highlightRect, setHighlightRect] = useState<{top: number, left: number, text: string, pageNum?: number, startOffset?: number, endOffset?: number} | null>(null);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [capturedText, setCapturedText] = useState("");

  // Responsive sizing and layout detection
  useEffect(() => {
    const updateLayout = () => {
      const availableHeight = window.innerHeight - 150; // account for header and toolbar
      setPageHeight(Math.max(400, availableHeight));
      
      if (window.innerWidth < 900) {
        setIsTwoPage(false);
      }
    };
    
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  // Track container width for 'Fit to Width' mode
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Text selection listener
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 0 && !showCaptureModal) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        
        let selectedPageNum = pageNumber;
        let startOffset = 0;
        let endOffset = 0;
        
        if (range) {
          // Find the react-pdf page element
          let pageNode: HTMLElement | null = null;
          let node = range.startContainer as Node | null;
          while (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
          let element = node as HTMLElement | null;
          
          while (element) {
            if (element.classList?.contains('react-pdf__Page')) {
              pageNode = element;
              break;
            }
            element = element.parentElement;
          }
          
          if (pageNode) {
            const pageStr = pageNode.getAttribute('data-page-number');
            if (pageStr) selectedPageNum = parseInt(pageStr, 10);
            
            const textLayer = pageNode.querySelector('.react-pdf__Page__textContent');
            if (textLayer) {
              const preRange = range.cloneRange();
              preRange.selectNodeContents(textLayer);
              preRange.setEnd(range.startContainer, range.startOffset);
              startOffset = preRange.toString().length;
              endOffset = startOffset + text.length;
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
            endOffset
          });
        }
      } else {
        setHighlightRect(null);
      }
    };
    
    document.addEventListener("mouseup", handleSelection);
    return () => document.removeEventListener("mouseup", handleSelection);
  }, [showCaptureModal]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  // Use a ref to store the latest bytes so we don't need to depend on state.bytes in the observer
  const bytesRef = useRef<Byte[]>([]);

  // Update bytesRef whenever state.bytes changes
  useEffect(() => {
    bytesRef.current = state.bytes.filter(b => b.source === sourceName);
  }, [state.bytes, sourceName]);

  // Robust highlight applier using MutationObserver + React useEffect
  useEffect(() => {
    if (!containerRef.current) return;
    let debounceTimer: NodeJS.Timeout;

    const applyHighlights = () => {
      const bytes = bytesRef.current;
      if (bytes.length === 0) return;

      const textLayers = containerRef.current!.querySelectorAll('.react-pdf__Page__textContent');
      
      textLayers.forEach(layer => {
        // Skip empty text layers
        if (layer.children.length === 0) return;
        
        const pageStr = layer.parentElement?.getAttribute('data-page-number');
        const parsedPage = pageStr ? parseInt(pageStr, 10) : 0;
        const pageBytes = bytes.filter(b => b.pageNumber === parsedPage || !b.pageNumber);
        if (pageBytes.length === 0) return;

        const instance = new Mark(layer as HTMLElement);
        instance.unmark({
          done: () => {
            let matches = 0;
            pageBytes.forEach(byte => {
              if (byte.startOffset != null && byte.endOffset != null) {
                // Precision mode!
                instance.markRanges([{
                  start: byte.startOffset,
                  length: byte.endOffset - byte.startOffset
                }], {
                  className: "loom-byte-highlight",
                  done: (count) => matches += count
                });
              } else {
                // Legacy fuzzy mode
                instance.mark(byte.content, {
                  accuracy: "partially",
                  separateWordSearch: false,
                  className: "loom-byte-highlight",
                  acrossElements: true,
                  diacritics: true,
                  ignoreJoiners: true,
                  ignorePunctuation: [":", ";", ",", ".", "-", "—", " ", "\n", "\r", "\t", "”", "“", '"', "'", "(", ")", "[", "]"],
                  done: (count) => matches += count
                });
              }
            });
            if (matches > 0) console.log(`[Loom PDF] Applied ${matches} highlights on Page ${parsedPage}.`);
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
  }, [state.bytes, pageNumber]); // Re-run effect when bytes or page changes

  const handleCaptureClick = () => {
    if (highlightRect) {
      setCapturedText(highlightRect.text);
      setShowCaptureModal(true);
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a modal or input
      if (showCaptureModal || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      
      if (e.key === 'ArrowLeft' && canGoPrev) {
        handlePrev();
      } else if (e.key === 'ArrowRight' && canGoNext) {
        handleNext();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoPrev, canGoNext, handlePrev, handleNext, showCaptureModal]);

  // Calculate page dimensions based on fit mode
  const calcPageProps = () => {
    if (fitMode === "height") {
      return { height: pageHeight };
    } else {
      // fit to width
      // Non-page horizontal space:
      // Padding (30*2=60) + Arrows (64*2=128) + Gaps around Document (20*2=40) = 228px
      const nonPageSpace = 228;
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
    <div style={{ 
      position: "fixed", 
      top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: "var(--paper)", 
      zIndex: 5000, 
      display: "flex", 
      flexDirection: "column"
    }} ref={containerRef}>
      
      <style>{`
        .loom-byte-highlight {
          background-color: rgba(255, 204, 0, 0.4);
          border-bottom: 2px solid rgba(255, 204, 0, 0.8);
          color: inherit;
          /* Ensure the text stays selectable */
          pointer-events: none;
        }
        /* Make sure the text layer passes pointer events down so we can select */
        .react-pdf__Page__textContent span {
          pointer-events: auto;
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

      {/* Toolbar */}
      <div style={{ 
        display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", 
        padding: "10px 20px", borderBottom: "1px solid var(--rule)", backgroundColor: "var(--paper-alt)",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)", zIndex: 10
      }}>
        <div>
          <button className="btn ghost mini" onClick={onClose}>← Back to Library</button>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="label" style={{ minWidth: "120px", textAlign: "center" }}>
            {isTwoPage ? `Pages ${pageNumber}-${Math.min(pageNumber + 1, numPages || pageNumber)}` : `Page ${pageNumber}`} of {numPages || '?'}
          </span>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", backgroundColor: "var(--paper)", borderRadius: "4px", padding: "2px", border: "1px solid var(--rule)" }}>
            <button 
              className={`btn mini ${fitMode === "height" ? "" : "ghost"}`} 
              style={{ border: "none", margin: 0, padding: "4px 8px" }}
              onClick={() => setFitMode("height")}
            >
              Fit Page
            </button>
            <button 
              className={`btn mini ${fitMode === "width" ? "" : "ghost"}`} 
              style={{ border: "none", margin: 0, padding: "4px 8px" }}
              onClick={() => setFitMode("width")}
            >
              Fit Width
            </button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }} className="label">
            <input 
              type="checkbox" 
              checked={isTwoPage} 
              onChange={(e) => setIsTwoPage(e.target.checked)} 
              disabled={window.innerWidth < 900}
            />
            2-Page Spread
          </label>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", display: "flex", justifyContent: "center", backgroundColor: "#eef0f2" }}>
        
        <div style={{ display: "flex", alignItems: "center", gap: "20px", padding: "30px", minHeight: "100%" }}>
          
          {/* Left Arrow */}
          <button 
            className="pdf-side-nav"
            onClick={handlePrev}
            disabled={!canGoPrev}
            aria-label="Previous Page"
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          {/* PDF Container */}
          <Document 
            file={url} 
            onLoadSuccess={onDocumentLoadSuccess} 
            loading={<div className="hint">Loading PDF...</div>}
            error={<div className="hint" style={{ color: "var(--red)" }}>Failed to load PDF. Check file path.</div>}
          >
            <div style={{ display: "flex", gap: "20px", justifyContent: "center", boxShadow: "0 0 20px rgba(0,0,0,0.05)" }}>
              <Page 
                pageNumber={pageNumber} 
                {...calcPageProps()}
                renderTextLayer={true} 
                renderAnnotationLayer={true} 
                className="pdf-page-shadow"
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
          </Document>

          {/* Right Arrow */}
          <button 
            className="pdf-side-nav"
            onClick={handleNext}
            disabled={!canGoNext}
            aria-label="Next Page"
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>

      {/* Floating Capture Button */}
      {highlightRect && !showCaptureModal && (
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
      {showCaptureModal && (
        <CaptureModal 
          passage={capturedText}
          source={sourceName}
          location={`p. ${highlightRect?.pageNum || pageNumber}`}
          pageNumber={highlightRect?.pageNum}
          startOffset={highlightRect?.startOffset}
          endOffset={highlightRect?.endOffset}
          onClose={() => {
            setShowCaptureModal(false);
            setHighlightRect(null);
            setCapturedText("");
            document.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </div>
  );
}
