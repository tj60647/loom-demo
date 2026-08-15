"use client"

// The Workflows tab: one diagram per actor, switched in place.
//
// The picker is local state rather than a query param — the course/section
// params in AdminNav scope DATA, and carrying a diagram choice alongside them
// would imply this page reads either. It reads neither; these flows are the
// same for every course.

import { useState } from "react"
import FlowDiagram from "@/components/admin/FlowDiagram"
import { FLOWS, toMermaid } from "@/lib/workflows"
import { copyText } from "@/lib/clipboard"

const LEGEND: { kind: string; label: string }[] = [
  { kind: "start", label: "where they come in" },
  { kind: "step", label: "something they do" },
  { kind: "decision", label: "a fork the system decides" },
  { kind: "end", label: "what they are aiming at" },
  { kind: "denied", label: "a door shut to them" },
  { kind: "noted", label: "measured, not acted on" },
]

export default function WorkflowsBoard({ showAll = true }: { showAll?: boolean }) {
  // A student sees their own flow only (TJ, 2026-08-08): the other two describe
  // surfaces they cannot reach, and a chart of shut doors is a puzzle rather
  // than a help. Faculty and admins work the seam, so they see all of them —
  // including the pipeline, whose actor is the system rather than a person and
  // which is the only picture of how a PDF becomes quotable text.
  const flows = showAll ? FLOWS : FLOWS.filter((f) => f.key === "student")
  const [activeKey, setActiveKey] = useState(flows[0].key)
  const [copied, setCopied] = useState(false)
  const flow = flows.find((f) => f.key === activeKey) ?? flows[0]

  const handleCopy = () => {
    copyText(toMermaid(flow)).then((ok) => {
      setCopied(ok)
      if (ok) window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      {/* One flow needs no picker. */}
      <div className="flowpicker" role="tablist" aria-label="Whose workflow" hidden={flows.length < 2}>
        {flows.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={f.key === activeKey}
            className={`btn mini${f.key === activeKey ? "" : " ghost"}`}
            onClick={() => setActiveKey(f.key)}
          >
            {f.title}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: "16px" }}>
        <div className="mapbar">
          <span className="label">{flow.title}</span>
          <span style={{ color: "var(--ink-soft)", fontSize: "13px" }}>{flow.blurb}</span>
        </div>

        <FlowDiagram flow={flow} />

        <div className="flowlegend">
          {LEGEND.map((item) => (
            <span key={item.kind}>
              <span className={`flowkey flowkey-${item.kind}`} aria-hidden="true" />
              {item.label}
            </span>
          ))}
          <span>
            <span className="flowkey flowkey-back" aria-hidden="true" />
            a return, not progress
          </span>
        </div>
      </div>

      <div className="card" style={{ marginTop: "14px" }}>
        <h2>Keeping this true</h2>
        <p className="hint">
          The diagram is generated from <b>src/lib/workflows.ts</b> — it is not drawn by
          hand. When a refactor changes how someone moves through Loom, edit the flow
          there and the picture follows; <b>scripts/check-workflows.ts</b> runs in{" "}
          <code>npm run check</code> and fails on a step wired to nothing.
        </p>
        <p className="hint" style={{ marginTop: "8px" }}>
          The code behind <b>{flow.title}</b>:
        </p>
        <ul className="flowsources">
          {flow.sources.map((source) => (
            <li key={source}><code>{source}</code></li>
          ))}
        </ul>
        <button className="btn ghost mini" onClick={handleCopy} data-tip="Mermaid source, derived from the same data — paste into a doc or a PR">
          {copied ? "✓ copied" : "Copy as Mermaid"}
        </button>
      </div>
    </>
  )
}
