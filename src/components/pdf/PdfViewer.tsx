"use client"
import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import CaptureModal from './CaptureModal';
import { useLoom } from '@/components/providers/LoomProvider';
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
  
  const [highlightRect, setHighlightRect] = useState<{top: number, left: number, text: string} | null>(null);
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
        if (rect) {
          setHighlightRect({
            top: rect.top,
            left: rect.left + rect.width / 2,
            text
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

  // Highlight previously captured bytes
  const highlightCapturedBytes = () => {
    // Wait a beat for the text layer to actually populate the DOM
    setTimeout(() => {
      if (!containerRef.current) return;
      
      // Get all passages captured from this source
      const passages = state.bytes
        .filter(b => b.source === sourceName)
        .map(b => b.content);
        
      console.log(`[Loom PDF] Found ${passages.length} bytes for source "${sourceName}"`);
      if (passages.length === 0) return;

      // We target the text layers rendered by react-pdf
      const textLayers = containerRef.current.querySelectorAll('.react-pdf__Page__textContent');
      console.log(`[Loom PDF] Found ${textLayers.length} text layers in DOM.`);
      
      textLayers.forEach(layer => {
        const instance = new Mark(layer as HTMLElement);
        
        // Clear previous marks before reapplying
        instance.unmark({
          done: () => {
            let matches = 0;
            passages.forEach(passage => {
              instance.mark(passage, {
                accuracy: "partially",
                separateWordSearch: false,
                className: "loom-byte-highlight",
                acrossElements: true,
                diacritics: true,
                ignoreJoiners: true,
                ignorePunctuation: [":", ";", ",", ".", "-", "—", " ", "\n", "\r", "\t", "”", "“", '"', "'"],
                done: (count) => {
                  matches += count;
                  console.log(`[Loom PDF] Marked "${passage.substring(0, 20)}..." -> ${count} matches`);
                }
              });
            });
          }
        });
      });
    }, 250); // 250ms delay to let React finish rendering the span tags
  };

  const handleCaptureClick = () => {
    if (highlightRect) {
      setCapturedText(highlightRect.text);
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
      const targetWidth = isTwoPage ? (containerWidth / 2) - 20 : containerWidth;
      return { width: targetWidth };
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
                onRenderSuccess={highlightCapturedBytes}
                className="pdf-page-shadow"
              />
              {isTwoPage && pageNumber + 1 <= (numPages || 1) && (
                <Page 
                  pageNumber={pageNumber + 1} 
                  {...calcPageProps()}
                  renderTextLayer={true} 
                  renderAnnotationLayer={true}
                  onRenderSuccess={highlightCapturedBytes}
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
      {showCaptureModal && (
        <CaptureModal 
          passage={capturedText}
          source={sourceName}
          location={`p. ${pageNumber}`}
          onClose={() => {
            setShowCaptureModal(false);
            window.getSelection()?.removeAllRanges();
            highlightCapturedBytes();
          }}
        />
      )}
    </div>
  );
}
