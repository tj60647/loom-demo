"use client"

// 03 · Vocabulary — the User's holdings (model §3 tab 4).
//
// This tab is deliberately UNSCOPED where every other workbench tab is scoped.
// A concept does not belong to a reading (a passage does), so your vocabulary
// is the whole lexicon you have built across every text, not this reading's
// slice of it. 01 Open's Capture Log stays the reading-scoped record of what
// you captured *here*; this is the list of words you now own.
//
// It holds what the model gives Vocabulary and nothing else: browse/filter
// Concepts as full objects and Link Labels, recurrence, edit Descriptions,
// merge Concepts, and the Concepts/Links Overlays. The cloth-reflection
// prompts and "Your read" that used to live on 03 moved to 04 · Knowledge
// Graph, where the projection they describe already lives (TJ, 2026-08-08).

import { useMemo, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import { useDialog } from "@/components/providers/DialogProvider"
import type { Concept, Edge } from "@/lib/types"
import { soleSourceId } from "@/lib/scope"
import { sortedByLabel } from "@/lib/utils"
import VocabularyOverlay from "@/components/tabs/VocabularyOverlay"

/** Case- and space-insensitive contains, so "object worlds" finds "Object  Worlds". */
function matches(haystack: string | null | undefined, needle: string) {
  if (!needle) return true
  return (haystack ?? "").toLowerCase().replace(/\s+/g, " ").includes(needle)
}

export default function VocabularyTab() {
  const {
    state, scope, scoped,
    editConcept, removeConcept, mergeConcepts, editEdge, flash,
  } = useLoom()
  const { titleOf } = useReadings()
  const { confirm, notify } = useDialog()

  const [conceptFilter, setConceptFilter] = useState("")
  const [labelFilter, setLabelFilter] = useState("")
  const [openConcepts, setOpenConcepts] = useState<Record<string, boolean>>({})
  const [openLabels, setOpenLabels] = useState<Record<string, boolean>>({})
  const [mergeInputs, setMergeInputs] = useState<Record<string, string>>({})
  const [mergeBusy, setMergeBusy] = useState<Record<string, boolean>>({})

  const cq = conceptFilter.trim().toLowerCase().replace(/\s+/g, " ")
  const lq = labelFilter.trim().toLowerCase().replace(/\s+/g, " ")

  /**
   * Recurrence, per the model's "recurrence designations": how many DISTINCT
   * readings evidence a concept. That is the number that means something —
   * four passages from one text is depth, one passage from each of four is a
   * concept that travels. Counted from `sourceId` so a reference-only reading
   * (no PDF) still counts, and unattributed passages never collapse together.
   */
  const conceptStats = useMemo(() => {
    const stats = new Map<string, { passages: number; readings: string[] }>()
    for (const concept of state.concepts) stats.set(concept.id, { passages: 0, readings: [] })
    for (const byte of state.bytes) {
      for (const conceptId of byte.conceptIds) {
        const row = stats.get(conceptId)
        if (!row) continue
        row.passages += 1
        const key = byte.sourceId ?? (byte.source ? `t:${byte.source}` : null)
        if (key && !row.readings.includes(key)) row.readings.push(key)
      }
    }
    return stats
  }, [state.concepts, state.bytes])

  const readingName = (key: string) =>
    key.startsWith("t:") ? key.slice(2) : titleOf(key) ?? "a reading"

  /**
   * Link Labels are the student's own coinages, so they group by the label
   * itself rather than by edge: reaching for "shapes" on four threads is one
   * word used four times. Unlabeled links are collected under a null key —
   * they are legal (a Description without a Label is the ruled order) and
   * hiding them would make the list lie about how much is still loose.
   */
  const labelGroups = useMemo(() => {
    const groups = new Map<string, Edge[]>()
    for (const edge of state.edges) {
      const key = (edge.handle ?? "").trim()
      if (!key) continue
      const list = groups.get(key) ?? []
      list.push(edge)
      groups.set(key, list)
    }
    return [...groups.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    )
  }, [state.edges])

  const looseLinks = state.edges.filter((e) => !(e.handle ?? "").trim())

  const labelOf = (id: string) => state.concepts.find((c) => c.id === id)?.label ?? "?"

  const visibleConcepts = sortedByLabel(state.concepts).filter(
    (c) => matches(c.label, cq) || matches(c.def, cq)
  )
  const visibleLabels = labelGroups.filter(
    ([label, edges]) => matches(label, lq) || edges.some((e) => matches(e.sentence, lq))
  )

  const handleMerge = async (source: Concept) => {
    const name = (mergeInputs[source.id] ?? "").trim()
    if (!name) {
      await notify({
        title: "Name the concept to keep first.",
        body: "Type the concept this one merges into, then Merge.",
      })
      return
    }
    const target = state.concepts.find(
      (c) => c.label.trim().toLowerCase() === name.toLowerCase()
    )
    if (!target || target.id === source.id) {
      await notify({
        title: target ? "That is this concept." : "No concept by that name.",
        body: "Merging repairs a duplicate you already have — name the existing concept to keep.",
      })
      return
    }
    // Always confirm: the source concept goes away, and there is no unmerge.
    const ok = await confirm({
      title: `Merge “${source.label}” into “${target.label}”?`,
      body: "Every passage and thread of the first will point at the second, and the first goes away. There is no unmerge.",
      confirmLabel: "Merge",
      danger: true,
    })
    if (!ok) return
    setMergeBusy((prev) => ({ ...prev, [source.id]: true }))
    try {
      await mergeConcepts(source.id, target.id)
      setMergeInputs((prev) => ({ ...prev, [source.id]: "" }))
      setOpenConcepts((prev) => ({ ...prev, [target.id]: true }))
    } catch {
      // mergeConcepts resyncs and flashes before rethrowing; swallow here.
    } finally {
      setMergeBusy((prev) => ({ ...prev, [source.id]: false }))
    }
  }

  const handleRemoveConcept = async (concept: Concept, passages: number) => {
    // Threads first: a concept woven into one cannot be deleted out from under
    // it. The server enforces this too — this is the readable version.
    if (state.edges.some((e) => e.fromId === concept.id || e.toId === concept.id)) {
      await notify({
        title: "This concept is woven into a thread.",
        body: "Remove the thread on 02 · Linking first — deleting the concept now would take your thread with it.",
      })
      return
    }
    const ok = await confirm({
      title: `Delete “${concept.label}”?`,
      body: passages
        ? `Its ${passages} captured passage${passages !== 1 ? "s" : ""} stay${passages !== 1 ? "" : "s"} in your log, unfiled. Export from 06 · Keep first if you might want this back.`
        : "Export from 06 · Keep first if you might want this back.",
      confirmLabel: "Delete concept",
      danger: true,
    })
    if (ok) removeConcept(concept.id)
  }

  return (
    <>
      <p className="tasktitle">Your vocabulary.</p>
      <p className="tasksub">
        Every concept you have named and every label you have coined — across all your
        readings, not just this one. A concept does not belong to a text; it emerges from
        one and may then be evidenced in several. Sharpen a description, retire a
        duplicate, and see which of your words are becoming yours.
      </p>

      <div className="two">
        <div className="card">
          <h2>
            Concepts{" "}
            <span className="n">
              {state.concepts.length ? `(${state.concepts.length})` : ""}
            </span>
          </h2>
          <p className="hint">
            Click a concept to open it — edit its description, or merge it into another if
            you named the same idea twice.
          </p>
          <div className="quietrow" style={{ marginBottom: "10px" }}>
            <input
              id="conceptFilter"
              placeholder="filter your concepts…"
              aria-label="Filter concepts"
              value={conceptFilter}
              onChange={(e) => setConceptFilter(e.target.value)}
            />
          </div>

          <div className="scrollbox">
            {state.concepts.length === 0 && (
              <div className="empty">
                <span className="cap">your vocabulary fills as you capture</span>
              </div>
            )}
            {state.concepts.length > 0 && visibleConcepts.length === 0 && (
              <p className="empty">No concept matches “{conceptFilter.trim()}”.</p>
            )}
            {visibleConcepts.map((concept) => {
              const stats = conceptStats.get(concept.id) ?? { passages: 0, readings: [] }
              const isOpen = openConcepts[concept.id]
              return (
                <div key={concept.id} className={`lrow ${isOpen ? "open" : ""}`} data-concept-id={concept.id}>
                  <div
                    className="lhead"
                    onClick={() => setOpenConcepts((p) => ({ ...p, [concept.id]: !p[concept.id] }))}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <div className="lconcept" style={{ flex: 1 }}>{concept.label}</div>
                    <div className="lsrc">
                      {stats.passages} passage{stats.passages !== 1 ? "s" : ""}
                      {stats.readings.length > 1 ? ` · ${stats.readings.length} readings` : ""}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="lbody">
                      <div className="defrow">
                        <span className="label">Description</span>
                        <input
                          className="conceptDescription"
                          placeholder="in your words; same sense across your sources?"
                          defaultValue={concept.def ?? ""}
                          onBlur={(e) => {
                            if (e.target.value !== (concept.def ?? "")) {
                              editConcept(concept.id, { def: e.target.value })
                              flash("description saved")
                            }
                          }}
                        />
                      </div>

                      {stats.readings.length > 0 ? (
                        <p className="ghostnote" style={{ marginTop: "10px" }}>
                          Evidenced in{" "}
                          {stats.readings.map((key, i) => (
                            <span key={key}>
                              {i > 0 && (i === stats.readings.length - 1 ? " and " : ", ")}
                              <i>{readingName(key)}</i>
                            </span>
                          ))}
                          {stats.readings.length > 1
                            ? " — one concept, evidence from several texts."
                            : "."}
                        </p>
                      ) : (
                        <p className="ghostnote" style={{ marginTop: "10px", color: "var(--red)" }}>
                          No passage evidences this yet — every concept should trace to
                          something you captured.
                        </p>
                      )}

                      <div className="quietrow" style={{ marginTop: "12px" }}>
                        <input
                          list="conceptOptions"
                          placeholder="merge into another concept…"
                          title="the same idea captured twice? name the concept to keep — this one's passages and threads move onto it"
                          value={mergeInputs[concept.id] ?? ""}
                          onChange={(e) =>
                            setMergeInputs((p) => ({ ...p, [concept.id]: e.target.value }))
                          }
                        />
                        <button
                          className="btn ghost mini"
                          onClick={() => handleMerge(concept)}
                          disabled={!!mergeBusy[concept.id]}
                        >
                          Merge
                        </button>
                      </div>
                      <button
                        type="button"
                        className="rm"
                        style={{ background: "none", border: "none", padding: 0, marginTop: "12px" }}
                        onClick={() => handleRemoveConcept(concept, stats.passages)}
                      >
                        remove concept
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {/* The merge field completes against every concept the student has. */}
          <datalist id="conceptOptions">
            {state.concepts.map((c) => (
              <option key={c.id} value={c.label} />
            ))}
          </datalist>
        </div>

        <div className="card">
          <h2>
            Link Labels{" "}
            <span className="n">{labelGroups.length ? `(${labelGroups.length})` : ""}</span>
          </h2>
          <p className="hint">
            The words you coined for the relations themselves. A label you reach for again
            is a word becoming yours — open one to read its threads and sharpen what each
            says.
          </p>
          <div className="quietrow" style={{ marginBottom: "10px" }}>
            <input
              id="labelFilter"
              placeholder="filter your labels…"
              aria-label="Filter link labels"
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
            />
          </div>

          <div className="scrollbox">
            {labelGroups.length === 0 && (
              <div className="empty">
                <span className="cap">labels accrue as you link</span>
              </div>
            )}
            {labelGroups.length > 0 && visibleLabels.length === 0 && (
              <p className="empty">No label matches “{labelFilter.trim()}”.</p>
            )}
            {visibleLabels.map(([label, edges]) => {
              const isOpen = openLabels[label]
              return (
                <div key={label} className={`lrow ${isOpen ? "open" : ""}`} data-link-label={label}>
                  <div
                    className="lhead"
                    onClick={() => setOpenLabels((p) => ({ ...p, [label]: !p[label] }))}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <div className="lconcept" style={{ flex: 1 }}>{label}</div>
                    <div className="lsrc">
                      {edges.length} link{edges.length !== 1 ? "s" : ""}
                      {edges.length > 1 ? " · recurring" : ""}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="lbody">
                      {edges.map((edge) => (
                        <div
                          key={edge.id}
                          style={{
                            marginTop: "12px",
                            borderBottom: "1px dotted var(--rule)",
                            paddingBottom: "8px",
                          }}
                        >
                          <div className="trip">
                            <b>{labelOf(edge.fromId)}</b>{" "}
                            <span className="vpill">{label}</span>{" "}
                            <b>{labelOf(edge.toId)}</b>
                          </div>
                          <div className="defrow" style={{ marginTop: "6px" }}>
                            <span className="label">Description</span>
                            <input
                              className="linkDescription"
                              placeholder="the sentence this thread reads as…"
                              defaultValue={edge.sentence}
                              onBlur={(e) => {
                                if (e.target.value !== edge.sentence) {
                                  editEdge(edge.id, { sentence: e.target.value })
                                  flash("description saved")
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {looseLinks.length > 0 && (
            <p className="ghostnote" style={{ marginTop: "10px" }}>
              {looseLinks.length} link{looseLinks.length !== 1 ? "s" : ""} carry a
              description but no label yet — coin one on <b>02 · Linking</b> so a word can
              recur.
            </p>
          )}
        </div>
      </div>

      {/* The Concepts and Links Overlays (ruling 28). Below your own holdings,
          not beside them: the comparison is a second look at words you already
          have. Gated per reading on having coded it yourself, server-side. */}
      <VocabularyOverlay sourceId={soleSourceId(scope)} ownCaptureCount={scoped.bytes.length} />
    </>
  )
}
