// The §6 export contract and its inverse. `graph` is the artifact — the thing
// an agent or a future reader consumes; `views` is student-authored geometry
// that round-trips so no arrangement is lost, but that no consumer must read.
// Red line #5: the export is the student's artifact, always available.

import type { CardTableView, Concept, LoomExport, LoomState, Tier } from "./types"

const TIERS = new Set(["", "p", "s", "t", "x"])

function asTier(value: unknown): Tier {
  return typeof value === "string" && TIERS.has(value) ? (value as Tier) : ""
}

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
    },
    views: {
      cardTable: {
        positions: state.views.cardTable.positions,
        bends: state.views.cardTable.bends,
        ...(state.views.cardTable.order?.length ? { order: state.views.cardTable.order } : {}),
        ...(state.views.cardTable.pins?.length ? { pins: state.views.cardTable.pins } : {}),
      },
    },
  }
}

/** Markdown export (spec §3 Global, production) — for Obsidian / notes / agents. */
export function buildMarkdown(state: LoomState, student: string): string {
  const label = (id: string) => state.concepts.find((c) => c.id === id)?.label ?? "?"
  const lines: string[] = []
  lines.push(`# Loom — ${student || "my weave"}`, "")

  if (state.read?.trim()) {
    lines.push("## My read", "", state.read.trim(), "")
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

  // Reject JSON that is not a loom export at all — {}, [], a stray
  // package.json. Import REPLACES the graph, so silently treating arbitrary
  // JSON as a valid empty export would erase a student's work (red line #5).
  const looksLikeExport =
    (typeof data.graph === "object" && data.graph !== null) ||
    Array.isArray(data.concepts) ||
    Array.isArray(data.triples)
  if (!looksLikeExport) throw new Error("That file did not parse as a loom export.")

  // §6 shape: { graph, views } — flatten to the v14-ish working shape first.
  const views = (data.views ?? {}) as Record<string, unknown>
  const cardTableRaw = (views.cardTable ?? {}) as Record<string, unknown>
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
  const positions: CardTableView["positions"] = {}
  const bends: CardTableView["bends"] = {}
  const rawPositions = (data.positions ?? {}) as Record<string, { x?: unknown; y?: unknown }>
  const rawBends = (data.bends ?? {}) as Record<string, { dx?: unknown; dy?: unknown }>
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
  const rawOrder = Array.isArray(data.order) ? (data.order as unknown[]) : []
  const order: string[] = []
  const seenOrder = new Set<string>()
  rawOrder.forEach((key) => {
    if (typeof key !== "string" || !conceptKeys.has(key) || seenOrder.has(key)) return
    seenOrder.add(key)
    order.push(key)
  })

  // Pinned definitions round-trip like the rest of the card table: a student
  // gesture, so losing it on export/import would lose arrangement work.
  const rawPins = Array.isArray(data.pins) ? (data.pins as unknown[]) : []
  const pins: string[] = []
  const seenPins = new Set<string>()
  rawPins.forEach((key) => {
    if (typeof key !== "string" || !conceptKeys.has(key) || seenPins.has(key)) return
    seenPins.add(key)
    pins.push(key)
  })

  return {
    student: str(data.student),
    read: str(data.read),
    concepts,
    bytes,
    edges,
    cardTable: { positions, bends, order, pins },
  }
}

export function emptyViews(): { cardTable: CardTableView } {
  return { cardTable: { positions: {}, bends: {} } }
}

/** Filename-safe student slug, matching v14's export naming. */
export function exportFilename(student: string, ext: string): string {
  const name = (student || "loom").replace(/\s+/g, "_").toLowerCase()
  return `${name}-loom.${ext}`
}
