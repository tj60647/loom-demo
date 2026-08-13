// The per-Projection export, and the scope label every surface names a scope
// with.
//
// This file used to hold the WHOLE-graph export and its inverse — buildExport,
// buildMarkdown, parseImport, parseAnyImport and the two Parsed* types, some
// 600 lines. They went with Keep on 2026-08-11: download moved to each object
// (src/lib/objectExport.ts builds the cloth, the threads, the vocabulary and
// the log; this file builds the projection), and import went outright — TJ,
// "import goes away". Red line 5 is met per object rather than in one file:
// each one exports WHOLE.

import type { CardTableView, LoomExport, LoomMap, LoomState, LoomViews, Tier } from "./types"
import { scopeFromKey, scopedGraph } from "./scope"
import { fileStamp } from "./objectExport"

const TIER_GROUPS: [Tier, string][] = [
  ["p", "Primary"],
  ["s", "Secondary"],
  ["t", "Tertiary"],
  ["", "Unsorted"],
  ["x", "Set aside"],
]

export function emptyViews(): LoomViews {
  return { cardTable: { positions: {}, bends: {} } }
}

// --- PER-PROJECTION EXPORT (ratified TJ 2026-07-31) ---
// A projection is the primary keepable artifact: the file a student submits or
// hands on is one projection — its tiers, essence and paragraph — carried with
// the cards, passages and threads it arranges, so it reads on its own.

export const LOOM_MAP_FORMAT = "loom-map"

export type LoomMapExport = {
  format: typeof LOOM_MAP_FORMAT
  student: string
  map: {
    id: string
    scopeKey: string
    /** Readable form of the scope, so the file makes sense away from Loom. */
    scopeLabel: string
    name: string
    essence: string
    read: string
    tiers: Record<string, Tier>
  }
  graph: {
    /** `tier` here is THIS map's tier — the file is a sorted graph on its own. */
    concepts: { id: string; label: string; def: string; note: string; tier: Tier }[]
    passages: LoomExport["graph"]["passages"]
    edges: LoomExport["graph"]["edges"]
  }
  view?: CardTableView
}

/**
 * Readable scope label — a reading's title.
 *
 * The empty key used to mean "the whole weave" and now means a scope no
 * surface offers; rows written there before 2026-08-11 still carry it, so it
 * still needs a word rather than rendering blank.
 */
export function scopeLabelOf(scopeKey: string, titleOfSource?: (id: string) => string): string {
  return scopeKey === ""
    ? "no reading"
    : scopeKey.split(",").map((id) => (titleOfSource ? titleOfSource(id) : id)).join(" + ")
}

export function buildMapExport(
  state: LoomState,
  map: LoomMap,
  student: string,
  titleOfSource?: (id: string) => string
): LoomMapExport {
  const scoped = scopedGraph(state, scopeFromKey(map.scopeKey))
  const memberIds = new Set(scoped.concepts.map((c) => c.id))
  const view = state.views[`map:${map.id}`]
  const hasGeometry =
    view &&
    (Object.keys(view.positions).length > 0 ||
      Object.keys(view.bends).length > 0 ||
      (view.order?.length ?? 0) > 0 ||
      (view.pins?.length ?? 0) > 0)

  return {
    format: LOOM_MAP_FORMAT,
    student,
    map: {
      id: map.id,
      scopeKey: map.scopeKey,
      scopeLabel: scopeLabelOf(map.scopeKey, titleOfSource),
      name: map.name,
      essence: map.essence,
      read: map.read,
      tiers: map.tiers,
    },
    graph: {
      concepts: scoped.concepts.map((c) => ({
        id: c.id,
        label: c.label,
        def: c.def || "",
        note: c.note || "",
        tier: map.tiers[c.id] ?? "",
      })),
      // A concept's evidence travels whole — every passage of every member
      // concept, not only the scope's own passages — so the file stands
      // alone. The scope's own unlabeled passages travel too: a projection
      // shows them as its unattached group.
      passages: state.passages
        .filter(
          (b) =>
            b.conceptIds.some((id) => memberIds.has(id)) ||
            scoped.passages.some((sb) => sb.id === b.id)
        )
        .map((b) => ({
          id: b.id,
          conceptIds: b.conceptIds,
          source: b.source || "",
          location: b.location || "",
          text: b.content,
          ...(b.note ? { note: b.note } : {}),
          ...(b.question ? { question: b.question } : {}),
          ...(b.isPullQuote ? { isPullQuote: true } : {}),
          ...(b.tier ? { tier: b.tier } : {}),
          ...(b.sourceId
            ? {
                anchor: {
                  sourceId: b.sourceId,
                  pageNumber: b.pageNumber,
                  startOffset: b.startOffset,
                  endOffset: b.endOffset,
                  pageContentHash: b.pageContentHash,
                },
              }
            : {}),
        })),
      edges: scoped.edges.map((e) => ({
        id: e.id,
        fromId: e.fromId,
        toId: e.toId,
        sentence: e.sentence,
        handle: e.handle || "",
      })),
    },
    ...(hasGeometry
      ? {
          view: {
            positions: view.positions,
            bends: view.bends,
            ...(view.order?.length ? { order: view.order } : {}),
            ...(view.pins?.length ? { pins: view.pins } : {}),
          },
        }
      : {}),
  }
}

/** Readable single-map outline — the map's story with its evidence under it. */
export function buildMapMarkdown(
  state: LoomState,
  map: LoomMap,
  student: string,
  titleOfSource?: (id: string) => string
): string {
  const scoped = scopedGraph(state, scopeFromKey(map.scopeKey))
  const label = (id: string) => state.concepts.find((c) => c.id === id)?.label ?? "?"
  const lines: string[] = []

  lines.push(`# ${map.name} — a projection of ${scopeLabelOf(map.scopeKey, titleOfSource)}`, "")
  if (student) lines.push(`_${student}_`, "")
  if (map.essence.trim()) lines.push(`**${map.essence.trim()}**`, "")
  if (map.read.trim()) lines.push(map.read.trim(), "")

  TIER_GROUPS.forEach(([tier, name]) => {
    const group = scoped.concepts.filter((c) => (map.tiers[c.id] ?? "") === tier)
    if (!group.length) return
    lines.push(`## ${name}`, "")
    group.forEach((c) => {
      lines.push(`- **${c.label}**${c.def ? ` — ${c.def}` : ""}${c.note ? ` _(${c.note})_` : ""}`)
      state.passages
        .filter((b) => b.conceptIds.includes(c.id))
        .forEach((b) => {
          const cite = [b.source, b.location].filter(Boolean).join(" · ")
          lines.push(`  - > ${b.content}${cite ? ` — ${cite}` : ""}`)
        })
    })
    lines.push("")
  })

  const unfiled = scoped.passages.filter((b) => b.conceptIds.length === 0)
  if (unfiled.length) {
    lines.push("## Unfiled passages", "")
    unfiled.forEach((b) => {
      const cite = [b.source, b.location].filter(Boolean).join(" · ")
      lines.push(`- > ${b.content}${cite ? ` — ${cite}` : ""}`)
    })
    lines.push("")
  }

  if (scoped.edges.length) {
    lines.push("## Propositions", "")
    scoped.edges.forEach((e) => {
      lines.push(`- ${label(e.fromId)} —[${e.handle || "…"}]→ ${label(e.toId)}`)
      if (e.sentence) lines.push(`  - "${e.sentence}"`)
    })
    lines.push("")
  }

  return lines.join("\n")
}

export function mapExportFilename(student: string, mapName: string, ext: string, at?: Date): string {
  const name = (student || "loom").replace(/\s+/g, "_").toLowerCase()
  const mapSlug = (mapName || "projection").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toLowerCase() || "projection"
  // Stamped like every other download, last (TJ, 2026-08-12) — see `fileStamp`.
  return `${name}-${mapSlug}.projection.${fileStamp(at)}.${ext}`
}
