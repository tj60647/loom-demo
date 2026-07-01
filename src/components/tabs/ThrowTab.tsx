"use client"

import { useState, useEffect } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import type { Concept } from "@/lib/types"

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

export default function ThrowTab() {
  const { state, addEdge, editEdge, removeEdge, removeConcept, undoStack, setUndoStack, redoStack, setRedoStack } = useLoom()
  const [picks, setPicks] = useState<string[]>([]) // concept ids
  const [sentence, setSentence] = useState("")
  const [namingFor, setNamingFor] = useState<string | null>(null)
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
  }, [editEdge]);

  const togglePick = (id: string) => {
    if (picks.includes(id)) {
      setPicks(picks.filter(p => p !== id))
    } else {
      if (picks.length < 2) {
        setPicks([...picks, id])
      } else {
        // replace the second one
        setPicks([picks[0], id])
      }
    }
  }

  const handleDraw = () => {
    if (state.concepts.length < 2) return
    const shuffled = [...state.concepts].sort(() => 0.5 - Math.random())
    setPicks([shuffled[0].id, shuffled[1].id])
  }

  const handleSwap = () => {
    if (picks.length === 2) {
      setPicks([picks[1], picks[0]])
    }
  }

  const handleClearSlot = (index: number) => {
    const newPicks = [...picks]
    newPicks.splice(index, 1)
    setPicks(newPicks)
  }

  const handleThrow = async () => {
    if (picks.length !== 2 || !sentence) return
    await addEdge(picks[0], picks[1], sentence)
    setPicks([])
    setSentence("")
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

  const handleNameWord = (edgeId: string, word: string, previousValue: string | null) => {
    if (word !== previousValue) {
      setUndoStack(prev => [...prev, { edgeId, from: previousValue, to: word }]);
      setRedoStack([]);
      editEdge(edgeId, { handle: word });
    }
    setNamingFor(null);
    setMoreTongues(false);
  }

  const handleManualRename = (edgeId: string, word: string, previousValue: string | null) => {
    if (word !== previousValue) {
      setUndoStack(prev => [...prev, { edgeId, from: previousValue, to: word }]);
      setRedoStack([]);
      editEdge(edgeId, { handle: word });
    }
  }

  const handleResetRename = (edgeId: string, previousValue: string | null) => {
    if (previousValue !== null && previousValue !== "") {
      setUndoStack(prev => [...prev, { edgeId, from: previousValue, to: null }]);
      setRedoStack([]);
      editEdge(edgeId, { handle: "" });
    }
    setNamingFor(null);
    setMoreTongues(false);
  }

  const c1 = state.concepts.find(c => c.id === picks[0])
  const c2 = state.concepts.find(c => c.id === picks[1])

  return (
    <div className="two">
      <div className="card">
        <h2>The warp <span className="n">{state.concepts.length}</span></h2>
        <p className="do">Tap two of your concepts to connect them.</p>
        <p className="hint">These are the concepts you made on <b>01 — Open</b>. Tap one, then a second.</p>
        
        <div className="scrollbox">
          {state.concepts.map(c => {
            const isPicked = picks.includes(c.id)
            const pickedIndex = picks.indexOf(c.id)
            return (
              <div 
                key={c.id} 
                className={`crow ${isPicked ? "picked" : ""}`}
                onClick={() => togglePick(c.id)}
              >
                <div className="clabel">{c.label}</div>
                {isPicked && <div className="pickedtag">PICK {pickedIndex + 1}</div>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h2>Throw a thread</h2>
        <p className="hint calm">When two are picked, say how they hang together — long and awkward is fine. The sentence <i>is</i> the thread.</p>
        
        <div className="benchbar">
          <span className="cap">the pair</span>
          <button className="btn ghost mini" onClick={handleDraw} title="chance picks two threads you'd never elect — you do all the judging">
            ⤳ let the shuttle draw
          </button>
        </div>
        
        <div className="slots">
          <div className={`slot ${c1 ? "filled" : ""}`}>
            <span className="cap">From</span>
            {c1 ? (
              <>
                <span className="clear" onClick={() => handleClearSlot(0)}>✕</span>
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
                <span className="clear" onClick={() => handleClearSlot(1)}>✕</span>
                {c2.label}
              </>
            ) : <span className="ph">pick on left</span>}
          </div>
        </div>

        {picks.length < 2 ? (
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
            <button className="btn" onClick={handleThrow} disabled={!sentence}>Throw it</button>
            <p className="ghostnote" style={{marginTop: "7px"}}>Thrown threads land below — name each one when you like (optional).</p>
          </div>
        )}

        <h3 style={{fontFamily: "var(--display)", fontSize: "17px", borderBottom: "1px solid var(--rule)", paddingBottom: "5px", margin: "18px 0 6px"}}>
          Threads thrown <span className="n" style={{fontFamily: "var(--mono)", fontSize: "11px", color: "var(--grey)"}}>{state.edges.length}</span>
        </h3>
        
        <div className="scrollbox">
          {state.edges.slice().reverse().map(e => {
            const fromC = state.concepts.find(c => c.id === e.fromId)
            const toC = state.concepts.find(c => c.id === e.toId)
            if (!fromC || !toC) return null

            return (
              <div key={e.id} className="thread">
                <div className="trip">
                  {fromC.label} <span className="v">{e.handle || "→"}</span> {toC.label}
                </div>
                <div className="sent">{e.sentence}</div>
                <div className="tmeta" style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginTop: "6px" }}>
                  <span 
                    className="rm" 
                    onClick={() => {
                      if (window.confirm("Are you sure you want to remove this thread?")) {
                        removeEdge(e.id);
                      }
                    }} 
                    style={{ cursor: "pointer", marginTop: "2px" }}
                  >remove</span>
                  
                  {namingFor === e.id ? (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input 
                          placeholder="short handle (optional verb)" 
                          defaultValue={e.handle ?? ""}
                          onBlur={(ev) => handleManualRename(e.id, ev.target.value, e.handle)}
                          style={{
                            fontFamily: "var(--mono)", fontSize: "10px", padding: "4px 6px", border: "1px solid var(--rule)", borderRadius: "3px", width: "100%", maxWidth: "200px"
                          }}
                          autoFocus
                        />
                        <span 
                          onClick={() => handleResetRename(e.id, e.handle)}
                          style={{ fontFamily: "var(--mono)", fontSize: "10px", color: "var(--ink-soft)", cursor: "pointer" }}
                        >reset</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--ink-soft)", margin: "7px 0 4px" }}>
                        Stuck for a word? Tap an everyday suggestion — or open <b style={{color: "var(--ink)", fontWeight: 500}}>more tongues</b> for other fields' vocabularies:
                      </div>
                      <div className="chips" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {REGISTERS[0].verbs.map(v => (
                          <span 
                            key={v} 
                            onClick={() => handleNameWord(e.id, v, e.handle)}
                            style={{
                              fontFamily: "var(--mono)", fontSize: "12px", background: "#fff", border: "1px solid var(--rule)", 
                              borderRadius: "12px", padding: "3px 9px", cursor: "pointer", color: "var(--sage)"
                            }}
                          >{v}</span>
                        ))}
                      </div>
                      
                      <div 
                        onClick={() => setMoreTongues(!moreTongues)}
                        style={{
                          fontFamily: "var(--mono)", fontSize: "11px", letterSpacing: ".04em", color: "var(--sage)", 
                          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", margin: "8px 0 2px", userSelect: "none"
                        }}
                      >
                        <span style={{ display: "inline-block", transition: "transform .15s", transform: moreTongues ? "rotate(90deg)" : "none" }}>▸</span> 
                        more tongues
                      </div>
                      
                      {moreTongues && REGISTERS.slice(1).map(r => (
                        <div key={r.id} style={{ marginTop: "8px" }}>
                          <span className="cap" style={{ fontFamily: "var(--mono)", fontSize: "10px", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--grey)" }}>
                            {r.name} · {r.tag}
                          </span>
                          <div className="chips" style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {r.verbs.map(v => (
                              <span 
                                key={v} 
                                onClick={() => handleNameWord(e.id, v, e.handle)}
                                style={{
                                  fontFamily: "var(--mono)", fontSize: "12px", background: "#fff", border: "1px solid var(--rule)", 
                                  borderRadius: "12px", padding: "3px 9px", cursor: "pointer", color: "var(--lav)"
                                }}
                              >{v}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span 
                        onClick={() => setNamingFor(e.id)}
                        style={{
                          fontFamily: "var(--mono)", fontSize: "10px", color: "var(--sage)", cursor: "pointer", letterSpacing: ".04em", textDecoration: "underline", marginTop: "2px"
                        }}
                      >
                        {e.handle ? "rename" : "name it"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
