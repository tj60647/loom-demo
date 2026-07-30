"use client"

import { useState, useEffect } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { short } from "@/lib/clothMath"

const REGISTERS = [
  {id:'plain',   name:'Plain',          tag:'everyday',          verbs:['leads to','depends on','is part of','goes against','is the same as','sets up']},
  {id:'argue',   name:'Argument',       tag:'logic & claims',    verbs:['presupposes','contradicts','exemplifies','entails','qualifies','generalizes']},
  {id:'system',  name:'Cause & system', tag:'forces & feedback', verbs:['drives','constrains','bottlenecks','damps','feeds back into','is upstream of']},
  {id:'design',  name:'Design & making',tag:'craft & use',       verbs:['affords','scaffolds','reframes','trades off against','operationalizes','prototypes']},
  {id:'practice',name:'Practice & power',tag:'people & norms',   verbs:['legitimizes','governs','mediates','enacts','situates','negotiates']},
  {id:'stance',  name:'Stance & value', tag:'orientation',       verbs:['honors','resists','mourns','inherits from','answers','betrays']},
];

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

export default function ThrowTab() {
  const { state, addEdge, editEdge, removeEdge, flash, setUndoStack, setRedoStack } = useLoom()
  const [pairA, setPairA] = useState<string | null>(null)
  const [pairB, setPairB] = useState<string | null>(null)
  const [drawn, setDrawn] = useState(false)
  const [sentence, setSentence] = useState("")
  const [namingFor, setNamingFor] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [moreTongues, setMoreTongues] = useState(false)

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

  const bytesOf = (conceptId: string) => state.bytes.filter(b => b.conceptId === conceptId)

  const togglePick = (id: string) => {
    if (pairA === id) setPairA(null)
    else if (pairB === id) setPairB(null)
    else if (!pairA) setPairA(id)
    else if (!pairB) setPairB(id)
    else setPairB(id)
    setDrawn(false)
  }

  const drawPair = () => {
    const cs = state.concepts
    if (cs.length < 2) { alert('Lay at least two concepts on 01 — Open first.'); return }
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
    if (!pairA || !pairB || !sentence.trim()) return
    await addEdge(pairA, pairB, sentence.trim())
    setPairA(null)
    setPairB(null)
    setDrawn(false)
    setSentence("")
    flash('thread thrown — coin a term for it below, when you like')
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
    setMoreTongues(false)
  }

  const handleSaveName = (edgeId: string, previousValue: string | null) => {
    const h = nameDraft.trim()
    if (h !== (previousValue ?? "")) {
      setUndoStack(prev => [...prev, { edgeId, from: previousValue, to: h }]);
      setRedoStack([]);
      editEdge(edgeId, { handle: h });
    }
    setNamingFor(null);
    setMoreTongues(false);
    flash(h ? 'term coined' : 'left as a sentence');
  }

  const c1 = state.concepts.find(c => c.id === pairA)
  const c2 = state.concepts.find(c => c.id === pairB)
  const both = !!(pairA && pairB && pairA !== pairB)
  const sent = sentence.trim()
  const railN = (!pairA && !pairB) ? 0 : (!both ? 1 : (!sent ? 2 : 3))
  const doLine = (!pairA && !pairB)
    ? 'Tap two of your concepts to connect them.'
    : (both ? 'Two picked — now say how they relate, on the right. →' : 'Good — now tap a second.')

  const orderedEdges = [...state.edges].sort((a, b) => ((a.handle ? 1 : 0) - (b.handle ? 1 : 0)))

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
      <div className="two">
        <div className="card">
          <h2>The warp <span className="n">{state.concepts.length ? `(${state.concepts.length})` : ''}</span></h2>
          <p className="do">{doLine}</p>
          <p className="hint">These are the concepts you made on <b>01 — Open</b>. Tap one, then a second.</p>

          <div className="scrollbox">
            {state.concepts.length === 0 ? (
              <EmptyState caption="lay some warp on 01 — open first" />
            ) : state.concepts.map(c => {
              const isPicked = pairA === c.id || pairB === c.id
              const noev = bytesOf(c.id).length === 0
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
                    : (noev && <div className="pickedtag" style={{ color: "var(--red)" }} title="no captured passage — every concept should trace to a byte">no evidence</div>)}
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <h2>Throw a thread</h2>
          <p className="hint calm">When two are picked, say how they hang together — long and awkward is fine. The sentence <i>is</i> the thread. A good check: does it read aloud as a claim you&apos;d defend in section?</p>

          <div className="benchbar">
            <span className="cap">the pair</span>
            <button className="btn ghost mini" onClick={drawPair} title="chance picks two threads you'd never elect — you do all the judging">
              ⤳ let the shuttle draw
            </button>
          </div>

          <div className="slots">
            <div className={`slot ${c1 ? "filled" : ""}`}>
              <span className="cap">From</span>
              {c1 ? (
                <>
                  <span className="clear" onClick={() => handleClearSlot('A')}>✕</span>
                  {c1.label}
                </>
              ) : <span className="ph">pick on left</span>}
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
              ) : <span className="ph">pick on left</span>}
            </div>
          </div>

          <div className="drawnote">{drawn && pairA && pairB ? 'the shuttle drew these — do they cross? “no crossing I can see” is a judgment too. draw again.' : ''}</div>

          {!both ? (
            <div className="sleeper asleep">
              <div className="sleepmsg">pick two concepts on the left — the bench wakes when the pair is loaded</div>
            </div>
          ) : (
            <div className="sleeper">
              <div className="form-row">
                <span className="label">The relationship, however awkwardly — your sentence</span>
                <div className="chips" style={{ margin: "2px 0 6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {OPENERS.map(o => (
                    <span
                      key={o}
                      className="openchip"
                      onClick={() => handleOpenerClick(o)}
                      style={{
                        fontFamily: "var(--body)", fontStyle: "italic", fontSize: "13.5px",
                        background: "#fff", border: "1px solid var(--rule)", borderRadius: "12px",
                        padding: "3px 11px", cursor: "pointer", color: "var(--ink-soft)"
                      }}
                    >
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
              <button className="btn" onClick={handleThrow} disabled={!sent}>Throw it</button>
              <p className="ghostnote" style={{marginTop: "7px"}}>Thrown threads land below. When a relationship recurs, coin a short term for it (optional) — that&apos;s how your vocabulary grows.</p>
            </div>
          )}

          <h3 style={{fontFamily: "var(--display)", fontSize: "17px", borderBottom: "1px solid var(--rule)", paddingBottom: "5px", margin: "18px 0 6px"}}>
            Threads thrown <span className="n" style={{fontFamily: "var(--mono)", fontSize: "11px", color: "var(--grey)"}}>{state.edges.length ? `(${state.edges.length})` : ''}</span>
          </h3>

          <div className="scrollbox">
            {state.edges.length === 0 ? (
              <EmptyState caption="nothing thrown yet — pick, pick, say" />
            ) : orderedEdges.map(e => {
              const fromC = state.concepts.find(c => c.id === e.fromId)
              const toC = state.concepts.find(c => c.id === e.toId)
              if (!fromC || !toC) return null
              const sel = namingFor === e.id

              return (
                <div key={e.id} className={`thread ${sel ? "sel" : ""}`}>
                  <div className="trip">
                    <b>{short(fromC.label, 30)}</b>{' '}
                    {e.handle
                      ? <span className="v">{e.handle}</span>
                      : <span className="v loosev">{short(e.sentence, 38)}</span>}{' '}
                    <b>{short(toC.label, 30)}</b>
                  </div>
                  <div className="sent">“{e.sentence}”</div>
                  <div className="tmeta">
                    {e.handle
                      ? <span className="pill beaten">term</span>
                      : <span className="pill loose">sentence</span>}
                    <span className="act" onClick={() => toggleNamer(e.id, e.handle)}>
                      {sel ? 'close' : (e.handle ? 'edit term' : 'coin a term')}
                    </span>
                    <span
                      className="rm"
                      onClick={() => {
                        if (window.confirm("Are you sure you want to remove this thread?")) {
                          if (namingFor === e.id) setNamingFor(null);
                          removeEdge(e.id);
                        }
                      }}
                    >remove</span>
                  </div>
                  {sel && (
                    <div className="distill">
                      <div className="rnote"><b>Coin a term</b> (optional) — you&apos;ve already said how they relate; a short word lets this <i>kind</i> of link recur across your weave.</div>
                      <div className="form-row" style={{ margin: "6px 0 8px" }}>
                        <input
                          className="tinput"
                          value={nameDraft}
                          onChange={(ev) => setNameDraft(ev.target.value)}
                          placeholder="your word… e.g. leads to · contradicts · is part of"
                          autoFocus
                        />
                      </div>
                      <div className="rnote">Stuck for a word? Tap an everyday suggestion — or open <b>more tongues</b> for other fields&apos; vocabularies:</div>
                      <div className="chips">
                        {REGISTERS[0].verbs.map(v => (
                          <span key={v} className="verbchip" onClick={() => setNameDraft(v)}>{v}</span>
                        ))}
                      </div>
                      <span
                        className={`distilltoggle ${moreTongues ? 'open' : ''}`}
                        style={{ marginTop: "8px" }}
                        onClick={() => setMoreTongues(!moreTongues)}
                      >
                        <span className="tw">▸</span> more tongues
                      </span>
                      {moreTongues && REGISTERS.slice(1).map(r => (
                        <div key={r.id} style={{ marginTop: "8px" }}>
                          <span className="cap">{r.name} · {r.tag}</span>
                          <div className="chips" style={{ marginTop: "4px" }}>
                            {r.verbs.map(v => (
                              <span key={v} className="verbchip borrowed" onClick={() => setNameDraft(v)}>{v}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div style={{ marginTop: "10px" }}>
                        <button className="btn mini" onClick={() => handleSaveName(e.id, e.handle)}>Save term</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
