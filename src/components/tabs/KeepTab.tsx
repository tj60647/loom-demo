"use client"

// 05 · Keep — export, import, reset. Moved off the header so the student's
// artifact (red line #5) has a place that explains itself: what each file IS,
// when you would reach for it, and what reset does and does not touch.

import { useRef } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useDialog } from "@/components/providers/DialogProvider"
import { buildExport, buildMarkdown, exportFilename, parseImport } from "@/lib/graphExport"

export default function KeepTab() {
  const { state, studentName, importFromText, resetAll, flash } = useLoom()
  const { confirm, notify } = useDialog()
  const importInputRef = useRef<HTMLInputElement>(null)

  const download = (text: string, filename: string, type: string) => {
    const blob = new Blob([text], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleExportJson = () => {
    download(JSON.stringify(buildExport(state, studentName), null, 2), exportFilename(studentName, "json"), "application/json")
    flash("exported .json")
  }

  const handleExportMd = () => {
    download(buildMarkdown(state, studentName), exportFilename(studentName, "md"), "text/markdown")
    flash("exported .md")
  }

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
        parsed = parseImport(text)
      } catch (err) {
        await notify({
          title: "That file is not a Loom export.",
          body: err instanceof Error ? err.message : String(err),
        })
        return
      }
      const ok = await confirm({
        title: "Replace your cloth with this file?",
        body: `It holds ${parsed.concepts.length} concept${parsed.concepts.length !== 1 ? "s" : ""}, ${parsed.bytes.length} passage${parsed.bytes.length !== 1 ? "s" : ""} and ${parsed.edges.length} thread${parsed.edges.length !== 1 ? "s" : ""}. What is on the table now is replaced, not merged. Your weaving history is kept either way.`,
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
      body: `${state.concepts.length} concept${state.concepts.length !== 1 ? "s" : ""}, ${state.bytes.length} passage${state.bytes.length !== 1 ? "s" : ""}, ${state.edges.length} thread${state.edges.length !== 1 ? "s" : ""}, your read and your arrangement all go. Export first — a .json makes this reversible. Your weaving history on 03 · Read survives either way.`,
      confirmLabel: "Clear the table",
      danger: true,
    })
    if (ok) resetAll()
  }

  return (
    <>
      <p className="tasktitle">Keep your work.</p>
      <p className="tasksub">The weave is yours — your concepts, your passages, your threads, your read, your arrangement. This page is where you take it out of Loom, bring it back in, or clear the table and start again. Nothing here happens without asking you first.</p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Take it out <span className="n">{`${state.concepts.length} concepts · ${state.bytes.length} passages · ${state.edges.length} threads`}</span></h2>
        <p className="do">Do this — download a copy now, and again whenever you&apos;ve done real work. Two formats, two jobs.</p>
        <p className="hint"><b>.json</b> is the complete, exact record: every concept, passage, thread, tier, your read, and your arrangement on the card table. It is the file to keep, the file to submit, and the only one that round-trips — import it back here later and your cloth returns exactly as you left it. If you keep one file, keep this one.</p>
        <p className="hint"><b>.md</b> is a readable outline of the same work — plain Markdown for Obsidian, your notes app, a draft, or an agent you want to hand context to. Good for reading, quoting, and pasting. It is <b>not</b> re-importable: Loom cannot rebuild a cloth from it.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" data-tip="download your weave as a .json file — your submittable, portable artifact" onClick={handleExportJson}>Export .json</button>
          <button className="btn ghost" data-tip="download a readable outline for notes, Obsidian, or an agent — not re-importable" onClick={handleExportMd}>Export .md</button>
        </div>
        <p className="ghostnote" style={{ marginTop: 9 }}>Submitting or archiving? Send the .json. Reading or sharing? Send the .md.</p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Bring one back</h2>
        <p className="do">Do this — export first, then choose a Loom <b>.json</b> file to load.</p>
        <p className="hint">Importing <b>replaces</b> the cloth for this course. It does not merge: what is on the table now is set aside, and the file becomes your cloth. That is what makes it useful for moving between machines, restoring an earlier state, or picking up a copy you were handed.</p>
        <p className="hint">The file must be a Loom .json export — a .md export or any other JSON will be refused with a reason. Loom reads the file first, tells you what it found (how many concepts, passages, and threads), and asks before replacing anything.</p>
        <p className="hint">Either way, your weaving history is kept: importing rewrites the cloth, not the record of how you got here.</p>
        <button className="btn ghost" data-tip="load a previously exported .json weave" onClick={() => importInputRef.current?.click()}>Import .json</button>
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
        <p className="hint">Reset removes the concepts, the passages, the threads, your read, and your arrangement for this course. It cannot be undone from inside Loom. An export taken beforehand is the whole safety net — with a .json in hand, a reset is reversible by importing it back.</p>
        <p className="hint">What survives on purpose: the development history — &ldquo;the cloth, over time&rdquo; on <b>03 Read</b>. Reset clears the cloth, not the record of weaving it. Your growth stays visible even when the table is empty.</p>
        <p className="ghostnote">You will be asked to confirm. Export first if there is any doubt.</p>
        <button className="btn ghost" data-tip="clear this course's cloth and start blank — your weaving history is kept" onClick={handleReset} style={{ marginTop: 4 }}>Reset this cloth</button>
      </div>
    </>
  )
}
