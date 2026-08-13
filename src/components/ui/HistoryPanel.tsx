"use client"

// "The cloth, over time" — an exploratory replay of how the student's weave
// grew, reconstructed by folding their own recorded acts. An instrument, not a
// verdict: it renders and counts (red line #7) — no judgment, no comparison,
// no advice. Nothing here writes; the record is read-only.

import { useEffect, useMemo, useRef, useState } from "react"
import ReadOnlyClothMap from "@/components/svg/ReadOnlyClothMap"
import ObjectDownload from "@/components/ui/ObjectDownload"
import { useLoom } from "@/components/providers/LoomProvider"
import { getGraphEvents } from "@/lib/reads"
import { eventsForReading } from "@/lib/logScope"
import { buildLogExport, buildLogMarkdown } from "@/lib/objectExport"
import type { Passage, Concept, Edge, GraphEvent, LoomState } from "@/lib/types"

// Events arrive through a server-action boundary; be tolerant of a Date that
// serialized to a string.
function eventDate(e: GraphEvent): Date {
  return e.at instanceof Date ? e.at : new Date(e.at)
}

function makeConcept(id: string, label: string, at: Date): Concept {
  return { id, courseId: null, userId: "", label, def: "", note: "", createdAt: at }
}

function makePassage(id: string, conceptIds: string[], at: Date): Passage {
  return {
    id, courseId: null, userId: "", conceptIds,
    source: "", sourceId: null, location: "", content: "",
    pageNumber: null, startOffset: null, endOffset: null, pageContentHash: null,
    note: "", question: "", isPullQuote: false, tier: "",
    createdAt: at,
  }
}

/** A snapshot/payload's concept pointers: new shape (array) or legacy (single). */
function pointerIds(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.conceptIds)) {
    return raw.conceptIds.filter((v): v is string => typeof v === "string")
  }
  return typeof raw.conceptId === "string" ? [raw.conceptId] : []
}

function makeEdge(id: string, fromId: string, toId: string, sentence: string, at: Date): Edge {
  return { id, courseId: null, userId: "", fromId, toId, handle: "", linkId: null, sentence, createdAt: at }
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
  passages: Map<string, Passage>,
  edges: Map<string, Edge>,
  at: Date,
) {
  if (typeof snapshot !== "object" || snapshot === null) return
  const s = snapshot as Record<string, unknown>

  if (Array.isArray(s.concepts)) {
    for (const raw of s.concepts) {
      const c = raw as Record<string, unknown> | null
      if (c && typeof c.id === "string" && typeof c.label === "string") {
        concepts.set(c.id, makeConcept(c.id, c.label, at))
      }
    }
  }
  if (Array.isArray(s.passages)) {
    for (const raw of s.passages) {
      const b = raw as Record<string, unknown> | null
      if (b && typeof b.id === "string") {
        passages.set(b.id, makePassage(b.id, pointerIds(b), at))
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
  const passages = new Map<string, Passage>()
  const edges = new Map<string, Edge>()
  // Pre-0021 passages (recorded as passage.create) died with their concept — the
  // old cascade — while passage.capture passages survive as Unlabeled. The record
  // spans both eras, so the fold must replay each passage under the semantics
  // it actually lived under.
  const cascadeEraPassages = new Set<string>()
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
      case "concept.merge": {
        const fromId = typeof p.fromId === "string" ? p.fromId : null
        if (fromId && e.entityId && concepts.delete(fromId)) {
          for (const b of passages.values()) {
            if (b.conceptIds.includes(fromId)) {
              b.conceptIds = [...new Set(b.conceptIds.map((cid) => (cid === fromId ? e.entityId! : cid)))]
            }
          }
          for (const ed of edges.values()) {
            if (ed.fromId === fromId) ed.fromId = e.entityId
            if (ed.toId === fromId) ed.toId = e.entityId
          }
        }
        break
      }
      // concept.retier is a legacy kind (tiers moved onto maps, 0021) — it no
      // longer changes what the cloth draws.
      case "concept.delete": {
        if (e.entityId && concepts.delete(e.entityId)) {
          for (const [id, b] of passages) {
            if (!b.conceptIds.includes(e.entityId)) continue
            // Cascade-era passages actually died with their concept; 0021-era
            // passages survive their label and only the pointer goes.
            if (cascadeEraPassages.has(id)) passages.delete(id)
            else b.conceptIds = b.conceptIds.filter((cid) => cid !== e.entityId)
          }
          for (const [id, ed] of edges) if (ed.fromId === e.entityId || ed.toId === e.entityId) edges.delete(id)
        }
        break
      }
      case "passage.create":
      case "passage.capture": {
        if (e.entityId) {
          passages.set(e.entityId, makePassage(e.entityId, pointerIds(p), at))
          // Recorded passage.create = the pre-0021 cascade era. Synthesized
          // creates are minted from rows alive TODAY, so they demonstrably
          // survived — replay them with survive semantics.
          if (e.kind === "passage.create" && p.synthesized !== true) cascadeEraPassages.add(e.entityId)
        }
        break
      }
      case "passage.refile": {
        if (e.entityId && typeof p.conceptId === "string") {
          const b = passages.get(e.entityId)
          if (b && !b.conceptIds.includes(p.conceptId)) {
            b.conceptIds = [...b.conceptIds, p.conceptId]
          } else if (!b) {
            // Pre-0021 refile events minted a NEW passage row under this id —
            // cascade-era rows like any other passage.create of their day.
            passages.set(e.entityId, makePassage(e.entityId, [p.conceptId], at))
            cascadeEraPassages.add(e.entityId)
          }
        }
        break
      }
      case "passage.unfile": {
        if (e.entityId && typeof p.conceptId === "string") {
          const b = passages.get(e.entityId)
          if (b) b.conceptIds = b.conceptIds.filter((cid) => cid !== p.conceptId)
        }
        break
      }
      case "passage.delete": {
        if (e.entityId) passages.delete(e.entityId)
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
      // The cloth description is the read's successor (0021); count a
      // description revision the same way. Title edits change nothing drawn.
      case "cloth.update": {
        if (typeof p.descriptionChars === "number") readRevisions++
        break
      }
      // Reset clears the cloth.
      case "graph.reset": {
        concepts.clear()
        passages.clear()
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
        passages.clear()
        edges.clear()
        seedFromSnapshot(p.snapshot, concepts, passages, edges, at)
        break
      }
      // concept.update (def/note) doesn't change what the cloth draws.
      default:
        break
    }
  }

  return {
    concepts: [...concepts.values()],
    passages: [...passages.values()],
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
    case "concept.update": return "revised a concept's description"
    case "concept.merge":
      return typeof p.fromLabel === "string" && typeof p.intoLabel === "string"
        ? `merged "${p.fromLabel}" into "${p.intoLabel}"`
        : "merged two concepts"
    case "concept.delete": return "removed a concept"
    case "passage.create": return "captured a passage"
    case "passage.capture":
      return Array.isArray(p.conceptIds) && p.conceptIds.length === 0
        ? "captured an unlabeled passage"
        : "captured a passage"
    case "passage.refile": return "filed a passage under a second concept"
    case "passage.unfile": return "unfiled a passage from a concept"
    case "passage.attribute": return "placed passages in their reading"
    case "passage.delete": return "removed a passage"
    case "edge.throw": return "threw a thread"
    // The KIND keeps its name — `edge.coin` and `link.coin` are written into
    // graph_event and a log is history — but what the log SAYS follows the
    // student's language, which stopped being "coin" on 2026-08-12.
    case "edge.coin": return typeof p.handle === "string" && p.handle ? `labelled a link "${p.handle}"` : "cleared a link's label"
    case "edge.update": return "reworded a thread"
    case "edge.delete": return "removed a thread"
    // 5.1: a Link is an object now, so making one is its own act — it can
    // happen with no thread using it yet.
    case "link.coin": return typeof p.label === "string" && p.label ? `added the link label "${p.label}"` : "added a link label"
    case "link.update": return typeof p.label === "string" ? `renamed a link to "${p.label}"` : "glossed a link"
    case "read.update": return "revised the read"
    case "map.create": return typeof p.name === "string" && p.name ? `started a new projection — "${p.name}"` : "started a new projection"
    case "map.rename": return typeof p.name === "string" && p.name ? `renamed a projection to "${p.name}"` : "renamed a projection"
    case "map.retier": return "re-sorted a projection"
    case "map.update": return "revised a projection's description"
    case "map.delete": return typeof p.name === "string" && p.name ? `removed a projection ("${p.name}")` : "removed a projection"
    case "map.import": return "brought a projection in"
    case "cloth.update":
      return typeof p.descriptionChars === "number" ? "revised a cloth's description" : "titled a cloth"
    case "graph.reset": return "reset the cloth"
    case "graph.import": return "imported a cloth"
    case "graph.example": return "loaded the worked example"
    default: return "one more act on the record"
  }
}

export default function HistoryPanel({ sourceId, scopeLabel }: {
  /**
   * Read this reading's acts only (TJ, 2026-08-10 — the Log lives on 03 now,
   * "specific to that reading, not all readings"). Absent = the whole record.
   * Placement is `src/lib/logScope.ts`, which is where the hard part lives:
   * a Concept belongs to the User and a Thread to two Concepts, so neither
   * has a reading of its own to read off.
   */
  sourceId?: string
  /** Readable name for the scope, for the download's filename and heading. */
  scopeLabel?: string
} = {}) {
  const { state } = useLoom()
  const [events, setEvents] = useState<GraphEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // null = follow the end of the record ("now"); a number = a chosen point.
  const [pos, setPos] = useState<number | null>(null)
  /**
   * Two ways to read the same record (TJ, 2026-08-12). The TIMELINE replays it
   * — one position, the cloth as it stood at that act. The LIST is the record
   * as a record: every act with the time it happened, which the timeline can
   * only ever show one of. Clicking a row moves the replay, so they are two
   * views of one position rather than two panels.
   */
  const [view, setView] = useState<"timeline" | "list">("timeline")

  const load = () => {
    setLoading(true)
    setFailed(false)
    getGraphEvents()
      .then((rows) => {
        setEvents(sourceId ? eventsForReading(rows, sourceId, state) : rows)
        setPos(null)
      })
      .catch((err) => {
        console.error("Failed to load graph events", err)
        setFailed(true)
      })
      .finally(() => setLoading(false))
  }

  // A section now, not a fold (TJ, 2026-08-12: "the capture log should
  // actually be its own section below"), so the record is read on arrival
  // rather than on a disclosure nobody opened. `loadedFor` keeps this to one
  // fetch per scope: the effect re-runs whenever the reading changes, and
  // must not re-run itself when the fetch lands and sets state.
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    const key = sourceId ?? "*"
    if (loadedFor.current === key) return
    loadedFor.current = key
    load()
    // `load` closes over `state` for the reading filter, and `state` changes
    // with every keystroke a student makes — depending on it would refetch the
    // whole record constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId])

  /**
   * The replay position, in ACTS. 1 is the first recorded act — not 0, which
   * was "before the first recorded act": a state nobody made, shown as the
   * left end of every slider (TJ, 2026-08-12: "the timeline should start at
   * the first event, not before the first event").
   */
  const k = events ? (pos === null ? events.length : Math.min(Math.max(pos, 1), events.length)) : 0
  const cloth = useMemo(() => (events ? foldEvents(events, k) : null), [events, k])

  const mapState: LoomState | null = cloth
    ? {
        concepts: cloth.concepts,
        passages: cloth.passages,
        edges: cloth.edges,
        // The replay folds acts on the graph; the Link vocabulary is not
        // part of that story, so it is empty rather than half-reconstructed.
        links: [],
        maps: [],
        cloths: [],
        views: { cardTable: { positions: {}, bends: {} } },
      }
    : null

  const atMax = events !== null && k === events.length
  const current = events && k > 0 ? events[k - 1] : null
  const when = current
    ? eventDate(current).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : null

  /** A list row's stamp: short enough to sit in a column, exact to the minute. */
  const stamp = (e: GraphEvent) =>
    eventDate(e).toLocaleString([], {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    })

  return (
    <div className="card">
      <div className="mapbar" style={{ marginBottom: 8 }}>
        <span className="hint" style={{ margin: 0 }}>
          Every act that made this cloth, in the order you made them — counted, never judged.
        </span>
        {/* Two views of one record, and of one position: the chips read like
            the projection switcher above them because they do the same job. */}
        {events !== null && events.length > 0 && (
          <span className="chips" style={{ margin: 0, marginLeft: "auto", alignItems: "center" }}>
            {(["timeline", "list"] as const).map((v) => (
              <span
                key={v}
                className={`chip${view === v ? " on" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => setView(v)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(v) } }}
              >{v}</span>
            ))}
          </span>
        )}
      </div>

      {/* The Log downloads too (TJ, 2026-08-10) — it is the one object that
          has never been in any file, so without this it would be the only
          work a student cannot take with them. Only once the record is
          loaded: there is nothing to hand over before that. */}
      {events !== null && events.length > 0 && (
        <div style={{ margin: "6px 0 10px" }}>
          <ObjectDownload
            kind="capture-log"
            slug={scopeLabel ?? "capture-log"}
            tip="your acts, in order — the record of how this grew"
            json={(p) => JSON.stringify(buildLogExport(events, p, scopeLabel), null, 2)}
            markdown={(p) => buildLogMarkdown(events, p, scopeLabel)}
          />
        </div>
      )}

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

      {events !== null && events.length > 0 && view === "list" && (
        <div className="scrollbox">
          {events.map((e, i) => (
            <div
              key={e.id}
              className={`logrow${i + 1 === k ? " on" : ""}`}
              role="button"
              tabIndex={0}
              title="show the cloth as it stood after this act"
              onClick={() => { setPos(i + 1); setView("timeline") }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setPos(i + 1); setView("timeline") }
              }}
            >
              {/* The stamp the timeline cannot show: it has one position, and
                  this is every act's own time (TJ, 2026-08-12). */}
              <span className="logwhen">{stamp(e)}</span>
              <span className="logwhat">{describeEvent(e)}</span>
              <span className="logn">{i + 1}</span>
            </div>
          ))}
        </div>
      )}

      {events !== null && events.length > 0 && cloth && mapState && view === "timeline" && (
        <>
          {/* Ticked by ACT, not by clock (TJ, 2026-08-12): the record's own
              unit is the act, and spacing by time would bunch a working
              evening into a smear and stretch the gap to next week across half
              the bar. One notch per act, evenly spaced.
              Starts at 1 — the first act. It started at 0, "before the first
              recorded act", which is a state nobody ever made. */}
          <datalist id="logTicks">
            {events.map((_, i) => <option key={i} value={i + 1} />)}
          </datalist>
          <input
            type="range"
            className="logslider"
            min={1}
            max={events.length}
            step={1}
            list="logTicks"
            value={k}
            onChange={(ev) => setPos(Number(ev.target.value))}
            aria-label="replay position, in acts"
            aria-valuetext={current ? `act ${k} of ${events.length} — ${describeEvent(current)}` : undefined}
            style={{ width: "100%", margin: "4px 0 0" }}
          />
          {/* The ticks, drawn. `list=` is the semantic half and browsers no
              longer paint it, so the marks are a gradient with one period per
              act — evenly spaced BY ACT, which is the whole point: spacing by
              clock would smear an evening's work into one blur and stretch the
              gap to next week across half the bar. Above ~180 acts the marks
              would merge into a rule, so they thin to every nth and the bar
              keeps meaning "many" instead of going solid. */}
          {events.length > 1 && (
            <div
              className="logtickbar"
              aria-hidden="true"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, var(--rule) 0 1px, transparent 1px ${
                  (100 / (events.length - 1)) * Math.ceil((events.length - 1) / 180)
                }%)`,
              }}
            />
          )}
          <p className="cap" style={{ margin: "0 0 2px", display: "flex", justifyContent: "space-between" }}>
            <span>act {k} of {events.length}</span>
            <span>{atMax ? "now" : "· drag to replay ·"}</span>
          </p>

          <p className="cap" style={{ margin: "4px 0 2px" }}>
            {cloth.concepts.length} concepts · {cloth.edges.length} threads · {cloth.passages.length} passages —{" "}
            {atMax ? "now" : when ? `as of ${when}` : "at the first recorded act"}
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
    </div>
  )
}
