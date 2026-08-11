"use client"

// 04 · Map — the card table, ported from v14 (loom-v14-example.html).
// Red line #7: render and count, never decide. Cards without a stored position
// get a DEFAULT position computed fresh each render (v14's drift grid) that is
// NEVER persisted — only a student drag (card drop, line bend) or a de-tier
// cleanup writes geometry, into the ACTIVE MAP's own view row (`map:<id>`).
//
// A map is one named sorting of this scope's concepts with its own essence
// sentence and paragraph — parallel siblings, switched in the mapbar. Tiers
// live on the map (a tier is a rank relative to the concepts it sits among),
// so the same concept may be primary here and tertiary on another map.

import { useCallback, useEffect, useRef, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import { useReadings } from "@/components/providers/ReadingsProvider"
import { useDialog } from "@/components/providers/DialogProvider"
import type { CardTableView, Concept, Tier } from "@/lib/types"
import { isWholeWeave, readingsOf, soleSourceId } from "@/lib/scope"
import { sortedByLabel } from "@/lib/utils"
import { short } from "@/lib/clothMath"
import { buildMapKit } from "@/lib/mapKit"
import { copyText } from "@/lib/clipboard"
import { buildMapExport, buildMapMarkdown, mapExportFilename, scopeLabelOf } from "@/lib/graphExport"
import { downloadText } from "@/lib/download"
import CardMenu from "@/components/map/CardMenu"
import ClothReflection from "@/components/tabs/ClothReflection"
import HistoryPanel from "@/components/ui/HistoryPanel"

const TIERS: [Tier, string][] = [["p", "PRIMARY"], ["s", "SECONDARY"], ["t", "TERTIARY"]]
const TABLE_H = 560
const BAND_H = (TABLE_H - 20) / 3
/** Matches .cardmenu's max-height — used only to decide which way it opens. */
const MENU_MAX_H = 330

const isPlaced = (t: Tier) => t === "p" || t === "s" || t === "t"

/**
 * The sort list's effective sequence: ids named in views.cardTable.order first,
 * in that sequence, then every concept the order does not mention, A-Z.
 *
 * Alphabetical is only the DEFAULT — a list you scan to find a concept to tier.
 * A student who has dragged the list keeps their sequence, because that is a
 * persisted gesture and re-sorting it would throw their work away.
 *
 * Used for RENDERING THE SORT LIST ONLY — the card table, the mirror counts,
 * the map kit and the arc map all keep reading state.concepts as it comes,
 * since the arc map reads capture order as reading order. Computing this never
 * writes (red line #7): the default sequence is a display fact until a student
 * drags or arrows a row.
 */
const sortOrder = (concepts: Concept[], order?: string[]): Concept[] => {
  if (!order?.length) return sortedByLabel(concepts)
  const byId = new Map(concepts.map(c => [c.id, c]))
  const taken = new Set<string>()
  const out: Concept[] = []
  order.forEach(id => {
    const c = byId.get(id)
    if (c && !taken.has(id)) { out.push(c); taken.add(id) }
  })
  sortedByLabel(concepts).forEach(c => { if (!taken.has(c.id)) out.push(c) })
  return out
}

export default function MapTab({ practice = false }: {
  /** The practice loom: no Capture Log, which reads the student's real
   *  record over its own route rather than through the provider. */
  practice?: boolean
} = {}) {
  const {
    state, scopedState, scope,
    activeMap, scopeMaps, selectMap, addMap, renameMap, removeMap,
    setMapTiers, setMapRead, setMapEssence, flushMapText,
    setView, ensureActiveMap,
    addConcept, refilePassage,
    flash, studentName,
  } = useLoom()
  const { titleOf } = useReadings()
  const { confirm } = useDialog()
  const wholeWeave = isWholeWeave(scope)

  // The scope's Unlabeled Passages — the unattached group a projection must
  // show (ruling 38): nameable here, or left as visible remainder.
  const unfiled = scopedState.passages.filter((b) => b.conceptIds.length === 0)
  const [unfiledInputs, setUnfiledInputs] = useState<Record<string, string>>({})
  const [unfiledBusy, setUnfiledBusy] = useState<Record<string, boolean>>({})
  const handleNameUnfiled = async (passageId: string) => {
    if (unfiledBusy[passageId]) return
    const nm = (unfiledInputs[passageId] ?? "").trim()
    if (!nm) return
    setUnfiledBusy((prev) => ({ ...prev, [passageId]: true }))
    try {
      // Same reuse rule as capture: an existing label joins its concept, a
      // new one coins it — the student named it either way.
      const existing = state.concepts.find((c) => c.label.toLowerCase() === nm.toLowerCase())
      const concept = existing ?? (await addConcept(nm))
      await refilePassage(passageId, concept.id)
      setUnfiledInputs((prev) => ({ ...prev, [passageId]: "" }))
      flash(existing ? `filed under "${concept.label}"` : `named — "${concept.label}" joins your warp`)
    } catch {
      // refilePassage resyncs and flashes before rethrowing; swallow here.
    } finally {
      setUnfiledBusy((prev) => ({ ...prev, [passageId]: false }))
    }
  }

  // This map's tier for a concept — '' (unsorted) when the map has no entry,
  // or no map exists yet in this scope.
  const tierOf = useCallback(
    (id: string): Tier => activeMap?.tiers[id] ?? "",
    [activeMap]
  )

  // The active map's own geometry. Reads fall back to an empty view; writes go
  // through ensureActiveMap so the first gesture in a fresh scope mints Map 1.
  const viewKey = activeMap ? `map:${activeMap.id}` : null
  const emptyView: CardTableView = { positions: {}, bends: {} }
  const view = (viewKey ? state.views[viewKey] : undefined) ?? emptyView
  const viewFor = (mapId: string): CardTableView =>
    state.views[`map:${mapId}`] ?? { positions: {}, bends: {} }
  // The card menu: hover, focus or tap a card's corner. Held here rather than
  // per-card so only one is ever open.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const holdMenu = useCallback((id: string) => {
    window.clearTimeout(closeTimer.current)
    setMenuFor(id)
  }, [])
  // A small grace period: the pointer has to cross a gap between the corner
  // affordance and the popover, and closing instantly makes that a race.
  const releaseMenu = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setMenuFor(null), 160)
  }, [])

  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(720)
  // ResizeObserver also fires when a hidden panel becomes visible, which a
  // window resize listener does not. Zero width means display:none — hold the
  // last good width rather than reflowing the table to the fallback.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setWidth(Math.max(Math.floor(w), 720))
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])
  const W = width
  // Usable width — the denominator for proportional x (spec §5): stored x is a
  // 0..1 fraction of this; y stays absolute px.
  const usableW = Math.max(1, W - 20)

  useEffect(() => {
    if (!menuFor) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFor(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuFor])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // Live drag geometry — local only; persisted once, on pointer-up.
  const [livePos, setLivePos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [liveBend, setLiveBend] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const livePosRef = useRef<typeof livePos>(null)
  const liveBendRef = useRef<typeof liveBend>(null)
  const setLive = (p: typeof livePos) => { livePosRef.current = p; setLivePos(p) }
  const setBend = (b: typeof liveBend) => { liveBendRef.current = b; setLiveBend(b) }
  const dragCard = useRef<string | null>(null)
  const dragOff = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const dragEdge = useRef<string | null>(null)
  const dragEdgeStart = useRef<{ px: number; py: number; dx: number; dy: number } | null>(null)
  // The one pointer allowed to drive the current gesture — events from any
  // other pointerId are ignored while it is set.
  const activePointer = useRef<number | null>(null)

  const conceptById = (id: string) => scopedState.concepts.find(c => c.id === id)

  // Only a PINNED definition changes a card's size, so an unpinned card is a
  // fixed size and a stored position keeps meaning what it meant. Pins are
  // geometry, so they belong to the active map's view.
  const pins = view.pins ?? []
  const isPinned = (c: Concept) => !!c.def && pins.includes(c.id)
  const cardH = (c: Concept) => isPinned(c) ? 50 : 34
  const cardW = (c: Concept) => {
    const dl = isPinned(c) ? Math.min(c.def!.length, 46) * 5.2 + 22 : 0
    return Math.min(240, Math.max(90, Math.max(c.label.length * 6.4 + 22, dl)))
  }

  const togglePin = (c: Concept) => {
    void ensureActiveMap().then((m) => {
      const v = viewFor(m.id)
      const cur = v.pins ?? []
      const next = cur.includes(c.id) ? cur.filter(id => id !== c.id) : [...cur, c.id]
      setView(`map:${m.id}`, { ...v, pins: next })
      flash(next.includes(c.id) ? "description pinned to the card" : "description unpinned")
    })
  }
  const bandRange = (t: Tier, h: number): [number, number] => {
    const i = TIERS.findIndex(x => x[0] === t)
    const top = 10 + i * BAND_H
    return [top + 8, top + BAND_H - (h || 34) - 8]
  }

  const placed = scopedState.concepts.filter(c => isPlaced(tierOf(c.id)))
  const stored = view.positions
  const bends = view.bends

  // Effective positions: stored (student-authored) where present, else v14's
  // 4-column drift grid per band — computed for display, discarded (red line #7).
  //
  // The drift index is the concept's own capture position, NOT a running count
  // over the current band. A running count made every un-dragged card in two
  // bands jump the moment one card was dropped into another tier — dragging one
  // entry re-arranged the rest. Capture order is fixed, so a card only moves
  // when the student moves it.
  const captureIndex = new Map(scopedState.concepts.map((c, i) => [c.id, i]))
  const effPos: Record<string, { x: number; y: number }> = {}
  {
    placed.forEach(c => {
      const p = stored[c.id]
      if (p) {
        // Stored x is a 0..1 fraction of the usable width (spec §5); values
        // > 1.5 are legacy pixels (v14 import or earlier build) and are used
        // as px directly. Clamp into the visible table so out-of-range values
        // stay draggable. y is absolute px.
        const w = cardW(c), h = cardH(c)
        const px = p.x > 1.5 ? p.x : p.x * usableW
        effPos[c.id] = {
          x: Math.max(10, Math.min(W - w - 10, px)),
          y: Math.max(10, Math.min(TABLE_H - h - 10, p.y)),
        }
      } else {
        const k = captureIndex.get(c.id) ?? 0
        const [y0, y1] = bandRange(tierOf(c.id), cardH(c))
        effPos[c.id] = {
          x: Math.max(10, Math.min(W - cardW(c) - 10, 30 + (k % 4) * ((W - 60) / 4) + (Math.floor(k / 4) % 4) * 24)),
          y: y0 + ((k % 3) * (y1 - y0) / 3),
        }
      }
    })
  }
  if (livePos && effPos[livePos.id]) effPos[livePos.id] = { x: livePos.x, y: livePos.y }

  const center = (c: Concept) => {
    const p = effPos[c.id]
    return { x: p.x + cardW(c) / 2, y: p.y + cardH(c) / 2 }
  }

  /**
   * Where a link should meet a card: the point on the card's border in the
   * direction of `toward`, pushed out by `gap`. Centre-to-centre lines would
   * bury the arrowhead under the card it points at.
   */
  const borderPoint = (c: Concept, toward: { x: number; y: number }, gap = 4) => {
    const p = effPos[c.id], w = cardW(c), h = cardH(c)
    const cx = p.x + w / 2, cy = p.y + h / 2
    const dx = toward.x - cx, dy = toward.y - cy
    const len = Math.hypot(dx, dy)
    if (!len) return { x: cx, y: cy }
    const t = Math.min(dx ? (w / 2) / Math.abs(dx) : Infinity, dy ? (h / 2) / Math.abs(dy) : Infinity)
    return { x: cx + dx * t + (dx / len) * gap, y: cy + dy * t + (dy / len) * gap }
  }

  /** Wrap a label onto as many lines as it needs — link text is never cut. */
  const wrapLabel = (text: string, maxChars = 24) => {
    const lines: string[] = []
    let line = ""
    text.split(/\s+/).filter(Boolean).forEach(word => {
      if (!line) line = word
      else if ((line + " " + word).length <= maxChars) line += " " + word
      else { lines.push(line); line = word }
    })
    if (line) lines.push(line)
    return lines.length ? lines : [text]
  }

  // --- mirror counts (counted, not judged) ---
  const n: Record<string, number> = { p: 0, s: 0, t: 0 }
  const placedIds: string[] = []
  scopedState.concepts.forEach(c => { const t = tierOf(c.id); if (isPlaced(t)) { n[t]++; placedIds.push(c.id) } })
  const unsorted = scopedState.concepts.filter(c => !tierOf(c.id)).length
  const off = scopedState.concepts.filter(c => tierOf(c.id) === "x").length
  const onTable = scopedState.edges.filter(e => placedIds.includes(e.fromId) && placedIds.includes(e.toId))
  const cross = onTable.filter(e => {
    const a = tierOf(e.fromId), b = tierOf(e.toId)
    return a === b || Math.abs("pst".indexOf(a) - "pst".indexOf(b)) > 1
  }).length
  let level = "a list"
  if (n.p && (n.s || n.t)) level = "tiers"
  if (level === "tiers" && cross) level = "tiers + cross-links"
  const done1 = n.p + n.s + n.t > 0
  const done2 = done1 && Object.keys(stored).some(id => placedIds.includes(id))
  const done3 = done2 && cross > 0

  const onCount = scopedState.concepts.filter(c => { const t = tierOf(c.id); return t && t !== "x" }).length

  // --- sort: every assignment is a student act, on the ACTIVE map ---
  const setTier = (c: Concept, t: Tier) => {
    void ensureActiveMap().then((m) => {
      const current = m.tiers[c.id] ?? ""
      const next: Tier = current === t ? "" : t
      const tiers = { ...m.tiers }
      if (next) tiers[c.id] = next
      else delete tiers[c.id]
      void setMapTiers(m.id, tiers)
      const v = viewFor(m.id)
      if (!isPlaced(next) && v.positions[c.id]) {
        // Leaving the table clears the card's stored spot — a student gesture.
        const positions = { ...v.positions }
        delete positions[c.id]
        setView(`map:${m.id}`, { ...v, positions })
      }
    })
  }

  // "make all primary" — one student gesture that tiers everything at once.
  // The tool is not advising that everything is primary; it is doing in one
  // move what the student would otherwise do chip by chip, and saying plainly
  // that the demoting is still theirs.
  const makeAllPrimary = async () => {
    const all = scopedState.concepts
    if (!all.length) return
    const alreadySorted = all.filter(c => { const t = tierOf(c.id); return t && t !== "p" }).length
    const ok = await confirm({
      title: `Make all ${all.length} concept${all.length !== 1 ? "s" : ""} primary?`,
      body: alreadySorted
        ? `This overwrites the ${alreadySorted} tier${alreadySorted !== 1 ? "s" : ""} you have already set on this projection. It is a starting point to demote from, not a recommendation.`
        : "A starting point to demote from, not a recommendation.",
      confirmLabel: "Make all primary",
    })
    if (!ok) return
    const m = await ensureActiveMap()
    const tiers = { ...m.tiers }
    all.forEach(c => { tiers[c.id] = "p" })
    await setMapTiers(m.id, tiers)
    flash("all primary — re-sort any that aren't")
  }

  // --- sort list order: a view projection, written only by drag or arrow ---
  const sortList = sortOrder(scopedState.concepts, view.order)
  const [dragId, setDragId] = useState<string | null>(null)
  // Insertion index under the pointer (0..sortList.length), not a row index.
  const [dropAt, setDropAt] = useState<number | null>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Persist the FULL id list, so the sequence stays stable as concepts arrive.
  const moveRow = (fromIdx: number, toIdx: number) => {
    if (fromIdx < 0 || toIdx < 0 || toIdx >= sortList.length || toIdx === fromIdx) return false
    const ids = sortList.map(c => c.id)
    const [moved] = ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, moved)
    void ensureActiveMap().then((m) => setView(`map:${m.id}`, { ...viewFor(m.id), order: ids }))
    return true
  }

  const onHandleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>, idx: number) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    if (moveRow(idx, e.key === "ArrowUp" ? idx - 1 : idx + 1)) {
      flash("sort list re-ordered — the projection itself is unchanged")
    }
  }

  const onRowDragOver = (e: React.DragEvent<HTMLDivElement>, idx: number) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const r = e.currentTarget.getBoundingClientRect()
    setDropAt(e.clientY < r.top + r.height / 2 ? idx : idx + 1)
  }

  const onRowDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!dragId || dropAt === null) return
    e.preventDefault()
    const fromIdx = sortList.findIndex(c => c.id === dragId)
    const toIdx = dropAt > fromIdx ? dropAt - 1 : dropAt
    if (moveRow(fromIdx, toIdx)) flash("sort list re-ordered — the projection itself is unchanged")
    setDragId(null)
    setDropAt(null)
  }

  // --- drag machinery ---
  const svgPoint = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // A drag is already live — a second finger must not hijack the gesture.
    if (dragCard.current || dragEdge.current) return
    const target = e.target as Element
    // The menu's corner affordance sits INSIDE the card group, so it would
    // otherwise resolve to [data-card] and every tap on it would start a drag.
    if (target.closest("[data-cardmenu]")) return
    const g = target.closest("[data-card]")
    if (g) {
      const id = g.getAttribute("data-card")!
      const pos = effPos[id]
      if (!pos) return
      const pt = svgPoint(e)
      dragCard.current = id
      dragOff.current = { dx: pt.x - pos.x, dy: pt.y - pos.y }
      activePointer.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    const h = target.closest("[data-ebend]")
    if (h) {
      const id = h.getAttribute("data-ebend")!
      const pt = svgPoint(e)
      const cur = bends[id] || { dx: 0, dy: 0 }
      dragEdge.current = id
      dragEdgeStart.current = { px: pt.x, py: pt.y, dx: cur.dx, dy: cur.dy }
      activePointer.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointer.current === null || e.pointerId !== activePointer.current) return
    const pt = svgPoint(e)
    if (dragCard.current) {
      const c = conceptById(dragCard.current)
      if (!c) return
      const w = cardW(c), h = cardH(c)
      setLive({
        id: dragCard.current,
        x: Math.max(10, Math.min(W - w - 10, pt.x - dragOff.current.dx)),
        y: Math.max(10, Math.min(TABLE_H - h - 10, pt.y - dragOff.current.dy)),
      })
      return
    }
    if (dragEdge.current && dragEdgeStart.current) {
      const s = dragEdgeStart.current
      setBend({ id: dragEdge.current, dx: s.dx + 2 * (pt.x - s.px), dy: s.dy + 2 * (pt.y - s.py) })
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointer.current === null || e.pointerId !== activePointer.current) return
    activePointer.current = null
    if (dragCard.current) {
      const id = dragCard.current
      dragCard.current = null
      const c = conceptById(id)
      const pos = livePosRef.current && livePosRef.current.id === id
        ? { x: livePosRef.current.x, y: livePosRef.current.y }
        : null
      // Cards only exist on the table when a map holds their tiers, so the
      // active map is present for any real drop.
      if (c && pos && activeMap) {
        // Dropping decides the band: re-tier from the card's centre-y.
        const cy = pos.y + cardH(c) / 2
        const idx = Math.max(0, Math.min(2, Math.floor((cy - 10) / BAND_H)))
        const newTier = TIERS[idx][0]
        if (tierOf(c.id) !== newTier) {
          void setMapTiers(activeMap.id, { ...activeMap.tiers, [c.id]: newTier })
          flash("re-tiered to " + TIERS[idx][1].toLowerCase() + " — placement is the decision")
        }
        // The drag is the student gesture — persist this card's spot, once.
        // x is stored as a fraction of the usable width (spec §5), y in px.
        setView(`map:${activeMap.id}`, { ...view, positions: { ...stored, [id]: { x: pos.x / usableW, y: pos.y } } })
      }
      setLive(null)
      return
    }
    if (dragEdge.current) {
      const id = dragEdge.current
      dragEdge.current = null
      dragEdgeStart.current = null
      const b = liveBendRef.current
      if (b && b.id === id && activeMap) {
        setView(`map:${activeMap.id}`, { ...view, bends: { ...bends, [id]: { dx: b.dx, dy: b.dy } } })
      }
      setBend(null)
    }
  }

  // Cancelled or hijacked gestures abandon the drag outright — nothing is
  // persisted; the card/bend snaps back to its stored (or default) place.
  const abandonDrag = () => {
    activePointer.current = null
    dragCard.current = null
    dragEdge.current = null
    dragEdgeStart.current = null
    setLive(null)
    setBend(null)
  }

  // Came with the read editor when 03's duplicate was retired — the paragraph
  // and its one-line copy out together, which is how a student hands the take
  // to something outside Loom.
  const handleCopyRead = () => {
    const read = (activeMap?.read || "").trim()
    const essence = (activeMap?.essence || "").trim()
    if (!read && !essence) { flash("your read is empty — write a short paragraph first"); return }
    const out = [
      (studentName ? studentName + " — " : "") + (activeMap?.name || "my read of the cloth"),
      essence,
      read,
    ].filter(Boolean).join("\n\n")
    copyText(out).then(ok => {
      if (ok) flash("read copied to clipboard")
      else flash("select & copy by hand")
    })
  }

  const handleMapKit = () => {
    if (!scopedState.concepts.length) { flash("nothing to lay out yet — lay some warp first"); return }
    copyText(buildMapKit(
      scopedState.concepts,
      scopedState.edges,
      studentName,
      activeMap ? { name: activeMap.name, essence: activeMap.essence, tiers: activeMap.tiers } : undefined
    )).then(ok => {
      if (ok) flash("concept-map kit copied — take it to paper or Figma")
      else flash("select & copy by hand")
    })
  }

  // Keeping a map is the primary path out of Loom (ratified TJ 2026-07-31):
  // the file is this map — tiers, essence, paragraph, arrangement — carried
  // with the cards and passages behind it, so it stands on its own.
  const handleKeepMapJson = () => {
    if (!activeMap) return
    downloadText(
      JSON.stringify(buildMapExport(state, activeMap, studentName, titleOf), null, 2),
      mapExportFilename(studentName, activeMap.name, "json"),
      "application/json"
    )
    flash(`kept "${activeMap.name}" as .json`)
  }

  const handleKeepMapMd = () => {
    if (!activeMap) return
    downloadText(
      buildMapMarkdown(state, activeMap, studentName, titleOf),
      mapExportFilename(studentName, activeMap.name, "md"),
      "text/markdown"
    )
    flash(`kept "${activeMap.name}" as .md`)
  }

  const handleDeleteMap = async () => {
    if (!activeMap) return
    const ok = await confirm({
      title: `Delete "${activeMap.name}"?`,
      body: "Its tiers, its one-line, its paragraph and its arrangement go with it. Your concepts, passages and threads are untouched.",
      confirmLabel: "Delete this projection",
      danger: true,
    })
    if (ok) await removeMap(activeMap.id)
  }

  // Resolved before the return so the menu's handlers are props on a component
  // rather than closures built inside an IIFE mid-render.
  const menuConcept = menuFor ? conceptById(menuFor) : undefined
  const menuPos = menuConcept ? effPos[menuConcept.id] : undefined
  const handleTogglePin = () => { if (menuConcept) togglePin(menuConcept) }

  const drawnEdges = scopedState.edges.filter(e => {
    const f = conceptById(e.fromId), t2 = conceptById(e.toId)
    return f && t2 && isPlaced(tierOf(f.id)) && isPlaced(tierOf(t2.id)) && effPos[f.id] && effPos[t2.id]
  })

  return (
    <>
      <p className="tasktitle">Lay out your projection.</p>
      <p className="tasksub">Your data, projected to be read: sort your concepts into tiers on the list, then arrange them by hand as cards on the board (Novak &amp; Gowin, <i>Learning How to Learn</i>, 1984). The tool draws the lines you already threw and counts what it sees — it never sorts, places, or links for you. Keep more than one projection: each is its own reading of the material, with its own tiers, its own one-line and its own paragraph. When a projection reads right here, draw the real concept map (paper or Figma) and build your chalk talk from it.</p>

      <div className="rail" id="mapRail">
        <span className={`rstep${done1 ? " done" : ""}${!done1 ? " now" : ""}`}>sort</span>
        <span className="rsep">·</span>
        <span className={`rstep${done2 ? " done" : ""}${!done2 && done1 ? " now" : ""}`}>arrange</span>
        <span className="rsep">·</span>
        <span className={`rstep${done3 ? " done" : ""}${!done3 && done2 ? " now" : ""}`}>check</span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="heading-with-info">
          <h2>Sort <span className="n" id="triageCount">{scopedState.concepts.length ? `(${onCount} of ${scopedState.concepts.length} on the board)` : ""}</span></h2>
          <button
            className="btn ghost mini compact"
            id="makeAllPrimary"
            disabled={!scopedState.concepts.length}
            data-tip="tiers every concept primary in one gesture — you demote from there"
            onClick={makeAllPrimary}
          >make all primary</button>
        </div>
        <p className="do">Give each concept a tier: <b>P</b>rimary (the projection hangs on it) · <b>S</b>econdary · <b>T</b>ertiary (example / detail) · <b>–</b> set aside. Sorted concepts land on the board below.</p>
        <p className="hint">A–Z until you say otherwise: drag a row by its handle — or focus the handle and press ↑ / ↓ — to re-order this list, and your sequence sticks. That re-sequences the list only; the board, the counts and the concept-map kit are untouched. <b>Make all primary</b> is a starting point, not a recommendation: it puts everything on the top tier in one move so you can demote from there.</p>
        <div id="triageList" onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null) }}>
          {!scopedState.concepts.length ? (
            <div className="empty">
              <svg width={34} height={18} viewBox="0 0 34 18" fill="none" stroke="#a39f92" strokeWidth={1.3}><path d="M2 13 L7 5 L12 13 L17 5 L22 13 L27 5 L32 13" /></svg>
              <span className="cap">lay some warp on 01 — open first</span>
            </div>
          ) : sortList.map((c, i) => (
            <div
              key={c.id}
              className={`trow${dragId === c.id ? " dragging" : ""}${dropAt === i ? " dropbefore" : ""}${dropAt === sortList.length && i === sortList.length - 1 ? " dropafter" : ""}`}
              ref={el => {
                if (el) rowRefs.current.set(c.id, el)
                else rowRefs.current.delete(c.id)
              }}
              onDragOver={e => onRowDragOver(e, i)}
              onDrop={onRowDrop}
            >
              <span
                className="thandle"
                role="button"
                tabIndex={0}
                aria-label={`Reorder ${c.label}`}
                title="drag to re-order — or press ↑ / ↓"
                draggable
                onDragStart={e => {
                  setDragId(c.id)
                  setDropAt(i)
                  e.dataTransfer.effectAllowed = "move"
                  e.dataTransfer.setData("text/plain", c.id)
                  const row = rowRefs.current.get(c.id)
                  if (row) e.dataTransfer.setDragImage(row, 14, row.offsetHeight / 2)
                }}
                onDragEnd={() => { setDragId(null); setDropAt(null) }}
                onKeyDown={e => onHandleKeyDown(e, i)}
              >
                <svg width={10} height={16} viewBox="0 0 10 16" aria-hidden="true" focusable="false">
                  {[3, 8, 13].map(y => (
                    <g key={y}>
                      <circle cx={3} cy={y} r={1.25} />
                      <circle cx={7} cy={y} r={1.25} />
                    </g>
                  ))}
                </svg>
              </span>
              <span className="tlabel">{c.label}</span>
              <span className="tierchips">
                {TIERS.map(([k, name]) => (
                  <span key={k} className={`tchip${tierOf(c.id) === k ? " on" : ""}`} title={name.toLowerCase()} onClick={() => setTier(c, k)}>{k.toUpperCase()}</span>
                ))}
                <span className={`tchip off${tierOf(c.id) === "x" ? " on" : ""}`} title="set aside" onClick={() => setTier(c, "x")}>–</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mapbar" id="mapSwitcher">
        <span className="label">{wholeWeave ? "Your projections of the whole weave" : "Your projections of this reading"}</span>
        <span className="chips" style={{ margin: 0, alignItems: "center" }}>
          {scopeMaps.map(m => (
            <span
              key={m.id}
              className={`chip${activeMap?.id === m.id ? " on" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => selectMap(m.id)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectMap(m.id) } }}
            >{m.name}</span>
          ))}
          <button
            className="btn ghost mini"
            id="newMap"
            data-tip="start another projection of the same concepts — a different reading of them"
            onClick={() => void addMap().catch(e => flash(e instanceof Error ? e.message : "could not start a projection"))}
          >+ New projection</button>
        </span>
        {activeMap && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input
              aria-label="Rename this projection"
              value={activeMap.name}
              onChange={e => renameMap(activeMap.id, e.target.value)}
              onBlur={flushMapText}
              style={{ width: 140, fontSize: 12, padding: "4px 7px" }}
            />
            <button
              className="btn ghost mini"
              aria-label={`Keep the projection ${activeMap.name} as .json`}
              data-tip="keep this projection as its own file — the artifact to submit"
              onClick={handleKeepMapJson}
            >keep .json</button>
            <button
              className="btn ghost mini"
              aria-label={`Keep the projection ${activeMap.name} as .md`}
              data-tip="this projection as a readable outline — notes, Obsidian, an agent"
              onClick={handleKeepMapMd}
            >keep .md</button>
            <button className="btn ghost mini" data-tip="delete this projection — concepts and threads stay" onClick={handleDeleteMap}>delete</button>
          </span>
        )}
      </div>
      <div className="mapbar">
        <span className="label">The board</span>
        <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>Drag cards to arrange — general above, specific below. Dropping a card into another band re-tiers it. Drag a <i>line</i> to bow it out of the way and re-seat its label. Each card carries its own <b>⋯</b> — its description, the passages behind it, and where else you met it.</span>
      </div>

      {/* position:relative anchors the card menus, which are HTML over the SVG. */}
      <div id="tableWrap" style={{ position: "relative", border: "1px solid var(--rule)", borderRadius: 4, background: "radial-gradient(circle,var(--dot) 1px,transparent 1.4px) 0 0/22px 22px,#f4f2ec" }}>
        <svg
          ref={svgRef}
          id="cardTable"
          // userSelect: dragging a card used to sweep-select its label text.
          style={{ display: "block", width: "100%", height: 560, touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={abandonDrag}
          onLostPointerCapture={abandonDrag}
        >
          <defs>
            {/* Direction markers. orient auto-start-reverse keeps the head
                aligned with the curve however the cards are arranged. */}
            {([["ctArrowNamed", "var(--sage)"], ["ctArrowLoose", "var(--grey)"]] as const).map(([id, color]) => (
              <marker key={id} id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6.5} markerHeight={6.5} orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={color} />
              </marker>
            ))}
          </defs>
          {TIERS.map(([k, name], i) => {
            const top = 10 + i * BAND_H
            return (
              <g key={k}>
                {i > 0 && <line x1={14} y1={top} x2={W - 14} y2={top} stroke="var(--rule)" strokeWidth={1} strokeDasharray="2 5" />}
                <text x={W - 18} y={top + 18} textAnchor="end" fontFamily="ui-monospace,Menlo,monospace" fontSize={9} letterSpacing={2} fill="var(--grey)">{name}</text>
              </g>
            )
          })}
          {!placed.length && (
            <text x={W / 2} y={TABLE_H / 2} textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace" fontSize={9} letterSpacing={2} fill="var(--grey)">SORT CONCEPTS ABOVE — THEY LAND HERE AS CARDS</text>
          )}
          {/* edges first, under the cards — quadratic, bendable by drag */}
          {drawnEdges.map(e => {
            const f = conceptById(e.fromId)!, t2 = conceptById(e.toId)!
            const a0 = center(f), b0 = center(t2)
            const bend = (liveBend && liveBend.id === e.id) ? liveBend : (bends[e.id] || { dx: 0, dy: 0 })
            // Bends stay px deltas, but the control point is clamped so a
            // stored bend can never fling a curve off-table.
            const cx = Math.max(10, Math.min(W - 10, (a0.x + b0.x) / 2 + bend.dx))
            const cy = Math.max(10, Math.min(TABLE_H - 10, (a0.y + b0.y) / 2 + bend.dy))
            // Meet the cards at their borders, aimed at the control point, so
            // the arrowhead sits in the open rather than under the target card.
            const a = borderPoint(f, { x: cx, y: cy })
            const b = borderPoint(t2, { x: cx, y: cy })
            const named = !!e.handle
            const col = named ? "var(--sage)" : "var(--grey)"
            const d = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
            const lx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x, ly = 0.25 * a.y + 0.5 * cy + 0.25 * b.y
            const lines = wrapLabel(e.handle || e.sentence)
            return (
              <g key={e.id}>
                <path
                  d={d} fill="none" stroke={col} strokeWidth={1.4} opacity={0.8}
                  strokeDasharray={named ? undefined : "5 4"}
                  markerEnd={`url(#${named ? "ctArrowNamed" : "ctArrowLoose"})`}
                />
                {/* wide invisible twin — the drag handle for bending */}
                <path d={d} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={14} cursor="grab" data-ebend={e.id}>
                  <title>{`“${e.sentence}” — drag to bend this line`}</title>
                </path>
                {/* label at the curve's apex, wrapped rather than cut */}
                <text
                  x={lx} y={ly - 4 - (lines.length - 1) * 5.5} textAnchor="middle"
                  fontFamily="ui-monospace,Menlo,monospace" fontSize={10} letterSpacing=".04em"
                  fill={col} stroke="#f4f2ec" strokeWidth={4} paintOrder="stroke"
                  fontStyle={named ? undefined : "italic"} pointerEvents="none"
                >
                  {lines.map((ln, i) => <tspan key={i} x={lx} dy={i ? 11 : 0}>{ln}</tspan>)}
                </text>
              </g>
            )
          })}
          {placed.map(c => {
            const pos = effPos[c.id], w = cardW(c), h = cardH(c)
            const twoLine = isPinned(c)
            return (
              <g key={c.id} cursor="grab" data-card={c.id}>
                <rect x={pos.x} y={pos.y} width={w} height={h} rx={4} fill="#fff" stroke="var(--ochre)" strokeWidth={1.2} />
                <text x={pos.x + w / 2} y={pos.y + (twoLine ? 19 : h / 2 + 4)} textAnchor="middle" fontFamily='"Newsreader",Georgia,serif' fontSize={12.5} fill="var(--ink)">
                  {short(c.label, Math.floor(w / 6.4))}
                  <title>{c.label}</title>
                </text>
                {twoLine && (
                  <text x={pos.x + w / 2} y={pos.y + 36} textAnchor="middle" fontFamily='"Newsreader",Georgia,serif' fontSize={10} fontStyle="italic" fill="var(--ink-soft)">{short(c.def!, 46)}</text>
                )}
                {/* The card's own menu. Hover, focus or tap — the whole card is
                    a drag handle, so this must be a small target of its own or
                    it fights every drag. */}
                <g
                  data-cardmenu={c.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`What ${c.label} is made of`}
                  aria-expanded={menuFor === c.id}
                  cursor="pointer"
                  onPointerEnter={() => holdMenu(c.id)}
                  onPointerLeave={releaseMenu}
                  onFocus={() => holdMenu(c.id)}
                  onBlur={releaseMenu}
                  onClick={() => (menuFor === c.id ? setMenuFor(null) : holdMenu(c.id))}
                  onKeyDown={ev => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault()
                      setMenuFor(menuFor === c.id ? null : c.id)
                    }
                  }}
                >
                  <rect x={pos.x + w - 18} y={pos.y} width={18} height={16} fill="transparent" />
                  {[0, 1, 2].map(i => (
                    <circle
                      key={i}
                      cx={pos.x + w - 13 + i * 4}
                      cy={pos.y + 8}
                      r={1.1}
                      fill={menuFor === c.id ? "var(--ochre)" : "var(--grey)"}
                    />
                  ))}
                </g>
              </g>
            )
          })}
        </svg>

        {menuConcept && menuPos && (
          <CardMenu
            concept={menuConcept}
            passages={state.passages.filter(b => b.conceptIds.includes(menuConcept.id))}
            where={readingsOf(menuConcept.id, state.passages).map(titleOf)}
            pinned={pins.includes(menuConcept.id)}
            // Clamped so a card near the right edge does not push its menu off
            // the table, and flipped above the card when it sits low enough
            // that opening downward would hang off the table's bottom.
            left={Math.min(menuPos.x, Math.max(0, W - 268))}
            {...(menuPos.y + cardH(menuConcept) + MENU_MAX_H > TABLE_H
              ? { bottom: TABLE_H - menuPos.y + 6 }
              : { top: menuPos.y + cardH(menuConcept) + 6 })}
            onHold={holdMenu}
            onRelease={releaseMenu}
            onTogglePin={handleTogglePin}
          />
        )}
      </div>

      {/* The unattached group (ruling 38): unlabeled passages are part of the
          projection — visible remainder, never hidden (red line #4). Naming
          one here coins (or joins) a concept and the passage enters the graph;
          leaving it is equally legal — a passage may never gain a concept. */}
      {unfiled.length > 0 && (
        <div className="card" id="unfiledPassages" style={{ marginTop: 12 }}>
          <span className="label">Unfiled passages ({unfiled.length})</span>
          <p className="hint">
            Captured without a concept — part of your cloth, shown here as its own group.
            Name one to bring it onto the graph, or leave it as it is.
          </p>
          {unfiled.map((b) => (
            <div key={b.id} data-passage-id={b.id} style={{ marginTop: 10, borderBottom: "1px dotted var(--rule)", paddingBottom: 8 }}>
              <div className="passage">&quot;{b.content}&quot;</div>
              <div className="src">{b.source || "—"}{b.location ? ` · ${b.location}` : ""}</div>
              <div className="quietrow" style={{ marginTop: 6 }}>
                <input
                  placeholder="name the concept this passage evidences…"
                  value={unfiledInputs[b.id] ?? ""}
                  onChange={(e) => setUnfiledInputs((prev) => ({ ...prev, [b.id]: e.target.value }))}
                />
                <button
                  className="btn ghost mini"
                  onClick={() => handleNameUnfiled(b.id)}
                  disabled={!!unfiledBusy[b.id]}
                >
                  Name it
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ghostnote" id="mapMirror" style={{ marginTop: 8 }}>
        {scopedState.concepts.length > 0 && (
          <>On the board: <b>{n.p}</b> primary · <b>{n.s}</b> secondary · <b>{n.t}</b> tertiary{off ? ` · ${off} set aside` : ""}{unsorted ? ` · ${unsorted} unsorted` : ""} — {onTable.length} proposition{onTable.length !== 1 ? "s" : ""} drawn, <b>{cross}</b> running level-to-level or sideways (possible cross-links — the level-3 move; you decide if they&apos;re real). Right now this reads as: <b>{level}</b>. Counted, not judged.</>
        )}
      </div>

      {/* Look · trace · question, then write. The cloth and its prompts moved
          here from 03 when 03 became Vocabulary (TJ, 2026-08-08): the panel
          reads the structure of the graph, and the read it feeds is the one
          directly below it rather than a second copy on another tab. */}
      <ClothReflection />

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Your read of this projection {activeMap ? <span className="n">&ldquo;{activeMap.name}&rdquo; — its one-line and paragraph travel with it</span> : <span className="n">starts with your first sort</span>}</h2>
        <p className="readq">In a sentence — what is this {wholeWeave ? "weave" : "reading"} <i>about</i>?</p>
        <input
          id="mapEssence"
          placeholder="Your one-line — the take, in a sentence."
          value={activeMap?.essence ?? ""}
          onChange={e => { const v = e.target.value; void ensureActiveMap().then(m => setMapEssence(m.id, v)) }}
          onBlur={flushMapText}
        />
        <p className="hint" style={{ marginTop: 8 }}>Arranging and articulating feed each other: as the projection settles, say in one short paragraph what it is about and what holds it together. One-line, paragraph, tiers and arrangement belong to this projection — switch projections and each keeps its own.</p>
        <textarea
          id="yourRead2"
          placeholder="Write your read of this projection here — a paragraph is enough. Trace a prompt above if you want your threads laid out to work from."
          value={activeMap?.read ?? ""}
          onChange={e => { const v = e.target.value; void ensureActiveMap().then(m => setMapRead(m.id, v)) }}
          onBlur={flushMapText}
        />
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button className="btn ghost mini" data-tip="copies your paragraph to the clipboard" onClick={handleCopyRead}>Copy your read</button>
        <button className="btn ghost mini" data-tip="same concept-map kit — now grouped by your tiers" onClick={handleMapKit}>Copy the concept-map kit → draw the real concept map</button>
      </div>

      {/* The record is of the whole weaving, not one reading's share of it, so
          it belongs where the whole weave does rather than repeating itself
          identically inside all twenty-six readings. */}
      {/* The Capture Log, on the Knowledge Graph and scoped to THIS reading
          (TJ, 2026-08-10). It used to render here only at the whole weave —
          a surface nothing links to — which is how it came to be stranded on
          Keep. Inverting the scope is what makes it reachable.

          Not in the practice loom: it reads the student's REAL record over
          its own route, bypassing the provider, so it would show their
          actual work inside a space that keeps nothing. */}
      {!practice && (
        <div style={{ marginTop: "22px" }}>
          <HistoryPanel
            sourceId={wholeWeave ? undefined : (soleSourceId(scope) ?? undefined)}
            scopeLabel={wholeWeave ? undefined : scopeLabelOf(scope.key, titleOf)}
          />
        </div>
      )}
    </>
  )
}
