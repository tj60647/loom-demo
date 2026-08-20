// Which acts belong to a reading's Capture Log.
//
// TJ, 2026-08-10: the Capture Log moves to 03 · Knowledge Graph and is
// "specific to that reading, not all readings" — and, asked how acts that
// have no reading should place, ruled EVIDENCE-DERIVED.
//
// The difficulty is real and it is the model's, not an accident: a Passage
// belongs to a reading, but a Concept belongs to the User and a Thread joins
// two Concepts. So "everything you did in this reading" cannot be read off
// the rows. Three answers, in this order:
//
//  1. THE ACT SAID SO. Every event carries the reading it happened in —
//     passages from their own row, everything else from the route the student
//     was on. A stamp is authoritative, including a null one: capturing an
//     untethered passage belongs to no reading, and saying so is not the same
//     as not knowing.
//
//     Passages, concepts and threads were stamped on 2026-08-10; on
//     2026-08-11 the rest followed — editing, merging and deleting a concept,
//     coining and rewording and removing a thread, coining a Link and giving
//     it its gloss. TJ's reason, once the whole weave was ruled out of the
//     app: "i am worried about losing meaningful activities related to
//     reading, passage capture, concept labeling, link labeling, building
//     threads, organizing concepts and threads, and building projections from
//     a readings cloth." Every one of those is an act in a reading, so every
//     one of them now says which.
//
//  2. ITS SCOPE SAID SO. Cloth and projection events carry a scopeKey, which
//     for a single-reading scope IS the sourceId.
//
//  3. THE EVIDENCE SAYS SO. For acts recorded before the stamp existed, and
//     for the create events `getGraphEvents` synthesizes for rows that have
//     none: a concept belongs where it has a passage, a thread where both its
//     ends do. This is the same rule contextual search uses, so the two
//     surfaces agree about what "in this reading" means. It is a fallback for
//     the record's history, not the path new work takes.
//
// The honest cost of (3), worth knowing rather than hiding: an old entry can
// appear in a reading later, when evidence arrives. Nothing is ever rewritten
// — the record is append-only — but what a reading SHOWS of it can grow. New
// acts do not drift, because (1) settles them at the moment they happen.

import type { GraphEvent, LoomState } from "./types"

/** Course-wide acts — they happened to the whole loom, this reading included. */
const WHOLE_LOOM = new Set(["graph.import", "graph.reset", "graph.example"])

function payloadOf(e: GraphEvent): Record<string, unknown> {
  return (e.payload ?? {}) as Record<string, unknown>
}

/**
 * Did this act happen in this reading? `state` supplies the evidence for
 * step 3 — pass the WHOLE loom, not a scoped slice: the question is which
 * readings a concept is evidenced in, which a slice cannot answer.
 */
export function eventBelongsToReading(event: GraphEvent, sourceId: string, state: LoomState): boolean {
  const payload = payloadOf(event)

  // 1. The act said so. Present-and-null means "no reading", deliberately.
  if ("sourceId" in payload) return payload.sourceId === sourceId

  // 2. Its scope said so.
  if ("scopeKey" in payload) return payload.scopeKey === sourceId

  // A whole-loom act belongs to every reading it touched.
  if (WHOLE_LOOM.has(event.kind)) return true

  // 3. The evidence says so — the pre-stamp fallback.
  const here = new Set(
    state.passages.filter((p) => p.sourceId === sourceId).flatMap((p) => p.conceptIds)
  )

  if (event.entityType === "concept") {
    return !!event.entityId && here.has(event.entityId)
  }

  if (event.entityType === "edge") {
    // Both ends evidenced here — ThrowTab's own rule for what a thread in
    // this reading is. The ids may be on the event or on the live row.
    const edge = state.edges.find((e) => e.id === event.entityId)
    const fromId = typeof payload.fromId === "string" ? payload.fromId : edge?.fromId
    const toId = typeof payload.toId === "string" ? payload.toId : edge?.toId
    return !!fromId && !!toId && here.has(fromId) && here.has(toId)
  }

  if (event.entityType === "passage") {
    // A passage event from before the stamp: ask the row, while it lives. A
    // deleted one cannot be placed — which is exactly why the stamp exists.
    const passage = state.passages.find((p) => p.id === event.entityId)
    return !!passage && passage.sourceId === sourceId
  }

  return false
}

/** This reading's acts, in the record's own order. */
export function eventsForReading(events: GraphEvent[], sourceId: string, state: LoomState): GraphEvent[] {
  return events.filter((e) => eventBelongsToReading(e, sourceId, state))
}
