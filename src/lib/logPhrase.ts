/**
 * How an act reads, in the student's language rather than the record's.
 *
 * Shared so the LOG PANEL and the LOG FILE cannot drift (TJ, 2026-08-12: "the
 * json and md files should be similar content in different forms" — and a
 * markdown file printing `passage.capture` while the panel beside it says
 * "captured a passage" is the same drift in a smaller place). The event KINDS
 * keep their own names: they are written into graph_event and a log is
 * history. Only the sentence is ours to choose.
 */
import type { GraphEvent } from "./types"

/** The tier letters as the student reads them on the Sort list. */
export const TIER_WORD: Record<string, string> = {
  p: "primary", s: "secondary", t: "tertiary", x: "set aside", "": "unsorted",
}

export function describeEvent(e: GraphEvent): string {
  const p = e.payload ?? {}
  switch (e.kind) {
    case "concept.create": return typeof p.label === "string" && p.label ? `named "${p.label}"` : "named a concept"
    case "concept.rename": return "renamed a concept"
    case "concept.retier": return "re-tiered a concept"
    case "concept.update": return "revised a concept's description"
    case "concept.merge":
      return typeof p.fromLabel === "string" && typeof p.intoLabel === "string"
        ? `merged "${p.fromLabel}" into "${p.intoLabel}"`
        : "merged two concepts"
    case "concept.delete": return "removed a concept"
    case "passage.create": return "captured a passage"
    // The note itself is not in the event — only how long it is. A log that
    // survives reset should not be carrying the student's prose.
    case "passage.note":
      return typeof p.noteChars === "number" && p.noteChars === 0
        ? "cleared a passage's note"
        : "wrote a note on a passage"
    case "passage.capture":
      return Array.isArray(p.conceptIds) && p.conceptIds.length === 0
        ? "captured an unlabeled passage"
        : "captured a passage"
    case "passage.refile": return "filed a passage under a second concept"
    case "passage.unfile": return "unfiled a passage from a concept"
    case "passage.attribute": return "placed passages in their reading"
    case "passage.delete": return "removed a passage"
    case "edge.throw": return "threw a thread"
    // The KIND keeps its name — `edge.coin` and `link.coin` are written into
    // graph_event and a log is history — but what the log SAYS follows the
    // student's language, which stopped being "coin" on 2026-08-12.
    case "edge.coin": return typeof p.handle === "string" && p.handle ? `labelled a link "${p.handle}"` : "cleared a link's label"
    case "edge.update": return "reworded a thread"
    case "edge.delete": return "removed a thread"
    // 5.1: a Link is an object now, so making one is its own act — it can
    // happen with no thread using it yet.
    case "link.coin": return typeof p.label === "string" && p.label ? `added the link label "${p.label}"` : "added a link label"
    case "link.update": return typeof p.label === "string" ? `renamed a link to "${p.label}"` : "glossed a link"
    case "read.update": return "revised the read"
    case "map.create": return typeof p.name === "string" && p.name ? `started a new projection — "${p.name}"` : "started a new projection"
    case "map.rename": return typeof p.name === "string" && p.name ? `renamed a projection to "${p.name}"` : "renamed a projection"
    case "map.retier": return "re-sorted a projection"
    case "map.update": return "revised a projection's description"
    case "map.delete": return typeof p.name === "string" && p.name ? `removed a projection ("${p.name}")` : "removed a projection"
    case "map.import": return "brought a projection in"
    case "cloth.update":
      return typeof p.descriptionChars === "number" ? "revised a cloth's description" : "titled a cloth"
    case "graph.reset": return "reset the cloth"
    case "reading.reset": return "started this reading over"
    // "took off the shelf", not "deleted": the row is archived, the passages
    // captured from it are untouched, and an admin can put it back.
    case "reading.archive":
      return typeof p.title === "string" && p.title
        ? `took "${p.title}" off their shelf`
        : "took a reading of their own off their shelf"
    case "graph.import": return "imported a cloth"
    case "graph.example": return "loaded the worked example"
    default: return "one more act on the record"
  }
}
