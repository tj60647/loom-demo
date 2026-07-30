"use client"

// "The cloth, over time" — an exploratory replay of how the student's weave
// grew, reconstructed by folding their own recorded acts. An instrument, not a
// verdict: it renders and counts (red line #7) — no judgment, no comparison,
// no advice. Nothing here writes; the record is read-only.

import { useMemo, useState, type SyntheticEvent } from "react"
import ReadOnlyClothMap from "@/components/svg/ReadOnlyClothMap"
import { getGraphEvents } from "@/actions/loom"
import type { Byte, Concept, Edge, GraphEvent, LoomState, Tier } from "@/lib/types"

const TIERS = new Set(["", "p", "s", "t", "x"])

// Events arrive through a server-action boundary; be tolerant of a Date that
// serialized to a string.
function eventDate(e: GraphEvent): Date {
  return e.at instanceof Date ? e.at : new Date(e.at)
}

function makeConcept(id: string, label: string, at: Date): Concept {
  return { id, courseId: null, userId: "", label, def: "", note: "", tier: "", createdAt: at }
}

function makeByte(id: string, conceptId: string, at: Date): Byte {
  return {
    id, courseId: null, userId: "", conceptId,
    source: "", sourceId: null, location: "", content: "",
    pageNumber: null, startOffset: null, endOffset: null, pageContentHash: null,
    createdAt: at,
  }
}

function makeEdge(id: string, fromId: string, toId: string, sentence: string, at: Date): Edge {
  return { id, courseId: null, userId: "", fromId, toId, handle: "", sentence, createdAt: at }
}

/**
 * Seed the folded maps from a graph.import / graph.example row snapshot
 * (GraphSnapshot in actions/loom). Defensive: the snapshot travels through a
 * serialized payload, so every field is checked before use and a malformed
 * entry is skipped, never guessed at.
 */
function seedFromSnapshot(
  snapshot: unknown,
  concepts: Map<string, Concept>,
  bytes: Map<string, Byte>,
  edges: Map<string, Edge>,
  at: Date,
) {
  if (typeof snapshot !== "object" || snapshot === null) return
  const s = snapshot as Record<string, unknown>

  if (Array.isArray(s.concepts)) {
    for (const raw of s.concepts) {
      const c = raw as Record<string, unknown> | null
      if (c && typeof c.id === "string" && typeof c.label === "string") {
        const made = makeConcept(c.id, c.label, at)
        if (typeof c.tier === "string" && TIERS.has(c.tier)) made.tier = c.tier as Tier
        concepts.set(c.id, made)
      }
    }
  }
  if (Array.isArray(s.bytes)) {
    for (const raw of s.bytes) {
      const b = raw as Record<string, unknown> | null
      if (b && typeof b.id === "string" && typeof b.conceptId === "string") {
        bytes.set(b.id, makeByte(b.id, b.conceptId, at))
      }
    }
  }
  if (Array.isArray(s.edges)) {
    for (const raw of s.edges) {
      const e = raw as Record<string, unknown> | null
      if (e && typeof e.id === "string" && typeof e.fromId === "string" && typeof e.toId === "string") {
        const made = makeEdge(e.id, e.fromId, e.toId, typeof e.sentence === "string" ? e.sentence : "", at)
        if (typeof e.handle === "string") made.handle = e.handle
        edges.set(e.id, made)
      }
    }
  }
}

/**
 * Reconstruct the cloth as it stood after the first `upTo` events, by folding
 * the record oldest-first. Defensive throughout: an event with missing payload
 * fields is skipped, never guessed at.
 */
function foldEvents(events: GraphEvent[], upTo: number) {
  const concepts = new Map<string, Concept>()
  const bytes = new Map<string, Byte>()
  const edges = new Map<string, Edge>()
  let readRevisions = 0

  for (let i = 0; i < upTo && i < events.length; i++) {
    const e = events[i]
    const p = e.payload ?? {}
    const at = eventDate(e)

    switch (e.kind) {
      case "concept.create": {
        if (e.entityId && typeof p.label === "string") {
          concepts.set(e.entityId, makeConcept(e.entityId, p.label, at))
        }
        break
      }
      case "concept.rename": {
        const c = e.entityId ? concepts.get(e.entityId) : undefined
        if (c && typeof p.label === "string") c.label = p.label
        break
      }
      case "concept.retier": {
        const c = e.entityId ? concepts.get(e.entityId) : undefined
        if (c && typeof p.tier === "string" && TIERS.has(p.tier)) c.tier = p.tier as Tier
        break
      }
      case "concept.delete": {
        if (e.entityId && concepts.delete(e.entityId)) {
          for (const [id, b] of bytes) if (b.conceptId === e.entityId) bytes.delete(id)
          for (const [id, ed] of edges) if (ed.fromId === e.entityId || ed.toId === e.entityId) edges.delete(id)
        }
        break
      }
      case "byte.create":
      case "byte.refile": {
        if (e.entityId && typeof p.conceptId === "string") {
          bytes.set(e.entityId, makeByte(e.entityId, p.conceptId, at))
        }
        break
      }
      case "byte.delete": {
        if (e.entityId) bytes.delete(e.entityId)
        break
      }
      case "edge.throw": {
        if (e.entityId && typeof p.fromId === "string" && typeof p.toId === "string") {
          edges.set(e.entityId, makeEdge(e.entityId, p.fromId, p.toId, typeof p.sentence === "string" ? p.sentence : "", at))
        }
        break
      }
      case "edge.coin": {
        const ed = e.entityId ? edges.get(e.entityId) : undefined
        if (ed && typeof p.handle === "string") ed.handle = p.handle
        break
      }
      case "edge.update": {
        const ed = e.entityId ? edges.get(e.entityId) : undefined
        if (ed && typeof p.sentence === "string") ed.sentence = p.sentence
        break
      }
      case "edge.delete": {
        if (e.entityId) edges.delete(e.entityId)
        break
      }
      case "read.update": {
        readRevisions++
        break
      }
      // Reset clears the cloth.
      case "graph.reset": {
        concepts.clear()
        bytes.clear()
        edges.clear()
        break
      }
      // Import and the worked example clear too, then seed from the row
      // snapshot the event carries — the snapshot is the only source for that
      // era (getGraphEvents no longer synthesizes creates for ids it covers),
      // so this era replays even after those rows were later reset or deleted.
      // Older events may lack a snapshot; then clearing is all we can do.
      case "graph.import":
      case "graph.example": {
        concepts.clear()
        bytes.clear()
        edges.clear()
        seedFromSnapshot(p.snapshot, concepts, bytes, edges, at)
        break
      }
      // concept.update (def/note) doesn't change what the cloth draws.
      default:
        break
    }
  }

  return {
    concepts: [...concepts.values()],
    bytes: [...bytes.values()],
    edges: [...edges.values()],
    readRevisions,
  }
}

/** One line per act, past tense, in the student's own vocabulary. Never a judgment. */
function describeEvent(e: GraphEvent): string {
  const p = e.payload ?? {}
  switch (e.kind) {
    case "concept.create": return typeof p.label === "string" && p.label ? `named "${p.label}"` : "named a concept"
    case "concept.rename": return "renamed a concept"
    case "concept.retier": return "re-tiered a concept"
    case "concept.update": return "revised a working definition"
    case "concept.delete": return "removed a concept"
    case "byte.create": return "captured a passage"
    case "byte.refile": return "filed a passage under a second concept"
    case "byte.delete": return "removed a passage"
    case "edge.throw": return "threw a thread"
    case "edge.coin": return typeof p.handle === "string" && p.handle ? `coined "${p.handle}"` : "cleared a coined term"
    case "edge.update": return "reworded a thread"
    case "edge.delete": return "removed a thread"
    case "read.update": return "revised the read"
    case "graph.reset": return "reset the cloth"
    case "graph.import": return "imported a cloth"
    case "graph.example": return "loaded the worked example"
    default: return e.kind
  }
}

export default function HistoryPanel() {
  const [events, setEvents] = useState<GraphEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // null = follow the end of the record ("now"); a number = a chosen point.
  const [pos, setPos] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    setFailed(false)
    getGraphEvents()
      .then((rows) => {
        setEvents(rows)
        setPos(null)
      })
      .catch((err) => {
        console.error("Failed to load graph events", err)
        setFailed(true)
      })
      .finally(() => setLoading(false))
  }

  const handleToggle = (ev: SyntheticEvent<HTMLDetailsElement>) => {
    if (ev.currentTarget.open && events === null && !loading && !failed) load()
  }

  const k = events ? (pos === null ? events.length : Math.min(pos, events.length)) : 0
  const cloth = useMemo(() => (events ? foldEvents(events, k) : null), [events, k])

  const mapState: LoomState | null = cloth
    ? {
        concepts: cloth.concepts,
        bytes: cloth.bytes,
        edges: cloth.edges,
        read: "",
        views: { cardTable: { positions: {}, bends: {} } },
      }
    : null

  const atMax = events !== null && k === events.length
  const current = events && k > 0 ? events[k - 1] : null
  const when = current
    ? eventDate(current).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : null

  return (
    <details className="card" onToggle={handleToggle}>
      <summary style={{ cursor: "pointer" }}>
        <span className="cap">The cloth, over time</span>
        <span className="hint" style={{ display: "block" }}>
          replay how your weave grew — counted from your own acts, never judged
        </span>
      </summary>

      {loading && <p className="ghostnote">reading the record…</p>}

      {failed && !loading && (
        <p className="ghostnote">
          could not read the record{" "}
          <button
            type="button"
            className="act"
            style={{ background: "none", border: "none", padding: 0 }}
            onClick={load}
          >
            try again
          </button>
        </p>
      )}

      {events !== null && events.length === 0 && (
        <div className="empty">
          <span className="cap">no weaving recorded yet — the record starts as you work</span>
        </div>
      )}

      {events !== null && events.length > 0 && cloth && mapState && (
        <>
          <input
            type="range"
            min={0}
            max={events.length}
            step={1}
            value={k}
            onChange={(ev) => setPos(Number(ev.target.value))}
            aria-label="replay position"
            style={{ width: "100%", margin: "4px 0 2px" }}
          />

          <p className="cap" style={{ margin: "4px 0 2px" }}>
            {cloth.concepts.length} concepts · {cloth.edges.length} threads · {cloth.bytes.length} passages —{" "}
            {atMax ? "now" : when ? `as of ${when}` : "before the first recorded act"}
            {cloth.readRevisions > 0 && (
              <>
                {" · "}the read, revised{" "}
                {cloth.readRevisions === 1 ? "once" : `${cloth.readRevisions} times`} so far
              </>
            )}
          </p>
          {current && (
            <p className="ghostnote" style={{ margin: "0 0 8px" }}>
              {describeEvent(current)}
            </p>
          )}

          {/* Same frame as #mapWrap, inlined so this panel never duplicates the
              Weave tab's id when both sit on one page. */}
          <div
            style={{
              border: "1px solid var(--rule)",
              borderRadius: "4px",
              background: "radial-gradient(circle,var(--dot) 1px,transparent 1.4px) 0 0/22px 22px,#f4f2ec",
            }}
          >
            <ReadOnlyClothMap state={mapState} />
          </div>

          <p className="ghostnote" style={{ marginTop: "8px" }}>
            This is your own record — reset clears the cloth, not this. It counts; it never grades.
          </p>
        </>
      )}
    </details>
  )
}
