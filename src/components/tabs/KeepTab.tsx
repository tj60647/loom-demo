"use client"

// 06 · Keep — the maps first, then the whole cloth. A map is the primary
// keepable artifact (ratified TJ 2026-07-31): each one exports as its own
// file, the thing a student submits or hands on. The whole-cloth export stays
// as the complete backup, so keeping a map is never the only copy of anything
// (red line #5). Import and reset live here too, each explaining itself.

import { useRef } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useDialog } from "@/components/providers/DialogProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import {
  buildExport, buildMarkdown, exportFilename,
  buildMapExport, buildMapMarkdown, mapExportFilename, scopeLabelOf,
  parseAnyImport,
} from "@/lib/graphExport"
import { downloadText } from "@/lib/download"
import type { LoomMap } from "@/lib/types"

export default function KeepTab() {
  const { state, studentName, importFromText, importMapFile, resetAll, flash } = useLoom()
  const { confirm, notify } = useDialog()
  const { titleOf } = useReadings()
  const importInputRef = useRef<HTMLInputElement>(null)

  const handleExportJson = () => {
    downloadText(JSON.stringify(buildExport(state, studentName), null, 2), exportFilename(studentName, "json"), "application/json")
    flash("exported .json")
  }

  const handleExportMd = () => {
    downloadText(buildMarkdown(state, studentName, titleOf), exportFilename(studentName, "md"), "text/markdown")
    flash("exported .md")
  }

  const handleKeepMapJson = (m: LoomMap) => {
    downloadText(JSON.stringify(buildMapExport(state, m, studentName, titleOf), null, 2), mapExportFilename(studentName, m.name, "json"), "application/json")
    flash(`kept "${m.name}" as .json`)
  }

  const handleKeepMapMd = (m: LoomMap) => {
    downloadText(buildMapMarkdown(state, m, studentName, titleOf), mapExportFilename(studentName, m.name, "md"), "text/markdown")
    flash(`kept "${m.name}" as .md`)
  }

  // Whole weave first, then reading scopes in shelf order of their labels.
  const sortedMaps = [...state.maps].sort((a, b) => {
    if ((a.scopeKey === "") !== (b.scopeKey === "")) return a.scopeKey === "" ? -1 : 1
    const byScope = scopeLabelOf(a.scopeKey, titleOf).localeCompare(scopeLabelOf(b.scopeKey, titleOf))
    if (byScope !== 0) return byScope
    return a.name.localeCompare(b.name)
  })

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) {
      input.value = ""
      return
    }
    try {
      const text = await file.text()
      let parsed
      try {
        parsed = parseAnyImport(text)
      } catch (err) {
        await notify({
          title: "That file is not a Loom export.",
          body: err instanceof Error ? err.message : String(err),
        })
        return
      }

      if (parsed.kind === "map") {
        const m = parsed.map
        const known = new Set(state.concepts.map((c) => c.id))
        const total = Object.keys(m.map.tiers).length
        const matched = Object.keys(m.map.tiers).filter((id) => known.has(id)).length
        const ok = await confirm({
          title: `Add the projection "${m.map.name}" to your cloth?`,
          body: `A single-projection file: its tiers, its one-line and its paragraph arrive as one more projection alongside yours — nothing is replaced. ${matched} of ${total} sorted card${total !== 1 ? "s" : ""} ${matched === 1 ? "is" : "are"} on your table now${matched < total ? "; the rest are skipped, because a projection arranges cards rather than re-weaving them (the whole-cloth .json restores cards)" : ""}.`,
          confirmLabel: "Add this projection",
        })
        if (!ok) return
        try {
          await importMapFile(m)
        } catch (err) {
          await notify({
            title: "The import did not go through.",
            body: err instanceof Error ? err.message : String(err),
          })
        }
        return
      }

      const cloth = parsed.cloth
      const ok = await confirm({
        title: "Replace your cloth with this file?",
        body: `It holds ${cloth.concepts.length} concept${cloth.concepts.length !== 1 ? "s" : ""}, ${cloth.bytes.length} passage${cloth.bytes.length !== 1 ? "s" : ""}, ${cloth.edges.length} thread${cloth.edges.length !== 1 ? "s" : ""} and ${cloth.maps.length} projection${cloth.maps.length !== 1 ? "s" : ""}. What is on the table now is replaced, not merged. Your weaving history is kept either way.`,
        confirmLabel: "Replace my cloth",
        danger: true,
      })
      if (!ok) return
      try {
        await importFromText(text)
      } catch (err) {
        await notify({
          title: "The import did not go through.",
          body: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      input.value = ""
    }
  }

  const handleReset = async () => {
    const ok = await confirm({
      title: "Clear this course's cloth?",
      body: `${state.concepts.length} concept${state.concepts.length !== 1 ? "s" : ""}, ${state.bytes.length} passage${state.bytes.length !== 1 ? "s" : ""}, ${state.edges.length} thread${state.edges.length !== 1 ? "s" : ""} and ${state.maps.length} projection${state.maps.length !== 1 ? "s" : ""} — tiers, one-lines and descriptions — all go. Export first — a .json makes this reversible. Your weaving history on 03 · Vocabulary survives either way.`,
      confirmLabel: "Clear the table",
      danger: true,
    })
    if (ok) resetAll()
  }

  return (
    <>
      <p className="tasktitle">Keep your work.</p>
      <p className="tasksub">The weave is yours — your concepts, your passages, your threads, your projections. This page is where you take it out of Loom, bring it back in, or clear the table and start again. Nothing here happens without asking you first.</p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Keep a projection <span className="n">{state.maps.length ? `${state.maps.length} projection${state.maps.length !== 1 ? "s" : ""}` : ""}</span></h2>
        <p className="do">Do this — when a projection reads right, take it out as its own file. A projection is the artifact: its tiers, its one-line, its paragraph, and the cards, passages and threads behind them, arranged as you left it.</p>
        <p className="hint"><b>.json</b> is the projection&apos;s complete record and the file to submit — it stands alone, and importing it back later restores the projection onto your cards. <b>.md</b> is the same projection as a readable outline for notes, Obsidian, or an agent.</p>
        {sortedMaps.length === 0 ? (
          <div className="empty" style={{ padding: "14px 0" }}>
            <span className="cap">no projections yet — sort your concepts on 04 · Knowledge Graph and your first projection appears here</span>
          </div>
        ) : (
          <div>
            {sortedMaps.map((m) => (
              <div key={m.id} className="quietrow" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 auto", minWidth: 180 }}>
                  <b>{m.name}</b>
                  <span className="hint" style={{ marginLeft: 8 }}>{scopeLabelOf(m.scopeKey, titleOf)}</span>
                </span>
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <button
                    className="btn mini"
                    aria-label={`Keep the projection ${m.name} as .json`}
                    data-tip="this projection as its own file — the artifact to keep or submit"
                    onClick={() => handleKeepMapJson(m)}
                  >Keep .json</button>
                  <button
                    className="btn ghost mini"
                    aria-label={`Keep the projection ${m.name} as .md`}
                    data-tip="this projection as a readable outline — not re-importable"
                    onClick={() => handleKeepMapMd(m)}
                  >Keep .md</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Take it all out <span className="n">{`${state.concepts.length} concepts · ${state.bytes.length} passages · ${state.edges.length} threads`}</span></h2>
        <p className="do">The whole cloth in one file — every concept, passage, thread and every projection at once. Download one now and again whenever you&apos;ve done real work.</p>
        <p className="hint"><b>.json</b> is the complete, exact record and the only file that restores everything — import it back here later and your cloth returns exactly as you left it, projections and all. It is the backup behind every projection you keep; if you keep one file, keep this one.</p>
        <p className="hint"><b>.md</b> is a readable outline of the whole weave — plain Markdown for reading, quoting, and pasting. It is <b>not</b> re-importable.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" data-tip="download your whole weave as a .json file — the complete backup" onClick={handleExportJson}>Export .json</button>
          <button className="btn ghost" data-tip="download a readable outline of the whole weave — not re-importable" onClick={handleExportMd}>Export .md</button>
        </div>
        <p className="ghostnote" style={{ marginTop: 9 }}>Submitting one projection? Keep it above. Archiving or moving machines? This is the file.</p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Bring one back</h2>
        <p className="do">Do this — export first, then choose a Loom <b>.json</b> file to load.</p>
        <p className="hint">A <b>whole-cloth</b> file <b>replaces</b> the cloth for this course — what is on the table now is set aside, and the file becomes your cloth. A <b>single-projection</b> file <b>adds</b>: the projection arrives alongside your projections, its tiers and arrangement landing on the cards still on your table, and nothing is replaced.</p>
        <p className="hint">The file must be a Loom .json export — a .md export or any other JSON will be refused with a reason. Loom reads the file first, tells you what it found, and asks before touching anything.</p>
        <p className="hint">Either way, your weaving history is kept: importing rewrites the cloth, not the record of how you got here.</p>
        <button className="btn ghost" data-tip="load a previously exported .json — a whole cloth or a single projection" onClick={() => importInputRef.current?.click()}>Import .json</button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
      </div>

      <div className="card">
        <h2>Clear the table</h2>
        <p className="do calm">Only if you mean it — reset empties this course&apos;s cloth and starts you blank.</p>
        <p className="hint">Reset removes the concepts, the passages, the threads, and your projections — every tier, one-line, description and arrangement — for this course. It cannot be undone from inside Loom. An export taken beforehand is the whole safety net — with a .json in hand, a reset is reversible by importing it back.</p>
        <p className="hint">What survives on purpose: the development history — the Capture Log on <b>03 Vocabulary</b>. Reset clears the cloth, not the record of weaving it. Your growth stays visible even when the table is empty.</p>
        <p className="ghostnote">You will be asked to confirm. Export first if there is any doubt.</p>
        <button className="btn ghost" data-tip="clear this course's cloth and start blank — your weaving history is kept" onClick={handleReset} style={{ marginTop: 4 }}>Reset this cloth</button>
      </div>
    </>
  )
}
