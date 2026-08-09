// The reading lens (docs/archive/reading-scope-and-map-passes.md §A.3).
//
// A CONCEPT DOES NOT BELONG TO A READING — A BYTE DOES. A concept emerges from
// a reading and may then be evidenced in several: one User-level object,
// referenced by passages across readings (identity by object, not label —
// ruling 36). The stored relations are the passage's `sourceId` and its concept
// pointers (`byte_concept`), and everything below derives from them per render
// and throws the result away. Nothing here owns a concept, re-homes one, or
// writes.
//
// A reading is a door into one graph, never one of many graphs.

import type { Passage, Concept, Edge, LoomState } from "@/lib/types"

/**
 * A selection of readings the student is working in.
 *
 * `key` is the canonical form — sorted and comma-joined — and `''` means the
 * whole weave, every reading at once. Every row written before scoping existed
 * already means exactly that, which is why the empty key is the default rather
 * than a special case.
 */
export type Scope = { sourceIds: string[]; key: string }

export const WHOLE_WEAVE: Scope = { sourceIds: [], key: "" }

export function scopeOf(sourceIds: string[]): Scope {
  const ids = [...new Set(sourceIds.filter(Boolean))].sort()
  return { sourceIds: ids, key: ids.join(",") }
}

export function scopeFromKey(key: string): Scope {
  return scopeOf(key ? key.split(",") : [])
}

export const isWholeWeave = (scope: Scope) => scope.key === ""

/** The one reading this scope is, or null when it is a set or the whole weave. */
export function soleSourceId(scope: Scope): string | null {
  return scope.sourceIds.length === 1 ? scope.sourceIds[0] : null
}

/**
 * The graph as seen through one scope. Shaped so a tab can swap `state` for
 * this and keep reading `.concepts` / `.passages` / `.edges`, with the
 * cross-reading facts alongside rather than hidden.
 */
export type ScopedGraph = {
  /** Concepts evidenced in this scope, in capture order. */
  concepts: Concept[]
  /** Bytes captured from this scope's readings. */
  passages: Passage[]
  /** Threads with both ends in scope — this reading's internal weave. */
  edges: Edge[]
  /**
   * Threads with exactly one end in scope: the ones that run OUT of this
   * reading. The payoff of the back half of the term, so they are counted and
   * shown, never quietly filtered away.
   */
  bridges: Edge[]
  /** Concepts outside this scope, in capture order — reachable, not hidden. */
  outside: Concept[]
}

/**
 * A concept is *evidenced in* a scope when one of its passages came from one of
 * the scope's readings. It is not thereby the reading's — the same concept is
 * evidenced in every reading whose passages support it.
 *
 * Two deliberate exceptions:
 * - the whole weave (`key === ''`) contains everything, with no bridges and
 *   nothing outside;
 * - a concept with NO passages appears in every scope, flagged "no evidence" by
 *   its tab. Red line #4 already makes that a visible failure state, so it
 *   stays visible rather than being placed by an invented reading link.
 */
export function scopedGraph(state: LoomState, scope: Scope): ScopedGraph {
  if (isWholeWeave(scope)) {
    return {
      concepts: state.concepts,
      passages: state.passages,
      edges: state.edges,
      bridges: [],
      outside: [],
    }
  }

  const inScope = new Set(scope.sourceIds)
  const evidenced = new Set<string>()
  const hasByte = new Set<string>()
  const passages: Passage[] = []

  state.passages.forEach((b) => {
    b.conceptIds.forEach((id) => hasByte.add(id))
    if (b.sourceId && inScope.has(b.sourceId)) {
      b.conceptIds.forEach((id) => evidenced.add(id))
      passages.push(b)
    }
  })

  const isIn = (conceptId: string) => evidenced.has(conceptId) || !hasByte.has(conceptId)

  const concepts: Concept[] = []
  const outside: Concept[] = []
  state.concepts.forEach((c) => (isIn(c.id) ? concepts : outside).push(c))

  const edges: Edge[] = []
  const bridges: Edge[] = []
  state.edges.forEach((e) => {
    const from = isIn(e.fromId)
    const to = isIn(e.toId)
    if (from && to) edges.push(e)
    else if (from || to) bridges.push(e)
  })

  return { concepts, passages, edges, bridges, outside }
}

/** A scoped graph in the shape the tabs already consume. */
export function asLoomState(state: LoomState, graph: ScopedGraph): LoomState {
  return { ...state, concepts: graph.concepts, passages: graph.passages, edges: graph.edges }
}

/**
 * Which readings a concept is evidenced in. The seam that stitches the readings
 * together (§A.4): when this returns more than one id, the student has met the
 * same idea in two texts, which is the move the course is trying to teach.
 */
export function readingsOf(conceptId: string, passages: Passage[]): string[] {
  const ids = new Set<string>()
  passages.forEach((b) => {
    if (b.sourceId && b.conceptIds.includes(conceptId)) ids.add(b.sourceId)
  })
  return [...ids]
}

/** Per-reading tallies of the student's own acts. Counted, never scored. */
export type ReadingTally = { passages: number; concepts: number; threads: number }

/**
 * What the shelf shows on each card. Pure counting over the student's own
 * captures — no completion, no grade, no comparison (red line #7).
 */
export function tallyByReading(state: LoomState): Map<string, ReadingTally> {
  const conceptsBySource = new Map<string, Set<string>>()
  const byteCount = new Map<string, number>()

  state.passages.forEach((b) => {
    if (!b.sourceId) return
    byteCount.set(b.sourceId, (byteCount.get(b.sourceId) ?? 0) + 1)
    const set = conceptsBySource.get(b.sourceId) ?? new Set<string>()
    b.conceptIds.forEach((id) => set.add(id))
    conceptsBySource.set(b.sourceId, set)
  })

  const tallies = new Map<string, ReadingTally>()
  // Keyed by passage count, not by concept map: a reading whose only captures are
  // unlabeled passages still counts — the passage is the act, not the label.
  byteCount.forEach((count, sourceId) => {
    const conceptIds = conceptsBySource.get(sourceId) ?? new Set<string>()
    // A thread counts for a reading when either end is evidenced in it — the
    // same rule the workbench uses, so the card and the tab agree.
    const threads = state.edges.filter(
      (e) => conceptIds.has(e.fromId) || conceptIds.has(e.toId)
    ).length
    tallies.set(sourceId, {
      passages: count,
      concepts: conceptIds.size,
      threads,
    })
  })

  return tallies
}
