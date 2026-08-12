"use client"

/**
 * The guide, floating over the real interface (TJ, 2026-08-11: "the guide
 * should always be available, like the tutorials in any game" · "the guide
 * info should be in a layer that floats over the actual loom layout, not
 * displacing everything… like floaters with a small glow").
 *
 * Two parts. A small card pinned to a corner, and a GLOW ringing whatever the
 * current beat is talking about — every beat names a target selector, so the
 * copy can point ("the glowing field") instead of gesturing ("on the left"),
 * which is wrong on a narrow screen anyway.
 *
 * The card moves out of the glow's way. It was a full-width band first, on the
 * reasoning that fixed chrome in this app has form for covering the control it
 * points at; the honest answer is not to displace the page but to know where
 * the target is and sit elsewhere. So the card measures the ring and takes the
 * corner furthest from it.
 *
 * It advances when the student ACTS, not when they press Next — every beat
 * carries a predicate over the loom's own state (src/lib/practiceGuide.ts), so
 * a tick means the gesture happened. Next and Back are for reading ahead and
 * going back over something; neither marks anything done.
 *
 * Only ever rendered in the practice loom. It reads `useLoom()`, which inside
 * `/sandbox` is the sandbox's own context, so it watches practice state alone.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLoom } from "@/components/providers/LoomProvider"
import {
  GUIDE_STEPS,
  baselineOf,
  standOn,
  stepDone,
  type GuideBaseline,
  type GuideSignals,
} from "@/lib/practiceGuide"

/** Ask the workbench to change station. Workbench listens; see its handler. */
function goToStation(station: string) {
  window.dispatchEvent(new CustomEvent("loom:practice-station", { detail: station }))
}

type Ring = { top: number; left: number; width: number; height: number }

/** Which corner the card sits in. */
type Corner = "br" | "bl" | "tr" | "tl"

const CORNERS: Corner[] = ["br", "tr", "tl", "bl"]

/** The CSS offsets, mirrored so a corner can be scored before it is taken. */
const PAD = 18
const BOTTOM_GAP = 14
const TOP_GAP = 96

function rectFor(corner: Corner, w: number, h: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const left = corner.endsWith("r") ? vw - PAD - w : PAD
  const top = corner.startsWith("b") ? vh - BOTTOM_GAP - h : TOP_GAP
  return { left, top, right: left + w, bottom: top + h }
}

const overlaps = (
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * The corner that covers nothing you could press.
 *
 * A floating card WILL sit over a control sooner or later — at 1280x720 the
 * bottom-right lands squarely on the PDF's page-turn arrow, which is how the
 * suite found this twice. The card body takes no pointer events, so the page
 * beneath stays usable, but the card's OWN buttons must be clickable and they
 * do block. Choosing by geometry alone cannot know that, so this counts the
 * controls each corner would cover and takes an empty one — preferring, among
 * empty corners, the one furthest from what the beat is pointing at.
 */
function bestCorner(ring: Ring | null, size: { w: number; h: number }): Corner {
  if (typeof window === "undefined" || size.w === 0) return "br"
  const controls = Array.from(
    document.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select")
  )
    .filter((el) => !el.closest(".guidefloat"))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0)

  const ringMid = ring
    ? { x: ring.left + ring.width / 2, y: ring.top + ring.height / 2 }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 }

  let best: Corner = "br"
  let bestScore = -Infinity
  for (const corner of CORNERS) {
    const box = rectFor(corner, size.w, size.h)
    const blocked = controls.filter((c) => overlaps(box, c)).length
    const mid = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
    const away = Math.hypot(mid.x - ringMid.x, mid.y - ringMid.y)
    // Covering nothing dominates; distance from the target breaks ties.
    const score = blocked * -10000 + away
    if (score > bestScore) {
      bestScore = score
      best = corner
    }
  }
  return best
}

export default function PracticeGuide() {
  const { state, scope } = useLoom()
  const scopeKey = scope.key

  const [open, setOpen] = useState(true)
  const [signals, setSignals] = useState<GuideSignals>({
    readingOpened: false, captureOpened: false, kitCopied: false,
  })
  const [ring, setRing] = useState<Ring | null>(null)
  const [corner, setCorner] = useState<Corner>("br")
  // The reasoning is folded away by default. Not decoration: at 360x227 the
  // card was taller than any free corner on a 1280x720 screen, so it covered
  // a control wherever it went. Compact, it fits below the page-turn arrow.
  const [showWhy, setShowWhy] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)

  // Frozen on mount: the practice loom opens holding a worked cloth, so every
  // test is "one more than when you began" rather than "is there any".
  const [base] = useState<GuideBaseline>(() => baselineOf(state, scopeKey))
  const [at, setAt] = useState(() =>
    standOn(baselineOf(state, scopeKey), state, scopeKey, { readingOpened: false, captureOpened: false, kitCopied: false })
  )

  useEffect(() => {
    const onOpened = () => setSignals((s) => (s.readingOpened ? s : { ...s, readingOpened: true }))
    const onCapture = () => setSignals((s) => (s.captureOpened ? s : { ...s, captureOpened: true }))
    const onKit = () => setSignals((s) => (s.kitCopied ? s : { ...s, kitCopied: true }))
    window.addEventListener("loom:practice-opened", onOpened)
    window.addEventListener("loom:capture-open", onCapture)
    window.addEventListener("loom:mapkit-taken", onKit)
    return () => {
      window.removeEventListener("loom:practice-opened", onOpened)
      window.removeEventListener("loom:capture-open", onCapture)
      window.removeEventListener("loom:mapkit-taken", onKit)
    }
  }, [])

  const done = useMemo(
    () =>
      GUIDE_STEPS.map((s) =>
        s.readOnly ? false : stepDone(s.key, base, state, scopeKey, signals)
      ),
    [base, state, scopeKey, signals]
  )

  // Move on when the student finishes the beat they are STANDING on, and only
  // then: doing something out of order ticks its own step in the rail but does
  // not yank the guide away from what it is currently explaining. The pause is
  // so the tick is seen before the text changes under it.
  useEffect(() => {
    if (!open || !done[at] || at >= GUIDE_STEPS.length - 1) return
    const timer = window.setTimeout(() => setAt((cur) => (cur === at ? at + 1 : cur)), 900)
    return () => window.clearTimeout(timer)
  }, [open, done, at])

  const step = GUIDE_STEPS[at]

  const show = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(GUIDE_STEPS.length - 1, index))
    setAt(clamped)
    goToStation(GUIDE_STEPS[clamped].station)
  }, [])

  // Land on the right station when the guide moves itself, too.
  useEffect(() => {
    if (!open || step.station === "library") return
    goToStation(step.station)
  }, [open, step.station])

  // A beat about the TEXT needs a page with text on it. The practice reading
  // opens on two cover pages, where "drag across a line or two" points at a
  // picture — so the guide focuses one of the worked example's own passages
  // and the viewer turns to the page it came from. Read from state rather
  // than hard-coded: the example is built from whatever pages the reading
  // actually has.
  useEffect(() => {
    if (!open || !step.needsText) return
    const onAPage = state.passages.find((p) => p.pageNumber)
    if (onAPage) window.dispatchEvent(new CustomEvent("loom:practice-focus", { detail: onAPage.id }))
  }, [open, step.needsText, state.passages])

  // Bring the target into view when the beat changes. Pointing at something
  // three thousand pixels below the fold is not pointing at it — the kit
  // button lives under the whole board, and the glow was landing off-screen.
  // Once per beat, and only when it is actually out of view, so it never
  // fights a student who has scrolled somewhere on purpose.
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      const el = document.querySelector(step.target)
      if (!el) return
      const box = el.getBoundingClientRect()
      const above = box.top < 80
      const below = box.bottom > window.innerHeight - 60
      if (above || below) el.scrollIntoView({ block: "center", behavior: "smooth" })
    }, 260)
    return () => window.clearTimeout(timer)
  }, [open, at, step.target])

  // Track the target. Polled on a frame rather than observed: the things being
  // pointed at include a PDF page that re-lays itself out, a dialog that does
  // not exist until it is opened, and a list inside a scrollbox. One cheap
  // read a frame covers all three, where three different observers would not,
  // and state only changes when the rect actually moves.
  useEffect(() => {
    // No clearing when hidden: the collapsed guide renders no ring at all, so
    // a stale rect is never drawn — and setting state here would be a
    // cascading render for nothing.
    if (!open) return
    let frame = 0
    const measure = () => {
      const box = document.querySelector(step.target)?.getBoundingClientRect()
      setRing((was) => {
        if (!box || box.width === 0 || box.height === 0) return was === null ? was : null
        const next = { top: box.top, left: box.left, width: box.width, height: box.height }
        const same =
          was &&
          Math.abs(was.top - next.top) < 1 &&
          Math.abs(was.left - next.left) < 1 &&
          Math.abs(was.width - next.width) < 1 &&
          Math.abs(was.height - next.height) < 1
        return same ? was : next
      })
      // Same frame, same reason: the controls the card must not cover move
      // with the page, and a corner chosen once goes stale the moment a tab
      // changes or the viewer re-lays out.
      const card = cardRef.current
      if (card) {
        const next = bestCorner(
          box && box.width ? { top: box.top, left: box.left, width: box.width, height: box.height } : null,
          { w: card.offsetWidth, h: card.offsetHeight }
        )
        setCorner((was) => (was === next ? was : next))
      }
      frame = window.requestAnimationFrame(measure)
    }
    frame = window.requestAnimationFrame(measure)
    return () => window.cancelAnimationFrame(frame)
  }, [open, step.target])

  const finished = done.filter(Boolean).length
  const total = GUIDE_STEPS.filter((s) => !s.readOnly).length

  if (!open) {
    return (
      <button
        className="btn ghost mini guideopen"
        onClick={() => setOpen(true)}
        data-tip="the seven moves, walked on this reading"
      >
        show the guide · {finished}/{total}
      </button>
    )
  }

  return (
    <>
      {ring && (
        <div
          className="guideglow"
          aria-hidden="true"
          style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height }}
        />
      )}

      <div ref={cardRef} className={`guidefloat ${corner}`} role="region" aria-label="The guide">
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
          <span className="cap gcount">{finished}/{total}</span>
        </div>

        <p className="gsay">
          <b>{step.label}.</b> {step.say}
        </p>
        {showWhy && <p className="gwhy">{step.why}</p>}

        <div className="guidefoot">
          <button className="btn ghost mini" onClick={() => show(at - 1)} disabled={at === 0}>
            ‹ back
          </button>
          {/* Pulsing when going on IS the move: a beat with nothing to do,
              or one the student has just finished. Otherwise still, so the
              pulse means something when it happens. */}
          <button
            className={`btn ghost mini${(step.readOnly || done[at]) && at < GUIDE_STEPS.length - 1 ? " gpulse" : ""}`}
            onClick={() => show(at + 1)}
            disabled={at === GUIDE_STEPS.length - 1}
          >
            next ›
          </button>
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
