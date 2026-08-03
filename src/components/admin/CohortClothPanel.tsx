"use client"

// The cohort map with its material laid out. Mirrors the student's 03 · Read
// pane — the cloth on top, what is selected read out beneath it — but where
// the student weaves a read, the instructor inspects the weaving: a concept
// opens the bytes behind it, an arc opens its thread, and the full concept
// and thread lists sit below the map. Every quote and sentence is shown as
// the student's own, with attribution — counted and quoted, never judged.

import { useMemo, useState } from "react"
import ClothMap from "@/components/svg/ClothMap"
import type { Byte, Edge, LoomState } from "@/lib/types"

type ReadSel = { type: "concept" | "edge" | "hub"; id?: string; ids?: string[] } | null

export default function CohortClothPanel({
  state,
  names,
}: {
  state: LoomState
  /** userId → display name, for attributing concepts, bytes, and threads. */
  names: Record<string, string>
}) {
  const [readSel, setReadSel] = useState<ReadSel>(null)

  const conceptById = useMemo(
    () => new Map(state.concepts.map((c) => [c.id, c])),
    [state.concepts]
  )
  const bytesByConcept = useMemo(() => {
    const map = new Map<string, Byte[]>()
    state.bytes.forEach((b) => {
      const list = map.get(b.conceptId) ?? []
      list.push(b)
      map.set(b.conceptId, list)
    })
    return map
  }, [state.bytes])

  const who = (userId: string) => names[userId] ?? "unknown"

  const selectConcept = (id: string) => {
    setReadSel(readSel?.type === "concept" && readSel.id === id ? null : { type: "concept", id })
  }
  const selectEdge = (id: string) => {
    setReadSel(readSel?.type === "edge" && readSel.id === id ? null : { type: "edge", id })
  }

  const byteQuote = (b: Byte) => (
    <div key={b.id} className="bytequote">
      <span className="src">
        {who(b.userId)}
        {b.source ? ` · ${b.source}` : ""}
        {b.location ? ` · ${b.location}` : ""}
      </span>
      <br />
      {b.content}
    </div>
  )

  const threadTrip = (e: Edge) => {
    const from = conceptById.get(e.fromId)
    const to = conceptById.get(e.toId)
    return (
      <>
        <b>{from?.label ?? "?"}</b>{" "}
        {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">sentence</span>}{" "}
        <b>{to?.label ?? "?"}</b>
      </>
    )
  }

  // What is selected, read out under the map — the student idiom, admin-voiced.
  let pane = null
  if (readSel?.type === "concept" && readSel.id) {
    const concept = conceptById.get(readSel.id)
    if (concept) {
      const conceptBytes = bytesByConcept.get(concept.id) ?? []
      const crossings = state.edges.filter(
        (e) => e.fromId === concept.id || e.toId === concept.id
      )
      pane = (
        <div style={{ marginTop: "16px" }}>
          <div className="threadhead">
            <span className="red">{concept.label}</span>
            <span className="n">
              {" "}· {who(concept.userId)} · {crossings.length} crossing{crossings.length !== 1 ? "s" : ""} ·{" "}
              {conceptBytes.length} byte{conceptBytes.length !== 1 ? "s" : ""}
            </span>
          </div>
          {concept.def ? <p className="cardmenudef">{concept.def}</p> : null}

          <span className="cap" style={{ display: "block", marginTop: "8px" }}>
            the passages behind it
          </span>
          {conceptBytes.length === 0 ? (
            <p className="ghostnote" style={{ color: "var(--red)" }}>
              No evidence — this concept traces to no captured passage yet.
            </p>
          ) : (
            conceptBytes.map(byteQuote)
          )}

          {crossings.length > 0 && (
            <>
              <span className="cap" style={{ display: "block", marginTop: "10px" }}>
                the threads through it
              </span>
              {crossings.map((e) => (
                <div key={e.id} className="readitem" style={{ cursor: "pointer" }} onClick={() => selectEdge(e.id)}>
                  <div className="trip">{threadTrip(e)}</div>
                  <div className="sent">&ldquo;{e.sentence}&rdquo;</div>
                </div>
              ))}
            </>
          )}
        </div>
      )
    }
  } else if (readSel?.type === "edge" && readSel.id) {
    const edge = state.edges.find((e) => e.id === readSel.id)
    if (edge) {
      const ends = [conceptById.get(edge.fromId), conceptById.get(edge.toId)].filter(
        (c): c is NonNullable<typeof c> => Boolean(c)
      )
      pane = (
        <div style={{ marginTop: "16px" }}>
          <div className="threadhead">
            <span className="red">{ends[0]?.label ?? "?"}</span>{" "}
            {edge.handle ? <span className="vpill">{edge.handle}</span> : <span className="vpill loosev">sentence</span>}{" "}
            <span className="red">{ends[1]?.label ?? "?"}</span>
            <span className="n"> · {who(edge.userId)}</span>
          </div>
          <p style={{ fontSize: "15.5px", fontStyle: "italic", margin: "8px 0 14px" }}>
            &ldquo;{edge.sentence}&rdquo;
          </p>
          {ends.map((c) => (
            <div key={c.id} style={{ marginBottom: "16px" }}>
              <div className="label" style={{ marginTop: "8px" }}>{c.label}</div>
              {c.def ? (
                <div style={{ fontSize: "13.5px", color: "var(--ink-soft)" }}>{c.def}</div>
              ) : null}
              {(bytesByConcept.get(c.id) ?? []).map(byteQuote)}
            </div>
          ))}
        </div>
      )
    }
  } else {
    pane = (
      <p className="empty" style={{ marginTop: "16px" }}>
        Click a concept to open the passages behind it, or an arc to read its thread.
      </p>
    )
  }

  return (
    <>
      <div className="card">
        <div className="mapbar">
          <span className="label">The collective cloth</span>
          <span style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
            {state.concepts.length} concepts, {state.edges.length} threads, {state.bytes.length} bytes.
            Click a concept to open its bytes; click an arc to read the thread.
          </span>
        </div>
        <div id="mapWrap">
          <ClothMap state={state} readSel={readSel} setReadSel={setReadSel} />
        </div>
        {pane}
      </div>

      <div className="two" style={{ marginTop: "22px" }}>
        <div className="card">
          <h2>
            Concepts <span className="n">{state.concepts.length}</span>
          </h2>
          <p className="hint">
            Every concept in the cohort&apos;s weave, in map order. Click one to light it on the
            cloth and open the passages behind it.
          </p>
          {state.concepts.length === 0 ? (
            <p className="empty">Nothing woven yet.</p>
          ) : (
            <div className="scrollbox">
              {state.concepts.map((c) => {
                const count = bytesByConcept.get(c.id)?.length ?? 0
                return (
                  <div
                    key={c.id}
                    className={`crow${readSel?.type === "concept" && readSel.id === c.id ? " picked" : ""}`}
                    onClick={() => selectConcept(c.id)}
                  >
                    <span className="clabel">{c.label}</span>
                    <span className="cap" style={{ whiteSpace: "nowrap" }}>
                      {who(c.userId)} · {count} byte{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            Threads <span className="n">{state.edges.length}</span>
          </h2>
          <p className="hint">
            Every thread thrown across the cohort — each in its student&apos;s own sentence. Click
            one to trace it on the cloth.
          </p>
          {state.edges.length === 0 ? (
            <p className="empty">Nothing thrown yet.</p>
          ) : (
            <div className="scrollbox">
              {state.edges.map((e) => (
                <div
                  key={e.id}
                  className={`thread${readSel?.type === "edge" && readSel.id === e.id ? " sel" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => selectEdge(e.id)}
                >
                  <div className="trip">{threadTrip(e)}</div>
                  <div className="sent">&ldquo;{e.sentence}&rdquo;</div>
                  <div className="tmeta">
                    <span className="cap">{who(e.userId)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
