"use client"

import { useEffect, useState, useRef } from "react"
import type { LoomState } from "@/lib/types"
import { adjacency, componentOf } from "@/lib/clothMath"
import { conceptNameText } from "@/lib/conceptName"

type ReadSel = {
  type: "concept" | "edge" | "hub",
  id?: string,
  ids?: string[],
  /**
   * Threads chosen in their own right, for a `hub` that is a SELECTION rather
   * than a neighbourhood — the Cohort Graph's multi-select (TJ, 2026-08-22:
   * "we should be able to select more than one concept, or more than one
   * thread"). Each lights, and so do both of its ends: a lit arc reaching two
   * faded dots would read as an arc to nowhere.
   *
   * 03's prompts pass `ids` alone and are untouched by this.
   */
  edgeIds?: string[],
  promptIdx?: number,
  gap?: boolean,
} | null

/**
 * What just happened, if anything (TJ, 2026-08-12: "the latest event needs a
 * glow that fades out"). The replay hands the id of whatever the current act
 * touched and a `seq` that changes with every step — the seq is what restarts
 * the animation, since replaying the same concept twice must glow twice.
 */
export type ClothGlow = { id: string; seq: number } | null

/**
 * THE DEFAULT for every cloth: no tracing (TJ, 2026-08-18: "all cloths
 * hide/disable trace"). Hidden rather than deleted, so it returns whole
 * wherever it is asked for.
 *
 * Clicking a concept lights its full connected component in red and fades
 * everything else; clicking an arc lights that one thread. It went off on the
 * student's cloth first (75e005c) because it was unused and it owned the
 * click the pair needed, and the other three followed.
 *
 * SINCE 2026-08-22 THIS IS THE DEFAULT, NOT THE RULE. The Cohort Graph asks
 * for it back with `trace` (TJ: "in the graph the links and the nodes should
 * be selectable" — "cohort graph only, the read only graph with no editing —
 * the other select node trigger"). The distinction that makes both true at
 * once is what that last clause names: on 03 a node click already gathers the
 * pair for a throw, so trace there would take a gesture away; a read-only
 * staff surface has no competing click, so it can trace and cost nothing.
 *
 * The one-flag argument this replaces was that four per-caller flags are four
 * chances to diverge. That risk is real and is answered by the default: a
 * caller gets no tracing unless it says otherwise, and only one does.
 */
export const SHOW_TRACE: boolean = false

export default function ClothMap({
  state,
  readSel,
  setReadSel,
  glow = null,
  pair = [],
  onPickConcept,
  trace = SHOW_TRACE,
  height = 400,
  fill = false,
}: {
  state: LoomState,
  readSel: ReadSel,
  setReadSel: (s: ReadSel) => void,
  glow?: ClothGlow,
  /**
   * The two concepts being gathered for a throw, in pick order — [] , [a] or
   * [a, b]. Drawn red and ringed; the owner decides what a full pair means.
   */
  pair?: readonly string[],
  /**
   * A concept was pressed (TJ, 2026-08-18: "select a node, shift select
   * another node, and then a popup"). `additive` is the shift key. The third
   * argument is the node's own hit circle — the same element whatever part of
   * the node was aimed at, so a popover can hang off the drawing rather than
   * off whichever glyph took the click.
   *
   * PASSING THIS IS THE ONLY THING A NODE CLICK DOES NOW. With `SHOW_TRACE`
   * off there is no other candidate for it, on any cloth. The two staff
   * surfaces — `CohortClothPanel` and `ReadOnlyClothMap` — pass nothing here,
   * so their nodes are drawing and tooltip and nothing else.
   */
  onPickConcept?: (id: string, additive: boolean, anchor: SVGCircleElement | null) => void,
  /**
   * Whether THIS cloth traces: a click on a node or an arc selects it, the
   * selection lights, and everything unrelated fades.
   *
   * Per-surface since 2026-08-22, defaulting to the global `SHOW_TRACE` so
   * every existing caller keeps the behaviour the 2026-08-18 ruling gave it.
   * The Cohort Graph opts in (TJ, 2026-08-22: "in the graph the links and the
   * nodes should be selectable", scoped to "cohort graph only, the read only
   * graph with no editing — the other select node trigger").
   *
   * That last clause is the reason this is a prop and not the flag flipped:
   * on 03 the node click is already spoken for — it gathers the pair for a
   * throw — and trace was removed partly because it "owned the click the pair
   * needed". A surface with no editing has no competing gesture, so it can
   * trace without taking anything away. `onPickConcept` still wins over trace
   * below, so a caller that passes both keeps pairing.
   */
  trace?: boolean,
  /**
   * How tall to draw, in CSS px. 400 is the pane height every cloth had when
   * the drawing sat above a read-out in a column.
   *
   * It is a prop because arc height is capped by the canvas: `h` maxes at
   * `baseY - 44`, so at 400 (baseY 272, cap 228) every long span in a wide
   * cohort flattens onto the same ceiling and the arcs stack into a band. A
   * taller canvas lets the long ones rise clear of the short ones, which is
   * most of what makes a 94-concept cloth readable (TJ, 2026-08-22: "give
   * more space to the graph").
   */
  height?: number,
  /**
   * Fill the container instead of taking `height`. For the map surface, where
   * the drawing IS the page and its height is the window's, not a number
   * chosen here (TJ, 2026-08-22: "the map or graph needs to fill the screen
   * like a google map").
   *
   * No feedback loop: the svg's CSS height stays 100% and the observed height
   * is used for GEOMETRY only, so measuring can never change what is measured.
   */
  fill?: boolean,
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(720)
  const [measuredH, setMeasuredH] = useState(400)
  /**
   * The hit circles, by concept id. The popover anchors to the NODE, not to
   * the glyph that was clicked: aiming at a concept's name and aiming at its
   * dot are the same act, and a card that jumps to wherever the rotated label
   * happens to end reads as two different controls.
   */
  const nodeHits = useRef<Map<string, SVGCircleElement>>(new Map())

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
      // 360 floor: below it the arcs have nowhere to rise and the labels
      // collide with the baseline. A shorter container scrolls instead.
      const h = entries[0]?.contentRect.height ?? 0
      if (h > 0) setMeasuredH(Math.max(h, 360))
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const H = fill ? measuredH : height
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

  /**
   * A WIDE INVISIBLE TWIN FOR THE NODES, the fix the arcs got in 2026-08-12
   * and the nodes never did. SVG hit-testing on a circle is exactly the
   * circle, and the drawn node is r=3.4 — a 6.8px target, which was tolerable
   * while a miss merely failed to trace and is not while the click is how you
   * gather a pair.
   *
   * Sized off the warp's own spacing so the twins cannot swallow each other:
   * half the gap between neighbours, capped at 9. Computed from the layout
   * above at width=1200 — 20 concepts sit 55.7px apart (twin r=9, 37.7px of
   * clear air between them); 60 concepts sit 17.9px apart (twin r=8.96, edges
   * touching and not overlapping). The 4 floor is for the pathological case
   * only, where the warp is already unreadable.
   */
  const gap = n > 1 ? (width - mL - mR) / (n - 1) : width
  const hitR = Math.max(4, Math.min(9, gap / 2))

  let selNodes: Set<string> | null = null
  let selEdges: Set<string> | null = null
  let selEdgeId: string | null = null

  // Everything below is the trace, and with it off all three stay null — no
  // component lit, nothing faded, no red arc.
  if (trace && readSel?.type === "concept" && readSel.id) {
    // Pulling a thread lights the FULL connected component, as in v14.
    const comp = componentOf(readSel.id, adjacency(state.edges))
    selNodes = comp.nodes
    selEdges = new Set(comp.edges.map(e => e.id))
  } else if (trace && readSel?.type === "hub" && (readSel.ids || readSel.edgeIds)) {
    const ids = readSel.ids ?? []
    const nodes = new Set(ids)
    const edgeIds = new Set<string>(readSel.edgeIds ?? [])
    state.edges.forEach(e => {
      // A chosen concept lights the threads that touch it...
      if (ids.includes(e.fromId) || ids.includes(e.toId)) {
        edgeIds.add(e.id)
        nodes.add(e.fromId)
        nodes.add(e.toId)
      }
      // ...and a chosen thread lights both of its ends.
      if (edgeIds.has(e.id)) {
        nodes.add(e.fromId)
        nodes.add(e.toId)
      }
    })
    selNodes = nodes
    selEdges = edgeIds
  } else if (trace && readSel?.type === "edge" && readSel.id) {
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
    <svg
      ref={svgRef}
      id="map"
      style={{ width: "100%", minWidth: 480, height: fill ? "100%" : H, touchAction: "none" }}
    >
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

        // Tracing was the arc's only gesture, so with the flag off it has none.
        // The twin below stays — it is what carries the sentence as a tooltip,
        // which is not a trace and is the one thing an arc could always say.
        const handleSelect = trace
          ? () => {
              if (readSel?.type === "edge" && readSel.id === e.id) {
                setReadSel(null)
              } else {
                setReadSel({ type: "edge", id: e.id })
              }
            }
          : undefined

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
              cursor={handleSelect ? "pointer" : undefined}
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
              cursor={handleSelect ? "pointer" : undefined}
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
        const isSel = trace && readSel?.type === "concept" && readSel.id === c.id
        const picked = pair.includes(c.id)
        const op = (selNodes && !selNodes.has(c.id)) ? 0.3 : 1
        // Deliberately NOT dimmed while a pair is being gathered: the whole
        // point of the second pick is that you are still reading the warp for
        // it, and fading the candidates is the opposite of that.

        // Pick if somebody is gathering a pair, trace if tracing is on, and
        // otherwise nothing at all — in which case the cursor must not promise
        // a press either, and the handler is not attached below.
        //
        // Declared unconditionally rather than as a ternary of two arrows:
        // `react-hooks/refs` reads a ref access inside a conditionally-created
        // closure as a render-phase access and fails the build for it, which is
        // what the first cut of this did.
        const handleSelect = (ev: { shiftKey: boolean }) => {
          if (onPickConcept) {
            onPickConcept(c.id, ev.shiftKey, nodeHits.current.get(c.id) ?? null)
            return
          }
          setReadSel(isSel ? null : { type: "concept", id: c.id })
        }
        const pressable = !!onPickConcept || trace
        const nodeCursor = pressable ? "pointer" : undefined

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
            {/* Picked, in the colour the palette reserves for "the one
                selected thing" (globals.css). A RING AND a bigger dot — this
                comment said "the ring rather than a bigger dot" and the code
                ten lines below grew the dot in the same commit, so it
                described a decision that was never taken. Both marks are
                deliberate: the dot goes 3.4 → 4.6 and red, which is what the
                trace already did to a selected node, and the ring at r=7.5 is
                what carries at a full warp where 18px of spacing leaves no
                room for a dot to grow into. */}
            {picked && (
              <circle
                cx={x} cy={baseY} r={7.5}
                fill="none" stroke="var(--red)" strokeWidth={1.4}
                pointerEvents="none"
              />
            )}
            <circle
              cx={x} cy={baseY}
              r={isSel || picked ? 4.6 : 3.4}
              fill={isSel || picked ? "var(--red)" : "var(--ochre)"}
              opacity={op}
              pointerEvents="none"
            />
            <text
              transform={`translate(${x + 4},${baseY + 13}) rotate(30)`}
              fontFamily='"Newsreader",Georgia,serif'
              fontSize={11.5}
              fill={isSel || picked ? "var(--red)" : "var(--ink)"}
              opacity={op}
              cursor={nodeCursor}
              onClick={pressable ? handleSelect : undefined}
            >
              <title>{conceptNameText(c) + (c.def ? ` — ${c.def}` : '')}</title>
              {/* fill, not a class: `color` is inert on SVG text. */}
              {(() => { const n = conceptNameText(c); return n.length > 34 ? n.slice(0, 33) + '…' : n })()}
            </text>
            {/* The twin, LAST so it sits over its own node and takes the
                click — the drawn circle above is the picture and hands its
                hits here (`pointerEvents:none`), the way the arcs already
                work. The label keeps its own click: it is the bigger target
                and people aim at names. */}
            <circle
              ref={(el) => {
                if (el) nodeHits.current.set(c.id, el)
                else nodeHits.current.delete(c.id)
              }}
              cx={x} cy={baseY} r={hitR}
              fill="rgba(0,0,0,0)"
              cursor={nodeCursor}
              onClick={pressable ? handleSelect : undefined}
            >
              <title>{conceptNameText(c) + (c.def ? ` — ${c.def}` : '')}</title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
