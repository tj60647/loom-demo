// Resolving a Link — the one place that decides what a label means.
//
// 5.1 made a Link an object the student owns, but `edge.handle` still carries
// a copy of the label through the expand phase. So two questions recur all
// over the app: "what is this thread's label?" and "does the student already
// own a Link for this word?". Both are answered here, once, because BOTH
// providers must agree — the real one and the practice loom's, which cannot
// call the server at all — and the server repeats the same normalization in
// SQL (loom.ts's lower(btrim(…)) label matches). A second implementation is
// how they would drift.
//
// Case-insensitive throughout, because that is how the derived Link List
// always grouped handles: "Leads to" and "leads to" were one row on screen,
// and the object model must not quietly make them two.

import type { Edge, Link } from "./types"

/** The comparison key for a label. Trimmed and folded — never stored. */
export function normLabel(label: string): string {
  return label.trim().toLowerCase()
}

/**
 * The student's Link for this label, if they already own one.
 *
 * Homonyms are legal (ruling 36 — warned, never forbidden), so more than one
 * row can match; the EARLIEST coined wins, because that is the one the
 * student has been using. Deterministic on ties by id, so two readers of the
 * same loom never disagree.
 */
export function findLink(links: Link[], label: string): Link | undefined {
  const key = normLabel(label)
  if (!key) return undefined
  return links
    .filter((l) => normLabel(l.label) === key)
    .sort((a, b) => {
      const at = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return at !== 0 ? at : a.id.localeCompare(b.id)
    })[0]
}

/**
 * What this thread is labelled. The Link object first, the legacy string
 * second — the rule `Edge.handle` has been documenting since 5.1 landed.
 * When `handle`'s column is dropped the fallback goes and nothing else moves.
 */
export function labelOf(edge: Edge, links: Link[]): string {
  if (edge.linkId) {
    const link = links.find((l) => l.id === edge.linkId)
    if (link) return link.label
  }
  return edge.handle ?? ""
}

/**
 * Threads per Link — including the Links with none, which is the state 5.1
 * exists for (TJ: "a link with label and definition without it being used in
 * a thread"). Every Link gets an entry, so a caller counting uses never has
 * to distinguish "no threads" from "not in the map".
 *
 * Falls back to matching by label while `handle` survives: rows written
 * before 0024 — and anything seeded or imported — carry a handle with a null
 * linkId, and a count that ignored them would under-report the student's own
 * work.
 */
export function usesOf(links: Link[], edges: Edge[]): Map<string, Edge[]> {
  const byId = new Map<string, Edge[]>(links.map((l) => [l.id, []]))
  const byLabel = new Map<string, string>()
  for (const l of links) {
    const key = normLabel(l.label)
    // First writer wins, matching findLink's earliest-coined rule.
    if (key && !byLabel.has(key)) byLabel.set(key, l.id)
  }

  for (const edge of edges) {
    let id = edge.linkId && byId.has(edge.linkId) ? edge.linkId : null
    if (!id) {
      const key = normLabel(edge.handle ?? "")
      id = key ? byLabel.get(key) ?? null : null
    }
    if (id) byId.get(id)!.push(edge)
  }
  return byId
}

/** A thread carrying a label that matches no Link the student owns. Only
 *  possible while `handle` survives; the count belongs in no UI.
 *  scripts/check-link-resolve.ts pins this function's behaviour on fixtures
 *  and the attachLink/updateEdge wiring that keeps fresh work resolvable. */
export function unresolvedLabelled(links: Link[], edges: Edge[]): Edge[] {
  const known = new Set(links.map((l) => normLabel(l.label)))
  return edges.filter((e) => {
    if (e.linkId) return false
    const key = normLabel(e.handle ?? "")
    return !!key && !known.has(key)
  })
}
