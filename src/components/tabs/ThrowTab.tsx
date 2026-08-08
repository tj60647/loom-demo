"use client"

import { useState, useEffect, useRef } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import { useDialog } from "@/components/providers/DialogProvider"
import { isWholeWeave, readingsOf } from "@/lib/scope"
import { sortedByLabel } from "@/lib/utils"
import { short } from "@/lib/clothMath"

const PLAIN_VERBS = ['leads to','depends on','is part of','goes against','is the same as','sets up'];

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
 * The cloth's own card — Cloth Title and Cloth Description, edited where the
 * model homes them (Linking). Folded: the bench is this tab's work; the cloth
 * is its name. Saving here is also how a cloth begun from the shelf's Create
 * Cloth button gets its title — the shelf card shows both.
 */
function ClothFold() {
  const { activeCloth, updateCloth, isLoading, scope, flash } = useLoom()
  const wholeWeave = isWholeWeave(scope)
  const [title, setTitle] = useState(activeCloth?.title ?? "")
  const [description, setDescription] = useState(activeCloth?.description ?? "")
  const [busy, setBusy] = useState(false)

  // Reseed the drafts when the underlying row changes identity — on load, and
  // when a first save swaps the optimistic row for the server's. Keying on the
  // id keeps a keystroke from being clobbered by the save it caused.
  const seededId = useRef<string | null>(activeCloth?.id ?? null)
  useEffect(() => {
    const id = activeCloth?.id ?? null
    if (id !== seededId.current) {
      seededId.current = id
      setTitle(activeCloth?.title ?? "")
      setDescription(activeCloth?.description ?? "")
    }
  }, [activeCloth])

  const dirty =
    title !== (activeCloth?.title ?? "") || description !== (activeCloth?.description ?? "")

  const save = async () => {
    if (busy || !dirty) return
    setBusy(true)
    try {
      const ok = await updateCloth({ title, description })
      if (ok) flash("cloth saved")
    } finally {
      setBusy(false)
    }
  }

  const shownTitle = (activeCloth?.title ?? "").trim()
  return (
    <details className="card invitefold" style={{ marginBottom: 14 }}>
      <summary>
        <span className="tw">▸</span>
        <h2>
          {wholeWeave ? "The whole weave's cloth" : "This cloth"}{" "}
          {!isLoading && (
            <span className="n">{shownTitle ? `— “${short(shownTitle, 60)}”` : "— untitled"}</span>
          )}
        </h2>
      </summary>
      <p className="hint" style={{ marginTop: 10 }}>
        {wholeWeave
          ? "A title and a short interpretation for everything at once — every reading, one cloth."
          : "Your work on this reading, under your own name for it. The title is a sentence or headline — yours, not the reading's — and both show on the reading's card in the Library."}
      </p>
      <div className="form-row">
        <span className="label">Cloth Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="a sentence or headline — what your reading of it says"
          maxLength={200}
        />
      </div>
      <div className="form-row">
        <span className="label">Cloth Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={wholeWeave ? "your short interpretation, across the readings" : "your short interpretation of the reading"}
        />
      </div>
      <button className="btn mini" onClick={save} disabled={busy || !dirty}>
        {busy ? "Saving…" : "Save cloth"}
      </button>
    </details>
  )
}

export default function ThrowTab() {
  // Scoped for what this reading is about; whole for anything that has to be
  // TRUE. A thread that runs out of this reading has one end outside it, so
  // label lookups and the evidence check both read the whole graph.
  const { state, scoped, scope, addEdge, editEdge, removeEdge, flash, setUndoStack, setRedoStack } = useLoom()
  const { titleOf } = useReadings()
  const { confirm, notify } = useDialog()
  const [pairA, setPairA] = useState<string | null>(null)
  const [pairB, setPairB] = useState<string | null>(null)
  const [drawn, setDrawn] = useState(false)
  const [sentence, setSentence] = useState("")
  const [namingFor, setNamingFor] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [showOutside, setShowOutside] = useState(false)
  const [outsideFilter, setOutsideFilter] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)

  // A tapped suggestion is a starting point, not the answer — return focus to
  // the field (v14 did the same) so the student can edit it into their own word.
  const pickWord = (word: string) => {
    setNameDraft(word)
    nameInputRef.current?.focus()
  }

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
            editEdge(action.edgeId, { handle: action.to ?? undefined });
            setUndoStack(prevUndo => [...prevUndo, action]);
            return prevRedo.slice(0, -1);
          });
        } else {
          // Undo
          setUndoStack(prevUndo => {
            if (prevUndo.length === 0) return prevUndo;
            const action = prevUndo[prevUndo.length - 1];
            editEdge(action.edgeId, { handle: action.from ?? undefined });
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
          editEdge(action.edgeId, { handle: action.to ?? undefined });
          setUndoStack(prevUndo => [...prevUndo, action]);
          return prevRedo.slice(0, -1);
        });
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editEdge, setRedoStack, setUndoStack]);

  // Whole-graph: a concept evidenced in an earlier reading is not evidence-less
  // just because this reading has not quoted it.
  const bytesOf = (conceptId: string) => state.bytes.filter(b => b.conceptIds.includes(conceptId))
  const conceptById = (id: string) => state.concepts.find(c => c.id === id)

  const togglePick = (id: string) => {
    if (pairA === id) setPairA(null)
    else if (pairB === id) setPairB(null)
    else if (!pairA) setPairA(id)
    else if (!pairB) setPairB(id)
    else setPairB(id)
    setDrawn(false)
  }

  // The shuttle draws inside this reading by default; `across` opens it to the
  // whole graph once another reading has concepts. Chance picks the pair —
  // every judgment about whether they cross is still the student's.
  const drawPair = async (across = false) => {
    const cs = across ? state.concepts : scoped.concepts
    if (cs.length < 2) {
      await notify({
        title: "Not enough warp yet.",
        body: across
          ? "Lay at least two concepts, then the shuttle has something to draw between."
          : "Lay at least two concepts in this reading on 01 · Open, then the shuttle has something to draw between.",
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
    flash('thread thrown — coin a label for it below, when you like')
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

  const handleSaveName = (edgeId: string, previousValue: string | null) => {
    const h = nameDraft.trim()
    if (h !== (previousValue ?? "")) {
      setUndoStack(prev => [...prev, { edgeId, from: previousValue, to: h }]);
      setRedoStack([]);
      editEdge(edgeId, { handle: h });
    }
    setNamingFor(null);
    flash(h ? 'label coined' : 'left as a description');
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
  const orderedBridges = [...scoped.bridges].sort(byNamed)
  const wholeWeave = isWholeWeave(scope)

  // Concepts from the student's other readings, reachable and searchable but
  // out of the way. Never removed: threading this reading to an earlier one is
  // the move weeks 6-13 are built on.
  // Both bands are lists you SEARCH for a concept to pick, so both are A-Z.
  const warp = sortedByLabel(scoped.concepts)
  const outside = sortedByLabel(
    outsideFilter.trim()
      ? scoped.outside.filter(c => c.label.toLowerCase().includes(outsideFilter.trim().toLowerCase()))
      : scoped.outside
  )

  const conceptRow = (c: typeof state.concepts[number], fromElsewhere: boolean) => {
    const isPicked = pairA === c.id || pairB === c.id
    const noev = bytesOf(c.id).length === 0
    const where = fromElsewhere ? readingsOf(c.id, state.bytes).map(titleOf) : []
    return (
      <div
        key={c.id}
        className={`crow ${isPicked ? "picked" : ""}`}
        onClick={() => togglePick(c.id)}
        title={fromElsewhere ? "evidenced in another reading — tap to thread it to this one" : "tap to load into the bench"}
      >
        <div className="clabel">
          {c.label}
          {where.length > 0 && <span className="fromwhere">{where.join(" · ")}</span>}
        </div>
        {isPicked
          ? <div className="pickedtag">PICK {pairA === c.id ? 1 : 2}</div>
          : (noev && <div className="pickedtag" style={{ color: "var(--red)" }} title="no captured passage — every concept should trace to a passage">no evidence</div>)}
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
    // On a bridge, name the reading the far end came from — otherwise the row
    // reads as an unexplained stranger among this reading's concepts.
    const inScope = new Set(scoped.concepts.map(c => c.id))
    const far = !wholeWeave
      ? [e.fromId, e.toId].find(id => !inScope.has(id))
      : undefined
    const farWhere = far ? readingsOf(far, state.bytes).map(titleOf) : []

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
          {farWhere.length > 0 && <span className="pill">from {farWhere.join(" · ")}</span>}
          <span className="act" onClick={() => toggleNamer(e.id, e.handle)}>
            {sel ? 'close' : (e.handle ? 'edit label' : 'coin a label')}
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
            <div className="rnote"><b>Coin a label</b> (optional) — you&apos;ve already said how they relate; a short word lets this <i>kind</i> of link recur across your weave.</div>
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
      <div className="rail">
        {['pick', 'pick', 'say', 'throw'].map((label, r) => (
          <span key={r} style={{ display: 'contents' }}>
            {r > 0 && <span className="rsep">·</span>}
            <span className={`rstep ${r === railN ? 'now' : ''} ${r < railN ? 'done' : ''}`}>{label}</span>
          </span>
        ))}
      </div>
      <ClothFold />
      <div className="two">
        <div className="card">
          <h2>The warp <span className="n">{scoped.concepts.length ? `(${scoped.concepts.length})` : ''}</span></h2>
          <p className="do">{doLine}</p>
          <p className="hint">
            {wholeWeave
              ? <>Every concept you have made, across all your readings. Tap one, then a second.</>
              : <>The concepts this reading evidences. Tap one, then a second — or reach into another reading below, which is how a thread comes to run between texts.</>}
          </p>

          <div className="scrollbox">
            {warp.length === 0 ? (
              <EmptyState caption="lay some warp on 01 — open first" />
            ) : warp.map(c => conceptRow(c, false))}

            {scoped.outside.length > 0 && (
              <div className="outsideband">
                <button
                  type="button"
                  className={`bandtoggle ${showOutside ? "open" : ""}`}
                  aria-expanded={showOutside}
                  onClick={() => setShowOutside(v => !v)}
                >
                  <span className="tw">▸</span> from your other readings
                  <span className="n">({scoped.outside.length})</span>
                </button>
                {showOutside && (
                  <>
                    <div className="quietrow" style={{ padding: "6px 10px" }}>
                      <input
                        value={outsideFilter}
                        onChange={e => setOutsideFilter(e.target.value)}
                        placeholder="find a concept from another reading…"
                      />
                    </div>
                    {outside.length === 0
                      ? <p className="ghostnote" style={{ padding: "0 10px 10px" }}>nothing by that name.</p>
                      : outside.map(c => conceptRow(c, true))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Throw a thread</h2>
          <p className="hint calm">When two are picked, say how they hang together — long and awkward is fine. The description <i>is</i> the thread. A good check: does it read aloud as a claim you&apos;d defend in section?</p>

          <div className="benchbar">
            <span className="cap">the pair</span>
            {/* Wrapped, not passed by reference: the click event would arrive
                as `across` and turn every draw into a cross-reading one. */}
            <button className="btn ghost mini" onClick={() => drawPair()} title="chance picks two threads you'd never elect — you do all the judging">
              ⤳ let the shuttle draw
            </button>
            {!wholeWeave && scoped.outside.length > 0 && (
              <button
                className="btn ghost mini"
                onClick={() => drawPair(true)}
                title="chance reaches into your other readings too — you still do all the judging"
              >
                ⤳ across readings
              </button>
            )}
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
            <button className="btn" onClick={handleThrow} disabled={!both}>Throw it</button>
            {/* The sentence is encouraged, never required (P0.3) — the note
                coaches toward it instead of the button withholding the throw. */}
            <p className="ghostnote" style={{marginTop: "7px"}}>
              {sent
                ? "Thrown threads land below. When a relationship recurs, coin a short label for it (optional) — that's how your vocabulary grows."
                : "Say how they hang together — however awkwardly. The description is the thread, and you can throw now and write it later."}
            </p>
          </div>

          <h3 style={{fontFamily: "var(--display)", fontSize: "17px", borderBottom: "1px solid var(--rule)", paddingBottom: "5px", margin: "18px 0 6px"}}>
            {wholeWeave ? "Threads thrown" : "Threads in this reading"}
            {' '}
            <span className="n" style={{fontFamily: "var(--mono)", fontSize: "11px", color: "var(--grey)"}}>{orderedEdges.length ? `(${orderedEdges.length})` : ''}</span>
          </h3>

          <div className="scrollbox">
            {orderedEdges.length === 0 ? (
              <EmptyState caption="nothing thrown yet — pick, pick, say" />
            ) : orderedEdges.map(threadRow)}
          </div>

          {/* Bridges are the point of the back half of the term, so they get
              their own band and their own count rather than being filtered out
              of sight. Counted, never judged. */}
          {!wholeWeave && orderedBridges.length > 0 && (
            <>
              <h3 style={{fontFamily: "var(--display)", fontSize: "17px", borderBottom: "1px solid var(--rule)", paddingBottom: "5px", margin: "18px 0 6px"}}>
                Threads that run out of this reading{' '}
                <span className="n" style={{fontFamily: "var(--mono)", fontSize: "11px", color: "var(--grey)"}}>({orderedBridges.length})</span>
              </h3>
              <p className="hint">Each of these ties a concept here to one you met in another text. They belong to both readings and show up in either.</p>
              <div className="scrollbox">
                {orderedBridges.map(threadRow)}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
