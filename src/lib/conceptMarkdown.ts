import type { Byte, Concept, Edge, Source } from "@/lib/types"

// ---- slugs ----

export function slugifyLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize("NFKD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "untitled"
}

/**
 * Assigns a collision-free slug per concept id. Ordering is by createdAt
 * then id so the same concept set always yields the same slugs.
 */
export function buildSlugMap(concepts: Concept[]): Map<string, string> {
  const counts = new Map<string, number>()
  const result = new Map<string, string>()
  const ordered = [...concepts].sort((a, b) =>
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  )
  for (const c of ordered) {
    const base = slugifyLabel(c.label)
    const n = (counts.get(base) ?? 0) + 1
    counts.set(base, n)
    result.set(c.id, n === 1 ? base : `${base}-${n}`)
  }
  return result
}

// ---- citation formatting ----

export function formatCitation(byte: Byte, sourcesById: Map<string, Source>): string {
  const src = byte.sourceId ? sourcesById.get(byte.sourceId) : undefined
  const page = byte.pageNumber != null ? `, p. ${byte.pageNumber}` : ""
  if (src) {
    const who = src.author ? `${src.author}, ` : ""
    return `${who}*${src.title}*${page}`
  }
  const label = byte.source || "Unknown source"
  const loc = byte.location ? ` — ${byte.location}` : ""
  return `${label}${loc}${page}`
}

// ---- markdown rendering ----

export type ConceptMarkdownDeps = {
  concept: Concept
  bytesForConcept: Byte[]
  outgoingEdges: Edge[]
  incomingEdges: Edge[]
  conceptsById: Map<string, Concept>
  slugsById: Map<string, string>
  sourcesById: Map<string, Source>
}

function escapeYamlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function renderConceptMarkdown(deps: ConceptMarkdownDeps): string {
  const { concept, bytesForConcept, outgoingEdges, incomingEdges, conceptsById, slugsById, sourcesById } = deps

  const frontmatter = [
    "---",
    `label: "${escapeYamlString(concept.label)}"`,
    `concept_id: ${concept.id}`,
    `created: ${concept.createdAt.toISOString()}`,
    "tags: [loom-concept]",
    "---",
    "",
  ].join("\n")

  const title = `# ${concept.label}\n`

  const definition = [
    "## Definition",
    "",
    concept.def?.trim() || "*No definition yet.*",
    "",
  ].join("\n")

  const notes = [
    "## Notes",
    "",
    concept.note?.trim() || "*No notes yet.*",
    "",
  ].join("\n")

  const evidenceLines = bytesForConcept.length
    ? bytesForConcept.map((b) => `- "${b.content.trim()}" — ${formatCitation(b, sourcesById)}`)
    : ["*No evidence bytes yet.*"]
  const evidence = ["## Evidence", "", ...evidenceLines, ""].join("\n")

  const wikilink = (otherId: string) => {
    const other = conceptsById.get(otherId)
    const slug = slugsById.get(otherId)
    if (!other || !slug) return null
    return `[[${slug}|${other.label}]]`
  }

  const connectionLines: string[] = []
  for (const e of outgoingEdges) {
    const link = wikilink(e.toId)
    if (link) connectionLines.push(`- **${e.handle || "relates to"}** ${link}${e.sentence ? ` — ${e.sentence}` : ""}`)
  }
  for (const e of incomingEdges) {
    const link = wikilink(e.fromId)
    if (link) connectionLines.push(`- ${link} **${e.handle || "relates to"}** this${e.sentence ? ` — ${e.sentence}` : ""}`)
  }
  const connections = [
    "## Connections",
    "",
    connectionLines.length ? connectionLines.join("\n") : "*No connections yet.*",
    "",
  ].join("\n")

  return [frontmatter, title, definition, notes, evidence, connections].join("\n")
}

// ---- editable-region parsing (viewer round-trip) ----

/**
 * Parses only the editable prefix of a rendered concept document: the H1
 * (label) and the Definition/Notes bodies. Evidence/Connections are always
 * derived from DB state and are never read back from the textarea.
 */
export function parseEditableConceptMarkdown(md: string): { label: string; def: string; note: string } {
  const withoutFrontmatter = md.replace(/^---\n[\s\S]*?\n---\n/, "")
  const titleMatch = withoutFrontmatter.match(/^#\s+(.+?)\s*$/m)
  const label = titleMatch?.[1]?.trim() || ""

  const section = (heading: string, stopHeadings: string[]) => {
    const startIdx = withoutFrontmatter.search(new RegExp(`^##\\s+${heading}\\s*$`, "m"))
    if (startIdx === -1) return ""
    const after = withoutFrontmatter.slice(startIdx)
    const bodyStart = after.indexOf("\n") + 1
    let body = after.slice(bodyStart)
    for (const stop of stopHeadings) {
      const stopIdx = body.search(new RegExp(`^##\\s+${stop}\\s*$`, "m"))
      if (stopIdx !== -1) body = body.slice(0, stopIdx)
    }
    const trimmed = body.trim()
    return trimmed === "*No definition yet.*" || trimmed === "*No notes yet.*" ? "" : trimmed
  }

  const def = section("Definition", ["Notes", "Evidence", "Connections"])
  const note = section("Notes", ["Evidence", "Connections"])

  return { label, def, note }
}
