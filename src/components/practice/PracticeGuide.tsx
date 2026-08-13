"use client"

/**
 * The guide: a coach mark over the real interface.
 *
 * TJ, 2026-08-12, reviewing the first version: *"the beats seem out of sync
 * with the activities they describe, there is no clear hit this button now
 * glow, like 'next'. the instructions are in remote corners far from the main
 * controls… the actions one can take should be very constrained by the guide.
 * is this not a standard/best practice for these kinds of thing?"*
 *
 * It is. The pattern is a guided tour, and its anatomy is settled — Shepherd,
 * driver.js, Intro.js and react-joyride all ship the same four parts, and the
 * first version had one of them:
 *
 *   1. A MASKED BACKDROP with a cutout on the target. Draws the eye, and
 *      constrains the move: everything else sits behind an inert pane.
 *   2. A POPOVER ANCHORED to the target, with a beak. The instruction sits at
 *      the thing it is about. The old version scored the four viewport
 *      corners and deliberately took the one FURTHEST from the target.
 *   3. ONE PRIMARY ACTION, filled, pulsing the moment the beat's own
 *      predicate says the gesture landed.
 *   4. PROGRESS, and a way out.
 *
 * WHERE THE PATTERN BENDS HERE, both deliberate:
 *
 *   - Beat 2 teaches DRAG-SELECTING text in a PDF, so the cutout must stay
 *     fully interactive, and a drag that starts inside it and wanders out
 *     must not die on a pane. The panes therefore carry no handlers at all —
 *     they block by geometry and nothing else — and go away entirely for the
 *     duration of a drag that began inside the hole.
 *   - Beat 3's target is inside the app's own modal scrim, which already IS
 *     the constraint. That beat sets `overlay: "none"`: dimming twice only
 *     darkens the dialog.
 *
 * Only ever rendered in the practice loom (`SandboxWorkbench`). It reads
 * `useLoom()`, which there is the sandbox's own context.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import {
  GUIDE_STEPS,
  baselineOf,
  standOn,
  stepDone,
  type GuideBaseline,
  type GuideMove,
  type GuideSignals,
  type GuideStep,
} from "@/lib/practiceGuide"

function goToStation(station: string) {
  window.dispatchEvent(new CustomEvent("loom:practice-station", { detail: station }))
}

type Rect = { top: number; left: number; width: number; height: number }
type Side = "top" | "right" | "bottom" | "left"

/** Breathing room between the cutout and the popover. */
const GAP = 14
/** How far the cutout grows around the target, so nothing is clipped. */
const PAD = 6

const near = (a: Rect | null, b: Rect | null) =>
  !!a && !!b &&
  Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 &&
  Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1

/**
 * The area this beat works in: the UNION of every target in its chain that is
 * currently on the page.
 *
 * Not the first match — that was a bug with teeth. A beat's chain lists the
 * controls the move passes through, and several of them are on screen at
 * once: the throw beat names the warp, the bench and the Throw button, all
 * three always present. Cutting a hole over only the first would have masked
 * the sentence box the same beat tells you to type in, so the mask would have
 * made its own instruction impossible to follow.
 *
 * The union also walks the move by itself: the cloth beat's chain is the Your
 * work button, the fold, the title and Save, and the last three do not exist
 * until the ones before them are pressed — so the hole grows as the student
 * goes.
 *
 * A target counts only if it is IN the viewport. Size alone is not enough:
 * the Your-work sheet is always mounted, parked at `translateX(100% + 12px)`,
 * so a closed sheet has a perfectly real rect off the right edge — and a
 * cutout there is a dark screen with no hole in it.
 */
function resolveTarget(selectors: string[]): { rect: Rect | null; away: boolean } {
  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity
  // A target that IS on the page but scrolled out of it. The beat still has
  // something to point at; the student just cannot see it.
  let away = false

  for (const selector of selectors) {
    const box = document.querySelector(selector)?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) continue
    if (
      box.bottom < 0 || box.top > window.innerHeight ||
      box.right < 0 || box.left > window.innerWidth
    ) {
      away = true
      continue
    }
    top = Math.min(top, box.top)
    left = Math.min(left, box.left)
    right = Math.max(right, box.right)
    bottom = Math.max(bottom, box.bottom)
  }

  if (top === Infinity) return { rect: null, away }
  return { rect: { top, left, width: right - left, height: bottom - top }, away: false }
}

/**
 * The gesture the student is on, inside a beat made of several.
 *
 * The first one not yet finished — and the last one once they all are, so the
 * ring never blinks out at the end of a beat.
 */
function currentMove(step: GuideStep): GuideMove | null {
  if (!step.moves?.length) return null
  for (const move of step.moves) if (!move.done || !move.done(document)) return move
  return step.moves[step.moves.length - 1]
}

/** The nearest ancestor of `el` that actually scrolls, or null. */
function scrollerOf(el: Element | null): Element | null {
  for (let node = el; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 4 &&
        /auto|scroll/.test(getComputedStyle(node).overflowY)) return node
  }
  const doc = document.scrollingElement
  return doc && doc.scrollHeight > doc.clientHeight + 4 ? doc : null
}

/**
 * Let the wheel through the mask.
 *
 * A pane is `position:fixed`, so it is not in the scroll chain of whatever the
 * page scrolls — here a `<main>`, not the document. Wheeling over a pane
 * therefore scrolled nothing at all, while wheeling over the cutout scrolled
 * normally: the page moved or did not depending on where the pointer happened
 * to be, which is unexplainable to anybody it happens to. The mask is meant to
 * constrain what you can PRESS, not to freeze the page under it.
 */
function wheelThrough(e: React.WheelEvent<HTMLDivElement>) {
  const scroller = scrollerOf(document.querySelector("main"))
  if (!scroller) return
  scroller.scrollTop += e.deltaY
}

/**
 * Scroll the beat's first live target back under the student's eye.
 *
 * Beats scroll their target into view when they OPEN, but a student can scroll
 * away afterwards and then the card says "press the glowing card" with no glow
 * anywhere on screen (TJ, 2026-08-12: *"in many pages it is possible to scroll
 * away from the 'glowing button/card'. how do we indicate where the 'glow'
 * is?"*). Rather than dragging the page back whenever they look around — which
 * fights the scroll they just made — the card grows a button and they press it.
 */
function scrollToTarget(selectors: string[]) {
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    const box = el?.getBoundingClientRect()
    if (!el || !box || box.width === 0 || box.height === 0) continue
    // CENTRE a target that fits; align the TOP of one that does not (TJ,
    // 2026-08-12, chasing the board beat). The board is 562px tall and `main`
    // is 471 at a 1280×720 laptop: centring a target taller than its scroller
    // pushes the top of it off the top of the screen — and the top of the
    // board is the primary band, which is exactly where the card the beat
    // asks you to drag has just landed. The beat then says "drag the cards"
    // with the cards above the fold.
    const scroller = el.closest("main") ?? document.documentElement
    const fits = box.height <= scroller.getBoundingClientRect().height
    el.scrollIntoView({ behavior: "smooth", block: fits ? "center" : "start", inline: "nearest" })
    return
  }
}

/**
 * Place the popover beside the cutout: the first side with room, else the one
 * with the most. Then clamp it on screen — which is what makes the beak
 * necessary, since a clamped card no longer points at anything by position.
 */
function place(hole: Rect, card: { w: number; h: number }) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const room: Record<Side, number> = {
    bottom: vh - (hole.top + hole.height),
    right: vw - (hole.left + hole.width),
    top: hole.top,
    left: hole.left,
  }
  const order: Side[] = ["bottom", "right", "top", "left"]
  const need = (side: Side) => (side === "top" || side === "bottom" ? card.h : card.w) + GAP * 2
  const side =
    order.find((s) => room[s] >= need(s)) ??
    order.reduce((best, s) => (room[s] > room[best] ? s : best), order[0])

  let top: number
  let left: number
  if (side === "bottom") {
    top = hole.top + hole.height + GAP
    left = hole.left + hole.width / 2 - card.w / 2
  } else if (side === "top") {
    top = hole.top - card.h - GAP
    left = hole.left + hole.width / 2 - card.w / 2
  } else if (side === "right") {
    left = hole.left + hole.width + GAP
    top = hole.top + hole.height / 2 - card.h / 2
  } else {
    left = hole.left - card.w - GAP
    top = hole.top + hole.height / 2 - card.h / 2
  }

  const clampedLeft = Math.max(GAP, Math.min(Math.max(GAP, vw - card.w - GAP), left))
  const clampedTop = Math.max(GAP, Math.min(Math.max(GAP, vh - card.h - GAP), top))

  const targetX = hole.left + hole.width / 2
  const targetY = hole.top + hole.height / 2
  const beak =
    side === "top" || side === "bottom"
      ? Math.max(16, Math.min(Math.max(16, card.w - 16), targetX - clampedLeft))
      : Math.max(16, Math.min(Math.max(16, card.h - 16), targetY - clampedTop))

  return { side, top: clampedTop, left: clampedLeft, beak }
}

export default function PracticeGuide() {
  const { state } = useLoom()

  const [open, setOpen] = useState(true)
  const [showWhy, setShowWhy] = useState(false)
  const [signals, setSignals] = useState<GuideSignals>({
    readingOpened: false, capturing: false, kitCopied: false,
  })
  const [hole, setHole] = useState<Rect | null>(null)
  const [spot, setSpot] = useState<{ side: Side; top: number; left: number; beak: number } | null>(null)
  /** True while a drag that began inside the cutout is still in flight. */
  const [dragging, setDragging] = useState(false)
  /** True while one of the app's own modal scrims is on screen. */
  const [overScrim, setOverScrim] = useState(false)
  /** True when the beat's target is on the page but scrolled out of sight. */
  const [away, setAway] = useState(false)
  /** Bumped on every rail press, so re-showing the beat you are on re-finds it. */
  const [nudge, setNudge] = useState(0)
  /** The gesture inside a multi-part beat, and where its ring sits. */
  const [move, setMove] = useState<GuideMove | null>(null)
  const [ring, setRing] = useState<Rect | null>(null)

  const cardRef = useRef<HTMLDivElement | null>(null)

  const [base] = useState<GuideBaseline>(() => baselineOf(state))
  const [at, setAt] = useState(() =>
    standOn(baselineOf(state), state, { readingOpened: false, capturing: false, kitCopied: false })
  )

  useEffect(() => {
    const set = (patch: Partial<GuideSignals>) => setSignals((s) => ({ ...s, ...patch }))
    const onOpened = () => set({ readingOpened: true })
    const onCaptureOpen = () => set({ capturing: true })
    const onCaptureClose = () => set({ capturing: false })
    const onKit = () => set({ kitCopied: true })
    window.addEventListener("loom:practice-opened", onOpened)
    window.addEventListener("loom:capture-open", onCaptureOpen)
    window.addEventListener("loom:capture-close", onCaptureClose)
    window.addEventListener("loom:mapkit-taken", onKit)
    return () => {
      window.removeEventListener("loom:practice-opened", onOpened)
      window.removeEventListener("loom:capture-open", onCaptureOpen)
      window.removeEventListener("loom:capture-close", onCaptureClose)
      window.removeEventListener("loom:mapkit-taken", onKit)
    }
  }, [])

  const done = useMemo(
    () => GUIDE_STEPS.map((s) => stepDone(s.key, base, state, signals)),
    [base, state, signals]
  )

  const step = GUIDE_STEPS[at]
  const ready = done[at]
  const last = at === GUIDE_STEPS.length - 1

  const show = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(GUIDE_STEPS.length - 1, index))
    setAt(clamped)
    setNudge((n) => n + 1)
    // Including "library", which used to be excluded — so pressing pip 1 from
    // inside the workbench showed a beat about a glowing card with no card on
    // screen, the exact conflict TJ called confusing (2026-08-12: *"the 'open
    // a reading' button 1 does not take us back to 'pick a reading in
    // library', is that intentional?"* — it was not). Nothing is lost going
    // back: the practice loom's state lives in `SandboxLoomProvider`, above
    // the stage, so the reading re-opens holding everything you made.
    goToStation(GUIDE_STEPS[clamped].station)
  }, [])

  useEffect(() => {
    if (!open) return
    goToStation(step.station)
  }, [open, step.station])

  /**
   * A beat about the text needs a page with text on it: the practice reading
   * opens on two covers, where "drag across a line" points at a picture.
   *
   * It turns the page ONLY when there is no text on screen to work with, and
   * only when the beat arrives. Both halves were bugs (TJ, 2026-08-12: *"stage
   * 3 of guide does not stay on page where passage was captured"*). It used to
   * depend on `state.passages`, so the instant a capture landed the effect
   * re-fired — and it focused the FIRST passage carrying a page number, which
   * is one of the worked cloth's, on some other page entirely. The student was
   * thrown off the page they had just taken words from, in the middle of the
   * beat about naming them.
   */
  useEffect(() => {
    if (!open || !step.needsText) return
    const timer = window.setTimeout(() => {
      if (document.querySelector(".react-pdf__Page__textContent span")) return
      const onAPage = state.passages.find((p) => p.pageNumber)
      if (onAPage) window.dispatchEvent(new CustomEvent("loom:practice-focus", { detail: onAPage.id }))
    }, 200)
    return () => window.clearTimeout(timer)
    // Deliberately NOT `state.passages`: capturing must not move the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, at, step.needsText])

  /**
   * Bring the target into view when the beat arrives, and only when it is out
   * of it.
   *
   * It waits for the target rather than looking once. Pressing pip 1 from the
   * workbench tears the whole shelf down and builds it again, and the practice
   * Library is twenty-four cards deep — the one that opens is some two
   * thousand pixels down it. Looking once, 260ms in, found nothing and gave
   * up, so the shelf came back with no glow anywhere on it.
   *
   * `nudge` is what makes it fire on a press that does not change the beat:
   * `at` was already 0, so a dependency on `at` alone never re-ran.
   */
  useEffect(() => {
    if (!open) return
    let tries = 0
    const look = () => {
      for (const selector of step.targets) {
        const el = document.querySelector(selector)
        if (!el) continue
        const box = el.getBoundingClientRect()
        if (box.top < 80 || box.bottom > window.innerHeight - 60) {
          // Same rule as `scrollToTarget`: a target taller than its scroller
          // is aligned by its TOP, or centring hides the top of it — and the
          // top of the board is where the beat's card is.
          const scroller = el.closest("main") ?? document.documentElement
          const fits = box.height <= scroller.getBoundingClientRect().height
          el.scrollIntoView({ block: fits ? "center" : "start", behavior: "smooth" })
        }
        return
      }
      if (++tries < 12) timer = window.setTimeout(look, 180)
    }
    let timer = window.setTimeout(look, 260)
    return () => window.clearTimeout(timer)
  }, [open, at, nudge, step.targets])

  // Track the target and place the card, on one frame. The things pointed at
  // include a PDF page that re-lays itself out, a dialog that does not exist
  // until it is opened, and a list inside a scrollbox — one read a frame
  // covers all of them, and state changes only when the geometry does.
  useEffect(() => {
    if (!open) return
    let frame = 0
    const measure = () => {
      const { rect: found, away } = resolveTarget(step.targets)
      setAway((was) => (was === away ? was : away))
      const padded: Rect | null = found
        ? {
            top: Math.max(0, found.top - PAD),
            left: Math.max(0, found.left - PAD),
            width: found.width + PAD * 2,
            height: found.height + PAD * 2,
          }
        : null
      setHole((was) => (near(was, padded) || (was === null && padded === null) ? was : padded))

      // The ring walks the gestures inside the beat; the hole above stays the
      // whole working area, so picking the wrong pair is still recoverable.
      const move = currentMove(step)
      setMove((was) => (was === move ? was : move))
      const ringed = move ? resolveTarget([move.sel]).rect : null
      const ring: Rect | null = ringed
        ? {
            top: Math.max(0, ringed.top - PAD),
            left: Math.max(0, ringed.left - PAD),
            width: ringed.width + PAD * 2,
            height: ringed.height + PAD * 2,
          }
        : null
      setRing((was) => (near(was, ring) || (was === null && ring === null) ? was : ring))

      const card = cardRef.current
      if (card && padded) {
        const next = place(padded, { w: card.offsetWidth, h: card.offsetHeight })
        setSpot((was) =>
          was && was.side === next.side &&
          Math.abs(was.top - next.top) < 1 &&
          Math.abs(was.left - next.left) < 1 &&
          Math.abs(was.beak - next.beak) < 1
            ? was
            : next
        )
      } else if (!padded) {
        setSpot((was) => (was === null ? was : null))
      }
      // The app's own dialogs sit at z 10000 and would bury the guide. When
      // one is up the popover goes above it — a beat about a field inside
      // that dialog is unreadable underneath it — and the mask goes away,
      // because the scrim is already the constraint.
      const scrim = !!document.querySelector(".info-scrim")
      setOverScrim((was) => (was === scrim ? was : scrim))

      frame = window.requestAnimationFrame(measure)
    }
    frame = window.requestAnimationFrame(measure)
    return () => window.cancelAnimationFrame(frame)
    // `step` is a stable reference out of the module-level GUIDE_STEPS, so
    // depending on the whole beat costs nothing and the loop restarts only
    // when the beat actually changes.
  }, [open, step])

  /**
   * Publish the cutout so the practice loom's other fixed chrome can get out
   * of its way.
   *
   * The "you are in the guide" notice has to sit ABOVE the mask — it is a 13%
   * wash, so underneath it the dim showed through on one side of a cutout
   * boundary and the lit page through the other, a seam down the sentence.
   * Above the mask it can instead cover the thing the beat is ringing, which
   * on the kit beat it did: the button read "OAD THE CONCEPT-MAP KIT". So the
   * guide says where the hole is and the notice yields when it overlaps.
   */
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("loom:guide-hole", { detail: open ? hole : null }))
  }, [open, hole])

  // The one hand-off: highlighting finishes when the capture dialog opens,
  // and the next beat is about that dialog. Asking for a press in between is
  // asking twice for the same move.
  useEffect(() => {
    if (!open || !step.handOff || !ready || last) return
    const timer = window.setTimeout(() => setAt((cur) => (cur === at ? at + 1 : cur)), 450)
    return () => window.clearTimeout(timer)
  }, [open, step.handOff, ready, last, at])

  /**
   * A drag that starts in the cutout must be allowed to leave it. Once the
   * pointer is down the browser owns the selection and the viewer listens for
   * the release on `document`, so the panes only have to get out of the way
   * until then.
   */
  useEffect(() => {
    if (!open || !hole) return
    const inside = (e: PointerEvent) =>
      e.clientX >= hole.left && e.clientX <= hole.left + hole.width &&
      e.clientY >= hole.top && e.clientY <= hole.top + hole.height
    const down = (e: PointerEvent) => { if (inside(e)) setDragging(true) }
    const up = () => setDragging(false)
    window.addEventListener("pointerdown", down, true)
    window.addEventListener("pointerup", up, true)
    window.addEventListener("pointercancel", up, true)
    return () => {
      window.removeEventListener("pointerdown", down, true)
      window.removeEventListener("pointerup", up, true)
      window.removeEventListener("pointercancel", up, true)
    }
  }, [open, hole])

  const finished = done.filter(Boolean).length

  if (!open) {
    return (
      <button
        className="btn ghost mini guideopen"
        onClick={() => setOpen(true)}
        data-tip="every move, walked on this reading"
      >
        show the guide · {finished}/{GUIDE_STEPS.length}
      </button>
    )
  }

  // Never dim without a hole: a dark screen with nothing lit is the one
  // failure worse than not dimming at all.
  const masked = step.overlay === "mask" && !!hole && !dragging && !overScrim
  const vw = typeof window === "undefined" ? 0 : window.innerWidth
  const vh = typeof window === "undefined" ? 0 : window.innerHeight

  return (
    <>
      {masked && hole && (
        // Four inert panes — not a box-shadow, whose spread is not hit-tested
        // (it would block the hole and leak everything else), and not an SVG,
        // which re-rasterises a viewport-sized path every frame. The hole is
        // genuinely empty DOM, so hit-testing is exact and free.
        <div className="guidemask" aria-hidden="true" onWheel={wheelThrough}>
          <div className="gpane" style={{ top: 0, left: 0, width: vw, height: hole.top }} />
          <div className="gpane" style={{ top: hole.top + hole.height, left: 0, width: vw, height: Math.max(0, vh - hole.top - hole.height) }} />
          <div className="gpane" style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
          <div className="gpane" style={{ top: hole.top, left: hole.left + hole.width, width: Math.max(0, vw - hole.left - hole.width), height: hole.height }} />
        </div>
      )}

      {/* The ring sits on the current GESTURE when the beat has several, and
          on the whole hole when it does not. The hole is the working area; the
          ring is the pointer, and it has to move as the move is made. */}
      {(ring ?? hole) && (
        <div
          className="guideglow"
          aria-hidden="true"
          style={{
            top: (ring ?? hole)!.top,
            left: (ring ?? hole)!.left,
            width: (ring ?? hole)!.width,
            height: (ring ?? hole)!.height,
          }}
        />
      )}

      <div
        ref={cardRef}
        className={`guidepop ${spot ? `at-${spot.side}` : "adrift"}${overScrim ? " overscrim" : ""}`}
        role="region"
        aria-label="The guide"
        style={
          spot
            ? ({ top: spot.top, left: spot.left, "--beak": `${spot.beak}px` } as React.CSSProperties)
            : undefined
        }
      >
        <div className="guiderail">
          {GUIDE_STEPS.map((s, i) => (
            <button
              key={s.key}
              className={`gstep${i === at ? " now" : ""}${done[i] ? " done" : ""}`}
              onClick={() => show(i)}
              aria-current={i === at ? "step" : undefined}
              aria-label={`${i + 1}. ${s.label}${done[i] ? " — done" : ""}`}
              data-tip={s.label}
            >
              {done[i] ? "✓" : i + 1}
            </button>
          ))}
          {/* "done", because bare "1/8" sits on a row of numbered pips and
              reads as a step number — which the black pip beside it contradicts. */}
          <span className="cap gcount">{finished}/{GUIDE_STEPS.length} done</span>
        </div>

        <p className="gsay">
          <b>{step.label}.</b>{" "}
          {ready ? (
            <span className="gdone">
              {last
                ? "That’s the guide — and the kit in your downloads is the one thing it keeps."
                : "Done. Press next."}
            </span>
          ) : (
            move?.say ?? step.say
          )}
          {/* The card says the situation as well as offering the button. With
              nothing glowing anywhere, an instruction naming a control the
              student cannot see reads as an app that is broken. */}
          {away && !ready && (
            <span className="gaway"> It has scrolled out of sight — press “show me”.</span>
          )}
        </p>
        {showWhy && <p className="gwhy">{step.why}</p>}

        <div className="guidefoot">
          <button className="btn ghost mini" onClick={() => show(at - 1)} disabled={at === 0} aria-label="Back">
            ‹
          </button>
          {/* The one primary — and only once it means something. Until the
              beat's own predicate says the gesture landed this is a quiet
              "skip"; the moment it does, it fills, pulses and says "next".
              That IS the "hit this button now" the review asked for, and it
              cannot fire early because the predicate is what turns it on.
              Still pressable while quiet: a disabled button traps anybody the
              guide has misread, and a separate skip control would be a second
              button meaning the same thing.

              On the LAST beat it closes the guide instead of advancing. It
              used to be `disabled={last}`, so the copy said "Press next" over
              a dead button and the guide had no ending at all (TJ, 2026-08-12:
              *"the instructions are to press next, but the next is not
              active"*). Closing is what finishing means here — the reopen chip
              stays, so nothing is lost by pressing it. */}
          <button
            className={ready ? "btn mini gnext gpulse" : "btn ghost mini"}
            onClick={() => (last ? setOpen(false) : show(at + 1))}
          >
            {last ? (ready ? "done ›" : "close ›") : ready ? "next ›" : "skip ›"}
          </button>
          {/* Only when the target is on the page and off the screen — a button
              that is always there is one more thing to read. When it IS there
              it takes the primary's treatment, because with the glow off
              screen this card is the only thing left to look at and finding
              the control again is the whole of what there is to do (TJ,
              2026-08-12: *"if the action to take is off screen the guide card
              needs to offer some direction"*). */}
          {away && !ready && (
            <button
              className="btn mini gnext gpulse gfind"
              onClick={() => scrollToTarget(step.targets)}
            >
              show me ›
            </button>
          )}
          <button
            className="btn ghost mini gwhybtn"
            onClick={() => setShowWhy((v) => !v)}
            aria-expanded={showWhy}
          >
            why
          </button>
          <button className="btn ghost mini" onClick={() => setOpen(false)}>
            hide
          </button>
        </div>
      </div>
    </>
  )
}
