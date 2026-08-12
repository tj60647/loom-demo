"use client"

/**
 * The guide, walking the real interface (TJ, 2026-08-11: "the guide should
 * always be available, like the tutorials in any game").
 *
 * A band under the practice band rather than a floating card: fixed chrome in
 * this app has a history of covering the controls it is pointing at, and a
 * tutorial that eats the button it just told you to press is worse than no
 * tutorial. The band takes its own row, so nothing it names is ever underneath
 * it.
 *
 * It advances when the student ACTS, not when they press Next — every beat
 * carries a predicate over the loom's own state (src/lib/practiceGuide.ts), so
 * the tick means the gesture happened. Next and Back are there for reading
 * ahead and going back over something, and they never mark a beat done.
 *
 * Only ever rendered in the practice loom. It reads `useLoom()`, which inside
 * `/sandbox` is the sandbox's own context, so it is watching practice state
 * and nothing else.
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

export default function PracticeGuide() {
  const { state, scope } = useLoom()
  const scopeKey = scope.key

  const [open, setOpen] = useState(true)
  const [signals, setSignals] = useState<GuideSignals>({ captureOpened: false, kitCopied: false })

  // Frozen on mount: the practice loom opens holding a worked cloth, so every
  // test is "one more than when you began" rather than "is there any". Lazy
  // state rather than a ref — this is a value the render reads.
  const [base] = useState<GuideBaseline>(() => baselineOf(state, scopeKey))
  // Where to stand on arrival: the beginning, or wherever the work has got to
  // if this student has already been doing things before opening the guide.
  const [at, setAt] = useState(() =>
    standOn(baselineOf(state, scopeKey), state, scopeKey, { captureOpened: false, kitCopied: false })
  )

  useEffect(() => {
    const onCapture = () => setSignals((s) => (s.captureOpened ? s : { ...s, captureOpened: true }))
    const onKit = () => setSignals((s) => (s.kitCopied ? s : { ...s, kitCopied: true }))
    window.addEventListener("loom:capture-open", onCapture)
    window.addEventListener("loom:mapkit-copied", onKit)
    return () => {
      window.removeEventListener("loom:capture-open", onCapture)
      window.removeEventListener("loom:mapkit-copied", onKit)
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

  const show = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(GUIDE_STEPS.length - 1, index))
      setAt(clamped)
      goToStation(GUIDE_STEPS[clamped].station)
    },
    []
  )

  // Land on the right tab when the guide moves itself, too.
  const lastStation = useRef<string | null>(null)
  useEffect(() => {
    if (!open) return
    if (lastStation.current !== step.station) {
      lastStation.current = step.station
      goToStation(step.station)
    }
  }, [open, step.station])

  const finished = done.filter(Boolean).length
  const total = GUIDE_STEPS.filter((s) => !s.readOnly).length

  if (!open) {
    return (
      <div className="guideband collapsed">
        <button className="btn ghost mini" onClick={() => setOpen(true)}>
          show the guide
        </button>
        <span className="cap">{finished} of {total} done</span>
      </div>
    )
  }

  return (
    <div className="guideband" role="region" aria-label="The guide">
      <div className="guiderail">
        {GUIDE_STEPS.map((s, i) => (
          <button
            key={s.key}
            className={`gstep${i === at ? " now" : ""}${done[i] ? " done" : ""}`}
            onClick={() => show(i)}
            aria-current={i === at ? "step" : undefined}
            data-tip={s.label}
          >
            <span className="gn">{done[i] ? "✓" : i + 1}</span>
            {s.label}
          </button>
        ))}
      </div>

      <div className="guidebody">
        <p className="gsay">
          <b>{step.label}.</b> {step.say}
        </p>
        <p className="gwhy">{step.why}</p>
      </div>

      <div className="guidefoot">
        <button className="btn ghost mini" onClick={() => show(at - 1)} disabled={at === 0}>
          ‹ back
        </button>
        <button
          className="btn ghost mini"
          onClick={() => show(at + 1)}
          disabled={at === GUIDE_STEPS.length - 1}
        >
          next ›
        </button>
        <span className="cap">
          {done[at] ? "done — and you can keep going" : step.readOnly ? "read, then next" : "do it below"}
        </span>
        <button className="btn ghost mini" onClick={() => setOpen(false)} style={{ marginLeft: "auto" }}>
          hide the guide
        </button>
      </div>
    </div>
  )
}
