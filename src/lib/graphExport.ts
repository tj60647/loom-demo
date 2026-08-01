// The §6 export contract and its inverse. `graph` is the artifact — the thing
// an agent or a future reader consumes; `views` is student-authored geometry
// that round-trips so no arrangement is lost, but that no consumer must read.
// Red line #5: the export is the student's artifact, always available.

import type { CardTableView, Concept, LoomExport, LoomMap, LoomState, LoomViews, Tier } from "./types"
import { scopeFromKey, scopedGraph } from "./scope"

const TIERS = new Set(["", "p", "s", "t", "x"])

function asTier(value: unknown): Tier {
  return typeof value === "string" && TIERS.has(value) ? (value as Tier) : ""
}

const TIER_GROUPS: [Tier, string][] = [
  ["p", "Primary"],
  ["s", "Secondary"],
  ["t", "Tertiary"],
  ["", "Unsorted"],
  ["x", "Left off the map"],
]

export function buildExport(state: LoomState, student: string): LoomExport {
  return {
    graph: {
      student,
      concepts: state.concepts.map((c) => ({
        id: c.id,
        label: c.label,
        def: c.def || "",
        note: c.note || "",
        tier: c.tier || "",
      })),
      bytes: state.bytes.map((b) => ({
        id: b.id,
        conceptId: b.conceptId,
        source: b.source || "",
        location: b.location || "",
        // The contract's field is `text`; the app's column is `content`.
        text: b.content,
        // Capture provenance for PDF-captured bytes — a contract extension
        // (see spec changelog); consumers may ignore it.
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
      edges: state.edges.map((e) => ({
        id: e.id,
        fromId: e.fromId,
        toId: e.toId,
        sentence: e.sentence,
        handle: e.handle || "",
      })),
      read: state.read || "",
      // The student's maps — additive; `concepts[].tier` and `read` above stay
      // the mirror of the oldest whole-weave map, so pre-maps consumers still
      // see a sorted graph.
      ...(state.maps.length
        ? {
            maps: state.maps.map((m) => ({
              id: m.id,
              scopeKey: m.scopeKey,
              name: m.name,
              essence: m.essence,
              read: m.read,
              tiers: m.tiers,
            })),
          }
        : {}),
    },
    views: {
      cardTable: {
        positions: state.views.cardTable.positions,
        bends: state.views.cardTable.bends,
        ...(state.views.cardTable.order?.length ? { order: state.views.cardTable.order } : {}),
        ...(state.views.cardTable.pins?.length ? { pins: state.views.cardTable.pins } : {}),
      },
      ...(() => {
        const mapViews: NonNullable<LoomExport["views"]["maps"]> = {}
        state.maps.forEach((m) => {
          const v = state.views[`map:${m.id}`]
          if (!v) return
          if (!Object.keys(v.positions).length && !Object.keys(v.bends).length && !v.order?.length && !v.pins?.length) return
          mapViews[m.id] = {
            positions: v.positions,
            bends: v.bends,
            ...(v.order?.length ? { order: v.order } : {}),
            ...(v.pins?.length ? { pins: v.pins } : {}),
          }
        })
        return Object.keys(mapViews).length ? { maps: mapViews } : {}
      })(),
    },
  }
}

/** Markdown export (spec §3 Global, production) — for Obsidian / notes / agents. */
export function buildMarkdown(
  state: LoomState,
  student: string,
  titleOfSource?: (id: string) => string
): string {
  const label = (id: string) => state.concepts.find((c) => c.id === id)?.label ?? "?"
  const lines: string[] = []
  lines.push(`# Loom — ${student || "my weave"}`, "")

  if (state.read?.trim()) {
    lines.push("## My read", "", state.read.trim(), "")
  }

  // Each map is its own artifact: a named sorting of concepts within a scope,
  // with a one-line essence and an interpretive paragraph.
  if (state.maps.length) {
    lines.push("## Maps", "")
    const scopeLabel = (scopeKey: string) =>
      scopeKey === ""
        ? "your whole weave"
        : scopeKey.split(",").map((id) => (titleOfSource ? titleOfSource(id) : id)).join(" + ")
    const tierGroups: [Tier, string][] = [
      ["p", "Primary"],
      ["s", "Secondary"],
      ["t", "Tertiary"],
      ["x", "Left off the map"],
    ]
    state.maps.forEach((m) => {
      lines.push(`### ${m.name} — ${scopeLabel(m.scopeKey)}`, "")
      if (m.essence.trim()) lines.push(`_${m.essence.trim()}_`, "")
      if (m.read.trim()) lines.push(m.read.trim(), "")
      tierGroups.forEach(([tier, name]) => {
        const group = state.concepts.filter((c) => m.tiers[c.id] === tier)
        if (!group.length) return
        lines.push(`**${name}:** ${group.map((c) => c.label).join(" · ")}`, "")
      })
    })
  }

  lines.push("## Concepts", "")
  const groups: [Tier, string][] = [
    ["p", "Primary"],
    ["s", "Secondary"],
    ["t", "Tertiary"],
    ["", "Unsorted"],
    ["x", "Left off the map"],
  ]
  const tiered = state.concepts.some((c) => ["p", "s", "t"].includes(c.tier))
  const emitConcept = (c: Concept) => {
    lines.push(`- **${c.label}**${c.def ? ` — ${c.def}` : ""}${c.note ? ` _(${c.note})_` : ""}`)
    state.bytes
      .filter((b) => b.conceptId === c.id)
      .forEach((b) => {
        const cite = [b.source, b.location].filter(Boolean).join(" · ")
        lines.push(`  - > ${b.content}${cite ? ` — ${cite}` : ""}`)
      })
  }
  if (tiered) {
    groups.forEach(([tier, name]) => {
      const group = state.concepts.filter((c) => (c.tier || "") === tier)
      if (!group.length) return
      lines.push(`### ${name}`, "")
      group.forEach(emitConcept)
      lines.push("")
    })
  } else {
    state.concepts.forEach(emitConcept)
    lines.push("")
  }

  lines.push("## Propositions", "")
  state.edges.forEach((e) => {
    lines.push(`- ${label(e.fromId)} —[${e.handle || "…"}]→ ${label(e.toId)}`)
    lines.push(`  - "${e.sentence}"`)
  })
  lines.push("")
  return lines.join("\n")
}

// --- IMPORT ---
// Accepts the §6 shape, v14's flat shape, and (via v14's migrate() semantics)
// the legacy v2/v3 shapes: triples+noticings become edges, byte notes fold onto
// their concept. Original ids become symbolic keys; the server remints real ids
// and remaps the view geometry to match.

export type ParsedImport = {
  student: string
  read: string
  concepts: { key: string; label: string; def: string; note: string; tier: Tier }[]
  bytes: {
    conceptKey: string
    source: string
    location: string
    text: string
    anchor?: {
      sourceId: string
      pageNumber: number | null
      startOffset: number | null
      endOffset: number | null
      pageContentHash: string | null
    }
  }[]
  edges: { key: string; fromKey: string; toKey: string; sentence: string; handle: string }[]
  cardTable: CardTableView // keyed by concept/edge *keys*, remapped server-side
  /** Tiers keyed by concept *keys*; the server remints ids (like cardTable). */
  maps: { key: string; scopeKey: string; name: string; essence: string; read: string; tiers: Record<string, Tier> }[]
  /** Per-map geometry keyed by map *key*, inner keys concept/edge keys. */
  mapViews: Record<string, CardTableView>
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

export function parseImport(raw: string): ParsedImport {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error("That file did not parse as JSON.")
  }
  if (!data || typeof data !== "object") throw new Error("That file did not parse as a loom export.")

  // A single-map file must never reach the replace path: treating it as a
  // whole export would swap the entire cloth for one map's slice (red line
  // #5). parseAnyImport routes it to the additive map import instead.
  if (data.format === LOOM_MAP_FORMAT) {
    throw new Error("That file is a single-map export — it adds a map to your cloth rather than replacing it.")
  }

  // Reject JSON that is not a loom export at all — {}, [], a stray
  // package.json. Import REPLACES the graph, so silently treating arbitrary
  // JSON as a valid empty export would erase a student's work (red line #5).
  const looksLikeExport =
    (typeof data.graph === "object" && data.graph !== null) ||
    Array.isArray(data.concepts) ||
    Array.isArray(data.triples)
  if (!looksLikeExport) throw new Error("That file did not parse as a loom export.")

  // §6 shape: { graph, views } — flatten to the v14-ish working shape first.
  // Per-map geometry is captured before the flatten, since flattening replaces
  // `data` with the graph's members.
  const views = (data.views ?? {}) as Record<string, unknown>
  const cardTableRaw = (views.cardTable ?? {}) as Record<string, unknown>
  const mapViewsRaw = (views.maps && typeof views.maps === "object" ? views.maps : {}) as Record<string, unknown>
  if (data.graph && typeof data.graph === "object") {
    const g = data.graph as Record<string, unknown>
    data = {
      ...g,
      positions: cardTableRaw.positions ?? {},
      bends: cardTableRaw.bends ?? {},
      order: cardTableRaw.order ?? [],
      pins: cardTableRaw.pins ?? [],
    }
  }

  const rawConcepts = Array.isArray(data.concepts) ? (data.concepts as Record<string, unknown>[]) : []
  const rawBytes = Array.isArray(data.bytes) ? (data.bytes as Record<string, unknown>[]) : []
  const rawEdges = Array.isArray(data.edges) ? (data.edges as Record<string, unknown>[]) : []

  const concepts = rawConcepts
    .filter((c) => str(c.label).trim())
    .map((c, i) => ({
      key: str(c.id) || `c-${i}`,
      label: str(c.label).trim(),
      def: str(c.def),
      note: str(c.note),
      tier: asTier(c.tier),
    }))
  const conceptKeys = new Set(concepts.map((c) => c.key))

  const bytes = rawBytes
    .filter((b) => conceptKeys.has(str(b.conceptId)) && (str(b.text) || str(b.content)))
    .map((b) => {
      const anchorSource = str(b.sourceId) || str((b.anchor as Record<string, unknown> | undefined)?.sourceId)
      const a = (b.anchor ?? b) as Record<string, unknown>
      return {
        conceptKey: str(b.conceptId),
        source: str(b.source),
        location: str(b.location),
        // v14 exports `text`; app-era exports may carry `content`.
        text: str(b.text) || str(b.content),
        ...(anchorSource
          ? {
              anchor: {
                sourceId: anchorSource,
                pageNumber: typeof a.pageNumber === "number" ? a.pageNumber : null,
                startOffset: typeof a.startOffset === "number" ? a.startOffset : null,
                endOffset: typeof a.endOffset === "number" ? a.endOffset : null,
                pageContentHash: str(a.pageContentHash) || null,
              },
            }
          : {}),
      }
    })

  // Legacy v2/v3: byte.note folds onto its concept (joined with ' · ').
  rawBytes.forEach((b) => {
    const note = str(b.note)
    if (!note) return
    const c = concepts.find((x) => x.key === str(b.conceptId))
    if (c) c.note = c.note ? c.note + " · " + note : note
  })

  const edges = rawEdges
    .filter((e) => conceptKeys.has(str(e.fromId)) && conceptKeys.has(str(e.toId)))
    .map((e, i) => ({
      key: str(e.id) || `e-${i}`,
      fromKey: str(e.fromId),
      toKey: str(e.toId),
      sentence: str(e.sentence),
      handle: str(e.handle),
    }))

  // Legacy v2/v3: triples become edges; the linked noticing's text is the sentence.
  if (Array.isArray(data.triples)) {
    const noticings = Array.isArray(data.noticings) ? (data.noticings as Record<string, unknown>[]) : []
    const noticingText = (id: unknown) => str(noticings.find((n) => n.id === id)?.text)
    ;(data.triples as Record<string, unknown>[]).forEach((t, i) => {
      if (!conceptKeys.has(str(t.fromId)) || !conceptKeys.has(str(t.toId))) return
      edges.push({
        key: str(t.id) || `t-${i}`,
        fromKey: str(t.fromId),
        toKey: str(t.toId),
        sentence: noticingText(t.noticingId),
        handle: str(t.rel),
      })
    })
  }

  const edgeKeys = new Set(edges.map((e) => e.key))

  // Defensive geometry parse, shared by the card table and each map's view:
  // keep only known concept/edge keys, dedupe order and pins.
  const parseGeometry = (raw: Record<string, unknown>): CardTableView => {
    const positions: CardTableView["positions"] = {}
    const bends: CardTableView["bends"] = {}
    const rawPositions = (raw.positions ?? {}) as Record<string, { x?: unknown; y?: unknown }>
    const rawBends = (raw.bends ?? {}) as Record<string, { dx?: unknown; dy?: unknown }>
    Object.entries(rawPositions).forEach(([key, p]) => {
      if (conceptKeys.has(key) && typeof p?.x === "number" && typeof p?.y === "number") {
        positions[key] = { x: p.x, y: p.y }
      }
    })
    Object.entries(rawBends).forEach(([key, b]) => {
      if (edgeKeys.has(key) && typeof b?.dx === "number" && typeof b?.dy === "number") {
        bends[key] = { dx: b.dx, dy: b.dy }
      }
    })
    const dedupe = (value: unknown): string[] => {
      const out: string[] = []
      const seen = new Set<string>()
      ;(Array.isArray(value) ? value : []).forEach((key) => {
        if (typeof key !== "string" || !conceptKeys.has(key) || seen.has(key)) return
        seen.add(key)
        out.push(key)
      })
      return out
    }
    // Pinned definitions round-trip like the rest of the card table: a student
    // gesture, so losing it on export/import would lose arrangement work.
    return { positions, bends, order: dedupe(raw.order), pins: dedupe(raw.pins) }
  }

  const cardTable = parseGeometry({
    positions: data.positions,
    bends: data.bends,
    order: data.order,
    pins: data.pins,
  })

  const rawMaps = Array.isArray(data.maps) ? (data.maps as Record<string, unknown>[]) : []
  const maps: ParsedImport["maps"] = rawMaps.map((m, i) => {
    const rawTiers = (m.tiers && typeof m.tiers === "object" ? m.tiers : {}) as Record<string, unknown>
    const tiers: Record<string, Tier> = {}
    Object.entries(rawTiers).forEach(([key, t]) => {
      if (!conceptKeys.has(key)) return
      const tier = asTier(t)
      if (tier) tiers[key] = tier
    })
    return {
      key: str(m.id) || `m-${i}`,
      scopeKey: str(m.scopeKey),
      name: str(m.name).trim().slice(0, 80) || `Map ${i + 1}`,
      essence: str(m.essence),
      read: str(m.read),
      tiers,
    }
  })
  const mapKeys = new Set(maps.map((m) => m.key))
  const mapViews: Record<string, CardTableView> = {}
  Object.entries(mapViewsRaw).forEach(([mapKey, v]) => {
    if (!mapKeys.has(mapKey) || !v || typeof v !== "object") return
    mapViews[mapKey] = parseGeometry(v as Record<string, unknown>)
  })

  // A pre-maps file still describes one whole-weave map — its tiers, read and
  // card table. Synthesize it exactly the way migration 0012 backfilled live
  // rows, so an old export and an old database land in the same place.
  if (!maps.length && (concepts.length || str(data.read))) {
    const tiers: Record<string, Tier> = {}
    concepts.forEach((c) => {
      if (c.tier) tiers[c.key] = c.tier
    })
    maps.push({ key: "legacy-map-1", scopeKey: "", name: "Map 1", essence: "", read: str(data.read), tiers })
    mapViews["legacy-map-1"] = cardTable
  }

  return {
    student: str(data.student),
    read: str(data.read),
    concepts,
    bytes,
    edges,
    cardTable,
    maps,
    mapViews,
  }
}

export function emptyViews(): LoomViews {
  return { cardTable: { positions: {}, bends: {} } }
}

/** Filename-safe student slug, matching v14's export naming. */
export function exportFilename(student: string, ext: string): string {
  const name = (student || "loom").replace(/\s+/g, "_").toLowerCase()
  return `${name}-loom.${ext}`
}

// --- PER-MAP EXPORT (ratified TJ 2026-07-31) ---
// A map is the primary keepable artifact: the file a student submits or hands
// on is one map — its tiers, essence and paragraph — carried with the cards,
// passages and threads it arranges, so it reads on its own. The whole-cloth
// export above stays as the complete backup; keeping a map is never the only
// copy of anything (red line #5).

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
    bytes: LoomExport["graph"]["bytes"]
    edges: LoomExport["graph"]["edges"]
  }
  view?: CardTableView
}

/** Readable scope label: the whole weave, or the readings' titles. */
export function scopeLabelOf(scopeKey: string, titleOfSource?: (id: string) => string): string {
  return scopeKey === ""
    ? "the whole weave"
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
      // A concept's evidence travels whole — every byte of every member
      // concept, not only the scope's own passages — so the file stands alone.
      bytes: state.bytes
        .filter((b) => memberIds.has(b.conceptId))
        .map((b) => ({
          id: b.id,
          conceptId: b.conceptId,
          source: b.source || "",
          location: b.location || "",
          text: b.content,
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

  lines.push(`# ${map.name} — a map of ${scopeLabelOf(map.scopeKey, titleOfSource)}`, "")
  if (student) lines.push(`_${student}_`, "")
  if (map.essence.trim()) lines.push(`**${map.essence.trim()}**`, "")
  if (map.read.trim()) lines.push(map.read.trim(), "")

  TIER_GROUPS.forEach(([tier, name]) => {
    const group = scoped.concepts.filter((c) => (map.tiers[c.id] ?? "") === tier)
    if (!group.length) return
    lines.push(`## ${name}`, "")
    group.forEach((c) => {
      lines.push(`- **${c.label}**${c.def ? ` — ${c.def}` : ""}${c.note ? ` _(${c.note})_` : ""}`)
      state.bytes
        .filter((b) => b.conceptId === c.id)
        .forEach((b) => {
          const cite = [b.source, b.location].filter(Boolean).join(" · ")
          lines.push(`  - > ${b.content}${cite ? ` — ${cite}` : ""}`)
        })
    })
    lines.push("")
  })

  if (scoped.edges.length) {
    lines.push("## Propositions", "")
    scoped.edges.forEach((e) => {
      lines.push(`- ${label(e.fromId)} —[${e.handle || "…"}]→ ${label(e.toId)}`)
      lines.push(`  - "${e.sentence}"`)
    })
    lines.push("")
  }

  return lines.join("\n")
}

export function mapExportFilename(student: string, mapName: string, ext: string): string {
  const name = (student || "loom").replace(/\s+/g, "_").toLowerCase()
  const mapSlug = (mapName || "map").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toLowerCase() || "map"
  return `${name}-${mapSlug}.map.${ext}`
}

// --- MAP IMPORT ---
// The inverse is deliberately narrower than the whole-cloth import: a map file
// RESTORES AN ARRANGEMENT onto cards the student still has, matched by concept
// id. It never re-weaves missing cards (the whole .json does that) and never
// replaces anything — the map arrives as another parallel sibling.

export type ParsedMapImport = {
  student: string
  map: { scopeKey: string; name: string; essence: string; read: string; tiers: Record<string, Tier> }
  /** Geometry keyed by the file's concept/edge ids; filtered server-side. */
  view: CardTableView
  /** Concept ids the file's tiers reference, for match reporting. */
  referencedConceptIds: string[]
}

function parseMapImportData(data: Record<string, unknown>): ParsedMapImport {
  const rawMap = (data.map && typeof data.map === "object" ? data.map : {}) as Record<string, unknown>
  const name = str(rawMap.name).trim().slice(0, 80)
  if (!name) throw new Error("That map file has no map name — it did not parse as a loom map export.")

  const tiers: Record<string, Tier> = {}
  const rawTiers = (rawMap.tiers && typeof rawMap.tiers === "object" ? rawMap.tiers : {}) as Record<string, unknown>
  Object.entries(rawTiers).forEach(([key, t]) => {
    const tier = asTier(t)
    if (tier) tiers[key] = tier
  })

  const rawView = (data.view && typeof data.view === "object" ? data.view : {}) as Record<string, unknown>
  const positions: CardTableView["positions"] = {}
  const bends: CardTableView["bends"] = {}
  Object.entries((rawView.positions ?? {}) as Record<string, { x?: unknown; y?: unknown }>).forEach(([key, p]) => {
    if (typeof p?.x === "number" && typeof p?.y === "number") positions[key] = { x: p.x, y: p.y }
  })
  Object.entries((rawView.bends ?? {}) as Record<string, { dx?: unknown; dy?: unknown }>).forEach(([key, b]) => {
    if (typeof b?.dx === "number" && typeof b?.dy === "number") bends[key] = { dx: b.dx, dy: b.dy }
  })
  const strings = (value: unknown): string[] => {
    const out: string[] = []
    const seen = new Set<string>()
    ;(Array.isArray(value) ? value : []).forEach((key) => {
      if (typeof key !== "string" || seen.has(key)) return
      seen.add(key)
      out.push(key)
    })
    return out
  }
  const view: CardTableView = { positions, bends, order: strings(rawView.order), pins: strings(rawView.pins) }

  const referencedConceptIds = [
    ...new Set([...Object.keys(tiers), ...Object.keys(positions), ...(view.order ?? []), ...(view.pins ?? [])]),
  ]

  return {
    student: str(data.student),
    map: {
      scopeKey: str(rawMap.scopeKey),
      name,
      essence: str(rawMap.essence),
      read: str(rawMap.read),
      tiers,
    },
    view,
    referencedConceptIds,
  }
}

export type AnyImport =
  | { kind: "cloth"; cloth: ParsedImport }
  | { kind: "map"; map: ParsedMapImport }

/**
 * Routes an import file by what it is: a whole-cloth export (replaces the
 * cloth) or a single-map export (adds a map). Throws with a friendly message
 * on anything else.
 */
export function parseAnyImport(raw: string): AnyImport {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error("That file did not parse as JSON.")
  }
  if (data && typeof data === "object" && (data as Record<string, unknown>).format === LOOM_MAP_FORMAT) {
    return { kind: "map", map: parseMapImportData(data as Record<string, unknown>) }
  }
  return { kind: "cloth", cloth: parseImport(raw) }
}
