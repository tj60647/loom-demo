"use client"

// "The cloth, over time" — an exploratory replay of how the student's weave
// grew, reconstructed by folding their own recorded acts. An instrument, not a
// verdict: it renders and counts (red line #7) — no judgment, no comparison,
// no advice. Nothing here writes; the record is read-only.
//
// Since 2026-08-13 this file is no longer a panel: it is the log's STATE
// (`useCaptureLog`) and its two controls (`CaptureLogScrubber`,
// `CaptureLogRecord`), which `ClothReflection` composes into the cloth card.
// It drew a second `ClothMap` of its own until then, so 03 rendered the same
// component twice a screen apart. The one cloth is upstairs now.
//
// `foldEvents` stays HERE by contract: `scripts/check-vocabulary.ts` reads this
// file by path and asserts every kind `recordEvent` emits has a matching
// `case`. Move the fold and that guard goes looking at an empty file.

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import ObjectDownload from "@/components/ui/ObjectDownload"
import { useLoom } from "@/components/providers/LoomProvider"
import { short } from "@/lib/clothMath"
import { getGraphEvents } from "@/lib/reads"
import { eventsForReading } from "@/lib/logScope"
import { describeEvent, TIER_WORD } from "@/lib/logPhrase"
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
      // One reading started over. Only its captures went — concepts, links and
      // threads are user-level and survive by ruling — so this must NOT clear
      // the way graph.reset does, or the replay would delete work the act left
      // standing. The snapshot names exactly which passages went; without one
      // (an omitted, over-cap snapshot) the replay leaves them, which reads as
      // a reading whose captures outlive their reset and is the lesser wrong.
      case "reading.reset": {
        const cleared = (p.snapshot as { passages?: { id: string }[] } | undefined)?.passages
        cleared?.forEach((row) => passages.delete(row.id))
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

/**
 * The record, the replay position, and the cloth as it stood at that position.
 *
 * A hook rather than a panel since 2026-08-13 (TJ: "the log is awesome and
 * needs to be integrated into the cloth view, thus these are not separate
 * cards but one card"). It used to own a second `ClothMap` of its own, so the
 * station drew the same component twice a screen apart — once live, once
 * folded. Now the cloth card owns the one drawing and this owns only time:
 * `ClothReflection` reads `mapState` when the student scrubs back and its own
 * live state at the end of the record.
 */
export function useCaptureLog({ sourceId, enabled = true }: {
  /**
   * Read this reading's acts only (TJ, 2026-08-10 — the Log lives on 03 now,
   * "specific to that reading, not all readings"). Absent = the whole record.
   * Placement is `src/lib/logScope.ts`, which is where the hard part lives:
   * a Concept belongs to the User and a Thread to two Concepts, so neither
   * has a reading of its own to read off.
   */
  sourceId?: string
  /**
   * Whether to read the record at all. False in the practice loom, and it must
   * gate the FETCH, not just the render: this reads the student's real acts
   * over its own route, bypassing the provider, and an absent `sourceId` means
   * "the whole record" — so a hook that mounted disabled and fetched anyway
   * would pull their entire real history into a space that keeps nothing.
   * The old panel got this for free by not being mounted at all.
   */
  enabled?: boolean
} = {}) {
  const { state } = useLoom()
  const [events, setEvents] = useState<GraphEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // null = follow the end of the record ("now"); a number = a chosen point.
  const [pos, setPos] = useState<number | null>(null)
  /**
   * The timeline/list chips are gone with the merge (2026-08-13). They existed
   * because the replay and the record were two panels showing one position:
   * you pressed a chip to move between them, and each had its own door back
   * ("on the cloth ›", "in the list ›"). With one cloth in one card there is
   * one position and no journey — the scrubber and the record now move the
   * same drawing, so a row click needs no door and no view to switch to.
   */
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
    if (!enabled) return
    const key = sourceId ?? "*"
    if (loadedFor.current === key) return
    loadedFor.current = key
    load()
    // `load` closes over `state` for the reading filter, and `state` changes
    // with every keystroke a student makes — depending on it would refetch the
    // whole record constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, enabled])

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

  return {
    events, loading, failed, reload: load,
    k, atMax, current, when, cloth, mapState, glowId, pulse,
    goTo, playing, setPlaying,
    /**
     * Whether the student has moved the scrubber at all. The cloth glows only
     * once they have: on arrival the card should be a calm drawing of their
     * work, not a pulse on whatever they happened to do last.
     */
    scrubbed: pos !== null,
    /**
     * Safe to draw time. False while the record loads, when it fails, and when
     * there is nothing recorded — in every one of those the cloth card still
     * renders its live drawing and simply shows no scrubber. The log must never
     * be able to blank the cloth.
     */
    ready: events !== null && events.length > 0 && mapState !== null,
  }
}

export type CaptureLog = ReturnType<typeof useCaptureLog>

/** A list row's stamp: short enough to sit in a column, exact to the minute. */
const stamp = (e: GraphEvent) =>
  eventDate(e).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
const dayOf = (e: GraphEvent) =>
  eventDate(e).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })

/**
 * The record itself — every act in order, in the box the cloth was drawn in.
 *
 * A disclosure under the cloth for one day (2026-08-13), which stacked the card
 * taller and taller. TJ, restoring what the log panel did before the merge:
 * "the previous version had the diagram and the list in the same space,
 * correct? why not just do that again?" — so this fills the same fixed box the
 * drawing does, and the chips swap between them.
 */
export function CaptureLogRows({ log, onShowCloth }: {
  log: CaptureLog
  /**
   * Show the cloth at the act this row is (TJ, 2026-08-13: "the previous
   * list > diagram relation was ideal"). A row CLICK deliberately does not do
   * this — "clicking a row in the log list should not take us out of the list"
   * (TJ, 2026-08-12) — so the trip out is its own badge, said out loud.
   */
  onShowCloth?: () => void
}) {
  const { state } = useLoom()
  const { events, k, goTo } = log

  /**
   * Land on the act you were looking at. Arriving at act 60 of 66 with the list
   * scrolled to act 1 would put the marked row below the fold — technically
   * working and practically stranding you. Runs as the position moves too, so
   * playing the replay walks the list along with it.
   */
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-act="${k}"]`)
      ?.scrollIntoView({ block: "center", behavior: "auto" })
  }, [k])

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

  if (!events || events.length === 0) return null

  return (
    <>
      {(
        <div className="scrollbox logrows" ref={listRef}>
          {events.map((e, i) => {
            // A day heading where the date turns over. A term's record is
            // mostly made of sittings, and seeing where one ended is half of
            // remembering what you were doing in it.
            const newDay = i === 0 || dayOf(e) !== dayOf(events[i - 1])
            return (
              <Fragment key={e.id}>
                {newDay && <div className="logday">{dayOf(e)}</div>}
                {/* A row click moves the scrubber and STAYS here; the badge is
                    the way out. Both halves are TJ's: the row must not take you
                    out of the list (2026-08-12), and the list must be able to
                    hand you to the drawing (2026-08-13). */}
                <div
                  className={`logrow${i + 1 === k ? " on" : ""}`}
                  data-act={i + 1}
                  role="button"
                  tabIndex={0}
                  title="see the cloth as it stood at this act"
                  onClick={() => goTo(i + 1)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); goTo(i + 1) }
                  }}
                >
                  {/* The stamp the scrubber cannot show: it holds one position,
                      and this is every act's own time (TJ, 2026-08-12). */}
                  <span className="logwhen">{stamp(e)}</span>
                  <span className="logwhat">
                    <span className="logact">{describeEvent(e)}</span>
                    {contextOf(e)}
                  </span>
                  {/* The door to the drawing, said out loud. Quiet until the
                      row is hovered, marked or focused — see `.logjump`. */}
                  {onShowCloth && (
                    <button
                      type="button"
                      className="logjump"
                      title="see the cloth as it stood at this act"
                      onClick={(ev) => { ev.stopPropagation(); goTo(i + 1); onShowCloth() }}
                    >
                      on the cloth ›
                    </button>
                  )}
                  <span className="logn">{i + 1}</span>
                </div>
              </Fragment>
            )
          })}
        </div>
      )}
    </>
  )
}

/**
 * The log as a file. Beside the chips rather than inside the record, because
 * you should not have to be looking at the rows to take them — and because a
 * control that appears and disappears reflows the card, which is the thing TJ
 * called out ("i really hate it when buttons change size and reformat the
 * card"). It renders in both views, in the same place, at the same size.
 */
export function CaptureLogDownload({ log, scopeLabel }: {
  log: CaptureLog
  /** Readable name for the scope, for the download's filename and heading. */
  scopeLabel?: string
}) {
  const { events } = log
  if (!events || events.length === 0) return null
  return (
    <ObjectDownload
      kind="capture-log"
      noun="the log"
      slug={scopeLabel ?? "capture-log"}
      tip="your acts, in order — the record of how this grew"
      json={(p) => JSON.stringify(buildLogExport(events, p, scopeLabel), null, 2)}
      markdown={(p) => buildLogMarkdown(events, p, scopeLabel)}
    />
  )
}

/**
 * Time, under the cloth it belongs to: a scrubber from the first recorded act
 * to now, a play button, and the shape of the cloth at wherever you are.
 *
 * It draws no map of its own — that is the whole point of the merge. The one
 * `ClothMap` in the card above reads `log.mapState` while this sits away from
 * the end of the record.
 */
export function CaptureLogScrubber({ log }: { log: CaptureLog }) {
  const { events, k, goTo, playing, setPlaying, atMax, current, when, cloth, loading, failed, reload } = log

  if (loading) return <p className="ghostnote" style={{ margin: "8px 0 0" }}>reading the record…</p>

  if (failed) {
    return (
      <p className="ghostnote" style={{ margin: "8px 0 0" }}>
        could not read the record{" "}
        <button
          type="button"
          className="act"
          style={{ background: "none", border: "none", padding: 0 }}
          onClick={reload}
        >
          try again
        </button>
      </p>
    )
  }

  if (!events || events.length === 0 || !cloth) {
    return (
      <p className="ghostnote" style={{ margin: "8px 0 0" }}>
        no weaving recorded yet — the record starts as you work
      </p>
    )
  }

  return (
    <>
      {/* Ticked by ACT, not by clock (TJ, 2026-08-12): the record's own unit is
          the act, and spacing by time would bunch a working evening into a
          smear and stretch the gap to next week across half the bar. One notch
          per act, evenly spaced.
          Starts at 1 — the first act. It started at 0, "before the first
          recorded act", which is a state nobody ever made. */}
      {/* ONE set of ticks (TJ, 2026-08-12: "the slider ticks and the timeline
          ticks dont line up. maybe we only need the slider ticks"). There were
          two, and they could not agree: the browser paints `list=` ticks across
          the whole track while the thumb only travels between its own
          half-widths, so the drawn strip and the native marks were offset by
          8px at each end and drifted in between. The datalist is gone; the
          drawn strip is inset by the thumb's radius so a mark sits exactly
          under the thumb that selects it. */}
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
      {/* Spaced BY ACT, which is the whole point: by clock, an evening's work
          smears into one blur and the gap to next week takes half the bar.
          Above ~180 acts the marks would merge into a rule, so they thin to
          every nth and the strip keeps meaning "many". */}
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
      {/* NOTHING IN THIS BAR MAY CHANGE WIDTH (TJ, 2026-08-13: "i really hate
          it when buttons change size and reformat the card"). The button
          reserves the width of its longest label, the counter is tabular and
          reserves its own, and "back to now" keeps its box and hides its ink.

          The reserve is only as wide as the longest label, so the label decides
          the button (TJ: "the play button might be oversized"). "▶ replay from
          the start" was holding 182px open at every position in the record, for
          a sentence shown at exactly one of them. "▶ replay" says the same
          thing — you are at the end, pressing it starts again — in a third of
          the room, and now "❚❚ pause" is the widest of the three. */}
      <div className="logbar">
        {/* Play runs it forward a beat at a time and stops at the end. At the
            end it starts over, because that is the only thing the word can
            mean there. */}
        <button
          type="button"
          className="btn ghost mini logplay"
          onClick={() => {
            if (playing) { setPlaying(false); return }
            if (atMax) goTo(1)
            setPlaying(true)
          }}
          aria-pressed={playing}
          title={atMax ? "play the record again from the first act" : undefined}
        >
          {playing ? "❚❚ pause" : atMax ? "▶ replay" : "▶ play"}
        </button>
        <span className="cap logcount">act {k} of {events.length}{atMax ? " · now" : ""}</span>
        {/* Back to the live cloth in one press. Dragging the scrubber the last
            few pixels is a fiddly way to say "never mind, show me my work".
            Always mounted — see above; at the end there is nowhere to go back
            to, so it is inert and invisible rather than absent. */}
        <button
          type="button"
          className="act"
          style={{
            background: "none", border: "none", padding: 0,
            visibility: atMax ? "hidden" : "visible",
          }}
          aria-hidden={atMax}
          tabIndex={atMax ? -1 : 0}
          onClick={() => { setPlaying(false); goTo(events.length) }}
        >
          back to now ›
        </button>

        {/* THE SHAPE, on the right of the same row (TJ, 2026-08-13: "the
            metadata could be right side"). It had a line of its own under the
            bar, which cost a row of height to say something the bar had room
            for. Right-aligned, so the part that changes — "now" against a full
            timestamp — grows leftward into empty space and moves nothing.

            The counts are the cloth's shape at this act: the three things drawn
            above. "· the read, revised once so far" used to hang off the end of
            them and TJ read it as irrelevant (2026-08-12); it was worse than
            that. It counted `read.update` and cloth-description edits, so it
            named an object that no longer exists — "the read" was the cloth's
            paragraph before migration 0021 replaced it with the Cloth
            Description, and today "your read" means a PROJECTION's paragraph.
            It counted a thing you cannot see, under a name for something else,
            beside three things you can.

            Counted one at a time: "1 concepts · 0 threads" is the same slip TJ
            caught on My Loom (66172a1), and the first act is always a 1. */}
        <span className="cap logshape">
          {cloth.concepts.length} concept{cloth.concepts.length !== 1 ? "s" : ""} ·{" "}
          {cloth.edges.length} thread{cloth.edges.length !== 1 ? "s" : ""} ·{" "}
          {cloth.passages.length} passage{cloth.passages.length !== 1 ? "s" : ""} —{" "}
          {atMax ? "now" : when ? `as of ${when}` : "at the first recorded act"}
        </span>
      </div>

      {/* Always in the flow, blank at the end — mounting it only once you leave
          "now" grew the card by a line the moment you pressed play. */}
      <p className="ghostnote logsaid" style={{ margin: "0 0 4px" }}>
        {current && !atMax ? describeEvent(current) : ""}
      </p>
    </>
  )
}
