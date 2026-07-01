"use client"
import { useState, useEffect } from 'react';
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
  const [scale, setScale] = useState(1.2);
  
  const [highlightRect, setHighlightRect] = useState<{top: number, left: number, text: string} | null>(null);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [capturedText, setCapturedText] = useState("");

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

  return (
    <div style={{ position: "relative" }}>
      {/* Toolbar */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", marginBottom: "20px", position: "sticky", top: "10px", zIndex: 100 }}>
        <div>
          <button className="btn ghost mini" onClick={onClose}>← Back to Library</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="btn ghost mini" disabled={pageNumber <= 1} onClick={() => setPageNumber(p => p - 1)}>Prev</button>
          <span className="label">Page {pageNumber} of {numPages || '?'}</span>
          <button className="btn ghost mini" disabled={numPages === undefined || pageNumber >= numPages} onClick={() => setPageNumber(p => p + 1)}>Next</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button className="btn ghost mini" onClick={() => setScale(s => s - 0.2)}>-</button>
          <span className="label">{Math.round(scale * 100)}%</span>
          <button className="btn ghost mini" onClick={() => setScale(s => s + 0.2)}>+</button>
        </div>
      </div>

      {/* PDF Container */}
      <div style={{ display: "flex", justifyContent: "center", minHeight: "800px" }}>
        <Document 
          file={url} 
          onLoadSuccess={onDocumentLoadSuccess} 
          loading={<div className="hint" style={{ marginTop: "40px" }}>Loading PDF...</div>}
          error={<div className="hint" style={{ marginTop: "40px", color: "var(--red)" }}>Failed to load PDF. Check file path.</div>}
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            renderTextLayer={true} 
            renderAnnotationLayer={true} 
          />
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
            backgroundColor: "var(--ochre)", // Give it a distinctive color
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
