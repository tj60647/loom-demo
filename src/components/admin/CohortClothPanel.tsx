"use client"

// The cohort map with its material laid out. Mirrors the student's 03 · Read
// pane — the cloth on top, what is selected read out beneath it — but where
// the student weaves a read, the instructor inspects the weaving: a concept
// opens the passages behind it, an arc opens its thread, and the full concept
// and thread lists sit below the map. Every quote and sentence is shown as
// the student's own, with attribution — counted and quoted, never judged.
//
// SINCE 2026-08-18 THE CHOOSING IS DONE FROM THE LISTS, not from the drawing
// (TJ: "all cloths hide/disable trace"). `readSel` still does everything it
// did — the read-out below, the lit row in each list — but the cloth no longer
// sets it, because setting it was tracing. The lists carry every concept and
// every thread, so nothing became unreachable; the copy on this page said
// "click a concept on the cloth" in four places and now says where to click.

import { useMemo, useState } from "react"
import ClothMap from "@/components/svg/ClothMap"
import type { Passage, LoomState } from "@/lib/types"
import ConceptName from "@/components/ui/ConceptName"
import ThreadCard from "@/components/cards/ThreadCard"
import { labelOf } from "@/lib/linkResolve"
import { conceptNameText } from "@/lib/conceptName"

type ReadSel = { type: "concept" | "edge" | "hub"; id?: string; ids?: string[] } | null

export default function CohortClothPanel({
  state,
  names,
}: {
  state: LoomState
  /** userId → display name, for attributing concepts, passages, and threads. */
  names: Record<string, string>
}) {
  const [readSel, setReadSel] = useState<ReadSel>(null)

  const conceptById = useMemo(
    () => new Map(state.concepts.map((c) => [c.id, c])),
    [state.concepts]
  )
  const passagesByConcept = useMemo(() => {
    const map = new Map<string, Passage[]>()
    state.passages.forEach((b) => {
      b.conceptIds.forEach((conceptId) => {
        const list = map.get(conceptId) ?? []
        list.push(b)
        map.set(conceptId, list)
      })
    })
    return map
  }, [state.passages])

  const who = (userId: string) => names[userId] ?? "unknown"

  const selectConcept = (id: string) => {
    setReadSel(readSel?.type === "concept" && readSel.id === id ? null : { type: "concept", id })
  }
  const selectEdge = (id: string) => {
    setReadSel(readSel?.type === "edge" && readSel.id === id ? null : { type: "edge", id })
  }

  const passageQuote = (b: Passage) => (
    <div key={b.id} className="passagequote">
      <span className="src">
        {who(b.userId)}
        {b.source ? ` · ${b.source}` : ""}
        {b.location ? ` · ${b.location}` : ""}
      </span>
      <br />
      {b.content}
    </div>
  )


  // What is selected, read out under the map — the student idiom, admin-voiced.
  let pane = null
  if (readSel?.type === "concept" && readSel.id) {
    const concept = conceptById.get(readSel.id)
    if (concept) {
      const conceptPassages = passagesByConcept.get(concept.id) ?? []
      const crossings = state.edges.filter(
        (e) => e.fromId === concept.id || e.toId === concept.id
      )
      pane = (
        <div style={{ marginTop: "16px" }}>
          <div className="threadhead">
            <span className="red">{conceptNameText(concept)}</span>
            <span className="n">
              {" "}· {who(concept.userId)} · {crossings.length} crossing{crossings.length !== 1 ? "s" : ""} ·{" "}
              {conceptPassages.length} passage{conceptPassages.length !== 1 ? "s" : ""}
            </span>
          </div>
          {concept.def ? <p className="cardmenudef">{concept.def}</p> : null}

          <span className="cap" style={{ display: "block", marginTop: "8px" }}>
            the passages behind it
          </span>
          {conceptPassages.length === 0 ? (
            <p className="ghostnote" style={{ color: "var(--red)" }}>
              No evidence — this concept traces to no captured passage yet.
            </p>
          ) : (
            conceptPassages.map(passageQuote)
          )}

          {crossings.length > 0 && (
            <>
              <span className="cap" style={{ display: "block", marginTop: "10px" }}>
                the threads through it
              </span>
              {/* The same card as the list below the map — these ARE those
                  threads, seen from one of their ends, and drawing them a
                  second way was how `.readitem` and `.thread` came to say the
                  same thing differently. */}
              {crossings.map((e) => (
                <ThreadCard
                  key={e.id}
                  thread={e}
                  from={conceptById.get(e.fromId)}
                  to={conceptById.get(e.toId)}
                  links={state.links}
                  by={who(e.userId)}
                  onSelect={() => selectEdge(e.id)}
                />
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
          {/* The pane's HEADING, not a card: it names what is being read out
              below it, in the red the panel uses for a selection, and the card
              for this same thread is already lit in the list. Its label is
              resolved the card's way though — `labelOf` first, the legacy
              `handle` only as a fallback — because a thread carrying a Link
              object and an empty handle used to read as unlabelled here. */}
          <div className="threadhead">
            <span className="red">{ends[0] ? conceptNameText(ends[0]) : "?"}</span>{" "}
            {labelOf(edge, state.links)
              ? <span className="vpill">{labelOf(edge, state.links)}</span>
              : <span className="vpill loosev">description</span>}{" "}
            <span className="red">{ends[1] ? conceptNameText(ends[1]) : "?"}</span>
            <span className="n"> · {who(edge.userId)}</span>
          </div>
          <p style={{ fontSize: "15.5px", fontStyle: "italic", margin: "8px 0 14px" }}>
            &ldquo;{edge.sentence}&rdquo;
          </p>
          {ends.map((c) => (
            <div key={c.id} style={{ marginBottom: "16px" }}>
              <div className="label" style={{ marginTop: "8px" }}><ConceptName concept={c} /></div>
              {c.def ? (
                <div style={{ fontSize: "13.5px", color: "var(--ink-soft)" }}>{c.def}</div>
              ) : null}
              {(passagesByConcept.get(c.id) ?? []).map(passageQuote)}
            </div>
          ))}
        </div>
      )
    }
  } else {
    pane = (
      <p className="empty" style={{ marginTop: "16px" }}>
        Pick a concept or a thread from the lists below to read it out here.
      </p>
    )
  }

  return (
    <>
      <div className="card">
        <div className="mapbar">
          <span className="label">The collective cloth</span>
          <span style={{ color: "var(--ink-soft)", fontSize: "13px" }}>
            {state.concepts.length} concepts, {state.edges.length} threads, {state.passages.length} passages.
            Pick a concept or a thread from the lists below to read it out here.
          </span>
        </div>
        <div id="mapWrap">
          {/* The drawing, and only the drawing. `readSel` is still this
              panel's — it lights a row in each list below and fills the
              read-out — but the cloth neither draws it nor sets it. */}
          <ClothMap state={state} readSel={null} setReadSel={() => {}} />
        </div>
        {pane}
      </div>

      <div className="two" style={{ marginTop: "22px" }}>
        <div className="card">
          <h2>
            Concepts <span className="n">{state.concepts.length}</span>
          </h2>
          <p className="hint">
            Every concept in the cohort&apos;s weave, in projection order. Click one to open the
            passages behind it.
          </p>
          {state.concepts.length === 0 ? (
            <p className="empty">Nothing woven yet.</p>
          ) : (
            <div className="scrollbox">
              {state.concepts.map((c) => {
                const count = passagesByConcept.get(c.id)?.length ?? 0
                return (
                  <div
                    key={c.id}
                    className={`crow${readSel?.type === "concept" && readSel.id === c.id ? " picked" : ""}`}
                    onClick={() => selectConcept(c.id)}
                  >
                    <span className="clabel"><ConceptName concept={c} /></span>
                    <span className="cap" style={{ whiteSpace: "nowrap" }}>
                      {who(c.userId)} · {count} passage{count !== 1 ? "s" : ""}
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
            one to read it out above.
          </p>
          {state.edges.length === 0 ? (
            <p className="empty">Nothing thrown yet.</p>
          ) : (
            <div className="scrollbox">
              {/* THE SHARED CARD (docs/thread-card.md). `by` and `onSelect`
                  are props rather than a mode of their own: this is the only
                  surface with more than one student in it, and the only one
                  where pressing a thread reads it out — neither makes it a
                  different card. It also picks up the keyboard for free, which
                  a bare div with an onClick never had. */}
              {state.edges.map((e) => (
                <ThreadCard
                  key={e.id}
                  thread={e}
                  from={conceptById.get(e.fromId)}
                  to={conceptById.get(e.toId)}
                  links={state.links}
                  by={who(e.userId)}
                  selected={readSel?.type === "edge" && readSel.id === e.id}
                  onSelect={() => selectEdge(e.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
