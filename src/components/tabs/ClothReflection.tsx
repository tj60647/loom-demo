"use client"

// The cloth, its prompts, and the threads a prompt lays out to work from.
//
// This was the holdings station's whole content until 2026-08-08, when that
// station became Vocabulary pure (the model's User's holdings, now 04). It
// moved here to the Knowledge Graph — 03, after the same day's 03/04 swap —
// on TJ's call: the panel reads the *structure of the graph*, and this
// station already owns the projection whose one-line and paragraph it feeds.
// The read editor came with it only in the sense that it was already here —
// 03's copy was a duplicate of `#yourRead2` and is gone.
//
// Nothing here writes an interpretation: it counts and sorts and poses a
// generic question (red lines #1/#7). "Counted, not judged."

import { useLoom } from "@/components/providers/LoomProvider"
import { findLink } from "@/lib/linkResolve"
import LinkDescription from "@/components/ui/LinkDescription"
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type { Edge, Tier } from "@/lib/types"
import { adjacency, componentOf, allComponents, degreeOf, recurringHandles, noEvidenceConcepts, short } from "@/lib/clothMath"
import ClothMap, { SHOW_TRACE } from "@/components/svg/ClothMap"
import ThreadCard from "@/components/cards/ThreadCard"
import { useCaptureLog, CaptureLogScrubber, CaptureLogRows, CaptureLogDownload } from "@/components/ui/HistoryPanel"
import ConceptName from "@/components/ui/ConceptName"
import { conceptNameText } from "@/lib/conceptName"

/**
 * "What the cloth shows you" — the counted prompts, the threads they lay out,
 * and the "create projection" button on the end of a trace.
 *
 * Hidden on TJ's call (2026-08-13) so the cloth graph gets the full column
 * rather than half of a two-up. Kept behind a flag rather than deleted because
 * the panel is the only route from a trace to a projection: turn it back on and
 * the prompts, the reading pane and that button all return. Everything it needs
 * is still computed above — the cost of keeping it is a few unused renders, not
 * a rewrite.
 */
const SHOW_PROMPTS = false
/**
 * `SHOW_TRACE` USED TO BE DECLARED HERE, and it was this station's alone
 * (2026-08-18: "maybe just hide the tracing then, we arent really using it
 * yet"). It moved into `ClothMap` when TJ extended the ruling to the other
 * three cloths — the trace is drawn by the renderer, so one flag there cannot
 * leave a surface behind. Imported rather than re-declared for the same
 * reason. It still gates what this file owns: the legend's red swatch, and the
 * prompts panel's trace-a-prompt behaviour under SHOW_PROMPTS above.
 */

export default function ClothReflection({ onProjectionCreated, showLog = false, sourceId, scopeLabel, onThrowPair }: {
  /**
   * Take the student to the projection they just made (TJ, 2026-08-12:
   * "clicking the create projection button should also navigate us to the new
   * projection"). Selecting it is not arriving at it: this panel is at the top
   * of the station and the Projections section is a screen below, so the sort
   * and the board changed out of sight. The scroll lives in `MapTab`, which
   * owns that section's DOM.
   */
  onProjectionCreated?: () => void
  /**
   * Draw time under the cloth. Off in the practice loom, which must not read
   * the student's real record: the log fetches over its own route, bypassing
   * the provider, so it would show their actual work inside a space that keeps
   * nothing.
   */
  showLog?: boolean
  /** This reading's acts only — see `useCaptureLog`. */
  sourceId?: string
  /** Readable name for the scope, for the log download's filename. */
  scopeLabel?: string
  /**
   * Take a pair picked on the cloth to 02 · Linking, loaded (TJ, 2026-08-18:
   * "the throw navigate to 02 immediately on clicking the popup"). Without it
   * the pair is still gathered and drawn — the offer is what disappears,
   * because a popup whose one button has nowhere to go is a dead control.
   */
  onThrowPair?: (fromId: string, toId: string) => void
} = {}) {
  // The cloth and the counted report are this scope's — the scoped graph's
  // edges have both ends in scope by construction, so every concept lookup
  // below resolves. Bridges are named but not drawn: they are 02 Linking's
  // material, and drawing half a thread would be a lie.
  const {
    scopedState: state, flash, addEdge, links, addLink, attachLink,
    addMap, setMapTiers, selectMap, scopeMaps,
  } = useLoom()
  const [readSel, setReadSel] = useState<{type: "concept" | "edge" | "hub", id?: string, ids?: string[], promptIdx?: number, gap?: boolean} | null>(null)
  /**
   * THE PAIR (TJ, 2026-08-18: "select 2 nodes and throw them … so i think it
   * is something like select a node, shift select another node").
   *
   * In pick order, so the first is the From and the second the To. The cloth
   * is where you SEE that two concepts sit near each other and never crossed;
   * until now the only way to act on that was to remember both names and go
   * hunt them in 02's warp list.
   *
   * This state is what `SHOW_TRACE` freed. The click on a concept used to
   * light a traced component (commit 75e005c switched that off), so a cloth
   * with both live would have one gesture meaning two things.
   */
  const [pair, setPair] = useState<string[]>([])
  /**
   * The second node's own hit circle, kept for whatever has to hang off it.
   * A ref, not state: it is read at layout time and re-reading its rect is
   * how the drawing and the thing beside it stay together through a resize.
   */
  /**
   * The node each picked concept was picked ON, by id.
   *
   * One anchor was enough while the offer hung above the second node. The
   * create-thread card sits at the MIDPOINT of the pair (TJ, 2026-08-19: "a
   * 'create thread' card open at the arc midpoint"), which needs both — and
   * "the arc" is the one about to exist, so there is no path to measure and
   * the midpoint is the two nodes' own.
   */
  const pairAnchors = useRef(new Map<string, SVGCircleElement>())
  const pairAnchor = useRef<SVGCircleElement | null>(null)
  /** The thread being written, while the card is up. */
  const [threadSentence, setThreadSentence] = useState("")
  const [threadLabel, setThreadLabel] = useState("")
  const [throwing, setThrowing] = useState(false)

  /**
   * A PLAIN CLICK ALWAYS STARTS OVER; SHIFT EXTENDS. The file-manager idiom,
   * chosen because it is the one rule that makes every click predictable —
   * there is no state in which you have to remember how many nodes are lit to
   * know what pressing a third will do. Clicking the single picked node again
   * puts it down, which is how the cloth's own selection already behaved.
   */
  const pickConcept = useCallback((id: string, additive: boolean, anchor: SVGCircleElement | null) => {
    /* THE DRAWING CAN BE OLDER THAN THE LOOM. Scrub the record back and the
       cloth is `drawn` — a fold of the graph AS IT WAS — which happily draws a
       concept that has since been deleted. Picking one used to be allowed, and
       everything downstream then lied in turn: the offer named it "?", the
       bench woke with an id nothing resolves, and "Throw it" posted an edge
       whose fromId does not exist. (Reproduced on the seeded Object Worlds
       record, which carries 100 concepts its replay draws and the loom no
       longer has.)
       Refused here rather than patched at each of those, because this is the
       only place a pick is born. */
    if (!state.concepts.some((c) => c.id === id)) {
      flash("that concept has been deleted — the cloth is showing an earlier act")
      return
    }
    pairAnchor.current = anchor
    if (anchor) pairAnchors.current.set(id, anchor)
    setPair((prev) => {
      if (additive && prev.length === 1 && prev[0] !== id) return [prev[0], id]
      if (!additive && prev.length === 1 && prev[0] === id) return []
      return [id]
    })
  }, [state.concepts, flash])


  const [drafted, setDrafted] = useState("")
  const [showClothInfo, setShowClothInfo] = useState(false)
  const closeInfoButtonRef = useRef<HTMLButtonElement>(null)

  /**
   * The cloth over time (TJ, 2026-08-13). The hook is called unconditionally —
   * hooks must be — so `enabled` is what keeps the practice loom from reading
   * the student's real record. Gating only the render would still fetch it.
   */
  const log = useCaptureLog({ sourceId, enabled: showLog })
  /**
   * WHICH cloth the one map draws. Live state at the end of the record, the
   * folded reconstruction anywhere behind it. `log.ready` is false while the
   * record loads, when it fails, and when nothing is recorded — in every one of
   * those this stays false and the card draws the student's real work. The log
   * can hide its own scrubber; it can never blank the cloth.
   */
  const inThePast = showLog && log.ready && !log.atMax
  const drawn = inThePast && log.mapState ? log.mapState : state

  /**
   * Two views of one thing, in one box (TJ, 2026-08-13: "the previous version
   * had the diagram and the list in the same space, correct? why not just do
   * that again?"). It did, and this is that toggle back.
   *
   * The difference from then: the box used to hold a SECOND, read-only copy of
   * the cloth while the live one stayed on the station, so switching to the
   * list cost you nothing. There is one cloth now, so "record" hides the
   * drawing — which is what the row badges used to be a door back from. The
   * scrubber stays under both, because it is the position they share.
   */
  const [view, setView] = useState<"cloth" | "record">("cloth")

  /**
   * THE PAIR, AS IT CAN STILL BE DRAWN AND THROWN — and this is derived rather
   * than trusted, because `pair` is ids and an id outlives its concept.
   *
   * Refusing a pick whose concept is gone (see `pickConcept`) was not enough:
   * it checks only the id ARRIVING, so a concept picked while alive and deleted
   * afterwards stayed in the pair. Two routes reached it, both measured on the
   * running app. Pick a concept on the cloth, delete it on 04 · Vocabulary, and
   * come back — this station is KEEP_ALIVE, so the pair survives the trip —
   * then shift-click a live one: the offer opened reading "? → object worlds".
   * And picking, then scrubbing the record back past that concept's creation,
   * left the legend advertising PICKED with no red anywhere on the drawing,
   * which is the exact failure the legend's own guard exists to prevent.
   *
   * Filtering here fixes all of it in one place: the rings, the legend and the
   * offer all read this, so a pair that cannot be drawn is not offered either.
   * Against `drawn` AND `state` — the first is what is on screen, the second is
   * what the bench could actually accept.
   */
  const livePair = pair.filter(
    (id) => state.concepts.some((c) => c.id === id) && drawn.concepts.some((c) => c.id === id)
  )
  const offering = livePair.length === 2
  // Off `state`: `livePair` has already established that both resolve there.
  const pairName = (id: string) => {
    const c = state.concepts.find((x) => x.id === id)
    return c ? conceptNameText(c) : "?"
  }
  const popRef = useRef<HTMLDivElement>(null)
  /** Which pair the open offer is about — read by the toggle listener below. */
  const shownFor = useRef<string[] | null>(null)

  /**
   * THE OFFER RIDES THE BROWSER'S TOP LAYER, via the native popover API.
   *
   * The lesson is second-hand and paid for: 02's warp popover (`.cpop`, gone
   * in 14e42ce) was first written as an absolutely-positioned div inside the
   * list, and it was INVISIBLE — the scrollbox's `overflow:auto` clipped it
   * and the scrollbox's stacking context painted over it, while every
   * assertion passed and the screenshot showed nothing. The cloth sits inside
   * `#mapWrap`, which is `overflow-x:auto` (globals.css), so it is the same
   * trap. The top layer is clipped by nothing and outranks every z-index.
   *
   * `popover="auto"` brings light-dismiss and Escape with it, so there is no
   * scrim to maintain and no key handler to write — the × below is TJ's, and
   * additional to both ("there is a 'cancel' x in the popup").
   *
   * Positioned from JS, so the UA's centring margin has to go (see .pairpop).
   */
  const placePop = useCallback(() => {
    const pop = popRef.current
    const host = pairAnchor.current
    // `isConnected` is the guard that matters: flipping the card to "the
    // record" unmounts the whole SVG, and the anchor would otherwise be a
    // detached node reporting a 0,0 rect.
    if (!pop || !host?.isConnected) return
    /**
     * BETWEEN THE TWO, not over one of them.
     *
     * The card is about a relationship, so it hangs where the thread will be
     * drawn rather than on either end of it. Both anchors have to be connected
     * for that — scrub the record and the SVG is rebuilt, so a remembered node
     * can be detached — and when only one is, this falls back to the old
     * behaviour rather than placing the card at a coordinate half of which is
     * a lie.
     */
    const both = shownFor.current ?? []
    const a = pairAnchors.current.get(both[0] ?? "")
    const b = pairAnchors.current.get(both[1] ?? "")
    const mid = a?.isConnected && b?.isConnected
      ? (() => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
          const cx = (ra.left + ra.width / 2 + rb.left + rb.width / 2) / 2
          const cy = (ra.top + ra.height / 2 + rb.top + rb.height / 2) / 2
          return { left: cx, top: cy, width: 0, height: 0, right: cx, bottom: cy }
        })()
      : null
    const r = mid ?? host.getBoundingClientRect()
    if (!mid && !r.width && !r.height) { setPair([]); return }
    const w = pop.offsetWidth
    const h = pop.offsetHeight
    const GAP = 12, EDGE = 12
    // Centred on the node and ABOVE it: the warp's labels are drawn from each
    // node down and to the right, so anything hung below covers the names of
    // the pair it is asking about. Flipped below only when the node sits too
    // near the top of the window for the card to fit.
    const left = Math.min(
      Math.max(r.left + r.width / 2 - w / 2, EDGE),
      Math.max(window.innerWidth - w - EDGE, EDGE)
    )
    const above = r.top - GAP - h
    /* CLAMPED AT BOTH ENDS, and the top one was missing. `left` was guarded on
       both sides and the bottom was guarded, so three window edges were safe
       and the fourth was not: `placePop` runs on scroll with capture:true
       precisely so the card follows its node, and when the station scrolled
       the node above the window top `r.bottom + GAP` went negative and took
       the card with it — still :popover-open, still holding focus and the
       pair, and off screen. Measured at 1536x900 and 1280x800 before the fix. */
    const below = Math.min(r.bottom + GAP, Math.max(window.innerHeight - h - EDGE, EDGE))
    const top = above >= EDGE ? above : Math.max(below, EDGE)
    pop.style.left = `${Math.round(left)}px`
    pop.style.top = `${Math.round(top)}px`
  }, [])

  useEffect(() => {
    const pop = popRef.current
    if (!pop) return
    if (!offering) {
      if (pop.matches(":popover-open")) pop.hidePopover()
      return
    }
    // Which pair this showing is ABOUT — see the toggle listener below.
    shownFor.current = pair
    if (!pop.matches(":popover-open")) pop.showPopover()
    placePop()
    // Focus goes INTO the card. Showing a popover from script does not move it
    // — measured: with the offer up, the first Tab landed on the replay
    // scrubber below the cloth, so the × and the action were both past the
    // whole rest of the station. The container takes it (tabIndex -1) rather
    // than the action button, because a primary action under the cursor that
    // also answers to Enter is too eager for something that navigates.
    pop.focus()
    // Capture:true so the scroll of an ancestor — the station's own `main`, or
    // `#mapWrap` sideways — is seen, not only the window's.
    window.addEventListener("scroll", placePop, true)
    window.addEventListener("resize", placePop)
    /* AND THE NODE ITSELF MOVING UNDER IT. A window resize re-lays the warp:
       ClothMap's own ResizeObserver sets a new width and every X is recomputed,
       which happens in a React render AFTER the resize event this listener
       hears. Measured at 1280 → 1920 with the offer up: the card stayed put
       while its node travelled, ending 150px off it. The circle's `cx` is
       exactly what React rewrites when that lands, so watching the attribute
       puts the card back at the moment the node arrives — no delay to guess
       at, and nothing fires when the warp has not moved. */
    const anchor = pairAnchor.current
    const moved = anchor ? new MutationObserver(placePop) : null
    if (anchor && moved) moved.observe(anchor, { attributes: true, attributeFilter: ["cx", "cy", "r"] })
    return () => {
      window.removeEventListener("scroll", placePop, true)
      window.removeEventListener("resize", placePop)
      moved?.disconnect()
    }
  }, [offering, pair, placePop])

  /**
   * Light-dismiss and Escape close the ELEMENT without going through React, so
   * the state has to follow the element rather than the other way round.
   * Closing puts the whole pair down: cancelling is starting over, not
   * half-remembering one concept you have stopped looking at.
   *
   * BUT ONLY THE PAIR THIS SHOWING WAS ABOUT. Clicking a THIRD concept while
   * the offer is up both light-dismisses and picks, and a bare `setPair([])`
   * here threw the new pick away — measured in Chromium on the running app:
   * `click on circle @6110`, then `TOGGLE -> closed @6127`, 17ms later and in
   * its own task, so the clear always landed last and the first click on a
   * third node did nothing at all.
   *
   * Comparing identity rather than counting or timing makes that
   * order-independent: every pick mints a new array, so if the pair has moved
   * on since this showing began it is not this listener's to clear, whichever
   * of the two events the browser chooses to fire first.
   */
  useEffect(() => {
    const pop = popRef.current
    if (!pop) return
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState !== "closed") return
      setPair((prev) => (prev === shownFor.current ? [] : prev))
    }
    pop.addEventListener("toggle", onToggle)
    return () => pop.removeEventListener("toggle", onToggle)
  }, [])

  type ReadPrompt = {
    key: string
    rep?: string
    repHub?: string[]
    gap: boolean
    q: ReactNode
    move: string
  }

  useEffect(() => {
    if (!showClothInfo) return

    closeInfoButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowClothInfo(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showClothInfo])

  const adj = adjacency(state.edges)

  // The report as interpretive PROMPTS: question + move + "you decide".
  // The machine counts and sorts and poses a generic question; it never names
  // what the reading means (red lines #1/#7).
  const readPrompts: ReadPrompt[] = []
  const loose = state.edges.filter(e => !e.handle).length
  const noEv = noEvidenceConcepts(state.concepts, state.passages)
  if (state.concepts.length > 0) {
    const comps = allComponents(state.concepts, state.edges)
    const degs = state.concepts.map(c => ({c, d: degreeOf(state.edges, c.id)})).filter(o => o.d > 0).sort((a,b) => b.d - a.d)

    /* 1 — THE SPINE: the largest weave */
    if (comps.length && comps[0].edges.length >= 2) {
      const main = comps[0]
      const rep = [...main.nodes][0]
      readPrompts.push({
        key: 'the spine', rep: rep, gap: false,
        q: <>Your largest weave links <b>{main.nodes.size} concepts</b> across <b>{main.edges.length} threads</b>. Pull it — it already makes an argument.</>,
        move: 'trace the spine →'
      })
    }

    /* 2 — THE CENTRE: top-degree concept(s) */
    if (degs.length) {
      const top = degs[0]
      const tied = degs.filter(o => o.d === top.d).slice(0, 2)
      const names = tied.map((o, i) => (
        <Fragment key={o.c.id}>{i > 0 && ' and '}<b>{short(conceptNameText(o.c), 40)}</b></Fragment>
      ))
      readPrompts.push({
        key: 'the centre', rep: top.c.id, repHub: tied.map(o => o.c.id), gap: false,
        q: <>{tied.length > 1 ? 'Two concepts carry' : 'One concept carries'} the most threads ({top.d}): {names}. Your cloth keeps returning to {tied.length > 1 ? 'them' : 'it'} — {tied.length > 1 ? 'are they' : 'is it'} the core?</>,
        move: 'trace the centre →'
      })
    }

    /* 3 — THE GAP: an island, else unwoven warp */
    const islands = comps.slice(1)
    const unwoven = state.concepts.filter(c => degreeOf(state.edges, c.id) === 0)

    if (islands.length) {
      const isl = islands[0]
      const names = [...isl.nodes].map(id => state.concepts.find(c => c.id === id)).filter(Boolean)
      readPrompts.push({
        key: 'the gap', rep: [...isl.nodes][0], gap: true,
        q: <>{names.map((c, i) => (
          <Fragment key={c!.id}>{i > 0 && ' and '}<b>{short(conceptNameText(c!), 28)}</b></Fragment>
        ))} tie to each other but to nothing else. The sharpest question on the cloth: should they?</>,
        move: 'note the question →'
      })
    } else if (unwoven.length) {
      readPrompts.push({
        key: 'the gap', rep: unwoven[0].id, gap: true,
        q: <><b>{short(conceptNameText(unwoven[0]), 38)}</b>{unwoven.length > 1 ? ` and ${unwoven.length - 1} other${unwoven.length - 1 !== 1 ? 's' : ''}` : ''} cross nothing yet — warp with no weft. The sharpest question: where {unwoven.length > 1 ? 'do they' : 'does it'} belong?</>,
        move: 'note the question →'
      })
    }

    /* 4 — YOUR WORDS: a recurring handle becoming vocabulary */
    const rec = recurringHandles(state.edges)
    if (rec.length) {
      readPrompts.push({
        key: 'your words', gap: false,
        q: <>You&apos;ve reached for <b>&ldquo;{rec[0][0]}&rdquo;</b> on {rec[0][1].length} threads — it&apos;s becoming one of your own labels. See it with the rest on <b>04 · Vocabulary</b>.</>,
        move: 'a label recurring'
      })
    }
  }

  /**
   * A prompt is a TOGGLE: press it to trace, press it again to put it away
   * (TJ, 2026-08-12: "the 'what the cloth shows you' options should be click
   * to reveal click to hide toggles"). It only ever revealed before, so the
   * one way out of a trace was to press a different prompt — and the pane
   * below stayed full of threads you had finished with.
   */
  const handlePromptClick = (p: ReadPrompt, idx: number) => {
    if (readSel?.promptIdx === idx) {
      setReadSel(null)
      setDrafted("")
      return
    }
    if (p.repHub) {
      setReadSel({ type: "hub", ids: p.repHub, promptIdx: idx, gap: false })
    } else if (p.rep) {
      setReadSel({ type: "concept", id: p.rep, promptIdx: idx, gap: p.gap })
    } else {
      setReadSel(null)
    }
    setDrafted(p.rep
      ? 'traced on the cloth — your threads are laid out below, yours to weave into your read.'
      : 'just a pattern to notice — nothing to lay out.')
  }

  /**
   * Make these threads a projection (TJ, 2026-08-12). It used to be "copy
   * these threads", which put them on the clipboard and left the student to
   * do the laying out somewhere else — a dead end inside the tool that had
   * just found the trace.
   *
   * The trace IS a claim about what matters: the concepts it runs through go
   * on the top tier, and every other concept in this reading is set aside.
   * That is a starting arrangement, not a verdict — the sort list is right
   * there and every chip is one press. Nothing is written that the student
   * cannot immediately re-tier.
   */
  const [creating, setCreating] = useState(false)
  const createProjectionFrom = async (edges: Edge[], seeds: string[]) => {
    if (creating) return
    setCreating(true)
    try {
      const primary = new Set<string>(seeds)
      edges.forEach((e) => { primary.add(e.fromId); primary.add(e.toId) })
      if (!primary.size) { flash("nothing traced yet"); return }
      const name = `Cloth projection ${scopeMaps.length + 1}`
      const map = await addMap(name)
      // Go THEN sort, not sort then go: both writes are server round-trips and
      // waiting for the second one before moving left the student on the cloth
      // panel for ~2.5 seconds with nothing happening — long enough to read as
      // a dead button. Travelling first means they watch the sort fill in.
      selectMap(map.id)
      onProjectionCreated?.()
      const tiers: Record<string, Tier> = {}
      state.concepts.forEach((c) => { tiers[c.id] = primary.has(c.id) ? "p" : "x" })
      await setMapTiers(map.id, tiers)
      flash(`“${name}” — ${primary.size} concept${primary.size === 1 ? "" : "s"} primary, the rest set aside`)
    } catch (e) {
      flash(e instanceof Error ? e.message : "could not start a projection")
    } finally {
      setCreating(false)
    }
  }

  // v14's tripleHtml. The inline type overrides that used to sit here shrank
  // this pane to 12-14px; the sizes are globals.css's, and since 2026-08-18 the
  // row's are ThreadCard's.
  /* THE SHARED CARD (docs/thread-card.md). Hand-rolled as a `.readitem` until
     2026-08-18, with its own third stand-in for an unlabelled thread — the
     literal word "description" inside the pill, where 02 put a truncated
     sentence and /admin/user/[id] put an arrow. */
  const threadItem = (e: Edge) => (
    <ThreadCard
      key={e.id}
      thread={e}
      from={state.concepts.find((c) => c.id === e.fromId)}
      to={state.concepts.find((c) => c.id === e.toId)}
      links={state.links}
    />
  )

  // Generate reading pane content
  let readingPane = null;
  if (readSel) {
    if (readSel.type === "hub" && readSel.ids) {
      const inc = state.edges.filter(e => readSel.ids!.includes(e.fromId) || readSel.ids!.includes(e.toId));
      const names = readSel.ids.map(id => state.concepts.find(c => c.id === id)).filter(Boolean);

      readingPane = (
        <div id="readingPane" style={{ marginTop: "16px" }}>
          <div className="threadhead">
            {names.map((n, i) => <span key={n!.id}><span className="red">{conceptNameText(n!)}</span>{i < names.length - 1 ? " · " : ""}</span>)}
            <span className="n"> · {inc.length} thread{inc.length !== 1 ? 's' : ''} meet here</span>
          </div>
          <p className="hint" style={{ margin: "4px 0 9px" }}>
            The threads that converge on your busiest concept{readSel.ids.length > 1 ? 's' : ''} — your own sentences. <b>You</b> decide whether this is the core, and weave it into your read.
            Make it a projection and these concepts start on the top tier, with the rest set aside — a starting arrangement you can re-sort in a press.
          </p>
          <button
            className="btn ghost mini"
            onClick={() => createProjectionFrom(inc, readSel.ids ?? [])}
            disabled={creating}
            style={{ marginBottom: "12px" }}
          >{creating ? "…" : "create projection"}</button>
          <div>{inc.map(threadItem)}</div>
        </div>
      );
    } else if (readSel.type === "edge" && readSel.id) {
      const e = state.edges.find(x => x.id === readSel.id);
      if (e) {
        const f = state.concepts.find(c => c.id === e.fromId);
        const t = state.concepts.find(c => c.id === e.toId);
        const fromPassages = state.passages.filter(b => f && b.conceptIds.includes(f.id));
        const toPassages = state.passages.filter(b => t && b.conceptIds.includes(t.id));

        readingPane = (
          <div id="readingPane" style={{ marginTop: "16px" }}>
            <div className="threadhead">
              <span className="red">{f ? conceptNameText(f) : "?"}</span> {e.handle ? <span className="vpill">{e.handle}</span> : <span className="vpill loosev">description</span>} <span className="red">{t ? conceptNameText(t) : "?"}</span>
            </div>
            <p style={{ fontSize: "15.5px", fontStyle: "italic", margin: "8px 0 14px" }}>&ldquo;{e.sentence}&rdquo;</p>
            {[f, t].filter(Boolean).map(c => (
              <div key={c!.id} style={{ marginBottom: "16px" }}>
                <div className="label" style={{ marginTop: "8px" }}><ConceptName concept={c!} /></div>
                {c!.def && <div style={{ fontSize: "13.5px", color: "var(--ink-soft)" }}>{c!.def}</div>}
                {(c === f ? fromPassages : toPassages).map(b => (
                  <div key={b.id} className="passagequote">
                    <span className="src">{b.source || '—'}{b.location ? ` · ${b.location}` : ''}</span><br/>
                    {b.content}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      }
    } else if (readSel.type === "concept" && readSel.id) {
      const c = state.concepts.find(x => x.id === readSel.id);
      if (c) {
        const comp = componentOf(c.id, adj);
        if (comp.edges.length === 0) {
          readingPane = (
            <div id="readingPane" style={{ marginTop: "16px" }}>
              <div className="threadhead"><span className="red">{conceptNameText(c)}</span></div>
              <p className="empty" style={{ marginTop: "8px" }}>This thread crosses nothing yet — warp waiting for weft. Take it to 02 — Linking.</p>
            </div>
          );
        } else {
          readingPane = (
            <div id="readingPane" style={{ marginTop: "16px" }}>
              <div className="threadhead">
                <span className="red">{conceptNameText(c)}</span> <span className="n"> · {comp.edges.length} crossing{comp.edges.length !== 1 ? 's' : ''}</span>
              </div>
              <p className="hint" style={{ margin: "4px 0 9px" }}>
                Your threads, in walking order — your own sentences, laid out as raw material. <b>You</b> weave them into a read below, in your own words.
                Make it a projection and these concepts start on the top tier, with the rest set aside — a starting arrangement you can re-sort in a press.
              </p>
              <button
                className="btn ghost mini"
                onClick={() => createProjectionFrom(comp.edges, [c.id])}
                disabled={creating}
                style={{ marginBottom: "12px" }}
              >{creating ? "…" : "create projection"}</button>
              <div>{comp.edges.map(threadItem)}</div>
            </div>
          );
        }
      }
    }
  } else {
    readingPane = (
      <div id="readingPane" style={{ marginTop: "16px" }}>
        <p className="empty">Click a prompt above — or a concept/arc on the cloth — to lay your threads out here as material to weave from.</p>
      </div>
    );
  }

  return (
    <>
      {/* ONE popover element for the whole cloth, not one per node: it lives in
          the top layer, so there is nothing for a per-node instance to anchor
          to and every extra one would be a second thing to keep positioned.
          It renders empty and closed until a pair is complete. */}
      <div
        ref={popRef}
        popover="auto"
        className="pairpop"
        role="dialog"
        aria-label="Link these two concepts"
        tabIndex={-1}
      >
        {offering && (
          <>
            {/* TJ asked for this as well as light-dismiss, 2026-08-18: "there
                is a 'cancel' x in the popup". Escape and a click away already
                close it; a visible way out is what says so. */}
            <button
              type="button"
              className="iconbtn pairpop-x"
              aria-label="Cancel — put this pair down"
              title="put this pair down"
              onClick={() => setPair([])}
            >✕</button>
            {/* THE BENCH, STREAMLINED, WHERE THE THREAD WILL BE (TJ,
                2026-08-19: "we are making the cloth a place where threads are
                created … this is for the student who has done the process 12
                times and wants a shortcut. the main flow is still through 02.
                we want a version of the 02 stage but streamlined as a popup
                with editable fields").

                It offered a trip to 02 and nothing else. For a reader who has
                done it a dozen times that is a station change to write one
                sentence — and the cloth is exactly where you SEE that two
                concepts sit near each other and never crossed, so the judgment
                and the place to record it were one screen apart.

                It asks what the bench asks and no more: which way the thread
                runs, and how they hang together. Labels are still 02's — they
                are vocabulary, they recur across threads, and a shortcut is
                not the place to coin one. The door to 02 stays below for
                everything this leaves out. */}
            <div className="pairpop-slots">
              <div className="pairpop-slot">
                <span className="cap">From</span>
                <b>{pairName(livePair[0])}</b>
              </div>
              <div className="pairpop-swap">
                <span className="pairpop-arr">→</span>
                {/* The pair is stored in pick order and pick order IS direction,
                    so swapping is reversing the array — the same act as picking
                    them the other way round, and it re-places the card too
                    because nothing about the midpoint depends on order. */}
                <button
                  type="button"
                  onClick={() => setPair((prev) => [...prev].reverse())}
                  title="reverse the direction of this thread"
                >swap</button>
              </div>
              <div className="pairpop-slot">
                <span className="cap">To</span>
                <b>{pairName(livePair[1])}</b>
              </div>
            </div>

            {/* No opener chips here (TJ, 2026-08-19). They are the bench's
                scaffold for a student stuck on how to begin; this card is the
                shortcut for one who is not, and seven of them wrapping over
                five rows was most of the popup. */}
            <LinkDescription
              value={threadSentence}
              onChange={setThreadSentence}
              label="How they hang together"
              rows={3}
              openers={false}
            />

            {/* THE LABEL, OPTIONAL (TJ, 2026-08-19: "add a place for the label
                as an option").

                A Link is an object the student owns (5.1), not a string on the
                thread — so typing a name here ATTACHES the Link of that name
                when one exists and mints one only when it does not. findLink
                is the one place that decides whether two spellings are the same
                word ("Leads to" and "leads to" have always been one row), and
                going through it is what stops this card quietly creating a
                second Link for a label the student already has.

                Left empty the thread is unlabelled, which is legal and common:
                a label is for a relationship that RECURS, and the first time
                you throw one there is nothing to recur yet. */}
            <div className="form-row">
              <span className="label">
                Label <span className="labelsay">(optional — a short word, if this relationship recurs)</span>
              </span>
              <input
                className="tinput"
                list="pairpop-links"
                value={threadLabel}
                onChange={(e) => setThreadLabel(e.target.value)}
                placeholder="e.g. leads to"
              />
              <datalist id="pairpop-links">
                {links.filter((l) => l.label.trim()).map((l) => (
                  <option key={l.id} value={l.label} />
                ))}
              </datalist>
            </div>

            <div className="pairpop-actions">
              <button
                type="button"
                className="btn mini"
                disabled={throwing}
                onClick={async () => {
                  if (throwing) return
                  setThrowing(true)
                  try {
                    const [a, b] = livePair
                    // The same call the bench makes, with the same rule: the
                    // description is encouraged and never required (P0.3), so
                    // an empty one throws a thread you can describe later.
                    const edge = await addEdge(a, b, threadSentence.trim())
                    const name = threadLabel.trim()
                    if (name && edge?.id) {
                      // Reuse before mint — see the field's own note.
                      const existing = findLink(links, name)
                      const link = existing ?? (await addLink(name))
                      await attachLink(edge.id, link.id)
                    }
                    setThreadSentence("")
                    setThreadLabel("")
                    setPair([])
                    flash(name ? 'thread thrown, and labelled' : 'thread thrown — label the link on 02, when you like')
                  } catch (e) {
                    console.error(e)
                  } finally {
                    setThrowing(false)
                  }
                }}
              >{throwing ? "throwing…" : "Throw it"}</button>
              {onThrowPair && (
                <button
                  type="button"
                  className="btn mini ghost"
                  onClick={() => {
                    const [a, b] = livePair
                    setThreadSentence("")
                    setThreadLabel("")
                    setPair([])
                    onThrowPair(a, b)
                  }}
                >open on 02 →</button>
              )}
            </div>
            <p className="pairpop-note">02 · Linking carries the labels, the openers and the record of every thread</p>
          </>
        )}
      </div>

      {/* A note counting the bridges — threads running out of this reading to
          concepts met elsewhere — stood above the card until 2026-08-13 (TJ:
          "i dont think this adds value"). It explained an absence: why the
          drawing does not show something you were not looking for. The rule it
          defended is unchanged and still true — the cloth draws only threads
          with both ends in this reading, because half a thread would be a lie —
          and the bridges themselves are still counted, in the workbench
          footer's "N threads out" — nothing lists them since 02's band was
          removed on 2026-08-09. */}

      {/* The cloth and its reading were side by side (TJ, 2026-08-12) — one
          gesture, a prompt on the right lighting the cloth on the left. The
          prompts panel is hidden now (TJ, 2026-08-13) and the cloth takes the
          whole column, so there is no grid to be half of: with SHOW_PROMPTS
          off the card is a plain full-width block and ClothMap reflows to it.
          Tracing still works by clicking a concept or arc on the cloth itself. */}
      <div className={SHOW_PROMPTS ? "two" : undefined}>
      <div className="card">
      {/* No "THE CLOTH" label on the card: 03's section heading says it now
          (TJ, 2026-08-12), and the same words twice, six lines apart, read as
          two different things. */}
      {/* The chips read like the projection switcher because they do the same
          job: pick which of two views of one thing you are looking at. The
          download sits with them so it is in the same place in both. */}
      <div className="mapbar" style={{ marginBottom: 8 }}>
        <span className="hint" style={{ margin: 0 }}>
          Warp in reading order; weft arcs across.{SHOW_PROMPTS
            ? " Click a prompt beside this to trace it here — or click a concept/arc directly to pull it."
            /* It said "Click a concept or arc to trace it" until 2026-08-18,
               which stopped being true the moment SHOW_TRACE went off: the
               click did nothing at all. Now it picks. */
            : " Click a concept, then shift-click a second, to link them on 02."}
          {showLog && " Scrub below to see how it grew."}
        </span>
        {showLog && log.ready && (
          <>
            <span className="chips" style={{ margin: 0, marginLeft: "auto", alignItems: "center" }}>
              {([["cloth", "the cloth"], ["record", "the record"]] as const).map(([v, label]) => (
                <span
                  key={v}
                  className={`chip${view === v ? " on" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setView(v)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(v) } }}
                >{label}</span>
              ))}
            </span>
            <CaptureLogDownload log={log} scopeLabel={scopeLabel} />
          </>
        )}
      </div>

      {/* ONE box, two views (see `view` above). The cloth draws the student's
          live weave, or — while the scrubber sits back from the end of the
          record — the same weave folded to the act they are looking at. The
          glow marks what that act touched, and only once they have actually
          moved: on arrival this is a calm drawing of their work, not a pulse on
          whatever they last happened to do.

          Both are 400px tall, so the chips swap the contents and the legend,
          the scrubber and everything below them stay exactly where they were. */}
      <div id="mapWrap">
        {view === "record" && showLog && log.ready ? (
          <CaptureLogRows log={log} onShowCloth={() => setView("cloth")} />
        ) : (
          <ClothMap
            state={drawn}
            readSel={SHOW_TRACE ? readSel : null}
            setReadSel={SHOW_TRACE ? setReadSel : () => {}}
            glow={showLog && log.scrubbed && log.glowId ? { id: log.glowId, seq: log.pulse } : null}
            /* Only one of the two can own the click. Tracing is off here and
               pairing takes it; flip SHOW_TRACE back on and this has to be
               reconsidered rather than merely coexist. */
            pair={SHOW_TRACE ? [] : livePair}
            onPickConcept={SHOW_TRACE ? undefined : pickConcept}
          />
        )}
      </div>

      <div className="legend">
        <span><span className="sw" style={{borderTop: "2px solid var(--ochre)"}}></span>warp — concept</span>
        <span><span className="sw" style={{borderTop: "2px solid var(--sage)"}}></span>labelled link</span>
        <span><span className="sw" style={{borderTop: "2px dashed var(--grey)"}}></span>unlabelled — description only</span>
        {SHOW_TRACE && (
          <span><span className="sw" style={{borderTop: "2px solid var(--red)"}}></span>what you&apos;re tracing</span>
        )}
        {/* Only while there IS red on the drawing. A legend line for a
            transient state would otherwise stand permanently, naming a colour
            that is not on screen — which is what the tracing line above became
            the day tracing was switched off. It appends, so nothing else in
            the row moves when it arrives. */}
        {livePair.length > 0 && (
          <span><span className="sw" style={{borderTop: "2px solid var(--red)"}}></span>picked</span>
        )}
      </div>

      {/* The log, in the same card as the cloth it describes (TJ, 2026-08-13).
          A rule rather than a card edge: these are two registers of one thing —
          the cloth, and the cloth over time — not two objects sitting next to
          each other. It was its own section with its own heading and its own
          second drawing of the same graph until today. */}
      {showLog && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--rule)" }}>
          {/* Under BOTH views: it is the position the two of them share. Click
              a row in the record and this moves; drag this and the cloth
              redraws. */}
          <CaptureLogScrubber log={log} />
        </div>
      )}
      </div>

      {SHOW_PROMPTS && <div className="card">
        <h2 className="heading-with-info">
          What the cloth shows you <span className="n">counted, not judged</span>
          <button
            type="button"
            className="iconbtn cloth-info-btn"
            aria-label="How cloth prompts are derived"
            aria-haspopup="dialog"
            aria-expanded={showClothInfo}
            aria-controls="clothInfoDialog"
            onClick={() => setShowClothInfo(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
        </h2>
        {showClothInfo && (
          <div className="info-scrim" onClick={() => setShowClothInfo(false)}>
            <section
              id="clothInfoDialog"
              className="info-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="clothInfoTitle"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                ref={closeInfoButtonRef}
                type="button"
                className="iconbtn info-close"
                aria-label="Close info"
                onClick={() => setShowClothInfo(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <div className="info-k">counted, not judged</div>
              <h2 id="clothInfoTitle">How these prompts are made</h2>
              <p>
                This panel reads the structure of your own loom. It counts concepts and threads, then turns the visible patterns into questions for you to answer.
              </p>
              <ul>
                <li><b>The spine</b> is the largest connected weave of concepts and threads.</li>
                <li><b>The centre</b> is the concept, or tied concepts, with the most threads touching them.</li>
                <li><b>The gap</b> is either an island apart from the main weave, or a concept with no threads yet.</li>
              </ul>
              <p className="info-note">
                No agent writes the reading or decides what it means. The tool points; you interpret.
              </p>
              <button type="button" className="btn ghost mini" onClick={() => setShowClothInfo(false)}>Got it</button>
            </section>
          </div>
        )}
        <p className="hint">Click a prompt to light it up on the cloth and lay those threads out below. <b>You don&apos;t write anything here</b> — your one short read goes underneath.</p>

        <div id="clothPrompts">
          {state.concepts.length === 0 && <p className="empty">Nothing laid yet — prompts appear as you weave.</p>}
          {readPrompts.map((p, i) => (
            <div
              key={i}
              className={`prompt ${readSel?.promptIdx === i ? "on" : ""}`}
              onClick={() => handlePromptClick(p, i)}
            >
              <span className="youdecide">you decide</span>
              <span className="pk">{p.key}</span>
              <div className="pq">{p.q}</div>
              {p.move && <span className="pm">{p.move}</span>}
            </div>
          ))}
          {state.concepts.length > 0 && loose > 0 && (
            <div className="ghostnote" style={{ marginTop: "6px" }}>{loose} thread{loose !== 1 ? 's' : ''} with no label yet — label one on 02 so a word can recur.</div>
          )}
          {/* A designation, not a scolding (TJ, 2026-08-08): a concept may be
              named ahead of its evidence on purpose. Counted, not judged — so
              it is stated in the ordinary voice, not in red. */}
          {state.concepts.length > 0 && noEv.length > 0 && (
            <div className="ghostnote" style={{ marginTop: "6px" }}>{noEv.length} concept{noEv.length !== 1 ? 's' : ''} carry <b>no passage</b> yet — named ahead of their evidence, or left behind by it.</div>
          )}
          {drafted && <div className="drafted" id="readDrafted">{drafted}</div>}
        </div>

        {readingPane}
      </div>}
      </div>
    </>
  )
}
