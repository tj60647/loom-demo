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
import type { Edge, Tier } from "@/lib/types"
import { adjacency, componentOf, allComponents, degreeOf, recurringHandles, noEvidenceConcepts, short } from "@/lib/clothMath"
import ClothMap from "@/components/svg/ClothMap"
import { useCaptureLog, CaptureLogScrubber, CaptureLogRows, CaptureLogDownload } from "@/components/ui/HistoryPanel"
import ConceptName from "@/components/ui/ConceptName"
import { conceptNameText } from "@/lib/conceptName"

/**
 * "What the cloth shows you" — the counted prompts, the threads they lay out,
 * and the "create projection" button on the end of a trace.
 *
 * Hidden on TJ's call (2026-08-13) so the cloth graph gets the full column
 * rather than half of a two-up. Kept behind a flag rather than deleted because
 * the panel is the only route from a trace to a projection: turn it back on and
 * the prompts, the reading pane and that button all return. Everything it needs
 * is still computed above — the cost of keeping it is a few unused renders, not
 * a rewrite.
 */
const SHOW_PROMPTS = false

export default function ClothReflection({ onProjectionCreated, showLog = false, sourceId, scopeLabel }: {
  /**
   * Take the student to the projection they just made (TJ, 2026-08-12:
   * "clicking the create projection button should also navigate us to the new
   * projection"). Selecting it is not arriving at it: this panel is at the top
   * of the station and the Projections section is a screen below, so the sort
   * and the board changed out of sight. The scroll lives in `MapTab`, which
   * owns that section's DOM.
   */
  onProjectionCreated?: () => void
  /**
   * Draw time under the cloth. Off in the practice loom, which must not read
   * the student's real record: the log fetches over its own route, bypassing
   * the provider, so it would show their actual work inside a space that keeps
   * nothing.
   */
  showLog?: boolean
  /** This reading's acts only — see `useCaptureLog`. */
  sourceId?: string
  /** Readable name for the scope, for the log download's filename. */
  scopeLabel?: string
} = {}) {
  // The cloth and the counted report are this scope's — the scoped graph's
  // edges have both ends in scope by construction, so every concept lookup
  // below resolves. Bridges are named but not drawn: they are 02 Linking's
  // material, and drawing half a thread would be a lie.
  const {
    scopedState: state, flash,
    addMap, setMapTiers, selectMap, scopeMaps,
  } = useLoom()
  const [readSel, setReadSel] = useState<{type: "concept" | "edge" | "hub", id?: string, ids?: string[], promptIdx?: number, gap?: boolean} | null>(null)
  const [drafted, setDrafted] = useState("")
  const [showClothInfo, setShowClothInfo] = useState(false)
  const closeInfoButtonRef = useRef<HTMLButtonElement>(null)

  /**
   * The cloth over time (TJ, 2026-08-13). The hook is called unconditionally —
   * hooks must be — so `enabled` is what keeps the practice loom from reading
   * the student's real record. Gating only the render would still fetch it.
   */
  const log = useCaptureLog({ sourceId, enabled: showLog })
  /**
   * WHICH cloth the one map draws. Live state at the end of the record, the
   * folded reconstruction anywhere behind it. `log.ready` is false while the
   * record loads, when it fails, and when nothing is recorded — in every one of
   * those this stays false and the card draws the student's real work. The log
   * can hide its own scrubber; it can never blank the cloth.
   */
  const inThePast = showLog && log.ready && !log.atMax
  const drawn = inThePast && log.mapState ? log.mapState : state

  /**
   * Two views of one thing, in one box (TJ, 2026-08-13: "the previous version
   * had the diagram and the list in the same space, correct? why not just do
   * that again?"). It did, and this is that toggle back.
   *
   * The difference from then: the box used to hold a SECOND, read-only copy of
   * the cloth while the live one stayed on the station, so switching to the
   * list cost you nothing. There is one cloth now, so "record" hides the
   * drawing — which is what the row badges used to be a door back from. The
   * scrubber stays under both, because it is the position they share.
   */
  const [view, setView] = useState<"cloth" | "record">("cloth")

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
        <Fragment key={o.c.id}>{i > 0 && ' and '}<b>{short(conceptNameText(o.c), 40)}</b></Fragment>
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
          <Fragment key={c!.id}>{i > 0 && ' and '}<b>{short(conceptNameText(c!), 28)}</b></Fragment>
        ))} tie to each other but to nothing else. The sharpest question on the cloth: should they?</>,
        move: 'note the question →'
      })
    } else if (unwoven.length) {
      readPrompts.push({
        key: 'the gap', rep: unwoven[0].id, gap: true,
        q: <><b>{short(conceptNameText(unwoven[0]), 38)}</b>{unwoven.length > 1 ? ` and ${unwoven.length - 1} other${unwoven.length - 1 !== 1 ? 's' : ''}` : ''} cross nothing yet — warp with no weft. The sharpest question: where {unwoven.length > 1 ? 'do they' : 'does it'} belong?</>,
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

  /**
   * A prompt is a TOGGLE: press it to trace, press it again to put it away
   * (TJ, 2026-08-12: "the 'what the cloth shows you' options should be click
   * to reveal click to hide toggles"). It only ever revealed before, so the
   * one way out of a trace was to press a different prompt — and the pane
   * below stayed full of threads you had finished with.
   */
  const handlePromptClick = (p: ReadPrompt, idx: number) => {
    if (readSel?.promptIdx === idx) {
      setReadSel(null)
      setDrafted("")
      return
    }
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

  /**
   * Make these threads a projection (TJ, 2026-08-12). It used to be "copy
   * these threads", which put them on the clipboard and left the student to
   * do the laying out somewhere else — a dead end inside the tool that had
   * just found the trace.
   *
   * The trace IS a claim about what matters: the concepts it runs through go
   * on the top tier, and every other concept in this reading is set aside.
   * That is a starting arrangement, not a verdict — the sort list is right
   * there and every chip is one press. Nothing is written that the student
   * cannot immediately re-tier.
   */
  const [creating, setCreating] = useState(false)
  const createProjectionFrom = async (edges: Edge[], seeds: string[]) => {
    if (creating) return
    setCreating(true)
    try {
      const primary = new Set<string>(seeds)
      edges.forEach((e) => { primary.add(e.fromId); primary.add(e.toId) })
      if (!primary.size) { flash("nothing traced yet"); return }
      const name = `Cloth projection ${scopeMaps.length + 1}`
      const map = await addMap(name)
      // Go THEN sort, not sort then go: both writes are server round-trips and
      // waiting for the second one before moving left the student on the cloth
      // panel for ~2.5 seconds with nothing happening — long enough to read as
      // a dead button. Travelling first means they watch the sort fill in.
      selectMap(map.id)
      onProjectionCreated?.()
      const tiers: Record<string, Tier> = {}
      state.concepts.forEach((c) => { tiers[c.id] = primary.has(c.id) ? "p" : "x" })
      await setMapTiers(map.id, tiers)
      flash(`“${name}” — ${primary.size} concept${primary.size === 1 ? "" : "s"} primary, the rest set aside`)
    } catch (e) {
      flash(e instanceof Error ? e.message : "could not start a projection")
    } finally {
      setCreating(false)
    }
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
          <b>{f ? conceptNameText(f) : "?"}</b> {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">description</span>} <b>{t ? conceptNameText(t) : "?"}</b>
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
            {names.map((n, i) => <span key={n!.id}><span className="red">{conceptNameText(n!)}</span>{i < names.length - 1 ? " · " : ""}</span>)}
            <span className="n"> · {inc.length} thread{inc.length !== 1 ? 's' : ''} meet here</span>
          </div>
          <p className="hint" style={{ margin: "4px 0 9px" }}>
            The threads that converge on your busiest concept{readSel.ids.length > 1 ? 's' : ''} — your own sentences. <b>You</b> decide whether this is the core, and weave it into your read.
            Make it a projection and these concepts start on the top tier, with the rest set aside — a starting arrangement you can re-sort in a press.
          </p>
          <button
            className="btn ghost mini"
            onClick={() => createProjectionFrom(inc, readSel.ids ?? [])}
            disabled={creating}
            style={{ marginBottom: "12px" }}
          >{creating ? "…" : "create projection"}</button>
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
              <span className="red">{f ? conceptNameText(f) : "?"}</span> {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">description</span>} <span className="red">{t ? conceptNameText(t) : "?"}</span>
            </div>
            <p style={{ fontSize: "15.5px", fontStyle: "italic", margin: "8px 0 14px" }}>&ldquo;{e.sentence}&rdquo;</p>
            {[f, t].filter(Boolean).map(c => (
              <div key={c!.id} style={{ marginBottom: "16px" }}>
                <div className="label" style={{ marginTop: "8px" }}><ConceptName concept={c!} /></div>
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
              <div className="threadhead"><span className="red">{conceptNameText(c)}</span></div>
              <p className="empty" style={{ marginTop: "8px" }}>This thread crosses nothing yet — warp waiting for weft. Take it to 02 — Linking.</p>
            </div>
          );
        } else {
          readingPane = (
            <div id="readingPane" style={{ marginTop: "16px" }}>
              <div className="threadhead">
                <span className="red">{conceptNameText(c)}</span> <span className="n"> · {comp.edges.length} crossing{comp.edges.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="hint" style={{ margin: "4px 0 9px" }}>
                Your threads, in walking order — your own sentences, laid out as raw material. <b>You</b> weave them into a read below, in your own words.
                Make it a projection and these concepts start on the top tier, with the rest set aside — a starting arrangement you can re-sort in a press.
              </p>
              <button
                className="btn ghost mini"
                onClick={() => createProjectionFrom(comp.edges, [c.id])}
                disabled={creating}
                style={{ marginBottom: "12px" }}
              >{creating ? "…" : "create projection"}</button>
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
      {/* A note counting the bridges — threads running out of this reading to
          concepts met elsewhere — stood above the card until 2026-08-13 (TJ:
          "i dont think this adds value"). It explained an absence: why the
          drawing does not show something you were not looking for. The rule it
          defended is unchanged and still true — the cloth draws only threads
          with both ends in this reading, because half a thread would be a lie —
          and the bridges themselves are still counted and listed where they can
          be acted on, on 02 · Linking. */}

      {/* The cloth and its reading were side by side (TJ, 2026-08-12) — one
          gesture, a prompt on the right lighting the cloth on the left. The
          prompts panel is hidden now (TJ, 2026-08-13) and the cloth takes the
          whole column, so there is no grid to be half of: with SHOW_PROMPTS
          off the card is a plain full-width block and ClothMap reflows to it.
          Tracing still works by clicking a concept or arc on the cloth itself. */}
      <div className={SHOW_PROMPTS ? "two" : undefined}>
      <div className="card">
      {/* No "THE CLOTH" label on the card: 03's section heading says it now
          (TJ, 2026-08-12), and the same words twice, six lines apart, read as
          two different things. */}
      {/* The chips read like the projection switcher because they do the same
          job: pick which of two views of one thing you are looking at. The
          download sits with them so it is in the same place in both. */}
      <div className="mapbar" style={{ marginBottom: 8 }}>
        <span className="hint" style={{ margin: 0 }}>
          Warp in reading order; weft arcs across.{SHOW_PROMPTS
            ? " Click a prompt beside this to trace it here — or click a concept/arc directly to pull it."
            : " Click a concept or arc to trace it."}
          {showLog && " Scrub below to see how it grew."}
        </span>
        {showLog && log.ready && (
          <>
            <span className="chips" style={{ margin: 0, marginLeft: "auto", alignItems: "center" }}>
              {([["cloth", "the cloth"], ["record", "the record"]] as const).map(([v, label]) => (
                <span
                  key={v}
                  className={`chip${view === v ? " on" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setView(v)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(v) } }}
                >{label}</span>
              ))}
            </span>
            <CaptureLogDownload log={log} scopeLabel={scopeLabel} />
          </>
        )}
      </div>

      {/* ONE box, two views (see `view` above). The cloth draws the student's
          live weave, or — while the scrubber sits back from the end of the
          record — the same weave folded to the act they are looking at. The
          glow marks what that act touched, and only once they have actually
          moved: on arrival this is a calm drawing of their work, not a pulse on
          whatever they last happened to do.

          Both are 400px tall, so the chips swap the contents and the legend,
          the scrubber and everything below them stay exactly where they were. */}
      <div id="mapWrap">
        {view === "record" && showLog && log.ready ? (
          <CaptureLogRows log={log} onShowCloth={() => setView("cloth")} />
        ) : (
          <ClothMap
            state={drawn}
            readSel={readSel}
            setReadSel={setReadSel}
            glow={showLog && log.scrubbed && log.glowId ? { id: log.glowId, seq: log.pulse } : null}
          />
        )}
      </div>

      <div className="legend">
        <span><span className="sw" style={{borderTop: "2px solid var(--ochre)"}}></span>warp — concept</span>
        <span><span className="sw" style={{borderTop: "2px solid var(--sage)"}}></span>labelled link</span>
        <span><span className="sw" style={{borderTop: "2px dashed var(--grey)"}}></span>unlabelled — description only</span>
        <span><span className="sw" style={{borderTop: "2px solid var(--red)"}}></span>what you&apos;re tracing</span>
      </div>

      {/* The log, in the same card as the cloth it describes (TJ, 2026-08-13).
          A rule rather than a card edge: these are two registers of one thing —
          the cloth, and the cloth over time — not two objects sitting next to
          each other. It was its own section with its own heading and its own
          second drawing of the same graph until today. */}
      {showLog && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
          {/* Under BOTH views: it is the position the two of them share. Click
              a row in the record and this moves; drag this and the cloth
              redraws. */}
          <CaptureLogScrubber log={log} />
        </div>
      )}
      </div>

      {SHOW_PROMPTS && <div className="card">
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
      </div>}
      </div>
    </>
  )
}
