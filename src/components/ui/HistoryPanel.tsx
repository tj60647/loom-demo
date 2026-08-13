"use client"

// "The cloth, over time" — an exploratory replay of how the student's weave
// grew, reconstructed by folding their own recorded acts. An instrument, not a
// verdict: it renders and counts (red line #7) — no judgment, no comparison,
// no advice. Nothing here writes; the record is read-only.

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import ReadOnlyClothMap from "@/components/svg/ReadOnlyClothMap"
import ObjectDownload from "@/components/ui/ObjectDownload"
import { useLoom } from "@/components/providers/LoomProvider"
import { short } from "@/lib/clothMath"
import { getGraphEvents } from "@/lib/reads"
import { eventsForReading } from "@/lib/logScope"
import { buildLogExport, buildLogMarkdown } from "@/lib/objectExport"
import type { Passage, Concept, Edge, GraphEvent, LoomState } from "@/lib/types"

/** The tier letters as the student reads them on the Sort list. */
const TIER_WORD: Record<string, string> = {
  p: "primary", s: "secondary", t: "tertiary", x: "set aside", "": "unsorted",
}

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
      // `read.update` and `cloth.update` change nothing the fold draws — the
      // cloth is concepts, threads and passages. They were counted here for a
      // line under the slider that has gone (2026-08-12); the list view shows
      // each of them as its own row, which is where an act belongs.
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
  /** Running the replay forward on its own (TJ, 2026-08-12). */
  const [playing, setPlaying] = useState(false)
  /**
   * Bumped on every position change, so the glow restarts even when two acts
   * in a row touch the same concept. A counter, not the position itself: the
   * animation must replay when you step back and forth over one act too.
   */
  const [pulse, setPulse] = useState(0)

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

  /** Move the replay AND restart the glow. Every position change goes here. */
  const goTo = (n: number) => {
    setPos(n)
    setPulse((p) => p + 1)
  }

  /**
   * Play, at one act a beat. It stops itself at the end rather than looping —
   * the record has an end, and a replay that wrapped around would say
   * otherwise. Pressing play at the end starts again from the first act,
   * because that is the only thing "play" can mean there.
   */
  useEffect(() => {
    if (!playing || !events) return
    // The stop lives INSIDE the beat rather than in the effect body: setState
    // during the effect's own pass is the cascading-render trap the lint rule
    // is named for, and the last beat is a fine place to notice the end.
    const t = window.setTimeout(() => {
      if (k >= events.length) setPlaying(false)
      else goTo(k + 1)
    }, 420)
    return () => window.clearTimeout(t)
  }, [playing, k, events])

  /**
   * Arriving in the list, land on the act you were looking at. Without this,
   * "in the list ›" from act 60 of 66 opens a list scrolled to act 1 and the
   * marked row is somewhere below the fold — the door would technically work
   * and practically strand you.
   */
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (view !== "list") return
    listRef.current
      ?.querySelector(`[data-act="${k}"]`)
      ?.scrollIntoView({ block: "center", behavior: "auto" })
  }, [view, k])

  /**
   * What the current act touched, for the glow. A passage is not drawn on the
   * cloth, so a capture glows the CONCEPT it was filed under — which is what
   * visibly changed. Concepts and threads glow themselves.
   */
  const glowId = (() => {
    if (!current) return null
    const p = (current.payload ?? {}) as Record<string, unknown>
    if (current.entityType === "passage") {
      const ids = Array.isArray(p.conceptIds) ? (p.conceptIds as unknown[]) : []
      const first = ids.find((v) => typeof v === "string") as string | undefined
      return first ?? (typeof p.conceptId === "string" ? p.conceptId : null)
    }
    if (current.entityType === "concept" || current.entityType === "edge") return current.entityId
    return null
  })()
  const when = current
    ? eventDate(current).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : null

  /** A list row's stamp: short enough to sit in a column, exact to the minute. */
  const stamp = (e: GraphEvent) =>
    eventDate(e).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const dayOf = (e: GraphEvent) =>
    eventDate(e).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })

  /**
   * What the act was ABOUT (TJ, 2026-08-12: "the list view should include more
   * contextual data to help log ones memory about a decision. not just the
   * act… the idea is to help the student remember their decision making
   * process").
   *
   * A verb alone — "captured a passage" — is the one thing a student cannot
   * fail to remember and the one thing that tells them nothing. What brings
   * the moment back is what they WROTE: the words they kept, the note they
   * wrote about keeping them, the name they gave the idea, the sentence they
   * would defend. Four places, and this shows whichever the act touched.
   *
   * Payload first, live rows second. The payload is what the act itself
   * recorded and cannot change afterwards; the passage's text and note and a
   * concept's description live on rows that may since have been edited or
   * deleted — so they are shown when they resolve and simply absent when they
   * do not, which is the honest state for a log that outlives its rows.
   */
  const conceptLabel = (id: unknown): string | null =>
    typeof id === "string" ? state.concepts.find((c) => c.id === id)?.label ?? null : null
  const contextOf = (e: GraphEvent): ReactNode => {
    const p = (e.payload ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
    const passage = e.entityType === "passage" && e.entityId
      ? state.passages.find((b) => b.id === e.entityId)
      : undefined
    const bits: ReactNode[] = []

    if (passage) {
      bits.push(<span key="q" className="logquote">&ldquo;{short(passage.content, 220)}&rdquo;</span>)
      const note = str(passage.note)
      if (note) bits.push(<span key="n" className="lognote">your note: {short(note, 180)}</span>)
    }
    // The concepts it was filed under — by label, resolved now, because the
    // payload records ids and an id says nothing to a person.
    const filed = Array.isArray(p.conceptIds)
      ? (p.conceptIds as unknown[]).map(conceptLabel).filter(Boolean)
      : [conceptLabel(p.conceptId)].filter(Boolean)
    if (filed.length) bits.push(<span key="f" className="logmeta">under {filed.join(" · ")}</span>)

    if (e.entityType === "concept") {
      const label = str(p.label) ?? conceptLabel(e.entityId)
      const def = e.entityId ? str(state.concepts.find((c) => c.id === e.entityId)?.def) : null
      if (label && !/"/.test(describeEvent(e))) bits.push(<span key="c" className="logmeta">{label}</span>)
      if (def) bits.push(<span key="d" className="lognote">your description: {short(def, 180)}</span>)
    }

    if (e.entityType === "edge") {
      const from = conceptLabel(p.fromId), to = conceptLabel(p.toId)
      const sentence = str(p.sentence)
      if (from && to) bits.push(<span key="t" className="logmeta">{from} → {to}</span>)
      if (sentence) bits.push(<span key="s" className="logquote">&ldquo;{short(sentence, 180)}&rdquo;</span>)
    }

    // A sort is a judgement about what this projection hangs on, and the act
    // recorded WHICH concepts moved and where to (`changed`). Without this the
    // commonest row in a working session reads "re-sorted a projection" and
    // remembers nothing.
    if (p.changed && typeof p.changed === "object") {
      const moves = Object.entries(p.changed as Record<string, string>)
        .map(([cid, tier]) => {
          const label = conceptLabel(cid)
          return label ? `${label} → ${TIER_WORD[tier] ?? "unsorted"}` : null
        })
        .filter(Boolean) as string[]
      if (moves.length) {
        bits.push(
          <span key="m" className="logmeta">
            {moves.slice(0, 4).join(" · ")}{moves.length > 4 ? ` · +${moves.length - 4} more` : ""}
          </span>
        )
      }
    }

    // Which piece of writing was touched. The payload keeps only a character
    // count — deliberately, it is not a copy of the student's prose — but
    // WHICH field it was is the part worth remembering.
    const fields = [
      p.essenceChars !== undefined ? "the one-line" : null,
      p.readChars !== undefined ? "the paragraph" : null,
      p.titleChars !== undefined ? "the title" : null,
      p.descriptionChars !== undefined ? "the description" : null,
    ].filter(Boolean)
    if (fields.length) bits.push(<span key="fl" className="logmeta">{fields.join(" · ")}</span>)

    if (e.entityType === "cloth") {
      const title = str(state.cloths.find((c) => c.id === e.entityId)?.title)
      if (title) bits.push(<span key="ct" className="logmeta">{title}</span>)
    }

    // Where it came from, which is how you find it again in the text.
    const where = [str(p.source), str(p.location)].filter(Boolean).join(" · ")
    if (where) bits.push(<span key="w" className="logmeta">{where}</span>)

    return bits.length ? <span className="logctx">{bits}</span> : null
  }

  return (
    <div className="card">
      <div className="mapbar" style={{ marginBottom: 8 }}>
        {/* The heading above says WHAT this is; this says how to use it and
            what a row holds. They both opened with "how this cloth came to
            be" until TJ read them together (2026-08-12: "these are odd
            together, perhaps redundant?"). ("counted, never judged" stood here
            before that — the build's own phrase, red line #7, which said
            nothing a student needed.) */}
        <span className="hint" style={{ margin: 0 }}>
          Replay it act by act, or read it as a record — each entry keeps the words you
          kept, the name you gave them, and the note you wrote at the time.
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
            noun="the log"
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
        <div className="scrollbox" ref={listRef}>
          {events.map((e, i) => {
            // A day heading where the date turns over. A term's record is
            // mostly made of sittings, and seeing where one ended is half of
            // remembering what you were doing in it.
            const newDay = i === 0 || dayOf(e) !== dayOf(events[i - 1])
            return (
              <Fragment key={e.id}>
                {newDay && <div className="logday">{dayOf(e)}</div>}
                {/* A row click moves the replay and STAYS here (TJ,
                    2026-08-12: "clicking a row in the log list should not take
                    us out of the list"). Reading the record and watching the
                    cloth are two different jobs; the view changes only when
                    the badge says it will. */}
                <div
                  className={`logrow${i + 1 === k ? " on" : ""}`}
                  data-act={i + 1}
                  role="button"
                  tabIndex={0}
                  title="mark this act — the replay moves with you"
                  onClick={() => goTo(i + 1)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); goTo(i + 1) }
                  }}
                >
                  {/* The stamp the timeline cannot show: it holds one position,
                      and this is every act's own time (TJ, 2026-08-12). */}
                  <span className="logwhen">{stamp(e)}</span>
                  <span className="logwhat">
                    <span className="logact">{describeEvent(e)}</span>
                    {contextOf(e)}
                  </span>
                  {/* The door to the other view, said out loud. */}
                  <button
                    type="button"
                    className="logjump"
                    title="see the cloth as it stood at this act"
                    onClick={(ev) => { ev.stopPropagation(); goTo(i + 1); setView("timeline") }}
                  >
                    on the cloth ›
                  </button>
                  <span className="logn">{i + 1}</span>
                </div>
              </Fragment>
            )
          })}
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
          {/* ONE set of ticks (TJ, 2026-08-12: "the slider ticks and the
              timeline ticks dont line up. maybe we only need the slider
              ticks"). There were two, and they could not agree: the browser
              paints `list=` ticks across the whole track while the thumb only
              travels between its own half-widths, so the drawn strip and the
              native marks were offset by 8px at each end and drifted in
              between. The datalist is gone; the drawn strip is inset by the
              thumb's radius so a mark sits exactly under the thumb that
              selects it. */}
          <input
            type="range"
            className="logslider"
            min={1}
            max={events.length}
            step={1}
            value={k}
            onChange={(ev) => { setPlaying(false); goTo(Number(ev.target.value)) }}
            aria-label="replay position, in acts"
            aria-valuetext={current ? `act ${k} of ${events.length} — ${describeEvent(current)}` : undefined}
            style={{ width: "100%", margin: "4px 0 0" }}
          />
          {/* Spaced BY ACT, which is the whole point: by clock, an evening's
              work smears into one blur and the gap to next week takes half the
              bar. Above ~180 acts the marks would merge into a rule, so they
              thin to every nth and the strip keeps meaning "many". */}
          {events.length > 1 && (
            <div
              className="logtickbar"
              aria-hidden="true"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, var(--grey) 0 1px, transparent 1px ${
                  (100 / (events.length - 1)) * Math.ceil((events.length - 1) / 180)
                }%)`,
              }}
            />
          )}
          <div className="logbar">
            {/* Play runs it forward a beat at a time and stops at the end. At
                the end it starts over, because that is the only thing the word
                can mean there. */}
            <button
              type="button"
              className="btn ghost mini"
              onClick={() => {
                if (playing) { setPlaying(false); return }
                if (atMax) goTo(1)
                setPlaying(true)
              }}
              aria-pressed={playing}
            >
              {playing ? "❚❚ pause" : atMax ? "▶ replay from the start" : "▶ play"}
            </button>
            <span className="cap">act {k} of {events.length}{atMax ? " · now" : ""}</span>
            {/* The badge back, the mirror of the list's (TJ, 2026-08-12:
                "and conversely for the [timeline]"). */}
            <button
              type="button"
              className="logjump"
              title="find this act in the record"
              onClick={() => { setPlaying(false); setView("list") }}
            >
              in the list ›
            </button>
          </div>

          {/* The counts are the cloth's SHAPE at this act — the three things
              drawn below. "· the read, revised once so far" used to hang off
              the end of them and TJ read it as irrelevant (2026-08-12); it was
              worse than that. It counted `read.update` and cloth-description
              edits, so it named an object that no longer exists: "the read"
              was the cloth's paragraph before migration 0021 replaced it with
              the Cloth Description, and today "your read" means a
              PROJECTION's paragraph, a different object again. It counted a
              thing you cannot see, under a name for something else, next to
              three things you can. The acts it counted are in the list, said
              plainly: "revised a cloth's description · the description". */}
          <p className="cap" style={{ margin: "4px 0 2px" }}>
            {cloth.concepts.length} concepts · {cloth.edges.length} threads · {cloth.passages.length} passages —{" "}
            {atMax ? "now" : when ? `as of ${when}` : "at the first recorded act"}
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
            <ReadOnlyClothMap state={mapState} glow={glowId ? { id: glowId, seq: pulse } : null} />
          </div>

          {/* The second "counted, never judged", and it also promised a reset
              that was deleted with Keep on 2026-08-11. Both gone: the panel
              says what it is once, at the top. */}
        </>
      )}
    </div>
  )
}
