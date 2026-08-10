/**
 * Rail placement for the margin concept cards (01 · Reading, page mode).
 *
 * Ported verbatim from the spread canvas (origin/spread-canvas-reading,
 * src/components/pdf/SpreadCanvas.tsx — reverted off master by 41d5b50 for
 * deploy hygiene, not on merit). Pure geometry, no DOM: derived for display
 * and discarded each render, never persisted (red line #7; the drift grid in
 * MapTab is the precedent).
 */

/**
 * Place cards along a rail. Each card sits centered on its highlight (so its
 * leader line runs horizontal) when nothing crowds it. Cards that would
 * overlap merge into a cluster that spreads up AND down around the mean of
 * their ideal positions, clamped inside the page; only a cluster taller than
 * the page itself pins to the top and grows downward.
 */
export function layoutRail(
  items: { id: string; desired: number; h: number }[],
  maxH: number,
  gap = 12
): Record<string, number> {
  type Placed = { id: string; desired: number; off: number }
  const clampTop = (t: number, h: number) => (h >= maxH ? 0 : Math.min(Math.max(t, 0), maxH - h))
  const clusters: { items: Placed[]; height: number; top: number }[] = []
  for (const it of [...items].sort((a, b) => a.desired - b.desired)) {
    let cur = {
      items: [{ id: it.id, desired: it.desired, off: 0 }],
      height: it.h,
      top: clampTop(it.desired, it.h),
    }
    while (clusters.length > 0) {
      const prev = clusters[clusters.length - 1]
      if (prev.top + prev.height + gap <= cur.top) break
      clusters.pop()
      const merged = [...prev.items, ...cur.items.map(x => ({ ...x, off: x.off + prev.height + gap }))]
      const height = prev.height + gap + cur.height
      const top = clampTop(merged.reduce((s, x) => s + (x.desired - x.off), 0) / merged.length, height)
      cur = { items: merged, height, top }
    }
    clusters.push(cur)
  }
  const out: Record<string, number> = {}
  for (const c of clusters) for (const p of c.items) out[p.id] = c.top + p.off
  return out
}

/**
 * When a rail holds more card than page, the cards themselves shrink (whole
 * entity, via transform) until the stack fits — every passage stays visible
 * instead of overflowing. Heights are measured unscaled, so this never feeds
 * back into itself.
 */
export function railScale(heights: number[], gap: number, maxH: number): number {
  if (heights.length === 0) return 1
  const required = heights.reduce((a, b) => a + b, 0) + gap * Math.max(0, heights.length - 1)
  return Math.min(1, maxH / required)
}
