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
]

export default function WorkflowsBoard() {
  const [activeKey, setActiveKey] = useState(FLOWS[0].key)
  const [copied, setCopied] = useState(false)
  const flow = FLOWS.find((f) => f.key === activeKey) ?? FLOWS[0]

  const handleCopy = () => {
    copyText(toMermaid(flow)).then((ok) => {
      setCopied(ok)
      if (ok) window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <>
      <div className="flowpicker" role="tablist" aria-label="Whose workflow">
        {FLOWS.map((f) => (
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
