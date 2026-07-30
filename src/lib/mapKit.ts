// The map kit — everything needed to DRAW the concept map by hand, ported
// verbatim from v14 (loom-v14-example.html buildMapKit). Counting and sorting
// only; the arranging (the thinking) stays with the student. This is the
// hand-off out of the tool: an exploratory instrument's exit, not a document.

import type { Concept, Edge, Tier } from "./types"
import { allComponents, degreeOf } from "./clothMath"

const TIER_GROUPS: [Tier, string][] = [
  ["p", "PRIMARY"],
  ["s", "SECONDARY"],
  ["t", "TERTIARY"],
  ["", "UNSORTED"],
  ["x", "LEFT OFF"],
]

export function buildMapKit(concepts: Concept[], edges: Edge[], student: string): string {
  const NL = "\n"
  const degs = concepts
    .map((c) => ({ c, d: degreeOf(edges, c.id) }))
    .sort((a, b) => b.d - a.d)
  const label = (id: string) => concepts.find((c) => c.id === id)?.label ?? "?"

  let out = "MAP KIT — " + (student || "my weave") + NL
  out += "Take this to paper or Figma. You arrange; that is the thinking." + NL + NL

  const tiered = concepts.some((c) => ["p", "s", "t"].includes(c.tier))
  if (tiered) {
    out += "CONCEPTS (grouped by YOUR tiers, from 04 - Map):" + NL
    TIER_GROUPS.forEach(([tier, name]) => {
      const group = concepts.filter((c) => (c.tier || "") === tier)
      if (!group.length) return
      out += "  " + name + ":" + NL
      group.forEach((c) => {
        out += "    " + c.label + (c.def ? "  —  " + c.def : "") + NL
      })
    })
  } else {
    out += "CONCEPTS (busiest first — the top few are your primary candidates):" + NL
    degs.forEach((o) => {
      out += "  [" + o.d + "] " + o.c.label + (o.c.def ? "  —  " + o.c.def : "") + NL
    })
  }

  out += NL + "PROPOSITIONS (each should read as a sentence on your map):" + NL
  edges.forEach((e) => {
    out += "  " + label(e.fromId) + "  —[" + (e.handle || "…") + "]→  " + label(e.toId) + NL
    out += '      ("' + e.sentence + '")' + NL
  })

  const comps = allComponents(concepts, edges)
  if (comps.length && comps[0].edges.length >= 2) {
    out += NL + "A POSSIBLE ARMATURE (your largest chain — one spine to hang the rest on):" + NL
    comps[0].edges.forEach((e) => {
      out += "  " + label(e.fromId) + " → " + label(e.toId) + NL
    })
  }

  const unwoven = concepts.filter((c) => !degreeOf(edges, c.id))
  if (unwoven.length) {
    out +=
      NL +
      "STILL LOOSE (decide: secondary, tertiary, or leave off the map):" +
      NL +
      unwoven.map((c) => "  " + c.label).join(NL) +
      NL
  }
  return out
}
