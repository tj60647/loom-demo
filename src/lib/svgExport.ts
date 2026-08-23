"use client"

/**
 * A DRAWING ON SCREEN, AS A FILE THAT STILL LOOKS LIKE ITSELF.
 *
 * The cloth (`#map`, src/components/svg/ClothMap.tsx) and the board (`#cardTable`,
 * src/components/tabs/MapTab.tsx) are both a single live <svg>. Handing one to
 * `XMLSerializer` and calling it an export produces a file that opens wrong,
 * for four separate reasons — each fixed below, in the order they bite:
 *
 * 1. NO COLOUR. Both draw with `fill="var(--red)"` and friends, and the flow
 *    diagram styles its labels by className. Custom properties resolve against
 *    `:root` in src/app/globals.css, and class rules live in a stylesheet — a
 *    file opened from disk has neither, so every stroke falls back to black.
 * 2. NO SIZE. Neither carries a `viewBox`, a `width` attribute or a `height`
 *    attribute; the geometry is raw CSS pixels against a width a ResizeObserver
 *    measured (ClothMap.tsx:147-165). Serialized as-is the drawing has no
 *    coordinate system to be scaled by.
 * 3. NO NAMESPACE. React puts elements in the SVG namespace at DOM level
 *    without writing `xmlns`, which a standalone file must declare.
 * 4. NO GROUND. Neither svg paints a background; the paper comes from the
 *    wrapper around it (#mapWrap / #tableWrap, both `#f4f2ec`). On a file with
 *    no ground, a viewer's own background shows through — white here, black in
 *    a dark image viewer, with dark ink either way.
 *
 * The colour fix is the one worth explaining. Rather than maintaining a table
 * of tokens that would rot the moment the palette moves, this copies
 * `getComputedStyle` for a small set of paint properties onto each element.
 * The browser has already resolved every `var()`, every class rule and every
 * inherited value by then, so what lands in the file is the literal the screen
 * is using — and it stays right when the palette changes, because it was never
 * written down twice.
 */

/**
 * What gets copied. SVG paint and text properties only: no layout, no
 * transforms (they are attributes and serialize on their own), nothing that
 * would bloat the file with values a standalone renderer defaults to anyway.
 */
const PAINT = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "paint-order",
  "marker-start",
  "marker-mid",
  "marker-end",
] as const

/** Is this colour fully transparent — `transparent`, `none`, or alpha 0? */
function paintsNothing(value: string): boolean {
  if (!value || value === "none" || value === "transparent") return true
  const alpha = /^rgba?\([^)]*,\s*(0|0?\.0+)\s*\)$/.exec(value)
  return alpha !== null
}

/**
 * An element that paints nothing at all, and is therefore not the picture.
 *
 * Both drawings lay an invisible twin over every clickable shape so the hit
 * target is bigger than the mark (ClothMap.tsx:325-334 and :464-475 —
 * `stroke="rgba(0,0,0,0)" strokeWidth={14}`). In the browser they are pointer
 * targets and nothing else. In a file they are geometry a reader cannot see
 * and an editor can: Illustrator's "select all, add stroke" turns every one of
 * them into a 14px black bar across the drawing. They go.
 */
function isInvisible(el: Element, style: CSSStyleDeclaration): boolean {
  if (style.display === "none" || style.visibility === "hidden") return true
  // <title> and <desc> do not count as content here. Every hit twin carries a
  // <title> (ClothMap.tsx:333, :474), so a plain childElementCount check kept
  // all six of them — measured on an export before this line existed.
  for (const child of Array.from(el.children)) {
    if (child.tagName !== "title" && child.tagName !== "desc") return false
  }
  return paintsNothing(style.fill) && paintsNothing(style.stroke)
}

export type SvgExportOptions = {
  /** Painted behind everything, so the file does not take a viewer's ground. */
  background: string
  /**
   * Dropped before serializing, by selector. The animated glow
   * (`.clothglow`, globals.css:1634-1639) is the case this exists for: it is a
   * one-second fade that only exists while something is being pointed at, and
   * a still frame of it is an opaque ochre blob over the drawing.
   */
  drop?: string[]
}

/**
 * The live <svg>, as standalone SVG text.
 *
 * Reads geometry from the element's own box rather than from any attribute,
 * because the drawings that need this have no width/height attributes to read
 * — what is on screen is what the ResizeObserver last measured.
 */
export function serializeSvg(source: SVGSVGElement, options: SvgExportOptions): string {
  const box = source.getBoundingClientRect()
  const width = Math.max(1, Math.round(box.width))
  const height = Math.max(1, Math.round(box.height))

  const clone = source.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(width))
  clone.setAttribute("height", String(height))
  // Only when it has none: FlowDiagram computes an honest one from its layout,
  // and overwriting that with a measured box would rescale the drawing.
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${width} ${height}`)
  // The inline width:100%/height that sized it inside the app would fight the
  // attributes above in any viewer that honours CSS.
  clone.removeAttribute("style")

  /**
   * Walk both trees together. The clone is detached and has no styles of its
   * own, so every value has to come from the element it was copied from —
   * which is why this pairs the two rather than reading the clone.
   *
   * NOTHING MAY BE REMOVED BEFORE THIS. The pairing is positional, so the two
   * lists have to be the same shape: `drop` used to run above and silently
   * broke that the first time a selector actually matched something — the
   * length guard threw and the button did nothing at all. Both removals now
   * happen after the walk, when the indices have already been used.
   */
  const live = [source, ...Array.from(source.querySelectorAll("*"))]
  const copies = [clone, ...Array.from(clone.querySelectorAll("*"))]
  if (live.length !== copies.length) {
    // A deep clone of a static tree cannot differ. If it does, something has
    // mutated the live DOM mid-walk, and inlining against mismatched indices
    // would paint elements with each other's colours — worse than no file.
    throw new Error("[svgExport] the clone drifted from the live tree")
  }

  const removals: Element[] = []
  for (let i = 1; i < live.length; i++) {
    const style = window.getComputedStyle(live[i])
    if (isInvisible(live[i], style)) {
      removals.push(copies[i])
      continue
    }
    const declarations: string[] = []
    for (const property of PAINT) {
      const value = style.getPropertyValue(property)
      if (value && value !== "normal" && value !== "auto") {
        declarations.push(`${property}:${value}`)
      }
    }
    if (declarations.length) copies[i].setAttribute("style", declarations.join(";"))
    /**
     * And drop the presentation attribute it came from. An inline style beats
     * a presentation attribute, so leaving `fill="var(--red)"` beside
     * `style="fill:rgb(178,58,43)"` renders correctly — but it leaves ten
     * unresolved var() calls in a file whose whole purpose is to not need
     * them, and an editor that reads attributes rather than CSS would show
     * black. Measured on an export before this: 10 in the cloth.
     */
    for (const property of PAINT) {
      if (copies[i].hasAttribute(property)) copies[i].removeAttribute(property)
    }
  }
  removals.forEach((node) => node.remove())

  for (const selector of options.drop ?? []) {
    clone.querySelectorAll(selector).forEach((node) => node.remove())
  }

  const ground = clone.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "rect")
  ground.setAttribute("x", "0")
  ground.setAttribute("y", "0")
  ground.setAttribute("width", "100%")
  ground.setAttribute("height", "100%")
  ground.setAttribute("fill", options.background)
  clone.insertBefore(ground, clone.firstChild)

  /**
   * The webfont, for readers that can fetch it. The concept labels ask for
   * "Newsreader" (ClothMap.tsx:448), which the app loads from Google Fonts in
   * globals.css:1 — a file opened from disk has no such stylesheet, so it
   * falls to Georgia. An @import inside the file gets the real face back in a
   * browser and is ignored, harmlessly, by Illustrator and Inkscape, which use
   * the fallback. Not embedded as base64: that would carry the whole variable
   * font and its licence notice into every download.
   */
  const fonts = clone.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "style")
  fonts.textContent =
    "@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap');"
  clone.insertBefore(fonts, clone.firstChild)

  const markup = new XMLSerializer().serializeToString(clone)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`
}

/**
 * The ground each drawing sits on in the app, so an export matches the screen.
 * Both wrappers set it in the same literal — #mapWrap at globals.css:747 and
 * #tableWrap inline at MapTab.tsx:858 — and it is NOT `--paper`: the cloth's
 * text halo is drawn in this exact colour (ClothMap.tsx:367), so a background
 * that drifted from it would leave a visible plate behind every arc label.
 */
export const DRAWING_GROUND = "#f4f2ec"
