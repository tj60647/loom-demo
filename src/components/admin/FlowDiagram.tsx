"use client"

// Draws a Flow from src/lib/workflows.ts. Geometry comes from
// src/lib/flowLayout.ts — nothing here decides where anything sits, so a new
// step in the data re-flows the picture without a coordinate being touched.
//
// --red is reserved for "the one selected thing" (globals.css), so no node
// kind claims it; the palette here is ochre for entry, sage for a fork, and
// quiet grey for a door that is shut.

import { layoutFlow, NODE_W, type LaidNode } from "@/lib/flowLayout"
import type { Flow } from "@/lib/workflows"

const KIND_STYLE: Record<string, { stroke: string; fill: string; label: string; dash?: string }> = {
  start:    { stroke: "var(--ochre)", fill: "var(--paper)",   label: "var(--ink)" },
  step:     { stroke: "var(--rule)",  fill: "var(--paper)",   label: "var(--ink)" },
  decision: { stroke: "var(--sage)",  fill: "var(--paper-2)", label: "var(--ink)" },
  end:      { stroke: "var(--ochre)", fill: "var(--paper-2)", label: "var(--ink)" },
  denied:   { stroke: "var(--grey)",  fill: "transparent",    label: "var(--ink-soft)", dash: "4 3" },
}

/** A decision is chamfered left and right so a fork reads as a fork at a
 *  glance; everything else is a plain rounded box. */
function nodeShape(laid: LaidNode, kind: string) {
  const { x, y, w, h } = laid
  if (kind !== "decision") return null
  const c = 15
  return `${x + c},${y} ${x + w - c},${y} ${x + w},${y + h / 2} ${x + w - c},${y + h} ${x + c},${y + h} ${x},${y + h / 2}`
}

export default function FlowDiagram({ flow }: { flow: Flow }) {
  const laid = layoutFlow(flow)

  return (
    <div className="flowscroll">
      <svg
        viewBox={`0 0 ${laid.width} ${laid.height}`}
        width={laid.width}
        height={laid.height}
        role="img"
        aria-label={`${flow.title} workflow: ${flow.blurb}`}
        className="flowsvg"
      >
        <defs>
          <marker id="flowarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-soft)" />
          </marker>
          <marker id="flowarrowback" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--grey)" />
          </marker>
        </defs>

        {/* Edges first so a box always sits above its connectors. */}
        {laid.edges.map((e, i) => (
          <g key={`${e.edge.from}-${e.edge.to}-${i}`}>
            <path
              d={e.path}
              fill="none"
              stroke={e.edge.back ? "var(--grey)" : "var(--ink-soft)"}
              strokeWidth={e.edge.back ? 1 : 1.3}
              strokeDasharray={e.edge.back ? "5 4" : undefined}
              markerEnd={e.edge.back ? "url(#flowarrowback)" : "url(#flowarrow)"}
            />
            {e.edge.label && (
              <>
                {/* A plate behind the words so a label never fights its line.
                    Width is estimated from the character count for the same
                    reason the text wraps that way — no measuring, and the
                    server and client agree. */}
                <rect
                  x={e.labelAnchor === "start" ? e.labelX - 5 : e.labelX - (e.edge.label.length * 6.2 + 12) / 2}
                  y={e.labelY - 9}
                  width={e.edge.label.length * 6.2 + 12}
                  height={18}
                  rx={9}
                  fill="var(--paper)"
                  stroke="var(--rule)"
                  strokeWidth={0.75}
                />
                <text x={e.labelX} y={e.labelY + 3.5} textAnchor={e.labelAnchor} className="flowedgelabel">
                  {e.edge.label}
                </text>
              </>
            )}
          </g>
        ))}

        {laid.nodes.map((n) => {
          const kind = n.node.kind ?? "step"
          const style = KIND_STYLE[kind] ?? KIND_STYLE.step
          const points = nodeShape(n, kind)
          const rx = kind === "start" || kind === "end" ? 19 : 8
          return (
            // No <svg:title> here: React 19 hoists <title> into the document
            // head, which desynchronises server and client and throws a
            // hydration error. It would only have repeated text the box
            // already shows — the list below the diagram is the real
            // alternative, and it is useful to everyone, not only to a reader.
            <g key={n.node.id} data-flow-node={n.node.id}>
              {points ? (
                <polygon points={points} fill={style.fill} stroke={style.stroke} strokeWidth={1.4} />
              ) : (
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx={rx}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={kind === "step" ? 1 : 1.4}
                  strokeDasharray={style.dash}
                />
              )}
              {n.labelLines.map((line, i) => (
                <text
                  key={i}
                  x={n.x + NODE_W / 2}
                  y={n.y + 13 + 13 + i * 17}
                  textAnchor="middle"
                  className="flownodelabel"
                  fill={style.label}
                >
                  {line}
                </text>
              ))}
              {n.whereLines.map((line, i) => (
                <text
                  key={`w${i}`}
                  x={n.x + NODE_W / 2}
                  y={n.y + 13 + 13 + n.labelLines.length * 17 + 5 + i * 14 - 3}
                  textAnchor="middle"
                  className="flownodewhere"
                >
                  {line}
                </text>
              ))}
            </g>
          )
        })}
      </svg>

      {/* The same flow as prose. This is the diagram's text alternative — the
          SVG carries no per-node title — and it is also the thing to read when
          the picture is too wide for the screen you are on. */}
      <details className="flowtext">
        <summary>
          <span className="tw">▸</span> Read it as a list
        </summary>
        <ol>
          {laid.nodes.map((n) => {
            const out = flow.edges.filter((e) => e.from === n.node.id)
            return (
              <li key={n.node.id}>
                <b>{n.node.label}</b>
                {n.node.where ? <span className="flowwhere"> — {n.node.where}</span> : null}
                {out.length > 0 && (
                  <ul>
                    {out.map((e, i) => {
                      const target = flow.nodes.find((t) => t.id === e.to)
                      return (
                        <li key={i}>
                          {e.back ? "back to " : "then "}
                          <i>{target?.label ?? e.to}</i>
                          {e.label ? ` (${e.label})` : ""}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </details>
    </div>
  )
}
