"use client"

import { useEffect, useRef } from "react"

/**
 * The hover tips, drawn once in the TOP LAYER.
 *
 * A [data-tip] bubble used to be an ::after on the control itself. A
 * pseudo-element cannot leave its own stacking context and cannot escape an
 * ancestor's overflow — and this app is made of both, so most of the tips in
 * it were never actually readable. Measured in Chromium before this change
 * (TJ reported it, 2026-08-09):
 *
 *   - the header's tips, INCLUDING the "?" help button, were ~90% clipped by
 *     `body { overflow: hidden }` — on every page in the app;
 *   - all six reading-toolbar tips were ~80% clipped by
 *     `main.station-reading { overflow: hidden }`, and 93% below 900px, where
 *     `.pdf-toolbar` becomes its own scroll container;
 *   - the journey nav's tip was 100% clipped below 900px, same cause;
 *   - tips on the lower rows of a `.scrollbox` were 100% clipped by its bottom
 *     edge — by the very rule at globals.css that was meant to rescue them,
 *     which only ever moved which edge did the cutting.
 *
 * On top of the clipping, `.pdf-toolbar` is a flex item with `z-index: 10`,
 * which makes a stacking context — so a bubble asking for `z-index: 30` in
 * there painted at an effective 10, under Your work at 25. Raising numbers
 * could not have fixed it, and repositioning only moved the problem.
 *
 * So: one element, at the document root, in the top layer. Above every
 * stacking context by construction, clipped by no ancestor, and carrying NO
 * z-index of its own — which is the point. No future sheet, scrim or sticky
 * bar can bury it, and nobody has to renumber the ladder in globals.css again.
 *
 * `[data-tip="…"]` stays the authoring API and the listeners are delegated, so
 * not one of the ~70 call sites changes.
 *
 * Deliberately unchanged from the pseudo-element it replaces: a tip is
 * DECORATIVE. aria-hidden, mouse only (never touch, never keyboard focus),
 * pointer-events: none. It is therefore not announced and not reachable, so
 * any control whose tip carries meaning not already in its visible label still
 * needs that meaning in the label or an aria-label — never in data-tip alone.
 * And still no `title` alongside: the browser would draw its own bubble over
 * this one.
 */

const GAP = 7   // control → bubble
const EDGE = 8  // bubble → viewport

export default function TipLayer() {
  const tipRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const tip = tipRef.current
    if (!tip) return

    const hide = () => {
      hostRef.current = null
      if (tip.matches(":popover-open")) tip.hidePopover()
    }

    const place = () => {
      const host = hostRef.current
      if (!host || !host.isConnected) return hide()
      const r = host.getBoundingClientRect()
      // A control scrolled out of its own scroller still has a rect; one that
      // has been collapsed or unmounted does not.
      if (!r.width && !r.height) return hide()
      const w = tip.offsetWidth
      const h = tip.offsetHeight
      const above = r.top - GAP - h >= EDGE
      tip.style.top = `${Math.round(above ? r.top - GAP - h : r.bottom + GAP)}px`
      const left = Math.min(
        Math.max(r.left + r.width / 2 - w / 2, EDGE),
        window.innerWidth - w - EDGE,
      )
      tip.style.left = `${Math.round(left)}px`
      tip.dataset.side = above ? "above" : "below"
      // The arrow points at the CONTROL, not at the middle of a bubble that
      // may have been clamped to a viewport edge — which is most of them in
      // the header, where the tips sit against the top-right corner.
      tip.style.setProperty("--arrow", `${Math.round(r.left + r.width / 2 - left)}px`)
    }

    const over = (e: PointerEvent) => {
      // Mouse only: a tap fires pointerover once and would strand a bubble on
      // a touch screen with nothing to dismiss it — which the pseudo-element,
      // being a :hover rule, never did.
      if (e.pointerType !== "mouse") return
      const host = (e.target as Element | null)?.closest?.("[data-tip]") as HTMLElement | null
      if (!host || host === hostRef.current) return
      const text = host.getAttribute("data-tip")
      if (!text) return
      hostRef.current = host
      tip.textContent = text
      if (!tip.matches(":popover-open")) tip.showPopover()
      // After showPopover, so offsetWidth/Height are real numbers.
      place()
    }

    const out = (e: PointerEvent) => {
      const host = hostRef.current
      if (!host) return
      // Moving between a control's own children is not leaving it.
      const to = e.relatedTarget as Node | null
      if (to && host.contains(to)) return
      hide()
    }

    document.addEventListener("pointerover", over, true)
    document.addEventListener("pointerout", out, true)
    // A tip glued to a control inside .scrollbox / .adminbody / .pdf-toolbar
    // must travel with it; capture:true is what reaches those inner scrollers,
    // since scroll does not bubble.
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    // Any real interaction ends the tip: pressing a <summary> must not leave
    // the old bubble hanging over the foldout it just opened.
    document.addEventListener("pointerdown", hide, true)
    document.addEventListener("keydown", hide, true)
    return () => {
      document.removeEventListener("pointerover", over, true)
      document.removeEventListener("pointerout", out, true)
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
      document.removeEventListener("pointerdown", hide, true)
      document.removeEventListener("keydown", hide, true)
    }
  }, [])

  return <div ref={tipRef} className="tiplayer" popover="manual" aria-hidden="true" />
}
