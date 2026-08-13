"use client"

// The cloth, its prompts, and the threads a prompt lays out to work from.
//
// This was station 03's whole content until 2026-08-08, when 03 became
// Vocabulary (the model's tab 4 — the User's holdings). It moved here to 04 ·
// Knowledge Graph on TJ's call: the panel reads the *structure of the graph*,
// and 04 already owns the projection whose one-line and paragraph it feeds.
// The read editor came with it only in the sense that it was already here —
// 03's copy was a duplicate of `#yourRead2` and is gone.
//
// Nothing here writes an interpretation: it counts and sorts and poses a
// generic question (red lines #1/#7). "Counted, not judged."

import { useLoom } from "@/components/providers/LoomProvider"
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import type { Edge } from "@/lib/types"
import { adjacency, componentOf, allComponents, degreeOf, recurringHandles, noEvidenceConcepts, short } from "@/lib/clothMath"
import { copyText } from "@/lib/clipboard"
import ClothMap from "@/components/svg/ClothMap"

export default function ClothReflection() {
  // The cloth and the counted report are this scope's — the scoped graph's
  // edges have both ends in scope by construction, so every concept lookup
  // below resolves. Bridges are named but not drawn: they are 02 Linking's
  // material, and drawing half a thread would be a lie.
  const { scopedState: state, scoped, activeCloth, flash, studentName } = useLoom()
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
  const noEv = noEvidenceConcepts(state.concepts, state.passages)
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
        q: <>You&apos;ve reached for <b>&ldquo;{rec[0][0]}&rdquo;</b> on {rec[0][1].length} threads — it&apos;s becoming one of your own labels. See it with the rest on <b>04 · Vocabulary</b>.</>,
        move: 'a label recurring'
      })
    }
  }

  // Read rail: look · trace · question · write
  // "Wrote" = any interpretive paragraph exists: a projection's read, or this
  // reading's own cloth description.
  const wrote = !!(
    state.maps.some((m) => m.read.trim()) || activeCloth?.description.trim()
  )
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
      ? 'traced on the cloth — your threads are laid out below, yours to weave into your read.'
      : 'just a pattern to notice — nothing to lay out.')
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
      if (ok) { flash("copied to clipboard"); setDrafted("✓ copied") }
      else flash("select & copy by hand")
    })
  }

  // v14's tripleHtml + .readitem. Sizes come from globals.css (.threadhead is
  // 19px display, .trip 15px, .sent 14.5px) — this pane is material to read
  // from, and the inline overrides that used to sit here shrank it to 12-14px.
  const threadItem = (e: Edge) => {
    const f = state.concepts.find(c => c.id === e.fromId)
    const t = state.concepts.find(c => c.id === e.toId)
    return (
      <div key={e.id} className="readitem">
        <div className="trip">
          <b>{f?.label || "?"}</b> {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">description</span>} <b>{t?.label || "?"}</b>
        </div>
        <div className="sent">&ldquo;{e.sentence}&rdquo;</div>
      </div>
    )
  }

  // Generate reading pane content
  let readingPane = null;
  if (readSel) {
    if (readSel.type === "hub" && readSel.ids) {
      const inc = state.edges.filter(e => readSel.ids!.includes(e.fromId) || readSel.ids!.includes(e.toId));
      const names = readSel.ids.map(id => state.concepts.find(c => c.id === id)).filter(Boolean);

      readingPane = (
        <div id="readingPane" style={{ marginTop: "16px" }}>
          <div className="threadhead">
            {names.map((n, i) => <span key={n!.id}><span className="red">{n!.label}</span>{i < names.length - 1 ? " · " : ""}</span>)}
            <span className="n"> · {inc.length} thread{inc.length !== 1 ? 's' : ''} meet here</span>
          </div>
          <p className="hint" style={{ margin: "4px 0 9px" }}>
            The threads that converge on your busiest concept{readSel.ids.length > 1 ? 's' : ''} — your own sentences. <b>You</b> decide whether this is the core, and weave it into your read.
          </p>
          <button className="btn ghost mini" onClick={handleCopyDraft} style={{ marginBottom: "12px" }}>copy these threads</button>
          <div>{inc.map(threadItem)}</div>
        </div>
      );
    } else if (readSel.type === "edge" && readSel.id) {
      const e = state.edges.find(x => x.id === readSel.id);
      if (e) {
        const f = state.concepts.find(c => c.id === e.fromId);
        const t = state.concepts.find(c => c.id === e.toId);
        const fromPassages = state.passages.filter(b => f && b.conceptIds.includes(f.id));
        const toPassages = state.passages.filter(b => t && b.conceptIds.includes(t.id));

        readingPane = (
          <div id="readingPane" style={{ marginTop: "16px" }}>
            <div className="threadhead">
              <span className="red">{f?.label || "?"}</span> {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">description</span>} <span className="red">{t?.label || "?"}</span>
            </div>
            <p style={{ fontSize: "15.5px", fontStyle: "italic", margin: "8px 0 14px" }}>&ldquo;{e.sentence}&rdquo;</p>
            {[f, t].filter(Boolean).map(c => (
              <div key={c!.id} style={{ marginBottom: "16px" }}>
                <div className="label" style={{ marginTop: "8px" }}>{c!.label}</div>
                {c!.def && <div style={{ fontSize: "13.5px", color: "var(--ink-soft)" }}>{c!.def}</div>}
                {(c === f ? fromPassages : toPassages).map(b => (
                  <div key={b.id} className="passagequote">
                    <span className="src">{b.source || '—'}{b.location ? ` · ${b.location}` : ''}</span><br/>
                    {b.content}
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
              <div className="threadhead"><span className="red">{c.label}</span></div>
              <p className="empty" style={{ marginTop: "8px" }}>This thread crosses nothing yet — warp waiting for weft. Take it to 02 — Linking.</p>
            </div>
          );
        } else {
          readingPane = (
            <div id="readingPane" style={{ marginTop: "16px" }}>
              <div className="threadhead">
                <span className="red">{c.label}</span> <span className="n"> · {comp.edges.length} crossing{comp.edges.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="hint" style={{ margin: "4px 0 9px" }}>
                Your threads, in walking order — your own sentences, laid out as raw material. <b>You</b> weave them into a read below, in your own words. Copy to quote a line.
              </p>
              <button className="btn ghost mini" onClick={handleCopyDraft} style={{ marginBottom: "12px" }}>copy these threads</button>
              <div>{comp.edges.map(threadItem)}</div>
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
      <div className="rail" id="readRail" style={{ marginTop: "22px" }}>
        {["look", "trace", "question", "write"].map((s, i) => (
          <Fragment key={s}>
            {i > 0 && <span className="rsep">·</span>}
            <span className={"rstep" + (i === railN ? " now" : "") + (i < railN ? " done" : "")} data-r={i}>{s}</span>
          </Fragment>
        ))}
      </div>

      {scoped.bridges.length > 0 && (
        <p className="ghostnote" style={{ marginTop: 6, marginBottom: 12 }}>
          {scoped.bridges.length} thread{scoped.bridges.length !== 1 ? "s" : ""} also run{scoped.bridges.length === 1 ? "s" : ""} out of this reading to concepts you met elsewhere.
          They are not drawn here — half a thread would be a lie — but they are listed on <b>02 · Linking</b>.
        </p>
      )}

      {/* The cloth and its reading, side by side (TJ, 2026-08-12). They are one
          gesture — you click a prompt on the right and it lights on the left —
          and stacked vertically the two halves of it could not be seen at
          once: tracing a prompt scrolled the cloth off the top. Half and half
          to start. The cloth is in a card now for parity with its partner; it
          used to be a bare block under a `.mapbar`, which read as page
          furniture rather than as one of the two things here. */}
      <div className="two">
      <div className="card">
      {/* No "THE CLOTH" label on the card: 03's section heading says it now
          (TJ, 2026-08-12), and the same words twice, six lines apart, read as
          two different things. */}
      <p className="hint">
        Warp in reading order; weft arcs across. Click a prompt beside this to trace it here — or click a concept/arc directly to pull it.
      </p>

      <div id="mapWrap">
        <ClothMap state={state} readSel={readSel} setReadSel={setReadSel} />
      </div>

      <div className="legend">
        <span><span className="sw" style={{borderTop: "2px solid var(--ochre)"}}></span>warp — concept</span>
        <span><span className="sw" style={{borderTop: "2px solid var(--sage)"}}></span>labelled link</span>
        <span><span className="sw" style={{borderTop: "2px dashed var(--grey)"}}></span>unlabelled — description only</span>
        <span><span className="sw" style={{borderTop: "2px solid var(--red)"}}></span>what you&apos;re tracing</span>
      </div>
      </div>

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
        <p className="hint">Click a prompt to light it up on the cloth and lay those threads out below. <b>You don&apos;t write anything here</b> — your one short read goes underneath.</p>

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
            <div className="ghostnote" style={{ marginTop: "6px" }}>{loose} thread{loose !== 1 ? 's' : ''} with no label yet — label one on 02 so a word can recur.</div>
          )}
          {/* A designation, not a scolding (TJ, 2026-08-08): a concept may be
              named ahead of its evidence on purpose. Counted, not judged — so
              it is stated in the ordinary voice, not in red. */}
          {state.concepts.length > 0 && noEv.length > 0 && (
            <div className="ghostnote" style={{ marginTop: "6px" }}>{noEv.length} concept{noEv.length !== 1 ? 's' : ''} carry <b>no passage</b> yet — named ahead of their evidence, or left behind by it.</div>
          )}
          {drafted && <div className="drafted" id="readDrafted">{drafted}</div>}
        </div>

        {readingPane}
      </div>
      </div>
    </>
  )
}
