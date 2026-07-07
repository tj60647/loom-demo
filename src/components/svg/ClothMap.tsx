"use client"

import { useEffect, useState, useRef } from "react"
import type { LoomState } from "@/lib/types"

type ReadSel = { type: "concept" | "edge" | "hub", id?: string, ids?: string[], promptIdx?: number } | null

export default function ClothMap({ 
  state, 
  readSel, 
  setReadSel 
}: { 
  state: LoomState, 
  readSel: ReadSel, 
  setReadSel: (s: ReadSel) => void 
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(720)

  useEffect(() => {
    if (svgRef.current) {
      setWidth(Math.max(svgRef.current.getBoundingClientRect().width, 720))
    }
  }, [])

  const H = 400
  const baseY = H - 128
  const mL = 46
  const mR = 34
  
  const cs = state.concepts
  const n = cs.length
  const X = (i: number) => n === 1 ? width / 2 : mL + i * (width - mL - mR) / (n - 1)
  
  const idx: Record<string, number> = {}
  cs.forEach((c, i) => idx[c.id] = i)

  const selNodes = new Set<string>()
  const selEdges = new Set<string>()
  let selEdgeId: string | null = null

  if (readSel?.type === "concept" && readSel.id) {
    // We would trace the component here, but for simplicity let's just highlight the node and its immediate edges
    // The original app highlights the entire component (island). We can just do immediate edges for now,
    // or calculate the component if we port `componentOf`.
    selNodes.add(readSel.id)
    state.edges.forEach(e => {
      if (e.fromId === readSel.id || e.toId === readSel.id) {
        selEdges.add(e.id)
        selNodes.add(e.fromId)
        selNodes.add(e.toId)
      }
    })
  } else if (readSel?.type === "hub" && readSel.ids) {
    readSel.ids.forEach(id => selNodes.add(id))
    state.edges.forEach(e => {
      if (readSel.ids!.includes(e.fromId) || readSel.ids!.includes(e.toId)) {
        selEdges.add(e.id)
        selNodes.add(e.fromId)
        selNodes.add(e.toId)
      }
    })
  } else if (readSel?.type === "edge" && readSel.id) {
    selEdgeId = readSel.id
  }

  const eo = state.edges
    .map((e, k) => ({ e, k }))
    .filter(o => idx[o.e.fromId] != null && idx[o.e.toId] != null && o.e.fromId !== o.e.toId)
  
  eo.sort((a, b) => Math.abs(X(idx[b.e.fromId]) - X(idx[b.e.toId])) - Math.abs(X(idx[a.e.fromId]) - X(idx[a.e.toId])))

  return (
    <svg ref={svgRef} id="map" style={{ width: "100%", height: H, touchAction: "none" }}>
      <defs>
        <marker id="arwS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--sage)" />
        </marker>
        <marker id="arwG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--grey)" />
        </marker>
        <marker id="arwR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--red)" />
        </marker>
      </defs>

      {cs.length > 0 && (
        <line x1={mL - 16} y1={baseY} x2={width - mR + 14} y2={baseY} stroke="var(--rule)" strokeWidth={1.2} />
      )}

      {/* Warp Lines */}
      {cs.map((c, i) => (
        <line key={`warp-${c.id}`} x1={X(i)} y1={28} x2={X(i)} y2={baseY} stroke="rgba(168,132,63,.14)" strokeWidth={1} />
      ))}

      {/* Edges */}
      {eo.map(({ e, k }) => {
        const fx = X(idx[e.fromId])
        const tx = X(idx[e.toId])
        const span = Math.abs(tx - fx)
        if (!span) return null
        
        const h = Math.min(baseY - 44, 28 + span * 0.2 + (k % 3) * 11)
        const beaten = !!e.handle
        const isSel = selEdgeId === e.id
        
        const col = isSel ? "var(--red)" : (beaten ? "var(--sage)" : "var(--grey)")
        let op = 1
        if (selEdgeId && !isSel) op = 0.18
        else if (readSel && readSel.type !== "edge" && !selEdges.has(e.id)) op = 0.15

        const handleSelect = () => {
          if (readSel?.type === "edge" && readSel.id === e.id) {
            setReadSel(null)
          } else {
            setReadSel({ type: "edge", id: e.id })
          }
        }

        return (
          <g key={`edge-${e.id}`}>
            <path 
              d={`M ${fx} ${baseY - 6} A ${span / 2} ${h} 0 0 ${fx < tx ? 1 : 0} ${tx} ${baseY - 6}`}
              fill="none" 
              stroke={col} 
              opacity={op} 
              strokeWidth={isSel ? 2 : 1.5}
              strokeDasharray={beaten ? "none" : "5 4"}
              markerEnd={`url(#${isSel ? 'arwR' : (beaten ? 'arwS' : 'arwG')})`}
              cursor="pointer"
              onClick={handleSelect}
            >
              <title>{`"${e.sentence}"`}</title>
            </path>
            
            <text
              x={(fx + tx) / 2}
              y={baseY - 6 - h - 5}
              textAnchor="middle"
              fontFamily="ui-monospace,Menlo,monospace"
              fontSize={10}
              fontStyle={beaten ? "normal" : "italic"}
              fill={col}
              stroke="#f4f2ec"
              strokeWidth={4}
              paintOrder="stroke"
              letterSpacing=".04em"
              opacity={op}
              cursor="pointer"
              onClick={handleSelect}
            >
              {e.handle || (e.sentence.length > 34 ? e.sentence.slice(0, 33) + '…' : e.sentence)}
            </text>
          </g>
        )
      })}

      {/* Nodes */}
      {cs.map((c, i) => {
        const x = X(i)
        const isSel = readSel?.type === "concept" && readSel.id === c.id
        const op = (selNodes.size > 0 && !selNodes.has(c.id)) ? 0.3 : 1
        
        const handleSelect = () => {
          if (isSel) setReadSel(null)
          else setReadSel({ type: "concept", id: c.id })
        }

        return (
          <g key={`node-${c.id}`}>
            <circle 
              cx={x} cy={baseY} 
              r={isSel ? 4.6 : 3.4} 
              fill={isSel ? "var(--red)" : "var(--ochre)"} 
              opacity={op}
              cursor="pointer"
              onClick={handleSelect}
            />
            <text
              transform={`translate(${x + 4},${baseY + 13}) rotate(30)`}
              fontFamily='"Newsreader",Georgia,serif'
              fontSize={11.5}
              fill={isSel ? "var(--red)" : "var(--ink)"}
              opacity={op}
              cursor="pointer"
              onClick={handleSelect}
            >
              <title>{c.label + (c.def ? ` — ${c.def}` : '')}</title>
              {c.label.length > 34 ? c.label.slice(0, 33) + '…' : c.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
