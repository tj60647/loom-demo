"use client"

import { useLoom } from "@/components/providers/LoomProvider"
import { useState } from "react"
import type { Concept, Edge } from "@/lib/types"
import ClothMap from "@/components/svg/ClothMap"

export default function ReadTab() {
  const { state, setRead } = useLoom()
  const [readSel, setReadSel] = useState<{type: "concept" | "edge" | "hub", id?: string, ids?: string[], promptIdx?: number} | null>(null)

  const degreeOf = (cid: string) => state.edges.filter(e => e.fromId === cid || e.toId === cid).length

  // Generate prompts
  const getAdjacency = () => {
    const adj: Record<string, Edge[]> = {}
    state.edges.forEach(e => {
      (adj[e.fromId] = adj[e.fromId] || []).push(e);
      (adj[e.toId] = adj[e.toId] || []).push(e);
    })
    return adj
  }

  const getComponentOf = (cid: string, adj: Record<string, Edge[]>) => {
    const nodes = new Set([cid])
    const q = [cid]
    const edges: Edge[] = []
    const seenE = new Set<string>()

    while(q.length) {
      const id = q.shift()!
      ;(adj[id] || []).forEach(e => {
        if (!seenE.has(e.id)) {
          seenE.add(e.id)
          edges.push(e)
        }
        [e.fromId, e.toId].forEach(o => {
          if (!nodes.has(o)) {
            nodes.add(o)
            q.push(o)
          }
        })
      })
    }
    return { nodes, edges }
  }

  const getAllComponents = () => {
    const adj = getAdjacency()
    const seen = new Set<string>()
    const comps: {nodes: Set<string>, edges: Edge[]}[] = []
    
    state.concepts.forEach(c => {
      if (seen.has(c.id) || !(adj[c.id] || []).length) return
      const comp = getComponentOf(c.id, adj)
      comp.nodes.forEach(x => seen.add(x))
      comps.push(comp)
    })
    return comps.sort((a,b) => b.nodes.size - a.nodes.size)
  }

  const readPrompts: any[] = []
  if (state.concepts.length > 0) {
    const comps = getAllComponents()
    const degs = state.concepts.map(c => ({c, d: degreeOf(c.id)})).filter(o => o.d > 0).sort((a,b) => b.d - a.d)

    if (comps.length && comps[0].edges.length >= 2) {
      const main = comps[0]
      const rep = [...main.nodes][0]
      readPrompts.push({
        key: 'the spine', rep: rep, gap: false,
        q: `Your largest weave links <b>${main.nodes.size} concepts</b> across <b>${main.edges.length} threads</b>. Pull it — it already makes an argument.`,
        move: 'trace the spine →'
      })
    }

    if (degs.length) {
      const top = degs[0]
      const tied = degs.filter(o => o.d === top.d).slice(0, 2)
      const names = tied.map(o => `<b>${o.c.label}</b>`).join(' and ')
      readPrompts.push({
        key: 'the centre', rep: top.c.id, repHub: tied.map(o => o.c.id), gap: false,
        q: `${tied.length > 1 ? 'Two concepts carry' : 'One concept carries'} the most threads (${top.d}): ${names}. Your cloth keeps returning to ${tied.length > 1 ? 'them' : 'it'} — ${tied.length > 1 ? 'are they' : 'is it'} the core?`,
        move: 'trace the centre →'
      })
    }

    const islands = comps.slice(1)
    const unwoven = state.concepts.filter(c => degreeOf(c.id) === 0)
    
    if (islands.length) {
      const isl = islands[0]
      const names = [...isl.nodes].map(id => state.concepts.find(c => c.id === id)).filter(Boolean)
      readPrompts.push({
        key: 'the gap', rep: [...isl.nodes][0], gap: true,
        q: `<b>${names.map(c => c!.label).join('</b> and <b>')}</b> tie to each other but to nothing else. The sharpest question on the cloth: should they?`,
        move: 'note the question →'
      })
    } else if (unwoven.length) {
      readPrompts.push({
        key: 'the gap', rep: unwoven[0].id, gap: true,
        q: `<b>${unwoven[0].label}</b>${unwoven.length > 1 ? ` and ${unwoven.length - 1} other${unwoven.length - 1 !== 1 ? 's' : ''}` : ''} cross nothing yet — warp with no weft. The sharpest question: where ${unwoven.length > 1 ? 'do they' : 'does it'} belong?`,
        move: 'note the question →'
      })
    }
  }

  const handlePromptClick = (p: any, idx: number) => {
    if (p.repHub) {
      setReadSel({ type: "hub", ids: p.repHub, promptIdx: idx })
    } else if (p.rep) {
      setReadSel({ type: "concept", id: p.rep, promptIdx: idx })
    }
  }

  return (
    <>
      <p className="tasktitle">Read the whole cloth.</p>
      <p className="tasksub">What argument runs through it? What does it keep returning to? What's missing? The cloth shows you where to look — the reading is yours to write.</p>
      
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
          <h2>What the cloth shows you <span className="n">counted, not judged</span></h2>
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
                <div className="pq" dangerouslySetInnerHTML={{__html: p.q}}></div>
                {p.move && <span className="pm">{p.move}</span>}
              </div>
            ))}
          </div>
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
          />
        </div>
      </div>
    </>
  )
}
