"use client"

import { useEffect, useMemo, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { getSourcesByIds } from "@/actions/sources"
import { buildSlugMap, renderConceptMarkdown, parseEditableConceptMarkdown } from "@/lib/conceptMarkdown"
import type { Source } from "@/lib/types"

export default function FilesTab() {
  const { state, editConcept } = useLoom()
  const { concepts, bytes, edges } = state
  const [activeId, setActiveId] = useState<string | null>(null)
  const [sourcesById, setSourcesById] = useState<Map<string, Source>>(new Map())
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slugsById = useMemo(() => buildSlugMap(concepts), [concepts])
  const conceptsById = useMemo(() => new Map(concepts.map(c => [c.id, c])), [concepts])

  useEffect(() => {
    const ids = [...new Set(bytes.map(b => b.sourceId).filter((x): x is string => !!x))]
    if (ids.length === 0) return
    getSourcesByIds(ids).then(rows => setSourcesById(new Map(rows.map(s => [s.id, s]))))
  }, [bytes])

  const active = activeId ? conceptsById.get(activeId) : null

  const activeMarkdown = active ? renderConceptMarkdown({
    concept: active,
    bytesForConcept: bytes.filter(b => b.conceptId === active.id),
    outgoingEdges: edges.filter(e => e.fromId === active.id),
    incomingEdges: edges.filter(e => e.toId === active.id),
    conceptsById, slugsById, sourcesById,
  }) : ""

  const handleOpen = (id: string) => {
    setActiveId(id)
    setIsEditing(false)
    setError(null)
  }

  const handleBack = () => {
    setActiveId(null)
    setIsEditing(false)
    setError(null)
  }

  const handleEdit = () => {
    setDraft(activeMarkdown)
    setError(null)
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (!active) return
    setIsSaving(true)
    setError(null)
    try {
      const { label, def, note } = parseEditableConceptMarkdown(draft)
      if (!label.trim()) throw new Error("A concept needs a label (the # heading).")
      await editConcept(active.id, { label, def, note })
      setIsEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  if (active) {
    return (
      <div style={{ marginTop: "24px" }}>
        <button className="btn ghost mini" onClick={handleBack}>
          ← Back to Files
        </button>
        <div className="card" style={{ marginTop: "16px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span className="label">{slugsById.get(active.id)}.md</span>
            {!isEditing ? (
              <button className="btn mini" onClick={handleEdit}>Edit</button>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn ghost mini" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</button>
                <button className="btn mini" onClick={handleSave} disabled={isSaving}>{isSaving ? "Saving…" : "Save"}</button>
              </div>
            )}
          </div>
          {error && <p className="hint" style={{ color: "var(--red)" }}>{error}</p>}
          {isEditing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ width: "100%", minHeight: "420px", fontFamily: "var(--mono)", fontSize: "13px" }}
            />
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--mono)", fontSize: "13px", lineHeight: 1.5 }}>
              {activeMarkdown}
            </pre>
          )}
          <p className="hint" style={{ marginTop: "10px" }}>
            Evidence and Connections are generated from your Loom data and can&apos;t be edited here directly — edit them from the Open/Throw tabs.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <p className="hint">Your concepts as markdown files.</p>
        <a className="btn mini" href="/api/export/vault">Export Obsidian Vault</a>
      </div>
      {concepts.length === 0 && <p className="hint">No concepts yet.</p>}
      {concepts.map((c) => (
        <div
          className="card"
          key={c.id}
          style={{ padding: "16px", marginBottom: "10px", cursor: "pointer" }}
          onClick={() => handleOpen(c.id)}
        >
          <h3 style={{ margin: 0, fontSize: "15px" }}>{slugsById.get(c.id)}.md</h3>
          <p className="hint" style={{ margin: "4px 0 0" }}>{c.label}</p>
        </div>
      ))}
    </div>
  )
}
