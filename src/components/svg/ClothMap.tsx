"use client"

import { useEffect, useState, useRef } from "react"
import type { LoomState } from "@/lib/types"
import { adjacency, componentOf } from "@/lib/clothMath"
import { conceptNameText } from "@/lib/conceptName"

type ReadSel = { type: "concept" | "edge" | "hub", id?: string, ids?: string[], promptIdx?: number, gap?: boolean } | null

/**
 * What just happened, if anything (TJ, 2026-08-12: "the latest event needs a
 * glow that fades out"). The replay hands the id of whatever the current act
 * touched and a `seq` that changes with every step — the seq is what restarts
 * the animation, since replaying the same concept twice must glow twice.
 */
export type ClothGlow = { id: string; seq: number } | null

export default function ClothMap({
  state,
  readSel,
  setReadSel,
  glow = null,
}: {
  state: LoomState,
  readSel: ReadSel,
  setReadSel: (s: ReadSel) => void,
  glow?: ClothGlow,
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(720)

  // ResizeObserver rather than a one-shot measure: it catches window resizes
  // and the moment a hidden panel becomes visible. A zero width means the
  // panel is display:none — keep the last good width instead of collapsing to
  // the fallback and re-laying out on every tab switch.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      // The floor was 720 — from when the cloth was the full width of the
      // page. In half a column (TJ, 2026-08-12) a 720 layout inside a 562px
      // box does not shrink, it CLIPS: the last concepts simply leave the
      // frame. 480 is the narrowest the warp still reads at; below it
      // `#mapWrap` scrolls rather than hiding anything.
      if (w > 0) setWidth(Math.max(w, 480))
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const H = 400
  const baseY = H - 128
  const mL = 46
  // Room for the LAST label, which is drawn from the node and rotated 30° into
  // the right margin — at mR=34 it ran off the frame at any width, and half a
  // column made that impossible to miss. Not enough for the longest label
  // there can be (34 chars ≈ 160px projected); enough that a normal one lands.
  const mR = 96
  
  const cs = state.concepts
  const n = cs.length
  const X = (i: number) => n === 1 ? width / 2 : mL + i * (width - mL - mR) / (n - 1)
  
  const idx: Record<string, number> = {}
  cs.forEach((c, i) => idx[c.id] = i)

  let selNodes: Set<string> | null = null
  let selEdges: Set<string> | null = null
  let selEdgeId: string | null = null

  if (readSel?.type === "concept" && readSel.id) {
    // Pulling a thread lights the FULL connected component, as in v14.
    const comp = componentOf(readSel.id, adjacency(state.edges))
    selNodes = comp.nodes
    selEdges = new Set(comp.edges.map(e => e.id))
  } else if (readSel?.type === "hub" && readSel.ids) {
    const ids = readSel.ids
    const nodes = new Set(ids)
    const edgeIds = new Set<string>()
    state.edges.forEach(e => {
      if (ids.includes(e.fromId) || ids.includes(e.toId)) {
        edgeIds.add(e.id)
        nodes.add(e.fromId)
        nodes.add(e.toId)
      }
    })
    selNodes = nodes
    selEdges = edgeIds
  } else if (readSel?.type === "edge" && readSel.id) {
    selEdgeId = readSel.id
  }

  const eo = state.edges
    .map((e, k) => ({ e, k }))
    .filter(o => idx[o.e.fromId] != null && idx[o.e.toId] != null && o.e.fromId !== o.e.toId)
  
  eo.sort((a, b) => Math.abs(X(idx[b.e.fromId]) - X(idx[b.e.toId])) - Math.abs(X(idx[a.e.fromId]) - X(idx[a.e.toId])))

  // minWidth pairs with the 480 floor in the observer above: this is drawn in
  // raw CSS pixels, so a 480-wide warp inside a narrower element is cut off
  // rather than scaled down. With the minimum real, `#mapWrap` scrolls.
  return (
    <svg ref={svgRef} id="map" style={{ width: "100%", minWidth: 480, height: H, touchAction: "none" }}>
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

      {cs.length === 0 && (
        <g>
          <circle cx={480} cy={170} r={7} fill="none" stroke="var(--red)" strokeWidth={1.3} />
          {[[480, 156, 480, 163], [480, 177, 480, 184], [466, 170, 473, 170], [487, 170, 494, 170]].map(([x1, y1, x2, y2], i) => (
            <line key={`tick-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--red)" strokeWidth={1.3} />
          ))}
          <text x={480} y={206} textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" fontSize={9} letterSpacing={2} fill="var(--red)">HERE.</text>
          <text x={480} y={226} textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" fontSize={9} letterSpacing={2} fill="var(--grey)">THE CLOTH BEGINS WITH ONE THROWN THREAD.</text>
        </g>
      )}

      {cs.length > 0 && (
        <line x1={mL - 16} y1={baseY} x2={width - mR + 14} y2={baseY} stroke="var(--rule)" strokeWidth={1.2} />
      )}

      {/* Warp Lines. `pointerEvents:none` — they are the paper's grain, not a
          target, and they run the full height of the cloth: every arc crosses
          one, and an arc clicked where it crosses used to select nothing at
          all (the warp line is drawn under, but it wins any pixel the arc's
          hairline does not exactly cover). */}
      {cs.map((c, i) => (
        <line key={`warp-${c.id}`} x1={X(i)} y1={28} x2={X(i)} y2={baseY} stroke="rgba(168,132,63,.14)" strokeWidth={1} pointerEvents="none" />
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
        else if (selEdges && !selEdges.has(e.id)) op = 0.15

        const handleSelect = () => {
          if (readSel?.type === "edge" && readSel.id === e.id) {
            setReadSel(null)
          } else {
            setReadSel({ type: "edge", id: e.id })
          }
        }

        const d = `M ${fx} ${baseY - 6} A ${span / 2} ${h} 0 0 ${fx < tx ? 1 : 0} ${tx} ${baseY - 6}`

        return (
          <g key={`edge-${e.id}`}>
            {/* A WIDE INVISIBLE TWIN, so the arc can actually be hit (TJ,
                2026-08-12, asking whether the panel's "or a concept/arc on the
                cloth" was true). It was true of the code and false in the
                hand: SVG hit-testing on a stroke is exactly the stroke, so the
                target was a 1.5px hairline crossed by the warp lines — aiming
                at an arc mostly selected nothing. The board has had this twin
                for its bend handles all along; the cloth never got one. */}
            <path
              d={d}
              fill="none"
              stroke="rgba(0,0,0,0)"
              strokeWidth={14}
              cursor="pointer"
              onClick={handleSelect}
            >
              <title>{`"${e.sentence}"`}</title>
            </path>
            {glow?.id === e.id && (
              <path
                key={`glow-${e.id}-${glow.seq}`}
                className="clothglow"
                d={d}
                fill="none"
                stroke="var(--ochre)"
                strokeWidth={9}
                pointerEvents="none"
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={col}
              opacity={op}
              strokeWidth={isSel ? 2 : 1.5}
              strokeDasharray={beaten ? "none" : "5 4"}
              markerEnd={`url(#${isSel ? 'arwR' : (beaten ? 'arwS' : 'arwG')})`}
              // The twin above takes the clicks; this one is the drawing, and
              // must not steal a hit from a neighbour it happens to cross.
              pointerEvents="none"
            />

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
        const op = (selNodes && !selNodes.has(c.id)) ? 0.3 : 1
        
        const handleSelect = () => {
          if (isSel) setReadSel(null)
          else setReadSel({ type: "concept", id: c.id })
        }

        return (
          <g key={`node-${c.id}`}>
            {/* The act that just landed, glowing out. Keyed by seq so stepping
                the replay restarts it — the same concept touched twice in a
                row must pulse twice, not sit lit. */}
            {glow?.id === c.id && (
              <circle
                key={`glow-${c.id}-${glow.seq}`}
                className="clothglow"
                cx={x} cy={baseY} r={9}
                fill="none" stroke="var(--ochre)" strokeWidth={3}
                pointerEvents="none"
              />
            )}
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
              <title>{conceptNameText(c) + (c.def ? ` — ${c.def}` : '')}</title>
              {/* fill, not a class: `color` is inert on SVG text. */}
              {(() => { const n = conceptNameText(c); return n.length > 34 ? n.slice(0, 33) + '…' : n })()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
