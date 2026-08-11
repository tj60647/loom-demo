// Download at the object.
//
// TJ, 2026-08-10: "we want to move to a download at the object, so the
// downloading of the knowledge graph, the downloading of particular
// projections, the downloading of threads, happens where they are made, not
// in a separate tab" — and red line 5's "whole-artifact export" is read as BY
// OBJECT: each object exports whole, rather than everything in one click.
//
// A Projection already had its file (buildMapExport in graphExport.ts). These
// are the three that had none, and the reason Keep cannot hide until they
// exist: a reading with captures but no projection had no file at all, which
// is the one thing red line 5 forbids under either reading of it.
//
// Each is a WHOLE artifact of its object, never a slice — a cloth file
// carries its passages, the concepts they evidence, the threads between those
// and its own projections; a threads file names both ends so it reads away
// from Loom; a vocabulary file is every concept and label the student owns.
//
// None is re-importable. Import goes away with Keep, so these are outbound
// artifacts: a portfolio, a hand-in, the student's own copy.

import { scopeFromKey, scopedGraph } from "./scope"
import { scopeLabelOf } from "./graphExport"
import type { GraphEvent, LoomExport, LoomState, Tier } from "./types"

export const LOOM_CLOTH_FORMAT = "loom-cloth"
export const LOOM_THREADS_FORMAT = "loom-threads"
export const LOOM_VOCABULARY_FORMAT = "loom-vocabulary"

/**
 * What every object file says about itself. The old whole-cloth export
 * carried one field — `student` — so a file could not say which course it
 * came from or when it was taken. These are read outside Loom, where that is
 * the difference between an artifact and an orphan.
 *
 * Course and section are OPTIONAL because they are looked up, not stamped on
 * every row: section is a fact about a membership rather than about any act,
 * so it is resolved once here instead of denormalised across the graph.
 */
export type ExportProvenance = {
  student: string
  course?: string
  section?: string
  /** ISO, stamped by the caller — a file that cannot say when cannot be filed. */
  exportedAt: string
}

export function provenanceOf(student: string, course?: string, section?: string): ExportProvenance {
  return {
    student,
    ...(course ? { course } : {}),
    ...(section ? { section } : {}),
    exportedAt: new Date().toISOString(),
  }
}

// --- the cloth: one reading's work ---

export type LoomClothExport = {
  format: typeof LOOM_CLOTH_FORMAT
  provenance: ExportProvenance
  cloth: {
    scopeKey: string
    scopeLabel: string
    title: string
    description: string
  }
  graph: {
    concepts: { id: string; label: string; def: string; note: string }[]
    passages: LoomExport["graph"]["passages"]
    edges: LoomExport["graph"]["edges"]
  }
  /** Its own projections travel: a cloth file that dropped them IS a slice. */
  projections: {
    id: string
    name: string
    essence: string
    read: string
    tiers: Record<string, Tier>
  }[]
}

export function buildClothExport(
  state: LoomState,
  scopeKey: string,
  provenance: ExportProvenance,
  titleOfSource?: (id: string) => string
): LoomClothExport {
  const scoped = scopedGraph(state, scopeFromKey(scopeKey))
  const cloth = state.cloths.find((c) => c.scopeKey === scopeKey)
  return {
    format: LOOM_CLOTH_FORMAT,
    provenance,
    cloth: {
      scopeKey,
      scopeLabel: scopeLabelOf(scopeKey, titleOfSource),
      title: cloth?.title ?? "",
      description: cloth?.description ?? "",
    },
    graph: {
      concepts: scoped.concepts.map((c) => ({
        id: c.id,
        label: c.label,
        def: c.def || "",
        note: c.note || "",
      })),
      passages: scoped.passages.map((b) => ({
        id: b.id,
        // Empty = an Unlabeled Passage; it travels like any other capture.
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
    projections: state.maps
      .filter((m) => m.scopeKey === scopeKey)
      .map((m) => ({
        id: m.id,
        name: m.name,
        essence: m.essence,
        read: m.read,
        tiers: m.tiers,
      })),
  }
}

/** The same cloth as prose — readable without Loom, and not re-importable. */
export function buildClothMarkdown(
  state: LoomState,
  scopeKey: string,
  provenance: ExportProvenance,
  titleOfSource?: (id: string) => string
): string {
  const data = buildClothExport(state, scopeKey, provenance, titleOfSource)
  const labelOf = new Map(data.graph.concepts.map((c) => [c.id, c.label]))
  const out: string[] = []
  const where = provenance.course ? ` · ${provenance.course}` : ""

  out.push(`# ${data.cloth.title || data.cloth.scopeLabel}`, "")
  out.push(`_${data.cloth.scopeLabel} · ${provenance.student}${where}_`, "")
  if (data.cloth.description) out.push(data.cloth.description, "")

  out.push(`## Concepts (${data.graph.concepts.length})`, "")
  for (const c of data.graph.concepts) {
    out.push(`- **${c.label}**${c.def ? ` — ${c.def}` : ""}`)
    for (const p of data.graph.passages.filter((b) => b.conceptIds.includes(c.id))) {
      out.push(`  - ${quote(p.text)}${p.location ? ` (${p.location})` : ""}`)
    }
  }
  out.push("")

  const unlabeled = data.graph.passages.filter((p) => p.conceptIds.length === 0)
  if (unlabeled.length) {
    out.push(`## Unlabeled passages (${unlabeled.length})`, "")
    for (const p of unlabeled) out.push(`- ${quote(p.text)}${p.location ? ` (${p.location})` : ""}`)
    out.push("")
  }

  if (data.graph.edges.length) {
    out.push(`## Threads (${data.graph.edges.length})`, "")
    for (const e of data.graph.edges) out.push(`- ${threadLine(labelOf.get(e.fromId), labelOf.get(e.toId), e.handle, e.sentence)}`)
    out.push("")
  }

  for (const p of data.projections) {
    out.push(`## Projection — ${p.name}`, "")
    if (p.essence) out.push(`_${p.essence}_`, "")
    if (p.read) out.push(p.read, "")
  }

  return out.join("\n")
}

// --- the threads of a scope ---

export type LoomThreadsExport = {
  format: typeof LOOM_THREADS_FORMAT
  provenance: ExportProvenance
  scopeKey: string
  scopeLabel: string
  /** Both ends NAMED, not just referenced: away from Loom an id says nothing. */
  threads: { id: string; from: string; to: string; handle: string; sentence: string }[]
}

export function buildThreadsExport(
  state: LoomState,
  scopeKey: string,
  provenance: ExportProvenance,
  titleOfSource?: (id: string) => string
): LoomThreadsExport {
  const scoped = scopedGraph(state, scopeFromKey(scopeKey))
  const labelOf = new Map(state.concepts.map((c) => [c.id, c.label]))
  return {
    format: LOOM_THREADS_FORMAT,
    provenance,
    scopeKey,
    scopeLabel: scopeLabelOf(scopeKey, titleOfSource),
    threads: scoped.edges.map((e) => ({
      id: e.id,
      from: labelOf.get(e.fromId) ?? "",
      to: labelOf.get(e.toId) ?? "",
      handle: e.handle || "",
      sentence: e.sentence || "",
    })),
  }
}

export function buildThreadsMarkdown(
  state: LoomState,
  scopeKey: string,
  provenance: ExportProvenance,
  titleOfSource?: (id: string) => string
): string {
  const data = buildThreadsExport(state, scopeKey, provenance, titleOfSource)
  const out: string[] = []
  out.push(`# Threads — ${data.scopeLabel}`, "")
  out.push(`_${provenance.student}${provenance.course ? ` · ${provenance.course}` : ""}_`, "")
  if (!data.threads.length) {
    out.push("_No threads here yet._")
    return out.join("\n")
  }
  for (const t of data.threads) out.push(`- ${threadLine(t.from, t.to, t.handle, t.sentence)}`)
  return out.join("\n")
}

// --- the vocabulary: the User's holdings, unscoped ---

export type LoomVocabularyExport = {
  format: typeof LOOM_VOCABULARY_FORMAT
  provenance: ExportProvenance
  /** UNSCOPED by definition: a concept belongs to the User, a passage to a reading. */
  concepts: {
    id: string
    label: string
    def: string
    note: string
    /** Counted, never judged — recurrence is a designation, not a score. */
    readings: number
    passages: number
  }[]
  linkLabels: { handle: string; uses: number }[]
}

export function buildVocabularyExport(state: LoomState, provenance: ExportProvenance): LoomVocabularyExport {
  const uses = new Map<string, number>()
  for (const e of state.edges) {
    const h = (e.handle || "").trim()
    if (h) uses.set(h, (uses.get(h) ?? 0) + 1)
  }
  return {
    format: LOOM_VOCABULARY_FORMAT,
    provenance,
    concepts: state.concepts.map((c) => {
      const own = state.passages.filter((p) => p.conceptIds.includes(c.id))
      return {
        id: c.id,
        label: c.label,
        def: c.def || "",
        note: c.note || "",
        readings: new Set(own.map((p) => p.sourceId).filter(Boolean)).size,
        passages: own.length,
      }
    }),
    linkLabels: [...uses.entries()]
      .map(([handle, n]) => ({ handle, uses: n }))
      .sort((a, b) => a.handle.localeCompare(b.handle)),
  }
}

export function buildVocabularyMarkdown(state: LoomState, provenance: ExportProvenance): string {
  const data = buildVocabularyExport(state, provenance)
  const out: string[] = []
  out.push(`# Vocabulary — ${provenance.student}`, "")
  out.push(`_every concept and link label you own${provenance.course ? ` · ${provenance.course}` : ""}_`, "")
  out.push(`## Concepts (${data.concepts.length})`, "")
  for (const c of [...data.concepts].sort((a, b) => a.label.localeCompare(b.label))) {
    const counted = `${c.passages} passage${c.passages !== 1 ? "s" : ""} · ${c.readings} reading${c.readings !== 1 ? "s" : ""}`
    out.push(`- **${c.label}** (${counted})${c.def ? ` — ${c.def}` : ""}`)
  }
  out.push("", `## Link labels (${data.linkLabels.length})`, "")
  if (!data.linkLabels.length) out.push("_None coined yet._")
  for (const l of data.linkLabels) out.push(`- **${l.handle}** (${l.uses})`)
  return out.join("\n")
}

// --- the capture log ---
//
// The Log has never been in any file: no builder emitted graphEvents, which
// is why hiding its surface would have made it unreachable AND unkeepable at
// once. TJ ruled 2026-08-10 that it downloads, so it does — an object like
// the others. Append-only and read-only: this is a record of acts, not a
// re-importable artifact.

export const LOOM_LOG_FORMAT = "loom-capture-log"

export type LoomLogExport = {
  format: typeof LOOM_LOG_FORMAT
  provenance: ExportProvenance
  /** Absent = the whole record; present = one reading's acts. */
  scopeLabel?: string
  entries: { at: string; kind: string; entityType: string; entityId: string | null; payload: Record<string, unknown> | null }[]
}

export function buildLogExport(
  events: GraphEvent[],
  provenance: ExportProvenance,
  scopeLabel?: string
): LoomLogExport {
  return {
    format: LOOM_LOG_FORMAT,
    provenance,
    ...(scopeLabel ? { scopeLabel } : {}),
    entries: events.map((e) => ({
      at: (e.at instanceof Date ? e.at : new Date(e.at)).toISOString(),
      kind: e.kind,
      entityType: e.entityType,
      entityId: e.entityId,
      payload: e.payload ?? null,
    })),
  }
}

export function buildLogMarkdown(
  events: GraphEvent[],
  provenance: ExportProvenance,
  scopeLabel?: string
): string {
  const out: string[] = []
  out.push(`# Capture Log${scopeLabel ? ` — ${scopeLabel}` : ""}`, "")
  out.push(`_${provenance.student}${provenance.course ? ` · ${provenance.course}` : ""} · ${events.length} act${events.length !== 1 ? "s" : ""}_`, "")
  if (!events.length) {
    out.push("_Nothing recorded here yet._")
    return out.join("\n")
  }
  for (const e of events) {
    const when = (e.at instanceof Date ? e.at : new Date(e.at)).toISOString().slice(0, 16).replace("T", " ")
    const label = typeof e.payload?.label === "string" ? ` — ${e.payload.label}` : ""
    out.push(`- \`${when}\` **${e.kind}**${label}`)
  }
  return out.join("\n")
}

// --- shared shaping ---

function quote(text: string): string {
  return `"${text.replace(/\s+/g, " ").trim()}"`
}

/** One thread as the sentence it is: from —[label]→ to: the student's words. */
function threadLine(from = "?", to = "?", handle = "", sentence = ""): string {
  return `**${from || "?"}** —[${handle || "…"}]→ **${to || "?"}**${sentence ? `: ${sentence}` : ""}`
}

/** `<student>-<slug>.<kind>.<ext>`, the shape mapExportFilename already uses. */
export function objectExportFilename(student: string, kind: string, slug: string, ext: string): string {
  const who = (student || "loom").replace(/\s+/g, "_").toLowerCase()
  const what = (slug || kind).replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").toLowerCase() || kind
  return `${who}-${what}.${kind}.${ext}`
}
