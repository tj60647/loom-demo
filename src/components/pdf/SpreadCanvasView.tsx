"use client";

/**
 * The matrix as a spread canvas: the whole document laid out as 2-page
 * spreads on a near-square grid under ONE zoom/pan transform — Lingxiu's
 * spread canvas (origin/spread-canvas-reading, reverted by 41d5b50), rebuilt
 * as the matrix's rendering rather than a second surface beside it.
 *
 * What carries over from the branch: spreadLayout's grid, the imperative
 * transform (pan/zoom never re-renders forty pdf pages per frame), the
 * Figma-style trackpad wheel handling, the settle-then-retarget rastering,
 * and the counter-scaling cards — `--invk` keeps concept titles at reading
 * size however far out you zoom, and cards grow inward over their own pages,
 * so at full zoom-out you are reading concepts, not the shrunken text.
 *
 * What deliberately does NOT carry over: the single/spread reading modes,
 * masks and snap-to-page (01 · Reading's page mode already IS the focused
 * spread — one answer per question), and the branch's own capture path (the
 * text layers here are ordinary react-pdf layers inside `.pdf-stage`, so the
 * viewer's one selection handler, one CaptureModal and one ReuseOffer serve
 * this view like every other — the 2.1 invariant).
 *
 * All geometry is derived for display and discarded (red line #7). Cards are
 * read-only doors to Your work, exactly as in page mode.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { select, pointer } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type D3ZoomEvent, type ZoomTransform } from "d3-zoom";
import PageSlot from "./PageSlot";
import { type PdfDoc } from "./PageRaster";
import { spreadLayout, pageX } from "@/lib/spreadLayout";
import { layoutRail, railScale } from "@/lib/railLayout";
import { short } from "@/lib/clothMath";
import type { Concept, Passage } from "@/lib/types";

const CARD_GAP = 12;
const CARD_FALLBACK_H = 88;
const MEASURE_MS = 120;
const SETTLE_MS = 200;
const MAX_RES = 8;

type Anchor = {
  spreadIdx: number;
  side: "left" | "right";
  /** Canvas-unit coordinates — transform-independent, so zoom never forces a re-measure. */
  midY: number;
  edgeX: number;
};

export default function SpreadCanvasView({
  pdf,
  numPages,
  basePageWidth,
  aspect,
  stage,
  stageEl,
  cardsOn,
  passages,
  concepts,
  onOpenPassage,
  onAspect,
  zoomMultiplier,
  onZoomMultiplier,
  focusPage,
  onTransform,
}: {
  pdf: PdfDoc | null;
  numPages: number;
  /** Page width in canvas units — the width text layers render at, once. */
  basePageWidth: number;
  aspect: number;
  stage: { w: number; h: number };
  stageEl: HTMLDivElement | null;
  cardsOn: boolean;
  passages: Passage[];
  concepts: Concept[];
  onOpenPassage?: (passageId: string) => void;
  onAspect: (a: number) => void;
  /** The toolbar slider's value: 1 = the whole canvas fits the stage. */
  zoomMultiplier: number;
  onZoomMultiplier: (m: number) => void;
  /** "Go to this page": a CHANGE here centers that page at the current zoom.
   *  The scroll-based effect the other views use cannot serve a transformed
   *  canvas — its scrollIntoView would shift a hidden-overflow box by an
   *  offset the transform never learns about. */
  focusPage?: number;
  /** Fires on every transform write — the viewer re-seats anything it
   *  positioned in viewport coordinates (the floating capture button). */
  onTransform?: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const tref = useRef<ZoomTransform>(zoomIdentity);
  const zbRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const initedRef = useRef(false);
  const [pageRes, setPageRes] = useState<Record<number, number>>({});
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});

  const basePageHeight = basePageWidth * aspect;
  const layout = useMemo(
    () => (numPages > 0 && basePageWidth > 0 ? spreadLayout(numPages, basePageWidth, basePageHeight, cardsOn) : null),
    [numPages, basePageWidth, basePageHeight, cardsOn]
  );

  // 1 on the slider = the whole canvas in view; the counter-scale reference is
  // the two-page fit, so "reading size" means the same thing as page mode.
  const fitAllK = useMemo(
    () => (layout && stage.w > 0 ? Math.min(stage.w / (layout.canvasW + 24), stage.h / (layout.canvasH + 24)) : 1),
    [layout, stage.w, stage.h]
  );
  const spreadFitK = useMemo(
    () => (layout && stage.w > 0 ? Math.min((stage.w - 16) / layout.unitW, (stage.h - 24) / layout.unitH) : 1),
    [layout, stage.w, stage.h]
  );

  // The latest of everything the imperative handlers need, without
  // re-registering them (the branch's resDeps pattern).
  const live = useRef({ layout, stage, fitAllK, spreadFitK, basePageWidth, zoomMultiplier, onZoomMultiplier, onTransform });
  useEffect(() => {
    live.current = { layout, stage, fitAllK, spreadFitK, basePageWidth, zoomMultiplier, onZoomMultiplier, onTransform };
  });

  /**
   * After a settle: pages intersecting the view (plus half a page of margin)
   * get raster resolution matching the zoom; everything else drops back to
   * base and CSS-stretches. Analytic, off the layout — no DOM sweep.
   */
  const retargetRes = useCallback(() => {
    const { layout, stage, basePageWidth } = live.current;
    if (!layout || stage.w === 0) return;
    const t = tref.current;
    const dpr = window.devicePixelRatio || 1;
    const target = Math.max(1, Math.min(MAX_RES, Math.ceil(t.k * dpr * 2) / 2));
    const margin = basePageWidth / 2;
    const vx = -t.x / t.k - margin;
    const vy = -t.y / t.k - margin;
    const vw = stage.w / t.k + margin * 2;
    const vh = stage.h / t.k + margin * 2;
    const next: Record<number, number> = {};
    if (target > 1) {
      for (const s of layout.spreads) {
        for (const p of s.rightPage ? [s.leftPage, s.rightPage] : [s.leftPage]) {
          const px = pageX(layout, s, p, basePageWidth);
          const inView = px < vx + vw && px + basePageWidth > vx && s.y < vy + vh && s.y + layout.unitH > vy;
          if (inView) next[p] = target;
        }
      }
    }
    setPageRes((prev) => {
      const nk = Object.keys(next);
      if (Object.keys(prev).length === nk.length && nk.every((k) => prev[+k] === next[+k])) return prev;
      return next;
    });
  }, []);

  const applyTransform = useCallback((t: ZoomTransform) => {
    tref.current = t;
    const el = canvasRef.current;
    if (!el) return;
    el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    el.style.setProperty("--invk", String(Math.max(1, live.current.spreadFitK / t.k)));
    live.current.onTransform?.();
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      retargetRes();
      // Keep the toolbar slider honest about where a gesture left the zoom.
      const { fitAllK, zoomMultiplier, onZoomMultiplier } = live.current;
      const m = Math.min(8, Math.max(0.5, Math.round((tref.current.k / fitAllK) * 10) / 10));
      if (Math.abs(m - zoomMultiplier) > 0.05) onZoomMultiplier(m);
    }, SETTLE_MS);
  }, [retargetRes]);

  // --- the zoom behaviour: always freeform ---
  useEffect(() => {
    zbRef.current = zoom<HTMLDivElement, unknown>()
      .filter((e: Event & { button?: number }) => {
        // A MOUSE drag that starts on page text selects text — but only a
        // mouse drag: on touch, selection is long-press, not drag, so
        // filtering touchstart here left phones with no way to pan a zoomed
        // canvas at all (text layers cover the whole page and touch-action is
        // none). Touch pans everywhere; a tap on a card still clicks it.
        const t = e.target as HTMLElement;
        if (e.type === "mousedown" && t.closest(".react-pdf__Page__textContent")) return false;
        if ((e.type === "mousedown" || e.type === "touchstart") && t.closest(".pdf-railcard")) return false;
        return !e.button;
      })
      .on("zoom", (e: D3ZoomEvent<HTMLDivElement, unknown>) => applyTransform(e.transform));
  }, [applyTransform]);

  useEffect(() => {
    const zb = zbRef.current;
    if (!zb || !layout || stage.w === 0) return;
    const pad = layout.spreadGap * 4;
    // The gesture range IS the slider range — [0.5, 8] × fit-all, exactly.
    // A wider gesture ceiling (the branch allowed spreadFitK * 8) would let a
    // pinch rest where the settle sync clamps the slider to 8, and the slider
    // effect would then yank the view back out on its own — the extent and
    // the clamp must never disagree.
    zb.scaleExtent([fitAllK * 0.5, fitAllK * 8])
      .translateExtent([[-pad, -pad], [layout.canvasW + pad, layout.canvasH + pad]]);
  }, [layout, stage.w, fitAllK]);

  useEffect(() => {
    const el = viewportRef.current;
    const zb = zbRef.current;
    if (!el || !zb) return;
    const sel = select(el);
    sel.call(zb);
    sel.on("dblclick.zoom", null); // double-click zoom jumps are hostile mid-reading
    // Figma-style trackpad: two-finger scroll pans, pinch zooms. d3-zoom's
    // default treats every wheel event as zoom, so replace its wheel handler.
    // A trackpad pinch reaches the browser as a wheel event with ctrlKey set
    // (macOS convention); everything else is a scroll and becomes a pan.
    sel.on("wheel.zoom", null);
    sel.on("wheel.figma", (e: WheelEvent) => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 16 : 1; // line-scrolling mice report lines, not pixels
      if (e.ctrlKey || e.metaKey) {
        zb.scaleBy(sel, Math.pow(2, -e.deltaY * scale * 0.01), pointer(e, el));
      } else {
        const k = tref.current.k;
        zb.translateBy(sel, (-e.deltaX * scale) / k, (-e.deltaY * scale) / k);
      }
    });
    return () => {
      sel.on(".zoom", null);
      sel.on("wheel.figma", null);
    };
  }, [layout != null]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Set k = m·fitAllK, keeping the canvas point at the stage centre fixed. */
  const applyMultiplier = useCallback((m: number, recenter = false) => {
    const el = viewportRef.current;
    const zb = zbRef.current;
    const { layout, stage, fitAllK } = live.current;
    if (!el || !zb || !layout || stage.w === 0) return;
    const k = m * fitAllK;
    const t = tref.current;
    let t2: ZoomTransform;
    if (recenter || !initedRef.current) {
      t2 = zoomIdentity
        .translate((stage.w - layout.canvasW * k) / 2, (stage.h - layout.canvasH * k) / 2)
        .scale(k);
    } else {
      const cx = (stage.w / 2 - t.x) / t.k;
      const cy = (stage.h / 2 - t.y) / t.k;
      t2 = zoomIdentity.translate(stage.w / 2 - cx * k, stage.h / 2 - cy * k).scale(k);
    }
    zb.transform(select(el), t2);
  }, []);

  // First fit, and the slider. The 0.05 tolerance breaks the loop with the
  // settle-time slider sync above.
  useEffect(() => {
    if (!layout || stage.w === 0) return;
    if (!initedRef.current) {
      applyMultiplier(zoomMultiplier, true);
      initedRef.current = true;
      return;
    }
    if (Math.abs(zoomMultiplier - tref.current.k / fitAllK) > 0.05) {
      applyMultiplier(zoomMultiplier);
    }
  }, [zoomMultiplier, layout, stage.w, fitAllK, applyMultiplier]);

  // A resize or a rail toggle moves every coordinate: keep the multiplier,
  // re-center the canvas.
  const geomKey = `${stage.w}x${stage.h}:${layout?.canvasW ?? 0}x${layout?.canvasH ?? 0}`;
  const prevGeom = useRef(geomKey);
  useEffect(() => {
    if (prevGeom.current === geomKey) return;
    prevGeom.current = geomKey;
    if (initedRef.current) applyMultiplier(live.current.zoomMultiplier, true);
  }, [geomKey, applyMultiplier]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  // "Go to this page" — a CHANGE in focusPage (a Find hit, a passage's goto)
  // centers that page's spot at the current zoom. Entering the matrix does
  // not jump: the ref starts at whatever page the reading was already on.
  const prevFocus = useRef(focusPage);
  useEffect(() => {
    if (prevFocus.current === focusPage) return;
    prevFocus.current = focusPage;
    if (!focusPage || !layout || !initedRef.current) return;
    const el = viewportRef.current;
    const zb = zbRef.current;
    if (!el || !zb) return;
    const s = layout.spreads[Math.floor((focusPage - 1) / 2)];
    if (!s) return;
    const { stage, basePageWidth } = live.current;
    const k = tref.current.k;
    const cx = pageX(layout, s, focusPage, basePageWidth) + basePageWidth / 2;
    const cy = s.y + layout.unitH / 2;
    zb.transform(select(el), zoomIdentity.translate(stage.w / 2 - cx * k, stage.h / 2 - cy * k).scale(k));
  }, [focusPage, layout]);

  // --- pages ---
  const pagesEl = useMemo(() => {
    if (!layout || !pdf) return null;
    return layout.spreads.flatMap((s) =>
      (s.rightPage ? [s.leftPage, s.rightPage] : [s.leftPage]).map((p) => (
        <div
          key={p}
          className="pdf-spread-page"
          style={{ position: "absolute", left: pageX(layout, s, p, basePageWidth), top: s.y, width: basePageWidth }}
        >
          <PageSlot
            pageNumber={p}
            width={basePageWidth}
            aspect={aspect}
            root={stageEl}
            eager={p === 1}
            onAspect={onAspect}
            label
            pdf={pdf}
            baseWidth={basePageWidth}
            res={pageRes[p] ?? 1}
          />
        </div>
      ))
    );
  }, [layout, pdf, basePageWidth, aspect, stageEl, onAspect, pageRes]);

  // --- cards: anchors off the mark.js layer, in canvas units ---
  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const { layout, basePageWidth } = live.current;
    if (!canvas || !layout) return;
    const k = tref.current.k;
    if (k === 0) return;
    const next: Record<string, Anchor> = {};
    for (const mark of canvas.querySelectorAll<HTMLElement>(".loom-passage-highlight")) {
      const id = mark.getAttribute("data-loom-passage-id");
      if (!id || next[id]) continue;
      const pageEl = mark.closest<HTMLElement>(".react-pdf__Page");
      const pageNum = Number(pageEl?.getAttribute("data-page-number"));
      if (!pageEl || !pageNum) continue;
      const rect = mark.getClientRects()[0];
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      const spreadIdx = Math.floor((pageNum - 1) / 2);
      const s = layout.spreads[spreadIdx];
      if (!s) continue;
      const side: Anchor["side"] = pageNum % 2 === 1 ? "left" : "right";
      const pr = pageEl.getBoundingClientRect();
      const px = pageX(layout, s, pageNum, basePageWidth);
      next[id] = {
        spreadIdx,
        side,
        midY: s.y + (rect.top + rect.height / 2 - pr.top) / k,
        edgeX: px + ((side === "left" ? rect.left : rect.right) - pr.left) / k,
      };
    }
    setAnchors((prev) => {
      const pk = Object.keys(prev);
      const nk = Object.keys(next);
      if (
        pk.length === nk.length &&
        nk.every((id) => {
          const a = prev[id];
          const b = next[id];
          return a && a.side === b.side && a.spreadIdx === b.spreadIdx &&
            Math.abs(a.midY - b.midY) < 0.5 && Math.abs(a.edgeX - b.edgeX) < 0.5;
        })
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!cardsOn) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, MEASURE_MS);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(canvas, { childList: true, subtree: true });
    schedule();
    return () => {
      window.clearTimeout(timer);
      mo.disconnect();
    };
  }, [cardsOn, measure, passages]);

  const cardEls = useRef(new Map<string, HTMLElement>());
  const cardIdByEl = useRef(new Map<Element, string>());
  const cardRO = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const next: Record<string, number> = {};
      for (const [el, id] of cardIdByEl.current) next[id] = (el as HTMLElement).offsetHeight;
      setCardHeights((prev) => {
        const nk = Object.keys(next);
        if (Object.keys(prev).length === nk.length && nk.every((id) => prev[id] === next[id])) return prev;
        return next;
      });
    });
    cardRO.current = ro;
    return () => ro.disconnect();
  }, []);
  const registerCard = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      cardEls.current.set(id, el);
      cardIdByEl.current.set(el, id);
      cardRO.current?.observe(el);
    } else {
      const old = cardEls.current.get(id);
      if (old) {
        cardRO.current?.unobserve(old);
        cardIdByEl.current.delete(old);
        cardEls.current.delete(id);
      }
    }
  }, []);

  const cards = useMemo(() => {
    if (!cardsOn || !layout) return [];
    const out: { passage: Passage; concepts: Concept[]; anchor: Anchor }[] = [];
    for (const passage of passages) {
      const anchor = anchors[passage.id];
      if (!anchor) continue;
      out.push({
        passage,
        concepts: passage.conceptIds
          .map((id) => concepts.find((c) => c.id === id))
          .filter((c): c is Concept => !!c),
        anchor,
      });
    }
    return out.sort((a, b) => a.anchor.midY - b.anchor.midY);
  }, [cardsOn, layout, passages, concepts, anchors]);

  const placement = useMemo(() => {
    const tops: Record<string, number> = {};
    const scales: Record<string, number> = {};
    if (!layout) return { tops, scales };
    const groups = new Map<string, typeof cards>();
    for (const c of cards) {
      const key = `${c.anchor.spreadIdx}:${c.anchor.side}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    for (const group of groups.values()) {
      const spreadY = layout.spreads[group[0].anchor.spreadIdx].y;
      const hs = group.map((c) => cardHeights[c.passage.id] ?? CARD_FALLBACK_H);
      const s = railScale(hs, CARD_GAP, layout.unitH);
      const placed = layoutRail(
        group.map((c, i) => ({
          id: c.passage.id,
          desired: c.anchor.midY - spreadY - (hs[i] * s) / 2,
          h: hs[i] * s,
        })),
        layout.unitH,
        CARD_GAP * s
      );
      for (const c of group) {
        tops[c.passage.id] = spreadY + placed[c.passage.id];
        scales[c.passage.id] = s;
      }
    }
    return { tops, scales };
  }, [cards, cardHeights, layout]);

  if (!layout) return null;

  return (
    <div className="pdf-spread-viewport" ref={viewportRef}>
      <div
        className="pdf-spread-canvas"
        ref={canvasRef}
        style={{ width: layout.canvasW, height: layout.canvasH }}
      >
        {pagesEl}

        {cardsOn && (
          <svg className="pdf-rail-leaders" width={layout.canvasW} height={layout.canvasH} aria-hidden="true">
            {cards.map((c) => {
              const id = c.passage.id;
              const top = placement.tops[id];
              if (top == null) return null;
              const s = layout.spreads[c.anchor.spreadIdx];
              const cs = placement.scales[id] ?? 1;
              const h = (cardHeights[id] ?? CARD_FALLBACK_H) * cs;
              const x2 = c.anchor.side === "left" ? s.x + layout.railW : s.x + layout.unitW - layout.railW;
              return <path key={id} d={`M ${c.anchor.edgeX} ${c.anchor.midY} L ${x2} ${top + h / 2}`} />;
            })}
          </svg>
        )}

        {cardsOn && (
          <div className="pdf-spread-rails">
            {cards.map((c) => {
              const id = c.passage.id;
              const s = layout.spreads[c.anchor.spreadIdx];
              const cs = placement.scales[id] ?? 1;
              const first = c.concepts[0];
              const chips = c.concepts.slice(1);
              const name = first ? first.label : "Unlabeled passage";
              // Cards keep their rail-edge anchor and grow inward — over their
              // own page — as the canvas zooms out (width rides --invk), so at
              // full zoom-out you are reading concepts, not the shrunken text.
              // Both offsets set explicitly: the shared .pdf-railcard class
              // says left:0/right:0 (correct inside page mode's rail), and an
              // over-constrained absolute box resolves left+width and IGNORES
              // right — which pinned every right-side card to the canvas's
              // left edge until the unused side was released with "auto".
              const style: React.CSSProperties = {
                top: placement.tops[id] ?? s.y,
                width: `min(calc(${layout.railW}px * var(--invk, 1)), ${layout.railW + layout.gap + basePageWidth}px)`,
                transform: cs < 1 ? `scale(${cs})` : undefined,
                transformOrigin: c.anchor.side === "left" ? "top left" : "top right",
                ...(c.anchor.side === "left"
                  ? { left: s.x, right: "auto" }
                  : { right: layout.canvasW - (s.x + layout.unitW), left: "auto" }),
              };
              return (
                <div
                  key={id}
                  ref={(el) => registerCard(id, el)}
                  className="pdf-railcard"
                  style={style}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${name} in your work`}
                  onClick={() => onOpenPassage?.(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenPassage?.(id);
                    }
                  }}
                >
                  <div className={`pdf-railcard-label${first ? "" : " unlabeled"}`}>{name}</div>
                  {chips.length > 0 && (
                    <div className="pdf-railcard-chips">
                      {chips.map((chip) => (
                        <span key={chip.id} className="pdf-railcard-chip">{chip.label}</span>
                      ))}
                    </div>
                  )}
                  {first?.def ? <div className="pdf-railcard-def">{short(first.def, 140)}</div> : null}
                  {!first && <div className="pdf-railcard-def">{short(c.passage.content, 110)}</div>}
                  {c.passage.note ? <div className="pdf-railcard-note">{short(c.passage.note, 110)}</div> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
