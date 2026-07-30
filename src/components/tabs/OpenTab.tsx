"use client"

import { useEffect, useRef, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import type { Byte } from "@/lib/types"
import { contentWords } from "@/lib/utils"
import { tidy } from "@/lib/clothMath"

type OpenTabProps = {
  onGotoByte?: (byte: Byte) => void
  focusByteId?: string | null
  onFocusHandled?: () => void
}

export default function OpenTab({ onGotoByte, focusByteId, onFocusHandled }: OpenTabProps) {
  const { state, isLoading, addConcept, addByte, editConcept, removeConcept, removeByte, refileByte, loadExample, flash } = useLoom()
  const [source, setSource] = useState("")
  const [location, setLocation] = useState("")
  const [content, setContent] = useState("")
  const [conceptLabel, setConceptLabel] = useState("")
  const [workingDef, setWorkingDef] = useState("")
  const [newConceptOnly, setNewConceptOnly] = useState("")
  const [showCaptureInfo, setShowCaptureInfo] = useState(false)
  const [refileInputs, setRefileInputs] = useState<Record<string, string>>({})
  const [refileBusy, setRefileBusy] = useState<Record<string, boolean>>({})
  const [exampleBusy, setExampleBusy] = useState(false)
  const closeCaptureInfoButtonRef = useRef<HTMLButtonElement>(null)

  const [openLogRows, setOpenLogRows] = useState<Record<string, boolean>>({})

  const findConcept = (label: string) =>
    state.concepts.find(c => c.label.toLowerCase() === label.toLowerCase())

  const handleAddByte = async () => {
    // Trim before testing: whitespace is not a passage, and " boundary objects "
    // must match the existing "boundary objects" rather than mint a duplicate.
    const text = content.trim()
    const cname = conceptLabel.trim()
    if (!text || !cname) return

    const wdef = workingDef.trim()
    // Find concept or create it
    let concept = findConcept(cname)
    if (!concept) {
      concept = await addConcept(cname, wdef || undefined)
    } else if (wdef && !concept.def) {
      await editConcept(concept.id, { def: wdef })
    }

    await addByte(concept.id, source.trim(), location.trim(), text)

    // reset form (keep source/location if user wants to enter multiple passages from same place)
    setContent("")
    setConceptLabel("")
    setWorkingDef("")
    // The flash points at "its log row", so open that row — otherwise the
    // affordance it advertises is off screen (v14 set openByte on add).
    setOpenLogRows(prev => ({ ...prev, [concept.id]: true }))
    flash("byte added — in its log row you can also file it under a second concept")
  }

  const handleRefile = async (b: Byte) => {
    if (refileBusy[b.id]) return
    const nm = (refileInputs[b.id] ?? "").trim()
    if (!nm) {
      window.alert("Name the second concept this passage evidences.")
      return
    }
    let concept = findConcept(nm)
    if (concept && state.bytes.some(x => x.content === b.content && x.conceptId === concept!.id)) {
      window.alert("Already filed under that concept.")
      return
    }
    setRefileBusy(prev => ({ ...prev, [b.id]: true }))
    try {
      if (!concept) {
        concept = await addConcept(nm)
      }
      await refileByte(b.id, concept.id)
      setRefileInputs(prev => ({ ...prev, [b.id]: "" }))
      setOpenLogRows(prev => ({ ...prev, [concept!.id]: true }))
      flash("filed under a second concept")
    } catch {
      // refileByte resyncs and flashes the server message before rethrowing;
      // swallow here to avoid an unhandled rejection.
    } finally {
      setRefileBusy(prev => ({ ...prev, [b.id]: false }))
    }
  }

  const handleRemoveConcept = (conceptId: string, byteCount: number) => {
    if (state.edges.some(e => e.fromId === conceptId || e.toId === conceptId)) {
      window.alert("Used in a thrown thread. Remove the thread first.")
      return
    }
    if (byteCount && !window.confirm("This concept has bytes; removing it removes them too. Continue?")) return
    removeConcept(conceptId)
  }

  const handleLoadExample = async () => {
    setExampleBusy(true)
    try {
      await loadExample()
    } finally {
      setExampleBusy(false)
    }
  }

  const handleAddConceptOnly = async () => {
    if (!newConceptOnly) return
    if (!state.concepts.find(c => c.label.toLowerCase() === newConceptOnly.toLowerCase())) {
      await addConcept(newConceptOnly)
    }
    setNewConceptOnly("")
  }

  const toggleRow = (id: string) => {
    setOpenLogRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  useEffect(() => {
    if (!showCaptureInfo) return

    closeCaptureInfoButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCaptureInfo(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showCaptureInfo])

  useEffect(() => {
    if (!focusByteId) return
    const targetByte = state.bytes.find((b) => b.id === focusByteId)
    if (!targetByte) {
      onFocusHandled?.()
      return
    }

    const rowTimer = window.setTimeout(() => {
      setOpenLogRows((prev) => ({ ...prev, [targetByte.conceptId]: true }))
    }, 0)

    const timer = window.setTimeout(() => {
      const target = document.querySelector(`[data-byte-id="${focusByteId}"]`) as HTMLElement | null
      target?.scrollIntoView({ behavior: "smooth", block: "center" })
      onFocusHandled?.()
    }, 40)

    return () => {
      window.clearTimeout(rowTimer)
      window.clearTimeout(timer)
    }
  }, [focusByteId, onFocusHandled, state.bytes])

  return (
    <div className="two">
      <div className="card">
        <h2 className="heading-with-info">
          Capture a byte
          <button
            type="button"
            className="iconbtn"
            aria-label="Two ways to capture a byte"
            aria-haspopup="dialog"
            aria-expanded={showCaptureInfo}
            aria-controls="captureInfoDialog"
            onClick={() => setShowCaptureInfo(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
        </h2>
        {showCaptureInfo && (
          <div className="info-scrim" onClick={() => setShowCaptureInfo(false)}>
            <section
              id="captureInfoDialog"
              className="info-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="captureInfoTitle"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                ref={closeCaptureInfoButtonRef}
                type="button"
                className="iconbtn info-close"
                aria-label="Close info"
                onClick={() => setShowCaptureInfo(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <div className="info-k">same byte, different doorway</div>
              <h2 id="captureInfoTitle">Two ways to capture a byte</h2>
              <p>
                A byte is always the same thing: a passage you want to keep, attached to a concept you name.
              </p>
              <p>
                <b>Manual capture</b> starts here. Paste or type the passage, add source and location if you have them, then name what the passage is about.
              </p>
              <p>
                <b>Assisted capture</b> starts in the Library. Open a PDF, select text, and capture it. Loom fills in the passage, source, page, and highlight anchor for you.
              </p>
              <p>
                In both paths, the thinking stays yours. The word chips are only a scaffold: tap useful words from the passage, reuse an existing concept, or type a new phrase in your own language.
              </p>
              <p className="info-note">
                Nothing is generated. Loom helps you carry the quote; you make the code.
              </p>
              <button type="button" className="btn ghost mini" onClick={() => setShowCaptureInfo(false)}>Got it</button>
            </section>
          </div>
        )}
        <p className="do">Do this — paste a passage here, or select text in a Library PDF. Then name the concept it evidences, and gloss it in your own words.</p>
        <p className="hint">A &ldquo;byte&rdquo; = one passage + its citation. Choosing the passage is <i>your</i> judgment — that&apos;s the point. Loom can carry over source details and offer passage words to tap; it does not summarize or choose the concept for you.</p>
        
        <div className="form-row">
          <span className="label">Source — author, work</span>
          <input
            className="mono-in"
            placeholder="Suchman, Plans and Situated Actions"
            title="who wrote it, and what work it's from"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>

        <div className="form-row">
          <span className="label">Location</span>
          <input
            className="mono-in"
            placeholder="ch. 3, p. 49"
            title="page, chapter, or timestamp — so you (and readers) can get back to the source"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="form-row">
          <span className="label">Passage — the author&apos;s words, verbatim</span>
          <textarea
            id="bText"
            placeholder="paste or type the passage…"
            title="verbatim, with citation — this is your evidence"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={(e) => {
              e.preventDefault()
              setContent(tidy(e.clipboardData.getData("text")))
            }}
          />
          <div className="scaffold" style={{marginTop: "12px"}}>
            <div className="snote">
              A <b>concept</b> is the idea this passage evidences — a <b>short noun phrase</b>, often the author's own words. If she names it ("boundary objects"), use her name for it. Your own-words gloss goes in the <b>working definition</b> — a sentence is fine there, crude is welcome. Rename anything later.
            </div>
            <div className="snote" style={{marginTop: "5px", color: "var(--ink-soft)"}}>
              One passage can hold several concepts — capture it once, then "also file under another concept" from the log.
            </div>
            <div className="snote" style={{fontSize: "12px", color: "var(--ink-soft)", marginTop: "8px"}}>
              Stuck naming it? <b style={{color: "var(--ink)", fontWeight: 500}}>Point at the words in the passage that carry the point</b> and tap to build the concept from the author's own words.
            </div>
            {content.trim() ? (
              <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {contentWords(content).map(w => (
                  <span 
                    key={w} 
                    className="chip" 
                    onClick={() => setConceptLabel(prev => prev ? `${prev} ${w}` : w)}
                    style={{
                      fontFamily: "var(--mono)", fontSize: "12px", background: "#fff", border: "1px solid var(--rule)", 
                      borderRadius: "12px", padding: "3px 9px", cursor: "pointer", color: "var(--ink)"
                    }}
                  >{w}</span>
                ))}
              </div>
            ) : (
              <div className="snote" style={{fontStyle: "italic", fontSize: "12px", color: "var(--ink-soft)", marginTop: "8px"}}>
                …paste a passage above and its words appear here to tap.
              </div>
            )}
            
            <details className="ladder" style={{marginTop: "12px", fontSize: "13px"}}>
              <summary style={{cursor: "pointer", color: "var(--sage)"}}>still stuck? a few ways in</summary>
              <ul style={{marginTop: "6px", paddingLeft: "20px", color: "var(--ink-soft)", lineHeight: "1.5"}}>
                <li>What is this passage an <b style={{color: "var(--ink)", fontWeight: 500}}>example of</b>?</li>
                <li>Tell a friend what this bit is about in <b style={{color: "var(--ink)", fontWeight: 500}}>five words</b>.</li>
                <li>What's the <b style={{color: "var(--ink)", fontWeight: 500}}>one move</b> the author is making here?</li>
                <li className="eg" style={{marginTop: "6px", color: "var(--ink-soft)"}}>
                  Just to show the shape — concepts as noun phrases: &nbsp;<i>&ldquo;boundary objects&rdquo; · &ldquo;the central tension&rdquo;</i>
                </li>
              </ul>
              <div style={{marginTop: "6px", color: "var(--ink-soft)", fontSize: "12px"}}>
                A concept can be a phrase, not a word. It's provisional — rename it later, or type an existing name to reuse it.
              </div>
            </details>
          </div>
        </div>
        
        <div className="form-row">
          <span className="label">Concept — a short noun phrase naming the idea <span style={{textTransform: "none", letterSpacing: 0, color: "var(--grey)"}}>(one per byte — you can file the same passage under a second concept from the log)</span></span>
          <input
            list="conceptOptions"
            placeholder="e.g. boundary objects · satisficing · valence"
            title="a noun phrase, not a sentence — if the author names it, use her name for it"
            value={conceptLabel}
            onChange={(e) => setConceptLabel(e.target.value)}
          />
          <datalist id="conceptOptions">
            {state.concepts.map(c => <option key={c.id} value={c.label} />)}
          </datalist>
        </div>

        <div className="form-row">
          <span className="label">Working definition — the concept in your own words <span style={{textTransform: "none", letterSpacing: 0}}>(optional)</span></span>
          <input
            placeholder="e.g. a thing that means different things to different groups but still holds them together"
            title="your own-words gloss — a sentence is fine; this is where crude is welcome"
            value={workingDef}
            onChange={(e) => setWorkingDef(e.target.value)}
          />
        </div>

        <button
          className="btn"
          onClick={handleAddByte}
          disabled={!content.trim() || !conceptLabel.trim()}
          title="files the passage under its concept in your coding log"
        >
          Add byte
        </button>
        {/* v14 alerted the reason on click; the button here is disabled instead,
            so the same coaching has to be visible without one. */}
        {(!content.trim() || !conceptLabel.trim()) && (
          <p className="ghostnote" style={{ marginTop: "7px" }}>
            {!content.trim() && !conceptLabel.trim()
              ? "Paste or type a passage, then name the concept it evidences."
              : !content.trim()
                ? "Paste or type a passage."
                : "Name the concept this byte evidences — a short noun phrase (the author's own term is often best)."}
          </p>
        )}
      </div>

      <div className="card">
        <h2>Coding log <span className="n">{state.bytes.length ? `(${state.bytes.length} bytes · ${state.concepts.length} concepts)` : ""}</span></h2>
        <p className="do calm">Everything you capture lands here, newest on top — your growing pile of concepts.</p>
        <p className="hint">Click a row to open it — edit the working definition, or file the same passage under another concept. When you have a handful, go to <b>02 — Throw</b> and start connecting them.</p>
        
        <div className="scrollbox">
          {state.concepts.length === 0 && (
            <div className="empty">
              <svg width="34" height="18" viewBox="0 0 34 18" fill="none" stroke="#a39f92" strokeWidth="1.3"><path d="M2 13 L7 5 L12 13 L17 5 L22 13 L27 5 L32 13"/></svg>
              <span className="cap">the log fills as you lay warp</span>
            </div>
          )}
          {state.concepts.length === 0 && !isLoading && (
            <div style={{ textAlign: "center", marginTop: "4px" }}>
              <button className="btn ghost mini" onClick={handleLoadExample} disabled={exampleBusy}>
                load the worked example (Star &amp; Griesemer)
              </button>
              <p className="hint" style={{ marginTop: "6px" }}>a finished weave to poke at — explore it, then clear it from 05 · Keep to start your own.</p>
            </div>
          )}
          {state.concepts.slice().reverse().map(concept => {
            const isOpen = openLogRows[concept.id]
            const conceptBytes = state.bytes.filter(b => b.conceptId === concept.id)
            
            return (
              <div key={concept.id} className={`lrow ${isOpen ? "open" : ""}`}>
                {/* No destructive control here: this header is the row's
                    expand/collapse target, so "remove concept" lives inside the
                    opened row next to "remove byte", labelled, as in v14. */}
                <div className="lhead" onClick={() => toggleRow(concept.id)} style={{ display: "flex", alignItems: "center" }}>
                  <div className="lconcept" style={{flex: 1}}>{concept.label}</div>
                  <div className="lsrc">{conceptBytes.length} bytes</div>
                </div>
                {isOpen && (
                  <div className="lbody">
                    <div className="defrow">
                      <span className="label">Concept</span>
                      <input
                        key={concept.label}
                        placeholder="concept label…"
                        defaultValue={concept.label}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (!v || v === concept.label) return
                          const clash = state.concepts.find(
                            c => c.id !== concept.id && c.label.toLowerCase() === v.toLowerCase()
                          )
                          if (clash) {
                            flash("That name is already one of your concepts.")
                            e.target.value = concept.label
                            return
                          }
                          editConcept(concept.id, { label: v })
                          flash("renamed")
                        }}
                      />
                    </div>
                    <div className="defrow">
                      <span className="label">Working definition</span>
                      <input
                        placeholder="in your words; same sense across your sources?"
                        defaultValue={concept.def ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (concept.def ?? "")) {
                            editConcept(concept.id, { def: e.target.value })
                          }
                        }}
                      />
                    </div>
                    {conceptBytes.map(b => (
                      <div key={b.id} data-byte-id={b.id} style={{ marginTop: "12px", borderBottom: "1px dotted var(--rule)", paddingBottom: "8px" }}>
                        <div className="passage">"{b.content}"</div>
                        <div className="src">
                          {b.source || "—"}{b.location ? ` · ${b.location}` : ""}
                          <span className="rm-actions" style={{ marginLeft: "8px" }}>
                            <button
                              type="button"
                              className="rm"
                              style={{ marginRight: "8px", background: "none", border: "none", padding: 0 }}
                              onClick={() => onGotoByte?.(b)}
                              disabled={!b.sourceId && !b.source}
                              title={b.sourceId || b.source ? "Open this byte in the library PDF" : "No library source linked for this byte"}
                            >
                              goto
                            </button>
                            <button
                              type="button"
                              className="rm"
                              style={{ background: "none", border: "none", padding: 0 }}
                              onClick={() => removeByte(b.id)}
                            >
                              remove byte
                            </button>
                          </span>
                        </div>
                        <div className="quietrow" style={{ marginTop: "9px" }}>
                          <input
                            placeholder="also file this passage under another concept…"
                            title="one passage can evidence several concepts — name a second one here"
                            value={refileInputs[b.id] ?? ""}
                            onChange={(e) => setRefileInputs(prev => ({ ...prev, [b.id]: e.target.value }))}
                          />
                          <button className="btn ghost mini" onClick={() => handleRefile(b)} disabled={!!refileBusy[b.id]}>File</button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="rm"
                      style={{ background: "none", border: "none", padding: 0, marginTop: "12px" }}
                      onClick={() => handleRemoveConcept(concept.id, conceptBytes.length)}
                    >
                      remove concept
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="quietrow">
          <input 
            list="conceptOptions" 
            placeholder="add a concept with no byte yet (rare)"
            value={newConceptOnly}
            onChange={(e) => setNewConceptOnly(e.target.value)}
          />
          <button className="btn ghost mini" onClick={handleAddConceptOnly}>Add</button>
        </div>
      </div>
    </div>
  )
}
