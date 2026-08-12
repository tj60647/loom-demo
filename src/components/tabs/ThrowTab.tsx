"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useDialog } from "@/components/providers/DialogProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import ObjectDownload from "@/components/ui/ObjectDownload"
import { buildThreadsExport, buildThreadsMarkdown } from "@/lib/objectExport"
import { findLink, labelOf as labelOfEdge, usesOf } from "@/lib/linkResolve"
import { scopeLabelOf } from "@/lib/graphExport"
import { sortedByLabel } from "@/lib/utils"
import { short } from "@/lib/clothMath"

const PLAIN_VERBS = ['leads to','depends on','is part of','goes against','is the same as','sets up'];

/** How many of the student's own Link Labels the coin-time row offers. */
const SUGGESTED_LABELS = 12;

const OPENERS = [
  'this means that',
  'this explains why',
  'these are both about',
  'you can’t have this without that —',
  'this is an example of',
  'these pull against each other because',
  'these don’t obviously touch, except',
];

function EmptyState({ caption }: { caption: string }) {
  return (
    <div className="empty">
      <svg width="34" height="18" viewBox="0 0 34 18" fill="none" stroke="#a39f92" strokeWidth="1.3"><path d="M2 13 L7 5 L12 13 L17 5 L22 13 L27 5 L32 13"/></svg>
      <span className="cap">{caption}</span>
    </div>
  )
}

/**
 * The four moves of a thread, named rather than abbreviated.
 *
 * `railN` indexes this: 0 nothing picked · 1 one picked · 2 both picked, no
 * sentence · 3 sentence written. `says` is the line under the bar, so the
 * student reads what to do now rather than inferring it from a lit pill.
 */
const STEPS: { label: string; says: string }[] = [
  {
    label: "Pick a concept",
    says: "Tap a concept in the warp on the left — one you have evidence for in this reading.",
  },
  {
    label: "Pick a second",
    says: "Tap the concept you think it hangs together with. Two picked is what wakes the bench.",
  },
  {
    label: "Say how they relate",
    says: "Write it as a sentence you would defend out loud. Long and awkward is fine — the sentence IS the thread.",
  },
  {
    label: "Throw the thread",
    says: "Throw it, and the pair is joined. Afterwards you can label the link with a short word, so a word of yours can recur.",
  },
]

export default function ThrowTab() {
  // Scoped for what this reading is about; whole for anything that has to be
  // TRUE. The thread lists are `scoped` — this reading's own work, and since
  // 2026-08-09 only that — while the evidence check, the duplicate-pair guard
  // and the coined-label vocabulary all read the whole graph, because those
  // are facts about the student rather than about this bench.
  const { state, scoped, scope, addEdge, editEdge, removeEdge, attachLink, flash, setUndoStack, setRedoStack } = useLoom()
  const { byId: readingsById } = useReadings()
  const titleOf = (id: string) => readingsById.get(id)?.title ?? id
  const { confirm, notify } = useDialog()
  const [pairA, setPairA] = useState<string | null>(null)
  const [pairB, setPairB] = useState<string | null>(null)
  const [drawn, setDrawn] = useState(false)
  const [sentence, setSentence] = useState("")
  const [namingFor, setNamingFor] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)

  // A tapped suggestion is a starting point, not the answer — return focus to
  // the field (v14 did the same) so the student can edit it into their own word.
  const pickWord = (word: string) => {
    setNameDraft(word)
    nameInputRef.current?.focus()
  }

  /**
   * Put a label back on a thread — the one path undo and redo both take.
   *
   * A word the student already owns is re-ATTACHED, so stepping back over a
   * tapped chip leaves the thread pointing at the Link object rather than at
   * a string that merely agrees with it. Anything else goes through
   * `editEdge`, which coins the object server-side and clears it on "".
   */
  const restoreLabel = useCallback((edgeId: string, label: string | null) => {
    const link = label ? findLink(state.links, label) : undefined
    if (link) attachLink(edgeId, link.id)
    else editEdge(edgeId, { handle: label ?? "" })
  }, [state.links, attachLink, editEdge])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
          return; // Let native input undo/redo handle it
        }
        e.preventDefault();

        if (e.shiftKey) {
          setRedoStack(prevRedo => {
            if (prevRedo.length === 0) return prevRedo;
            const action = prevRedo[prevRedo.length - 1];
            restoreLabel(action.edgeId, action.to);
            setUndoStack(prevUndo => [...prevUndo, action]);
            return prevRedo.slice(0, -1);
          });
        } else {
          // Undo
          setUndoStack(prevUndo => {
            if (prevUndo.length === 0) return prevUndo;
            const action = prevUndo[prevUndo.length - 1];
            restoreLabel(action.edgeId, action.from);
            setRedoStack(prevRedo => [...prevRedo, action]);
            return prevUndo.slice(0, -1);
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        // Redo
        setRedoStack(prevRedo => {
          if (prevRedo.length === 0) return prevRedo;
          const action = prevRedo[prevRedo.length - 1];
          restoreLabel(action.edgeId, action.to);
          setUndoStack(prevUndo => [...prevUndo, action]);
          return prevRedo.slice(0, -1);
        });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [restoreLabel, setRedoStack, setUndoStack]);

  // Whole-graph: a concept evidenced in an earlier reading is not evidence-less
  // just because this reading has not quoted it.
  const passagesOf = (conceptId: string) => state.passages.filter(b => b.conceptIds.includes(conceptId))
  const conceptById = (id: string) => state.concepts.find(c => c.id === id)

  const togglePick = (id: string) => {
    if (pairA === id) setPairA(null)
    else if (pairB === id) setPairB(null)
    else if (!pairA) setPairA(id)
    else if (!pairB) setPairB(id)
    else setPairB(id)
    setDrawn(false)
  }

  // The shuttle draws from whatever is in scope — this reading's concepts here,
  // every concept at the whole weave. It no longer takes an `across` flag:
  // linking works on this reading (TJ, 2026-08-08), and at the whole weave the
  // scope already IS everything. Chance picks the pair; every judgment about
  // whether they cross is still the student's.
  const drawPair = async () => {
    const cs = scoped.concepts
    if (cs.length < 2) {
      await notify({
        title: "Not enough warp yet.",
        body: "Lay at least two concepts in this reading on 01 · Reading, then the shuttle has something to draw between.",
      })
      return
    }
    const crossed = (a: string, b: string) =>
      state.edges.some(e => (e.fromId === a && e.toId === b) || (e.fromId === b && e.toId === a))
    let pairs: [string, string][] = []
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++)
        if (!crossed(cs[i].id, cs[j].id)) pairs.push([cs[i].id, cs[j].id])
    if (!pairs.length) {
      pairs = []
      for (let i = 0; i < cs.length; i++)
        for (let j = i + 1; j < cs.length; j++)
          pairs.push([cs[i].id, cs[j].id])
      flash('every pair crossed — drawing any')
    }
    const p = pairs[Math.floor(Math.random() * pairs.length)]
    if (Math.random() < 0.5) p.reverse()
    setPairA(p[0])
    setPairB(p[1])
    setDrawn(true)
  }

  const handleSwap = () => {
    setPairA(pairB)
    setPairB(pairA)
  }

  const handleClearSlot = (which: 'A' | 'B') => {
    if (which === 'A') setPairA(null)
    else setPairB(null)
    setDrawn(false)
  }

  const handleThrow = async () => {
    // The sentence is encouraged, never required (P0.3): connecting first and
    // describing later is the golden path.
    if (!pairA || !pairB) return
    await addEdge(pairA, pairB, sentence.trim())
    setPairA(null)
    setPairB(null)
    setDrawn(false)
    setSentence("")
    flash('thread thrown — label the link below, when you like')
  }

  const handleOpenerClick = (opener: string) => {
    let newSentence = sentence;
    for (const o of OPENERS) {
      if (newSentence.startsWith(o + ' ')) {
        newSentence = newSentence.slice((o + ' ').length);
      }
    }
    setSentence(opener + ' ' + newSentence);
  }

  const toggleNamer = (edgeId: string, currentHandle: string | null) => {
    if (namingFor === edgeId) {
      setNamingFor(null)
    } else {
      setNamingFor(edgeId)
      setNameDraft(currentHandle ?? "")
    }
  }

  /**
   * Tap one of your own labels: ATTACH the object, do not copy its word.
   * Closes the naming fold, because the act is finished — there is nothing
   * left to type and a Save button that did nothing would invite a second
   * write. The undo stack still records it as a label change, so ⌘Z behaves
   * the same whether the word was tapped or typed.
   */
  const attachOwn = (edgeId: string, link: { id: string; label: string }) => {
    const edge = state.edges.find((x) => x.id === edgeId)
    const previous = edge ? labelOfEdge(edge, state.links) : ""
    if (previous !== link.label) {
      setUndoStack(prev => [...prev, { edgeId, from: previous || null, to: link.label }])
      setRedoStack([])
    }
    attachLink(edgeId, link.id)
    setNamingFor(null)
    flash("label attached")
  }

  const handleSaveName = (edgeId: string, previousValue: string | null) => {
    const h = nameDraft.trim()
    if (h !== (previousValue ?? "")) {
      setUndoStack(prev => [...prev, { edgeId, from: previousValue, to: h }]);
      setRedoStack([]);
      editEdge(edgeId, { handle: h });
    }
    setNamingFor(null);
    flash(h ? 'link labelled' : 'left as a description');
  }

  const c1 = conceptById(pairA ?? "")
  const c2 = conceptById(pairB ?? "")
  const both = !!(pairA && pairB && pairA !== pairB)
  const sent = sentence.trim()
  const railN = (!pairA && !pairB) ? 0 : (!both ? 1 : (!sent ? 2 : 3))
  const doLine = (!pairA && !pairB)
    ? 'Tap two of your concepts to connect them.'
    : (both ? 'Two picked — now say how they relate, on the right. →' : 'Good — now tap a second.')

  const byNamed = (a: { handle: string | null }, b: { handle: string | null }) =>
    (a.handle ? 1 : 0) - (b.handle ? 1 : 0)
  const orderedEdges = [...scoped.edges].sort(byNamed)
  // The Link List (model §Student: "belongs to the User, spans Cloths: the
  // reusable Link Labels, tappable at coin-time") — since 5.1 the student's
  // own Link OBJECTS, not strings scraped off threads. Two things follow. A
  // label coined and never used is offered here, which is the whole reason
  // for coining ahead. And tapping one ATTACHES that object rather than
  // copying its text, so reaching for the same word twice cannot mint a
  // near-duplicate; the design note's warning is that objects WITHOUT
  // attachment silt the vocabulary up by string copy.
  //
  // Read off `state`, never `scoped` — labels cross readings even though,
  // since 2026-08-09, the threads themselves do not. Most-used first so the
  // vocabulary you actually lean on is nearest the hand, then alphabetical so
  // the order is stable across renders. VocabularyTab is the list's full home.
  const ownLabels = (() => {
    const uses = usesOf(state.links, state.edges)
    const all = state.links
      .map((link) => ({ link, n: (uses.get(link.id) ?? []).length }))
      .sort((a, b) => b.n - a.n || a.link.label.localeCompare(b.link.label))
      .map((x) => x.link)
    // Twelve chips is what the row holds before it becomes a wall of verbs.
    // The count says what is not shown rather than quietly ending the list —
    // this IS the Link List (model §Student), and a truncated view of it that
    // does not admit to being truncated misreports what the student owns.
    return { shown: all.slice(0, SUGGESTED_LABELS), rest: Math.max(0, all.length - SUGGESTED_LABELS) }
  })()

  // Concepts from the student's other readings, reachable and searchable but
  // out of the way. Never removed: threading this reading to an earlier one is
  // the move weeks 6-13 are built on.
  // Both bands are lists you SEARCH for a concept to pick, so both are A-Z.
  const warp = sortedByLabel(scoped.concepts)

  const conceptRow = (c: typeof state.concepts[number]) => {
    const isPicked = pairA === c.id || pairB === c.id
    const noev = passagesOf(c.id).length === 0
    return (
      <div
        key={c.id}
        className={`crow ${isPicked ? "picked" : ""}`}
        onClick={() => togglePick(c.id)}
        title="tap to load into the bench"
      >
        <div className="clabel">{c.label}</div>
        {isPicked
          ? <div className="pickedtag">PICK {pairA === c.id ? 1 : 2}</div>
          : (noev && <div className="pickedtag" style={{ color: "var(--ink-soft)" }} title="no passage backs this yet — you may have named it ahead of its evidence, which is allowed">no evidence</div>)}
      </div>
    )
  }

  const threadRow = (e: typeof state.edges[number]) => {
    const fromC = conceptById(e.fromId)
    const toC = conceptById(e.toId)
    // v14 renders a dangling end as "?" rather than dropping the row:
    // a thread the student threw should stay visible and removable,
    // not vanish silently because one end went missing.
    const sel = namingFor === e.id
    // No far-end pill any more: with the bridges band gone, every row here has
    // both ends in scope, so there is never a reading to name.

    return (
      <div key={e.id} className={`thread ${sel ? "sel" : ""}`}>
        <div className="trip">
          <b>{fromC ? short(fromC.label, 30) : "?"}</b>{' '}
          {e.handle
            ? <span className="v">{e.handle}</span>
            : <span className="v loosev">{short(e.sentence, 38)}</span>}{' '}
          <b>{toC ? short(toC.label, 30) : "?"}</b>
        </div>
        <div className="sent">“{e.sentence}”</div>
        <div className="tmeta">
          {e.handle
            ? <span className="pill beaten">label</span>
            : <span className="pill loose">description</span>}
          {/* One word for one control (TJ, 2026-08-12). It read "coin a label"
              on a thread with none and "edit label" on one with a label — the
              pill beside it already says which of the two this thread is. */}
          <span className="act" onClick={() => toggleNamer(e.id, e.handle)}>
            {sel ? 'close' : 'edit label'}
          </span>
          <span
            className="rm"
            onClick={async () => {
              const ok = await confirm({
                title: "Remove this thread?",
                body: <>The description goes with it: <i>&ldquo;{short(e.sentence, 120)}&rdquo;</i> Both concepts stay.</>,
                confirmLabel: "Remove thread",
                danger: true,
              })
              if (!ok) return
              if (namingFor === e.id) setNamingFor(null)
              removeEdge(e.id)
            }}
          >remove</span>
        </div>
        {sel && (
          <div className="distill">
            <div className="rnote"><b>Label the link</b> (optional) — you&apos;ve already said how they relate; a short word lets this <i>kind</i> of link recur across your weave.</div>
            <div className="form-row" style={{ margin: "6px 0 8px" }}>
              <input
                ref={nameInputRef}
                className="tinput"
                value={nameDraft}
                onChange={(ev) => setNameDraft(ev.target.value)}
                placeholder="your word… e.g. leads to · contradicts · is part of"
                autoFocus
              />
            </div>
            {/* Your own labels first, from EVERY reading — TJ, 2026-08-09:
                "links from other readings may show up as link options". The
                threads themselves stay this reading's own (the bridges band
                went in the same ruling), but a label is vocabulary, not
                evidence: coining "sets the terms for" in one text and reaching
                for it again in the next is the reuse the course wants, and
                retyping it by hand is how you end up with two labels that mean
                one thing. Everyday verbs stay underneath as the fallback for
                someone who has not coined any yet. */}
            {ownLabels.shown.length > 0 && (
              <>
                <div className="rnote">
                  Labels you have used before
                  {ownLabels.rest > 0 && <> — the {ownLabels.shown.length} you reach for most, of {ownLabels.shown.length + ownLabels.rest}</>}:
                </div>
                <div className="chips">
                  {ownLabels.shown.map(link => (
                    <span
                      key={link.id}
                      className="verbchip borrowed"
                      title={link.description || undefined}
                      onClick={() => attachOwn(e.id, link)}
                    >{link.label}</span>
                  ))}
                </div>
              </>
            )}
            <div className="rnote">Stuck for a word? Tap an everyday suggestion:</div>
            <div className="chips">
              {PLAIN_VERBS.map(v => (
                <span key={v} className="verbchip" onClick={() => pickWord(v)}>{v}</span>
              ))}
            </div>
            <div style={{ marginTop: "10px" }}>
              <button className="btn mini" onClick={() => handleSaveName(e.id, e.handle)}>Save label</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Four pills reading "pick · pick · say · throw" said the shape of the
          move but not the move. Numbered, named, and with the current step
          spelled out underneath, so the bar teaches instead of labelling. */}
      <div className="rail steprail">
        {STEPS.map((step, r) => (
          <span key={r} style={{ display: 'contents' }}>
            {r > 0 && <span className="rsep">→</span>}
            <span className={`rstep ${r === railN ? 'now' : ''} ${r < railN ? 'done' : ''}`}>
              <span className="stepn">{r + 1}</span> {step.label}
            </span>
          </span>
        ))}
      </div>
      <p className="hint steprailnote">{STEPS[railN]?.says}</p>
      <div className="two">
        <div className="card" id="warp">
          <h2>The warp <span className="n">{scoped.concepts.length ? `(${scoped.concepts.length})` : ''}</span></h2>
          <p className="do">{doLine}</p>
          <p className="hint">
            The concepts <b>this reading</b> evidences — the ones you captured a
            passage for here. Tap one, then a second.
          </p>
          {/* Ruled 2026-08-08 (TJ): linking works on this reading's concepts.
              A concept you met elsewhere joins the warp the honest way — you
              find a passage HERE that embodies it and file it under that same
              concept, which is offered by name while you capture. */}
          {scoped.outside.length > 0 && (
            <p className="ghostnote">
              {scoped.outside.length} more concept{scoped.outside.length !== 1 ? "s" : ""}{" "}
              from your other readings are not listed here — this bench links what
              <i> this</i> reading evidences. To bring one in, capture a passage from this
              reading and file it under that concept while naming it; it then joins the
              warp above.
            </p>
          )}

          <div className="scrollbox">
            {warp.length === 0 ? (
              <EmptyState caption="lay some warp on 01 — open first" />
            ) : warp.map(c => conceptRow(c))}
          </div>
        </div>

        <div className="card" id="throwBench">
          <h2>Throw a thread</h2>
          <p className="hint calm">When two are picked, say how they hang together — long and awkward is fine. The description <i>is</i> the thread. A good check: does it read aloud as a claim you&apos;d defend in section?</p>

          <div className="benchbar">
            <span className="cap">the pair</span>
            {/* Wrapped, not passed by reference: the click event would arrive
                as `across` and turn every draw into a cross-reading one. */}
            <button className="btn ghost mini" onClick={() => drawPair()} title="chance picks two threads you'd never elect — you do all the judging">
              ⤳ let the shuttle draw
            </button>
            {/* No "across readings" draw here any more (TJ, 2026-08-08): this
                bench links THIS reading's concepts. The shuttle can still reach
                across at the whole weave, where every concept is in scope. */}
          </div>

          <div className="slots">
            <div className={`slot ${c1 ? "filled" : ""}`}>
              <span className="cap">From</span>
              {c1 ? (
                <>
                  <span className="clear" onClick={() => handleClearSlot('A')}>✕</span>
                  {c1.label}
                </>
              ) : <span className="ph">tap a concept on the left</span>}
            </div>

            <div className="swapcol">
              <span className="arr">→</span>
              <button onClick={handleSwap}>swap</button>
            </div>

            <div className={`slot ${c2 ? "filled" : ""}`}>
              <span className="cap">To</span>
              {c2 ? (
                <>
                  <span className="clear" onClick={() => handleClearSlot('B')}>✕</span>
                  {c2.label}
                </>
              ) : <span className="ph">tap a concept on the left</span>}
            </div>
          </div>

          <div className="drawnote">{drawn && pairA && pairB ? 'the shuttle drew these — do they cross? “no crossing I can see” is a judgment too. draw again.' : ''}</div>

          {/* The bench always renders and only dims when no pair is loaded, as
              in v14: you can see what the move will ask of you before you pick.
              `.sleeper.asleep` fades it and blocks clicks with its ::after. */}
          <div className={`sleeper ${both ? "" : "asleep"}`}>
            <div className="sleepmsg">pick two concepts on the left — the bench wakes when the pair is loaded</div>
            <div className="form-row">
              <span className="label">The link description — how they relate, however awkwardly</span>
              <div className="chips" style={{ margin: "2px 0 6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {OPENERS.map(o => (
                  <span key={o} className="openchip" onClick={() => handleOpenerClick(o)}>
                    {o}…
                  </span>
                ))}
              </div>
              <textarea
                placeholder="…or just start typing. Long and awkward is fine."
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
              />
            </div>
            <button id="throwIt" className="btn" onClick={handleThrow} disabled={!both}>Throw it</button>
            {/* The sentence is encouraged, never required (P0.3) — the note
                coaches toward it instead of the button withholding the throw. */}
            <p className="ghostnote" style={{marginTop: "7px"}}>
              {sent
                ? "Thrown threads land below. When a relationship recurs, label the link with a short word (optional) — that's how your vocabulary grows."
                : "Say how they hang together — however awkwardly. The description is the thread, and you can throw now and write it later."}
            </p>
          </div>

          <h3 style={{fontFamily: "var(--display)", fontSize: "17px", borderBottom: "1px solid var(--rule)", paddingBottom: "5px", margin: "18px 0 6px", display: "flex", alignItems: "baseline", gap: "10px"}}>
            Threads in this reading
            {' '}
            <span className="n" style={{fontFamily: "var(--mono)", fontSize: "11px", color: "var(--grey)"}}>{orderedEdges.length ? `(${orderedEdges.length})` : ''}</span>
            {/* Threads download where they are thrown (TJ, 2026-08-10). Both
                ends are named in the file: an id says nothing away from Loom. */}
            {orderedEdges.length > 0 && (
              <span style={{marginLeft: "auto"}}>
                <ObjectDownload
                  kind="threads"
                  slug={scopeLabelOf(scope.key, titleOf)}
                  tip="these threads, each naming both of its concepts"
                  json={(p) => JSON.stringify(buildThreadsExport(state, scope.key, p, titleOf), null, 2)}
                  markdown={(p) => buildThreadsMarkdown(state, scope.key, p, titleOf)}
                />
              </span>
            )}
          </h3>

          {/* What "edit label" is FOR (TJ, 2026-08-12). The control sits on
              every row with no account of why anyone would press it, and the
              answer is a movement rather than a field: the sentence comes
              first and stays the thread, and a label is what you distil out of
              it once you have written the same relation a few times. Shown
              only with threads on screen — with none, it explains a control
              nobody can see. */}
          {orderedEdges.length > 0 && (
            <p className="ghostnote" style={{ margin: "0 0 9px" }}>
              As a thread matures you can promote its description to a <b>label</b> — one
              short word for the relation, chosen because it captures the essence of what
              you already said. That is what <i>edit label</i> on a row is for. A thread
              that stays a description is finished work, not a draft.
            </p>
          )}

          <div className="scrollbox">
            {orderedEdges.length === 0 ? (
              <EmptyState caption="nothing thrown yet — pick, pick, say" />
            ) : orderedEdges.map(threadRow)}
          </div>

          {/* No band of threads from elsewhere (TJ, 2026-08-09: "threads from
              other readings should not show up in the linking"). It used to
              show `scoped.bridges` — threads with one end outside this
              reading — under "Threads that run out of this reading". Since the
              ruling of 2026-08-08 removed the outside-concepts band and the
              across-readings shuttle, a student can no longer MAKE a bridge
              from inside a reading, so by construction every row in that band
              had been thrown somewhere else. It had become a list of other
              readings' work sitting in this reading's Linking. The threads
              still exist and still show at the whole weave; they are simply
              not this bench's business. */}
        </div>
      </div>
    </>
  )
}
