"use client"
import { useState } from "react"
import dynamic from 'next/dynamic'

const PdfViewer = dynamic(() => import('@/components/pdf/PdfViewer'), {
  ssr: false,
})

export default function LibraryTab() {
  const [activePdf, setActivePdf] = useState<{url: string, title: string} | null>(null)

  if (activePdf) {
    return (
      <PdfViewer 
        url={activePdf.url} 
        sourceName={activePdf.title} 
        onClose={() => setActivePdf(null)} 
      />
    )
  }

  return (
    <>
      <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>Object Worlds</h3>
          <p className="hint" style={{ margin: "0 0 12px 0" }}>Bucciarelli — Designing Engineers</p>
          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
            Explores how different disciplines inhabit their own "worlds" with distinct instruments and languages. Useful for understanding how different experts might code the same concept in completely different ways.
          </p>
          <button 
            className="btn mini" 
            onClick={() => setActivePdf({ url: "/readings/Bucciarelli-Designing Engineers.pdf", title: "Bucciarelli, Designing Engineers" })}
          >
            Read in Loom
          </button>
        </div>
        
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>Communities of Practice</h3>
          <p className="hint" style={{ margin: "0 0 12px 0" }}>Wenger</p>
          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
            Details how shared vocabularies are learned by participating in a community. In Loom, you grow a shared edge-vocabulary over time by coding together.
          </p>
          <button 
            className="btn mini" 
            onClick={() => setActivePdf({ url: "/readings/Wenger_communities-of-practice.pdf", title: "Wenger, Communities of Practice" })}
          >
            Read in Loom
          </button>
        </div>
        
        <div className="card" style={{ padding: "20px" }}>
          <h3 style={{ margin: "0 0 4px 0", fontSize: "16px" }}>Boundary Objects</h3>
          <p className="hint" style={{ margin: "0 0 12px 0" }}>Star, 2010 — 'This Is Not A Boundary Object'</p>
          <p style={{ fontSize: "14px", lineHeight: "1.4", marginBottom: "16px" }}>
            How distinct fields coordinate around one shared object without agreeing on its exact meaning. Loom serves as a boundary object, holding a common identity across different disciplinary "tongues".
          </p>
          <button 
            className="btn mini" 
            onClick={() => setActivePdf({ url: "/readings/Star, 2010 'This Is Not A Boundary Object'.pdf", title: "Star, This Is Not A Boundary Object" })}
          >
            Read in Loom
          </button>
        </div>
        
      </div>
    </>
  )
}
