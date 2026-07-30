"use client"

import { useLoom } from "@/components/providers/LoomProvider"
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import type { Edge } from "@/lib/types"
import { adjacency, componentOf, allComponents, degreeOf, recurringHandles, noEvidenceConcepts, short } from "@/lib/clothMath"
import { buildMapKit } from "@/lib/mapKit"
import { copyText } from "@/lib/clipboard"
import ClothMap from "@/components/svg/ClothMap"
import HistoryPanel from "@/components/ui/HistoryPanel"

export default function ReadTab() {
  const { state, setRead, flushRead, flash, studentName } = useLoom()
  const [readSel, setReadSel] = useState<{type: "concept" | "edge" | "hub", id?: string, ids?: string[], promptIdx?: number, gap?: boolean} | null>(null)
  const [drafted, setDrafted] = useState("")
  const [showClothInfo, setShowClothInfo] = useState(false)
  const closeInfoButtonRef = useRef<HTMLButtonElement>(null)

  type ReadPrompt = {
    key: string
    rep?: string
    repHub?: string[]
    gap: boolean
    q: ReactNode
    move: string
  }

  useEffect(() => {
    if (!showClothInfo) return

    closeInfoButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowClothInfo(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showClothInfo])

  const adj = adjacency(state.edges)

  // The report as interpretive PROMPTS: question + move + "you decide".
  // The machine counts and sorts and poses a generic question; it never names
  // what the reading means (red lines #1/#7).
  const readPrompts: ReadPrompt[] = []
  const loose = state.edges.filter(e => !e.handle).length
  const noEv = noEvidenceConcepts(state.concepts, state.bytes)
  if (state.concepts.length > 0) {
    const comps = allComponents(state.concepts, state.edges)
    const degs = state.concepts.map(c => ({c, d: degreeOf(state.edges, c.id)})).filter(o => o.d > 0).sort((a,b) => b.d - a.d)

    /* 1 — THE SPINE: the largest weave */
    if (comps.length && comps[0].edges.length >= 2) {
      const main = comps[0]
      const rep = [...main.nodes][0]
      readPrompts.push({
        key: 'the spine', rep: rep, gap: false,
        q: <>Your largest weave links <b>{main.nodes.size} concepts</b> across <b>{main.edges.length} threads</b>. Pull it — it already makes an argument.</>,
        move: 'trace the spine →'
      })
    }

    /* 2 — THE CENTRE: top-degree concept(s) */
    if (degs.length) {
      const top = degs[0]
      const tied = degs.filter(o => o.d === top.d).slice(0, 2)
      const names = tied.map((o, i) => (
        <Fragment key={o.c.id}>{i > 0 && ' and '}<b>{short(o.c.label, 40)}</b></Fragment>
      ))
      readPrompts.push({
        key: 'the centre', rep: top.c.id, repHub: tied.map(o => o.c.id), gap: false,
        q: <>{tied.length > 1 ? 'Two concepts carry' : 'One concept carries'} the most threads ({top.d}): {names}. Your cloth keeps returning to {tied.length > 1 ? 'them' : 'it'} — {tied.length > 1 ? 'are they' : 'is it'} the core?</>,
        move: 'trace the centre →'
      })
    }

    /* 3 — THE GAP: an island, else unwoven warp */
    const islands = comps.slice(1)
    const unwoven = state.concepts.filter(c => degreeOf(state.edges, c.id) === 0)

    if (islands.length) {
      const isl = islands[0]
      const names = [...isl.nodes].map(id => state.concepts.find(c => c.id === id)).filter(Boolean)
      readPrompts.push({
        key: 'the gap', rep: [...isl.nodes][0], gap: true,
        q: <>{names.map((c, i) => (
          <Fragment key={c!.id}>{i > 0 && ' and '}<b>{short(c!.label, 28)}</b></Fragment>
        ))} tie to each other but to nothing else. The sharpest question on the cloth: should they?</>,
        move: 'note the question →'
      })
    } else if (unwoven.length) {
      readPrompts.push({
        key: 'the gap', rep: unwoven[0].id, gap: true,
        q: <><b>{short(unwoven[0].label, 38)}</b>{unwoven.length > 1 ? ` and ${unwoven.length - 1} other${unwoven.length - 1 !== 1 ? 's' : ''}` : ''} cross nothing yet — warp with no weft. The sharpest question: where {unwoven.length > 1 ? 'do they' : 'does it'} belong?</>,
        move: 'note the question →'
      })
    }

    /* 4 — YOUR WORDS: a recurring handle becoming vocabulary */
    const rec = recurringHandles(state.edges)
    if (rec.length) {
      readPrompts.push({
        key: 'your words', gap: false,
        q: <>You've reached for <b>"{rec[0][0]}"</b> on {rec[0][1].length} threads — it's becoming one of your own terms.</>,
        move: 'a coinage forming'
      })
    }
  }

  // Read rail: look · trace · question · write
  const wrote = !!(state.read && state.read.trim())
  const railN = wrote ? 3 : readSel?.gap ? 2 : readSel ? 1 : 0

  const handlePromptClick = (p: ReadPrompt, idx: number) => {
    if (p.repHub) {
      setReadSel({ type: "hub", ids: p.repHub, promptIdx: idx, gap: false })
    } else if (p.rep) {
      setReadSel({ type: "concept", id: p.rep, promptIdx: idx, gap: p.gap })
    } else {
      setReadSel(null)
    }
    setDrafted(p.rep
      ? 'traced on the cloth — your threads are laid out on the left, yours to weave here in your own words.'
      : 'just a pattern to notice — nothing to lay out.')
  }

  const copyWithFeedback = (out: string, okMsg: string) => {
    copyText(out).then(ok => {
      if (ok) { flash(okMsg); setDrafted("✓ copied") }
      else flash("select & copy by hand")
    })
  }

  const buildDraft = () => {
    if (!readSel) return ""
    let edges: Edge[] = []
    let head = ""
    if (readSel.type === "concept" && readSel.id) {
      const c = state.concepts.find(x => x.id === readSel.id)
      if (!c) return ""
      head = "Threads from: " + c.label
      edges = componentOf(c.id, adj).edges
    } else if (readSel.type === "hub" && readSel.ids) {
      const names = readSel.ids.map(id => state.concepts.find(c => c.id === id)?.label).filter(Boolean)
      head = "Threads meeting at: " + names.join(" / ")
      edges = state.edges.filter(e => readSel.ids!.includes(e.fromId) || readSel.ids!.includes(e.toId))
    } else {
      return ""
    }
    let out = head + "\n" + (studentName ? "(" + studentName + ")\n" : "") + "\n"
    edges.forEach(e => {
      const f = state.concepts.find(c => c.id === e.fromId)
      const t = state.concepts.find(c => c.id === e.toId)
      out += (f ? f.label : "?") + " — " + (e.handle || "(loose)") + " — " + (t ? t.label : "?") + "\n" + '"' + e.sentence + '"' + "\n\n"
    })
    return out
  }

  const handleCopyDraft = () => {
    const txt = buildDraft()
    if (!txt) return
    copyText(txt).then(ok => {
      if (ok) flash("copied to clipboard")
      else flash("select & copy by hand")
    })
  }

  const handleCopyRead = () => {
    const txt = (state.read || "").trim()
    if (!txt) { flash("your read is empty — write a short paragraph first"); return }
    const out = (studentName ? studentName + " — " : "") + "my read of the cloth\n\n" + state.read
    copyWithFeedback(out, "read copied to clipboard")
  }

  const handleMapKit = () => {
    if (!state.concepts.length) { flash("nothing to map yet — lay some warp first"); return }
    copyWithFeedback(buildMapKit(state.concepts, state.edges, studentName), "map kit copied — take it to paper or Figma")
  }

  // Generate reading pane content
  let readingPane = null;
  if (readSel) {
    if (readSel.type === "hub" && readSel.ids) {
      const inc = state.edges.filter(e => readSel.ids!.includes(e.fromId) || readSel.ids!.includes(e.toId));
      const names = readSel.ids.map(id => state.concepts.find(c => c.id === id)).filter(Boolean);

      readingPane = (
        <div id="readingPane" style={{ marginTop: "16px" }}>
          <div className="threadhead" style={{ fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>
            {names.map((n, i) => <span key={n!.id}><span style={{ color: "var(--red)" }}>{n!.label}</span>{i < names.length - 1 ? " / " : ""}</span>)}
            <span className="n" style={{ color: "var(--grey)", fontWeight: "normal" }}> · {inc.length} thread{inc.length !== 1 ? 's' : ''} meet here</span>
          </div>
          <p className="hint" style={{ margin: "4px 0 9px" }}>
            The threads that converge on your busiest concept{readSel.ids.length > 1 ? 's' : ''} — your own sentences. <b>You</b> decide whether this is the core, and weave it into your read.
          </p>
          <button className="btn ghost mini" onClick={handleCopyDraft} style={{ marginBottom: "12px" }}>copy these threads</button>
          <div>
            {inc.map(e => {
              const f = state.concepts.find(c => c.id === e.fromId);
              const t = state.concepts.find(c => c.id === e.toId);
              return (
                <div key={e.id} className="readitem" style={{ marginBottom: "12px", borderBottom: "1px dotted var(--rule)", paddingBottom: "12px" }}>
                  <div className="trip" style={{ fontSize: "12px", marginBottom: "4px" }}>
                    <b>{f?.label || "?"}</b> {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">loose</span>} <b>{t?.label || "?"}</b>
                  </div>
                  <div className="sent" style={{ fontStyle: "italic", fontSize: "14px", color: "var(--ink)" }}>"{e.sentence}"</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    } else if (readSel.type === "edge" && readSel.id) {
      const e = state.edges.find(x => x.id === readSel.id);
      if (e) {
        const f = state.concepts.find(c => c.id === e.fromId);
        const t = state.concepts.find(c => c.id === e.toId);
        const fBytes = state.bytes.filter(b => b.conceptId === f?.id);
        const tBytes = state.bytes.filter(b => b.conceptId === t?.id);

        readingPane = (
          <div id="readingPane" style={{ marginTop: "16px" }}>
            <div className="threadhead" style={{ fontSize: "14px", fontWeight: 500 }}>
              <span style={{ color: "var(--red)" }}>{f?.label || "?"}</span> {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">loose</span>} <span style={{ color: "var(--red)" }}>{t?.label || "?"}</span>
            </div>
            <p style={{ fontSize: "15.5px", fontStyle: "italic", margin: "8px 0 14px", color: "var(--ink)" }}>"{e.sentence}"</p>
            {[f, t].filter(Boolean).map(c => (
              <div key={c!.id} style={{ marginBottom: "16px" }}>
                <div className="label" style={{ marginTop: "8px", fontWeight: "bold" }}>{c!.label}</div>
                {c!.def && <div style={{ fontSize: "13.5px", color: "var(--ink-soft)" }}>{c!.def}</div>}
                {(c === f ? fBytes : tBytes).map(b => (
                  <div key={b.id} className="bytequote" style={{ marginTop: "6px", paddingLeft: "8px", borderLeft: "2px solid var(--rule)" }}>
                    <span className="src" style={{ fontSize: "11px", color: "var(--grey)" }}>{b.source || '-'} {b.location ? `· ${b.location}` : ''}</span><br/>
                    <span style={{ fontSize: "13px" }}>{b.content}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }
    } else if (readSel.type === "concept" && readSel.id) {
      const c = state.concepts.find(x => x.id === readSel.id);
      if (c) {
        const comp = componentOf(c.id, adj);
        if (comp.edges.length === 0) {
          readingPane = (
            <div id="readingPane" style={{ marginTop: "16px" }}>
              <div className="threadhead" style={{ fontSize: "14px", fontWeight: 500, color: "var(--red)" }}>{c.label}</div>
              <p className="empty" style={{ marginTop: "8px" }}>This thread crosses nothing yet — warp waiting for weft. Take it to 02 — Throw.</p>
            </div>
          );
        } else {
          readingPane = (
            <div id="readingPane" style={{ marginTop: "16px" }}>
              <div className="threadhead" style={{ fontSize: "14px", fontWeight: 500, marginBottom: "4px" }}>
                <span style={{ color: "var(--red)" }}>{c.label}</span> <span className="n" style={{ color: "var(--grey)", fontWeight: "normal" }}> · {comp.edges.length} crossing{comp.edges.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="hint" style={{ margin: "4px 0 9px" }}>
                Your threads, in walking order — your own sentences, laid out as raw material. <b>You</b> weave them into a read on the right, in your own words. Copy to quote a line.
              </p>
              <button className="btn ghost mini" onClick={handleCopyDraft} style={{ marginBottom: "12px" }}>copy these threads</button>
              <div>
                {comp.edges.map(e => {
                  const f = state.concepts.find(x => x.id === e.fromId);
                  const t = state.concepts.find(x => x.id === e.toId);
                  return (
                    <div key={e.id} className="readitem" style={{ marginBottom: "12px", borderBottom: "1px dotted var(--rule)", paddingBottom: "12px" }}>
                      <div className="trip" style={{ fontSize: "12px", marginBottom: "4px" }}>
                        <b>{f?.label || "?"}</b> {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">loose</span>} <b>{t?.label || "?"}</b>
                      </div>
                      <div className="sent" style={{ fontStyle: "italic", fontSize: "14px", color: "var(--ink)" }}>"{e.sentence}"</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }
      }
    }
  } else {
    readingPane = (
      <div id="readingPane" style={{ marginTop: "16px" }}>
        <p className="empty">Click a prompt above — or a concept/arc on the cloth — to lay your threads out here as material to weave from.</p>
      </div>
    );
  }

  return (
    <>
      <p className="tasktitle">Read the whole cloth.</p>
      <p className="tasksub">What argument runs through it? What does it keep returning to? What's missing? The cloth shows you where to look — the reading is yours to write.</p>

      <div className="rail" id="readRail">
        {["look", "trace", "question", "write"].map((s, i) => (
          <Fragment key={s}>
            {i > 0 && <span className="rsep">·</span>}
            <span className={"rstep" + (i === railN ? " now" : "") + (i < railN ? " done" : "")} data-r={i}>{s}</span>
          </Fragment>
        ))}
      </div>

      <div className="mapbar">
        <span className="label">The cloth</span>
        <span style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
          Warp in reading order; weft arcs across. Click a prompt below to trace it here — or click a concept/arc directly to pull it.
        </span>
      </div>

      <div id="mapWrap">
        <ClothMap state={state} readSel={readSel} setReadSel={setReadSel} />
      </div>

      <div className="legend">
        <span><span className="sw" style={{borderTop: "2px solid var(--ochre)"}}></span>warp — concept</span>
        <span><span className="sw" style={{borderTop: "2px solid var(--sage)"}}></span>named relation</span>
        <span><span className="sw" style={{borderTop: "2px dashed var(--grey)"}}></span>unnamed — sentence only</span>
        <span><span className="sw" style={{borderTop: "2px solid var(--red)"}}></span>what you're tracing</span>
      </div>

      <div className="two" style={{marginTop: "22px"}}>
        <div className="card">
          <h2 className="heading-with-info">
            What the cloth shows you <span className="n">counted, not judged</span>
            <button
              type="button"
              className="iconbtn cloth-info-btn"
              aria-label="How cloth prompts are derived"
              aria-haspopup="dialog"
              aria-expanded={showClothInfo}
              aria-controls="clothInfoDialog"
              onClick={() => setShowClothInfo(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>
          </h2>
          {showClothInfo && (
            <div className="info-scrim" onClick={() => setShowClothInfo(false)}>
              <section
                id="clothInfoDialog"
                className="info-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="clothInfoTitle"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  ref={closeInfoButtonRef}
                  type="button"
                  className="iconbtn info-close"
                  aria-label="Close info"
                  onClick={() => setShowClothInfo(false)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
                <div className="info-k">counted, not judged</div>
                <h2 id="clothInfoTitle">How these prompts are made</h2>
                <p>
                  This panel reads the structure of your own loom. It counts concepts and threads, then turns the visible patterns into questions for you to answer.
                </p>
                <ul>
                  <li><b>The spine</b> is the largest connected weave of concepts and threads.</li>
                  <li><b>The centre</b> is the concept, or tied concepts, with the most threads touching them.</li>
                  <li><b>The gap</b> is either an island apart from the main weave, or a concept with no threads yet.</li>
                </ul>
                <p className="info-note">
                  No agent writes the reading or decides what it means. The tool points; you interpret.
                </p>
                <button type="button" className="btn ghost mini" onClick={() => setShowClothInfo(false)}>Got it</button>
              </section>
            </div>
          )}
          <p className="hint">Each is a question with a move — click to trace it on the cloth and lay your threads out as material below. You weave them into your read. You make the call.</p>

          <div id="clothPrompts">
            {state.concepts.length === 0 && <p className="empty">Nothing laid yet — prompts appear as you weave.</p>}
            {readPrompts.map((p, i) => (
              <div
                key={i}
                className={`prompt ${readSel?.promptIdx === i ? "on" : ""}`}
                onClick={() => handlePromptClick(p, i)}
              >
                <span className="youdecide">you decide</span>
                <span className="pk">{p.key}</span>
                <div className="pq">{p.q}</div>
                {p.move && <span className="pm">{p.move}</span>}
              </div>
            ))}
            {state.concepts.length > 0 && loose > 0 && (
              <div className="ghostnote" style={{ marginTop: "6px" }}>{loose} thread{loose !== 1 ? 's' : ''} with no term yet — coin one on 02 so a word can recur.</div>
            )}
            {state.concepts.length > 0 && noEv.length > 0 && (
              <div className="ghostnote" style={{ marginTop: "6px", color: "var(--red)" }}>{noEv.length} concept{noEv.length !== 1 ? 's' : ''} with <b>no evidence</b> yet — every concept should trace to a captured passage.</div>
            )}
          </div>

          {readingPane}
        </div>

        <div className="card">
          <h2>Your read</h2>
          <p className="hint">The move: weave the findings into one narrative. The tool never writes it for you.</p>
          <p className="readq">In a sentence — what is this reading <i>about</i>?</p>
          <textarea
            id="yourRead"
            placeholder="Write your read here, in your own words. Trace a prompt on the left to lay your threads out as material to weave from."
            value={state.read}
            onChange={(e) => setRead(e.target.value)}
            onBlur={flushRead}
          />
          <div className="drafted" id="readDrafted">{drafted}</div>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
            <button className="btn ghost mini" onClick={handleCopyRead}>Copy as essay draft</button>
            <button className="btn ghost mini" onClick={handleMapKit}>Copy map kit → draw your map</button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "22px" }}>
        <HistoryPanel />
      </div>
    </>
  )
}
