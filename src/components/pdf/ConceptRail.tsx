"use client";

/**
 * Margin rails for page mode: every passage on the open pages gets a card
 * beside the page it was captured from, centered on its highlight, with a
 * leader line to the span — so the concepts live next to the lines they came
 * from. The idea is the spread canvas's (origin/spread-canvas-reading,
 * reverted off master by 41d5b50 for deploy hygiene); this rebuild keeps its
 * layout algorithm and drops its parallel rendering and capture paths.
 *
 * Always on, both rails standing (Lingxiu, 2026-08-15): the cards are the
 * reading surface, not a toggle, and a card's side is its page number's
 * parity — odd left, even right — in every view.
 *
 * Read-only by ruling (TJ, 2026-08-09): a card displays and clicks through to
 * Your work — it edits nothing, so concept identity keeps a single editing
 * surface. Anchors are read off the mark.js highlight layer
 * (`.loom-passage-highlight`), never re-resolved from offsets: whatever the
 * applier drew — precision or fuzzy — is what a card points at, and the
 * peer-overlay wash (`.loom-overlay-heat`) is deliberately not consulted, so
 * nobody else's marks can spawn a card here.
 *
 * All geometry is derived for display and discarded (red line #7; MapTab's
 * drift grid is the precedent). Nothing here writes.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Concept, Passage } from "@/lib/types";
import { layoutRail, railScale } from "@/lib/railLayout";
import { short } from "@/lib/clothMath";

export const RAIL_W = 220;
const CARD_GAP = 12;
const CARD_FALLBACK_H = 88;
/** Longer than the highlight applier's 100ms debounce, so a measurement runs
 *  after the marks have landed rather than between unmark and re-mark. */
const MEASURE_MS = 120;

type Side = "left" | "right";

type Anchor = {
  side: Side;
  /** Vertical middle of the highlight's first client rect, wrapper-relative. */
  midY: number;
  /** The rect edge facing the rail — where the leader line leaves the text. */
  edgeX: number;
};

type CardModel = {
  passage: Passage;
  concepts: Concept[];
  anchor: Anchor;
};

/**
 * Wraps the page-mode spread. Always renders the same wrapper element so the
 * pages inside keep their identity when the rails toggle; the rails, cards
 * and leader lines appear as siblings around the children.
 */
export default function ConceptRails({
  enabled,
  passages,
  concepts,
  onOpenPassage,
  children,
}: {
  enabled: boolean;
  passages: Passage[];
  concepts: Concept[];
  onOpenPassage?: (passageId: string) => void;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});

  /**
   * Anchors come off the DOM: the first mark per passage id, in document
   * order, measured relative to the wrapper. A card's side is the PAGE
   * NUMBER'S PARITY, never the layout: odd pages annotate leftward, even
   * pages rightward — page 1 left, page 2 right, page 3 left — the spread
   * canvas's fixed sides, kept identical across every view (Lingxiu,
   * 2026-08-15). Single-page mode therefore swings its cards between the
   * rails as the pages turn, rather than a view ever re-siding a card.
   */
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width === 0) return;

    const next: Record<string, Anchor> = {};
    for (const mark of wrap.querySelectorAll<HTMLElement>(".loom-passage-highlight")) {
      const id = mark.getAttribute("data-loom-passage-id");
      if (!id || next[id]) continue;
      const rect = mark.getClientRects()[0];
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      const pageNum = Number(
        mark.closest<HTMLElement>(".react-pdf__Page")?.getAttribute("data-page-number")
      );
      if (!pageNum) continue;
      const side: Side = pageNum % 2 === 1 ? "left" : "right";
      next[id] = {
        side,
        midY: rect.top + rect.height / 2 - wrapRect.top,
        edgeX: (side === "left" ? rect.left : rect.right) - wrapRect.left,
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
          // Half-pixel tolerance: sub-pixel wobble must not loop the observer.
          return a && a.side === b.side && Math.abs(a.midY - b.midY) < 0.5 && Math.abs(a.edgeX - b.edgeX) < 0.5;
        })
      ) {
        return prev;
      }
      return next;
    });
    setWrapSize((prev) =>
      Math.abs(prev.w - wrapRect.width) < 0.5 && Math.abs(prev.h - wrapRect.height) < 0.5
        ? prev
        : { w: wrapRect.width, h: wrapRect.height }
    );
  }, []);

  // The marks arrive and leave asynchronously (the applier runs off its own
  // MutationObserver), so the rail watches the wrapper for both DOM churn and
  // resize, and re-measures after a settle.
  useEffect(() => {
    if (!enabled) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, MEASURE_MS);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(wrap, { childList: true, subtree: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);
    schedule();
    return () => {
      window.clearTimeout(timer);
      mo.disconnect();
      ro.disconnect();
    };
  }, [enabled, measure, passages]);

  // Stacking needs real card heights (definitions vary), so every card
  // element is watched by one shared ResizeObserver. Heights are measured
  // unscaled — the shrink factor is applied after, and never feeds back.
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

  // One card per passage — a span refiled under a second concept grows a chip,
  // not a twin card. Ordered by anchor position only (red line #3: the rail
  // counts nothing and ranks nothing).
  const cards = useMemo<CardModel[]>(() => {
    if (!enabled) return [];
    const out: CardModel[] = [];
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
  }, [enabled, passages, concepts, anchors]);

  const placement = useMemo(() => {
    const tops: Record<string, number> = {};
    const scales: Record<Side, number> = { left: 1, right: 1 };
    if (!wrapSize.h) return { tops, scales };
    for (const side of ["left", "right"] as Side[]) {
      const group = cards.filter((c) => c.anchor.side === side);
      if (group.length === 0) continue;
      const hs = group.map((c) => cardHeights[c.passage.id] ?? CARD_FALLBACK_H);
      const s = railScale(hs, CARD_GAP, wrapSize.h);
      scales[side] = s;
      const placed = layoutRail(
        group.map((c, i) => ({
          // Ideal top centers the card on its highlight — horizontal leader.
          id: c.passage.id,
          desired: c.anchor.midY - (hs[i] * s) / 2,
          h: hs[i] * s,
        })),
        wrapSize.h,
        CARD_GAP * s
      );
      for (const c of group) tops[c.passage.id] = placed[c.passage.id];
    }
    return { tops, scales };
  }, [cards, cardHeights, wrapSize.h]);

  const renderRail = (side: Side) => (
    <div className="pdf-rail" aria-label={side === "left" ? "Cards for odd pages" : "Cards for even pages"}>
      {cards
        .filter((c) => c.anchor.side === side)
        .map((c) => {
          const id = c.passage.id;
          const s = placement.scales[side];
          const first = c.concepts[0];
          const chips = c.concepts.slice(1);
          const name = first ? first.label : "Unlabeled passage";
          return (
            <div
              key={id}
              ref={(el) => registerCard(id, el)}
              className="pdf-railcard"
              style={{
                top: placement.tops[id] ?? c.anchor.midY,
                transform: s < 1 ? `scale(${s})` : undefined,
                // Scaled cards hug the rail's inner edge, where the leader
                // line arrives.
                transformOrigin: side === "left" ? "top right" : "top left",
              }}
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
  );

  return (
    // Both rails stand whatever is open between them: a page's cards have a
    // fixed side, so the left rail exists even when a lone even page fills
    // it with nothing — standing room, not a re-layout, is what keeps the
    // text still as pages turn.
    <div className="pdf-spread-wrap" ref={wrapRef}>
      {enabled && renderRail("left")}
      {children}
      {enabled && renderRail("right")}
      {enabled && wrapSize.w > 0 && (
        <svg className="pdf-rail-leaders" width={wrapSize.w} height={wrapSize.h} aria-hidden="true">
          {cards.map((c) => {
            const id = c.passage.id;
            const top = placement.tops[id];
            if (top == null) return null;
            const s = placement.scales[c.anchor.side];
            const h = (cardHeights[id] ?? CARD_FALLBACK_H) * s;
            const x2 = c.anchor.side === "left" ? RAIL_W : wrapSize.w - RAIL_W;
            return <path key={id} d={`M ${c.anchor.edgeX} ${c.anchor.midY} L ${x2} ${top + h / 2}`} />;
          })}
        </svg>
      )}
    </div>
  );
}
