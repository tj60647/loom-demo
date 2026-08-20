/**
 * A concurrency gate for pdf.js page rasters.
 *
 * The matrix mounts every page of a reading, and on first open they all ask
 * to render at once. Nothing bounded that: 132 render tasks flooded the one
 * pdf.js worker, so the spread in front of the reader sharpened only after
 * every page behind it had decoded — on a scanned reading, minutes of queue
 * for pages nobody was looking at yet.
 *
 * The gate holds waiters until a slot frees and always grants the CLOSEST
 * page next: priority is a callback, sampled at grant time rather than
 * enqueue time, because the view keeps moving while pages wait — a page far
 * from a zoom-out's centre may be dead centre by the time a slot opens.
 *
 * Module-level, deliberately: all rasters in the tab share one pdf.js worker,
 * so they share one gate. Three slots keeps the worker busy (decode overlaps
 * with canvas paint) without drowning the page the reader is on.
 */

const MAX_CONCURRENT = 3

type Waiter = {
  /** Lower runs sooner. Sampled when a slot frees, not when enqueued. */
  priority: () => number
  grant: () => void
}

let active = 0
const waiters: Waiter[] = []

function pump() {
  while (active < MAX_CONCURRENT && waiters.length > 0) {
    let best = 0
    for (let i = 1; i < waiters.length; i++) {
      if (waiters[i].priority() < waiters[best].priority()) best = i
    }
    const next = waiters.splice(best, 1)[0]
    active += 1
    next.grant()
  }
}

/**
 * Resolves with a release function once a slot is free. The caller MUST call
 * release exactly once — `finally` is the natural home. A caller that was
 * cancelled while waiting still gets granted eventually; it should release
 * immediately and do no work, which costs one pump cycle and nothing else.
 */
export function acquireRenderSlot(priority: () => number): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    waiters.push({
      priority,
      grant: () => {
        let released = false
        resolve(() => {
          if (released) return
          released = true
          active -= 1
          pump()
        })
      },
    })
    pump()
  })
}
