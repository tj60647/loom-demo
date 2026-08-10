/**
 * Geometry for the matrix's spread canvas: the whole document as 2-page
 * spreads on a near-square grid, in canvas units. Ported from the spread
 * canvas (origin/spread-canvas-reading, reverted by 41d5b50) with one
 * deviation: `withRails` can lay out without card rails. The matrix always
 * passes true — like the original — because hiding the cards must not
 * re-lay the grid under the reader's eye (TJ, 2026-08-10); the parameter
 * stays for any future surface that wants the tighter geometry.
 *
 * Pure math, no DOM: derived for display and discarded (red line #7).
 */

export type Spread = {
  i: number
  x: number
  y: number
  leftPage: number
  rightPage: number | null
}

export type SpreadLayout = {
  railW: number
  gap: number
  spreadGap: number
  unitW: number
  unitH: number
  cols: number
  spreads: Spread[]
  canvasW: number
  canvasH: number
}

/** Lay spreads out as a near-square grid, all in canvas units. */
export function spreadLayout(
  numPages: number,
  pageW: number,
  pageH: number,
  withRails = true
): SpreadLayout {
  const railW = withRails ? pageW * 0.33 : 0
  const gap = Math.round(pageW * 0.02)
  const spreadGap = Math.round(pageW * 0.08)
  const unitW = railW * 2 + pageW * 2 + gap * 3
  const unitH = pageH
  const spreadCount = Math.max(1, Math.ceil(numPages / 2))
  const cols = Math.ceil(Math.sqrt(spreadCount))
  const rows = Math.ceil(spreadCount / cols)
  const spreads: Spread[] = []
  for (let i = 0; i < spreadCount; i++) {
    spreads.push({
      i,
      x: (i % cols) * (unitW + spreadGap),
      y: Math.floor(i / cols) * (unitH + spreadGap),
      leftPage: i * 2 + 1,
      rightPage: i * 2 + 2 <= numPages ? i * 2 + 2 : null,
    })
  }
  return {
    railW, gap, spreadGap, unitW, unitH, cols, spreads,
    canvasW: cols * unitW + (cols - 1) * spreadGap,
    canvasH: rows * unitH + (rows - 1) * spreadGap,
  }
}

/** The canvas x of a page's left edge — the one derived coordinate several
 *  consumers (page placement, raster retargeting, card anchoring) must agree
 *  on, so it lives beside the layout that defines it. */
export function pageX(layout: SpreadLayout, spread: Spread, pageNumber: number, pageW: number): number {
  const right = pageNumber % 2 === 0
  return spread.x + layout.railW + layout.gap + (right ? pageW + layout.gap : 0)
}
