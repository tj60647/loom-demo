// Pure graph arithmetic over the student's concepts and edges — the counting
// half of "render and count, never decide" (red line #7). Shared by the Read
// tab, the Map tab, the history view, and the cloth SVGs so their numbers can
// never disagree.

import type { Concept, Edge } from "./types"

export type Component = { nodes: Set<string>; edges: Edge[] }

export function adjacency(edges: Edge[]): Record<string, Edge[]> {
  const adj: Record<string, Edge[]> = {}
  edges.forEach((e) => {
    ;(adj[e.fromId] = adj[e.fromId] || []).push(e)
    ;(adj[e.toId] = adj[e.toId] || []).push(e)
  })
  return adj
}

/** Connected component reachable from cid, edges in BFS walking order. */
export function componentOf(cid: string, adj: Record<string, Edge[]>): Component {
  const nodes = new Set([cid])
  const queue = [cid]
  const edges: Edge[] = []
  const seenEdges = new Set<string>()

  while (queue.length) {
    const id = queue.shift()!
    ;(adj[id] || []).forEach((e) => {
      if (!seenEdges.has(e.id)) {
        seenEdges.add(e.id)
        edges.push(e)
      }
      ;[e.fromId, e.toId].forEach((other) => {
        if (!nodes.has(other)) {
          nodes.add(other)
          queue.push(other)
        }
      })
    })
  }
  return { nodes, edges }
}

/** All components with at least one edge, largest first. */
export function allComponents(concepts: Concept[], edges: Edge[]): Component[] {
  const adj = adjacency(edges)
  const seen = new Set<string>()
  const comps: Component[] = []

  concepts.forEach((c) => {
    if (seen.has(c.id) || !(adj[c.id] || []).length) return
    const comp = componentOf(c.id, adj)
    comp.nodes.forEach((n) => seen.add(n))
    comps.push(comp)
  })
  return comps.sort((a, b) => b.nodes.size - a.nodes.size)
}

export function degreeOf(edges: Edge[], cid: string): number {
  return edges.filter((e) => e.fromId === cid || e.toId === cid).length
}

/**
 * Coined terms reused across edges — "emerging vocabulary" (spec §2
 * recurrence). Keyed case-insensitively, most-reused first; only handles used
 * more than once qualify.
 */
export function recurringHandles(edges: Edge[]): [string, Edge[]][] {
  const byHandle: Record<string, Edge[]> = {}
  edges.forEach((e) => {
    if (e.handle) {
      const key = e.handle.toLowerCase()
      ;(byHandle[key] = byHandle[key] || []).push(e)
    }
  })
  return Object.entries(byHandle)
    .filter(([, uses]) => uses.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
}

/** Concepts with no captured passage — the red-line-#4 visible failure state. */
export function noEvidenceConcepts(concepts: Concept[], passages: { conceptIds: string[] }[]): Concept[] {
  const evidenced = new Set(passages.flatMap((b) => b.conceptIds))
  return concepts.filter((c) => !evidenced.has(c.id))
}

/**
 * Paste tidy (v14): re-join hyphenated line breaks, collapse newlines and runs
 * of whitespace. Capture automation, permitted by red line #2.
 */
export function tidy(text: string): string {
  return text
    .replace(/-\s*\n\s*/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

export function short(s: string | null | undefined, n: number): string {
  const str = s || ""
  return str.length > n ? str.slice(0, n - 1) + "…" : str
}
