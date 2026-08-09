/**
 * Lays a Flow out on a grid — pure arithmetic, no DOM.
 *
 * Kept apart from the component so the geometry can be asserted without a
 * browser (`scripts/check-workflows.ts`), and so adding a step to
 * `src/lib/workflows.ts` never means touching a coordinate. Rows come from
 * longest-path depth over the forward edges; back edges are excluded from
 * depth (they are returns, not progress) and routed through a gutter on the
 * right.
 *
 * Text is wrapped by character count rather than measured. That is
 * deliberate: it is deterministic, it renders identically on the server and
 * the client (no hydration drift), and it needs no font metrics. The cost is
 * that a very wide glyph run can sit a little proud of its box — acceptable
 * for a diagram of a dozen short labels.
 */
import type { Flow, FlowEdge, FlowNode } from "@/lib/workflows"

export const NODE_W = 236
const PAD_TOP = 13
const PAD_BOTTOM = 13
const LABEL_LH = 17
const WHERE_LH = 14
const LABEL_GAP = 5
const ROW_GAP = 58
const COL_GAP = 34
const MARGIN = 26
/** Room on the right for return edges to bow out into. */
const GUTTER = 52

/** Roughly how many characters fit on a line at each size, at NODE_W. */
const LABEL_CHARS = 31
const WHERE_CHARS = 38

export type LaidNode = {
  node: FlowNode
  x: number
  y: number
  w: number
  h: number
  labelLines: string[]
  whereLines: string[]
}

export type LaidEdge = {
  edge: FlowEdge
  path: string
  labelX: number
  labelY: number
  /** Forward labels centre on the line; return labels sit right of the gutter. */
  labelAnchor: "middle" | "start"
}

export type LaidFlow = {
  width: number
  height: number
  nodes: LaidNode[]
  edges: LaidEdge[]
}

/**
 * Greedy word wrap. A word longer than the line is broken rather than allowed
 * to overflow — a URL or a long identifier should look cramped, not escape
 * the box.
 */
export function wrapText(text: string, maxChars: number, maxLines = 4): string[] {
  const lines: string[] = []
  let line = ""
  for (const rawWord of text.split(/\s+/).filter(Boolean)) {
    let word = rawWord
    while (word.length > maxChars) {
      if (line) { lines.push(line); line = "" }
      lines.push(word.slice(0, maxChars - 1) + "-")
      word = word.slice(maxChars - 1)
    }
    if (!line) line = word
    else if (line.length + 1 + word.length <= maxChars) line += " " + word
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1].replace(/.{1}$/, "…")
    return kept
  }
  return lines
}

function nodeHeight(labelLines: number, whereLines: number) {
  return (
    PAD_TOP +
    labelLines * LABEL_LH +
    (whereLines ? LABEL_GAP + whereLines * WHERE_LH : 0) +
    PAD_BOTTOM
  )
}

/**
 * Longest-path depth over forward edges only. Iterated to a fixed point rather
 * than sorted topologically: the graphs are a dozen nodes and this needs no
 * cycle handling beyond the bound, so a malformed flow settles instead of
 * hanging.
 */
function depths(flow: Flow): Map<string, number> {
  const forward = flow.edges.filter((e) => !e.back)
  const depth = new Map<string, number>()
  for (const node of flow.nodes) depth.set(node.id, 0)
  for (let pass = 0; pass < flow.nodes.length; pass++) {
    let changed = false
    for (const edge of forward) {
      if (!depth.has(edge.from) || !depth.has(edge.to)) continue
      const next = depth.get(edge.from)! + 1
      if (next > depth.get(edge.to)!) {
        depth.set(edge.to, next)
        changed = true
      }
    }
    if (!changed) break
  }
  return depth
}

export function layoutFlow(flow: Flow): LaidFlow {
  const depth = depths(flow)

  const measured = flow.nodes.map((node) => {
    const labelLines = wrapText(node.label, LABEL_CHARS)
    const whereLines = node.where ? wrapText(node.where, WHERE_CHARS, 2) : []
    return { node, labelLines, whereLines, h: nodeHeight(labelLines.length, whereLines.length) }
  })

  // Rows keep the author's order within a depth, so re-ordering the nodes
  // array in workflows.ts re-orders the diagram — the only layout control
  // there is, and enough of one.
  const rows = new Map<number, typeof measured>()
  for (const item of measured) {
    const d = depth.get(item.node.id) ?? 0
    const row = rows.get(d) ?? []
    row.push(item)
    rows.set(d, row)
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a - b)

  const widest = Math.max(
    ...rowKeys.map((k) => {
      const n = rows.get(k)!.length
      return n * NODE_W + (n - 1) * COL_GAP
    }),
    NODE_W
  )

  // A forward edge that skips a row would be drawn straight down THROUGH the
  // box sitting between its ends — invisible, label and all, since nodes paint
  // over edges. Those get their own lanes on the left, mirroring the returns on
  // the right, which is why the content needs room on that side.
  const bypassEdges = flow.edges.filter(
    (e) => !e.back && (depth.get(e.to) ?? 0) - (depth.get(e.from) ?? 0) > 1
  )
  const bypassLaneOf = new Map(bypassEdges.map((e, i) => [e, i]))
  const LANE_STEP = 17
  const leftPad = bypassEdges.length ? bypassEdges.length * LANE_STEP + 20 : 0

  const placed = new Map<string, LaidNode>()
  // The top and bottom of each row's band. Return edges run their horizontal
  // legs in the gaps BETWEEN bands, which are free of boxes by construction —
  // that is what keeps a return from cutting through a step.
  const rowTop = new Map<number, number>()
  const rowBottom = new Map<number, number>()
  let y = MARGIN
  for (const key of rowKeys) {
    const row = rows.get(key)!
    const rowWidth = row.length * NODE_W + (row.length - 1) * COL_GAP
    let x = MARGIN + leftPad + (widest - rowWidth) / 2
    let tallest = 0
    for (const item of row) {
      placed.set(item.node.id, {
        node: item.node,
        x,
        y,
        w: NODE_W,
        h: item.h,
        labelLines: item.labelLines,
        whereLines: item.whereLines,
      })
      x += NODE_W + COL_GAP
      tallest = Math.max(tallest, item.h)
    }
    rowTop.set(key, y)
    rowBottom.set(key, y + tallest)
    y += tallest + ROW_GAP
  }

  // The lane returns run in, clear of every box. Its width has to account for
  // the labels that sit beside it, or a long condition prints back over the
  // diagram it belongs to.
  const backLabel = Math.max(
    0,
    ...flow.edges.filter((e) => e.back && e.label).map((e) => e.label!.length * 6.2 + 16)
  )
  // One lane per return, not one lane for all of them: two returns sharing a
  // line read as a single connector going somewhere neither of them goes.
  const backEdges = flow.edges.filter((e) => e.back)
  const laneOf = new Map(backEdges.map((e, i) => [e, i]))
  const laneBase = MARGIN + leftPad + widest + GUTTER * 0.55
  const outerLane = laneBase + Math.max(0, backEdges.length - 1) * LANE_STEP
  const width = outerLane + 14 + backLabel + MARGIN

  const edges: LaidEdge[] = []
  // A return leaving the last row runs BELOW it, so the canvas has to grow to
  // hold the leg — otherwise the line is clipped at the bottom edge.
  let lowestLeg = 0
  for (const edge of flow.edges) {
    const from = placed.get(edge.from)
    const to = placed.get(edge.to)
    if (!from || !to) continue // a dangling id is reported by check-workflows

    if (edge.back) {
      // Down out of the source, along the gap below its row, up the lane,
      // along the gap above the target's row, and down into it. Every leg is
      // in a band that holds no boxes, so a return never crosses a step —
      // which a straight line from one node's edge to another's does as soon
      // as either has a neighbour.
      //
      // Orthogonal with rounded corners rather than a bezier: a curve only
      // approaches its control points, so one aimed at the lane still bowed
      // back through the diagram.
      const fromDepth = depth.get(edge.from) ?? 0
      const toDepth = depth.get(edge.to) ?? 0
      const exitY = (rowBottom.get(fromDepth) ?? from.y + from.h) + ROW_GAP / 2
      const entryY = (rowTop.get(toDepth) ?? to.y) - ROW_GAP / 2
      // Offset from centre so the return does not leave and arrive on top of
      // the forward arrows that use the same faces.
      const x1 = from.x + from.w * 0.74
      const x2 = to.x + to.w * 0.74
      const r = 11
      const laneX = laneBase + (laneOf.get(edge) ?? 0) * LANE_STEP

      // A "back" edge that does not actually go back has no lane to run in;
      // draw it as a plain curve rather than an inside-out route.
      const routable = exitY > entryY + r * 2 && laneX > x1 + r * 2 && laneX > x2 + r * 2
      const path = routable
        ? [
            `M ${x1} ${from.y + from.h}`,
            `L ${x1} ${exitY - r}`,
            `Q ${x1} ${exitY} ${x1 + r} ${exitY}`,
            `L ${laneX - r} ${exitY}`,
            `Q ${laneX} ${exitY} ${laneX} ${exitY - r}`,
            `L ${laneX} ${entryY + r}`,
            `Q ${laneX} ${entryY} ${laneX - r} ${entryY}`,
            `L ${x2 + r} ${entryY}`,
            `Q ${x2} ${entryY} ${x2} ${entryY + r}`,
            `L ${x2} ${to.y}`,
          ].join(" ")
        : `M ${from.x + from.w} ${from.y + from.h / 2} C ${laneX} ${from.y + from.h / 2}, ${laneX} ${to.y + to.h / 2}, ${to.x + to.w} ${to.y + to.h / 2}`

      if (routable) lowestLeg = Math.max(lowestLeg, exitY)
      edges.push({
        edge,
        path,
        labelX: outerLane + 10,
        labelY: routable ? (exitY + entryY) / 2 : (from.y + to.y) / 2,
        labelAnchor: "start",
      })
      continue
    }

    const bypassLane = bypassLaneOf.get(edge)
    if (bypassLane !== undefined) {
      // Out of the left of the source, down a lane clear of the column, and
      // back in at the target's top — the mirror of a return.
      const fromDepth = depth.get(edge.from) ?? 0
      const toDepth = depth.get(edge.to) ?? 0
      const outY = (rowBottom.get(fromDepth) ?? from.y + from.h) + ROW_GAP / 2
      const inY = (rowTop.get(toDepth) ?? to.y) - ROW_GAP / 2
      const laneX = MARGIN + leftPad - 14 - bypassLane * LANE_STEP
      const bx1 = from.x + from.w * 0.26
      const bx2 = to.x + to.w * 0.26
      const r = 11
      edges.push({
        edge,
        path: [
          `M ${bx1} ${from.y + from.h}`,
          `L ${bx1} ${outY - r}`,
          `Q ${bx1} ${outY} ${bx1 - r} ${outY}`,
          `L ${laneX + r} ${outY}`,
          `Q ${laneX} ${outY} ${laneX} ${outY + r}`,
          `L ${laneX} ${inY - r}`,
          `Q ${laneX} ${inY} ${laneX + r} ${inY}`,
          `L ${bx2 - r} ${inY}`,
          `Q ${bx2} ${inY} ${bx2} ${inY + r}`,
          `L ${bx2} ${to.y}`,
        ].join(" "),
        labelX: laneX + 8,
        labelY: (outY + inY) / 2,
        labelAnchor: "start",
      })
      continue
    }

    const x1 = from.x + from.w / 2
    const y1 = from.y + from.h
    const x2 = to.x + to.w / 2
    const y2 = to.y
    const dy = Math.max((y2 - y1) / 2, 10)
    edges.push({
      edge,
      path: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2,
      labelAnchor: "middle",
    })
  }

  // Return labels all sit at one x in the outer gutter (`outerLane + 10`), so
  // two returns whose vertical spans have similar midpoints print ON TOP of
  // each other. The lanes themselves are separated one-per-return, for the
  // reason given above; the labels naming them were not, which undoes it — a
  // reader sees one chip over another and can attribute neither to a line.
  //
  // Observed on the student flow, where "next reading" (y=1183) covered
  // "another passage" (y=1189). It is not a wide-glyph case: they are 6px
  // apart and the text is 14px tall.
  //
  // Resolved deterministically — sort by y, then push each label down to clear
  // the one above. Deterministic matters here: this arithmetic runs on the
  // server AND the client, and a tie broken differently in the two would be a
  // hydration mismatch. Sorting by labelY with the lane index as tie-break is
  // total, so both sides agree. Labels move only downward and only when they
  // would overlap, so a flow with well-spaced returns is untouched.
  const LABEL_LINE_H = 17
  const backLabelled = edges
    .filter((e) => e.edge.back && e.edge.label)
    .sort((a, b) => a.labelY - b.labelY || (laneOf.get(a.edge) ?? 0) - (laneOf.get(b.edge) ?? 0))
  for (let i = 1; i < backLabelled.length; i++) {
    const prev = backLabelled[i - 1]
    const cur = backLabelled[i]
    if (cur.labelY - prev.labelY < LABEL_LINE_H) cur.labelY = prev.labelY + LABEL_LINE_H
  }

  // A label pushed past the last leg would sit below the canvas.
  const lowestLabel = backLabelled.length ? backLabelled[backLabelled.length - 1].labelY : 0
  const height = Math.max(y - ROW_GAP + MARGIN, lowestLeg + 16, lowestLabel + 16)
  return { width, height, nodes: [...placed.values()], edges }
}

/** Row index per node, for callers that need to reason about direction. */
export function nodeDepths(flow: Flow): Map<string, number> {
  return depths(flow)
}

/** Ids an edge names that no node defines — a diagram that would silently
 *  drop a connector. Used by `scripts/check-workflows.ts`. */
export function danglingEdgeIds(flow: Flow): string[] {
  const ids = new Set(flow.nodes.map((n) => n.id))
  const bad = new Set<string>()
  for (const edge of flow.edges) {
    if (!ids.has(edge.from)) bad.add(edge.from)
    if (!ids.has(edge.to)) bad.add(edge.to)
  }
  return [...bad]
}

/** Nodes no edge touches — usually a step someone added and forgot to wire. */
export function orphanNodeIds(flow: Flow): string[] {
  const touched = new Set<string>()
  for (const edge of flow.edges) {
    touched.add(edge.from)
    touched.add(edge.to)
  }
  return flow.nodes.filter((n) => !touched.has(n.id)).map((n) => n.id)
}
