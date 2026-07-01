"use client"
import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import CaptureModal from './CaptureModal';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  sourceName: string;
  onClose: () => void;
}

export default function PdfViewer({ url, sourceName, onClose }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  
  // Layout state
  const [isTwoPage, setIsTwoPage] = useState(false);
  const [pageHeight, setPageHeight] = useState(800);
  
  const [highlightRect, setHighlightRect] = useState<{top: number, left: number, text: string} | null>(null);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [capturedText, setCapturedText] = useState("");

  // Responsive sizing and layout detection
  useEffect(() => {
    const updateLayout = () => {
      // Calculate available height (viewport minus toolbar and some padding)
      const availableHeight = window.innerHeight - 120;
      setPageHeight(Math.max(400, availableHeight));
      
      // Auto-switch to single page if screen is too narrow (e.g. mobile/tablet portrait)
      if (window.innerWidth < 900) {
        setIsTwoPage(false);
      }
    };
    
    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
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

  const handlePrev = () => setPageNumber(p => Math.max(1, p - advance));
  const handleNext = () => setPageNumber(p => Math.min(numPages || p, p + advance));

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Toolbar */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", marginBottom: "16px", position: "sticky", top: "10px", zIndex: 100 }}>
        <div>
          <button className="btn ghost mini" onClick={onClose}>← Back to Library</button>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="btn ghost mini" disabled={!canGoPrev} onClick={handlePrev}>Prev</button>
          <span className="label" style={{ minWidth: "120px", textAlign: "center" }}>
            {isTwoPage ? `Pages ${pageNumber}-${Math.min(pageNumber + 1, numPages || pageNumber)}` : `Page ${pageNumber}`} of {numPages || '?'}
          </span>
          <button className="btn ghost mini" disabled={!canGoNext} onClick={handleNext}>Next</button>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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

      {/* PDF Container */}
      <div style={{ display: "flex", justifyContent: "center", gap: "20px", overflowX: "auto", paddingBottom: "20px" }}>
        <Document 
          file={url} 
          onLoadSuccess={onDocumentLoadSuccess} 
          loading={<div className="hint" style={{ marginTop: "40px" }}>Loading PDF...</div>}
          error={<div className="hint" style={{ marginTop: "40px", color: "var(--red)" }}>Failed to load PDF. Check file path.</div>}
        >
          <div style={{ display: "flex", gap: "20px", justifyContent: "center", boxShadow: "0 0 20px rgba(0,0,0,0.05)" }}>
            <Page 
              pageNumber={pageNumber} 
              height={pageHeight}
              renderTextLayer={true} 
              renderAnnotationLayer={true} 
              className="pdf-page-shadow"
            />
            {isTwoPage && pageNumber + 1 <= (numPages || 1) && (
              <Page 
                pageNumber={pageNumber + 1} 
                height={pageHeight}
                renderTextLayer={true} 
                renderAnnotationLayer={true}
                className="pdf-page-shadow"
              />
            )}
          </div>
        </Document>
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
            zIndex: 900,
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
          }}
        />
      )}
    </div>
  );
}
