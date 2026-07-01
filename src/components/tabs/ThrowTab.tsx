"use client"

import { useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import type { Concept } from "@/lib/types"

export default function ThrowTab() {
  const { state, addEdge, editEdge, removeEdge, removeConcept } = useLoom()
  const [picks, setPicks] = useState<string[]>([]) // concept ids
  const [sentence, setSentence] = useState("")

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
                <div className="tmeta">
                  <span className="rm" onClick={() => removeEdge(e.id)}>remove</span>
                  <input 
                    placeholder="short handle (optional verb)" 
                    defaultValue={e.handle ?? ""}
                    onBlur={(ev) => editEdge(e.id, { handle: ev.target.value })}
                    style={{
                      fontFamily: "var(--mono)", fontSize: "10px", padding: "2px 6px", border: "1px solid var(--rule)", borderRadius: "3px"
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
