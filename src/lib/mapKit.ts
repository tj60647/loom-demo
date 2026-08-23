// The map kit — everything needed to DRAW the concept map by hand, ported
// verbatim from v14 (loom-v14-example.html buildMapKit). Counting and sorting
// only; the arranging (the thinking) stays with the student. This is the
// hand-off out of the tool: an exploratory instrument's exit, not a document.
//
// "Counting and sorting only" is the whole rule, and three headings here broke
// it (fixed 2026-08-09). They said "the top few are your PRIMARY CANDIDATES",
// "one spine to HANG THE REST ON", and "STILL LOOSE (DECIDE: secondary,
// tertiary, or set aside)" — a ranking with an interpretive gloss, a
// recommendation, and an instruction to resolve a state red line 4 says is
// legal. This is a STUDENT surface (MapTab), and red line 3 is "counted, never
// judged: no scoring, no completion states, NO ADVICE". Every heading may say
// what was counted and how it was ordered. None may say what to do about it.

import { openLoomTakeLines, type OpenLoomTake } from "./objectExport"
import type { Concept, Edge, Tier } from "./types"
import { allComponents, degreeOf } from "./clothMath"

const TIER_GROUPS: [Tier, string][] = [
  ["p", "PRIMARY"],
  ["s", "SECONDARY"],
  ["t", "TERTIARY"],
  ["", "UNSORTED"],
  ["x", "SET ASIDE"],
]

export function buildMapKit(
  concepts: Concept[],
  edges: Edge[],
  student: string,
  map?: { name?: string; essence?: string; tiers?: Record<string, Tier> },
  taken?: OpenLoomTake
): string {
  const NL = "\n"
  const degs = concepts
    .map((c) => ({ c, d: degreeOf(edges, c.id) }))
    .sort((a, b) => b.d - a.d)
  const label = (id: string) => concepts.find((c) => c.id === id)?.label ?? "?"
  // The active map's tiers when given (per-map placement — the only placement
  // there is since the concept.tier mirror was dropped in 0021); with no map,
  // everything is unsorted and the kit falls back to degree ordering.
  const tierOf = (c: Concept): Tier => map?.tiers?.[c.id] ?? ""

  let out = "CONCEPT-MAP KIT — " + (student || "my weave") + (map?.name ? " — " + map.name : "") + NL
  const takeLines = openLoomTakeLines(student || "my weave", taken)
  if (takeLines.length) out += takeLines[0] + NL
  if (map?.essence?.trim()) out += "ONE-LINE: " + map.essence.trim() + NL
  out += "Take this to paper or Figma. You arrange; that is the thinking." + NL + NL

  const tiered = concepts.some((c) => ["p", "s", "t"].includes(tierOf(c)))
  if (tiered) {
    out += "CONCEPTS (grouped by YOUR tiers, from 03 - Knowledge Graph):" + NL
    TIER_GROUPS.forEach(([tier, name]) => {
      const group = concepts.filter((c) => tierOf(c) === tier)
      if (!group.length) return
      out += "  " + name + ":" + NL
      group.forEach((c) => {
        out += "    " + c.label + (c.def ? "  —  " + c.def : "") + NL
      })
    })
  } else {
    out += "CONCEPTS (most threads first — the number is how many touch each):" + NL
    degs.forEach((o) => {
      out += "  [" + o.d + "] " + o.c.label + (o.c.def ? "  —  " + o.c.def : "") + NL
    })
  }

  out += NL + "PROPOSITIONS (each should read as a sentence on your concept map):" + NL
  edges.forEach((e) => {
    out += "  " + label(e.fromId) + "  —[" + (e.handle || "…") + "]→  " + label(e.toId) + NL
    if (e.sentence) out += '      ("' + e.sentence + '")' + NL
  })

  const comps = allComponents(concepts, edges)
  if (comps.length && comps[0].edges.length >= 2) {
    out += NL + "THE LONGEST CHAIN (the most threads that connect end to end):" + NL
    comps[0].edges.forEach((e) => {
      out += "  " + label(e.fromId) + " → " + label(e.toId) + NL
    })
  }

  const unwoven = concepts.filter((c) => !degreeOf(edges, c.id))
  if (unwoven.length) {
    out +=
      NL +
      "NO THREAD TOUCHES THESE YET:" +
      NL +
      unwoven.map((c) => "  " + c.label).join(NL) +
      NL
  }
  return out
}

/**
 * The same kit as data (TJ, 2026-08-12: "update the download map kit to
 * include the .json and .md"). Every other object on the station hands over
 * both, and the kit is the one thing a student takes to another tool — where
 * a machine-readable copy is worth more than a printout, not less.
 *
 * Deliberately the SAME content as the markdown, in the same order: concepts
 * grouped by the tiers the student gave them, and the propositions between
 * them with both ends named. It is not the projection export — that one
 * carries the arrangement, the reads and the passages; this is the material
 * for drawing the map by hand.
 */
export function buildMapKitData(
  concepts: Concept[],
  edges: Edge[],
  student: string,
  map?: { name?: string; essence?: string; tiers?: Record<string, Tier> },
  taken?: OpenLoomTake
) {
  const tierOf = (c: Concept): Tier => map?.tiers?.[c.id] ?? ""
  const label = (id: string) => concepts.find((c) => c.id === id)?.label ?? "?"
  return {
    format: "loom-concept-map-kit",
    student: student || "my weave",
    ...(taken ?? {}),
    projection: map?.name ?? null,
    oneLine: map?.essence?.trim() || null,
    tiers: TIER_GROUPS.map(([tier, name]) => ({
      tier: name.toLowerCase(),
      concepts: concepts
        .filter((c) => tierOf(c) === tier)
        .map((c) => ({ label: c.label, description: c.def || null, threads: degreeOf(edges, c.id) })),
    })).filter((g) => g.concepts.length),
    propositions: edges.map((e) => ({
      from: label(e.fromId),
      label: e.handle || null,
      to: label(e.toId),
      sentence: e.sentence,
    })),
    // The two things the kit COUNTS rather than copies. They were in the
    // markdown and not here, which broke the rule the pair lives under (TJ,
    // 2026-08-12: "the json and md files should be similar content in
    // different forms").
    longestChain: (() => {
      const comps = allComponents(concepts, edges)
      if (!comps.length || comps[0].edges.length < 2) return []
      return comps[0].edges.map((e) => ({ from: label(e.fromId), to: label(e.toId) }))
    })(),
    untouched: concepts.filter((c) => !degreeOf(edges, c.id)).map((c) => c.label),
  }
}
