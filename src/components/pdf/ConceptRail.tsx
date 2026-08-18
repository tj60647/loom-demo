"use client";

/**
 * Margin rails for page mode: every passage on the open spread gets a card
 * beside the page it was captured from, centered on its highlight, with a
 * leader line to the span — so the concepts live next to the lines they came
 * from. The idea is the spread canvas's (origin/spread-canvas-reading,
 * reverted off master by 41d5b50 for deploy hygiene); this rebuild keeps its
 * layout algorithm and drops its parallel rendering and capture paths.
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

/**
 * What a margin card SAYS — its concepts and its note — with no opinion about
 * where it sits.
 *
 * Shared because there are two rails: this one, beside a spread in page mode,
 * and SpreadCanvasView's, which draws the same cards over the whole reading at
 * any zoom. They held two copies of the markup and the canvas one was still
 * showing a concept label and a gloss hours after this one stopped. One body,
 * two hosts: the host owns position, scale and the leader; the body owns what
 * is written on the card.
 */
export function RailCardBody({
  passage,
  concepts,
  onOpenPassage,
  onOpenConcept,
  onUnfile,
  readOnly = false,
}: {
  passage: Passage;
  concepts: Concept[];
  onOpenPassage?: (passageId: string) => void;
  onOpenConcept?: (conceptId: string) => void;
  onUnfile?: (passageId: string, conceptId: string) => void;
  /**
   * No × and no + — the card is only a way IN (TJ, 2026-08-17: "i think that
   * zoomed out editing these things is a bad idea").
   *
   * The canvas sets it. Its cards are drawn over the whole reading at any
   * zoom, and at fit-all you are reading a concept map: the controls are
   * counter-scaled dots over a page thumbnail, and an unfile is one mis-click
   * from a pan. Unconditional rather than below some zoom, because a control
   * that appears at one magnification and not another is a control nobody
   * learns — and every act it offers is a click away in the panel, which is
   * where the badges and the note already lead.
   */
  readOnly?: boolean;
}) {
  return (
    <>
      <div className="pdf-railcard-badges">
        {concepts.map((concept) => (
          <span key={concept.id} className="pdf-railcard-chip">
            <button
              type="button"
              className="pdf-chip-open"
              onClick={() => onOpenConcept?.(concept.id)}
              title={`Open “${concept.label}” in your work`}
            >{concept.label}</button>
            {!readOnly && (
              <button
                type="button"
                className="pchip-x"
                onClick={() => onUnfile?.(passage.id, concept.id)}
                aria-label={`Remove ${concept.label} from this passage`}
                title={`Remove “${concept.label}” from this passage. The passage stays.`}
              >×</button>
            )}
          </span>
        ))}
        {/* Click-through, not an inline field: cards are CSS-scaled when a
            side crowds, so a field in here would loop — typing grows the card,
            height changes the scale, and the scale moves every card on the
            side including the one under the cursor. */}
        {!readOnly && (
          <button
            type="button"
            className="pdf-railcard-add"
            onClick={() => onOpenPassage?.(passage.id)}
            aria-label="Add a concept to this passage"
            title="Add a concept to this passage"
          >+</button>
        )}
      </div>
      {/* An invitation you cannot take is not an invitation (TJ, 2026-08-17:
          "if no note then hide add a passage"). While the card is read-only the
          empty state says "add a passage note" over a control that will not
          add one — so with nothing written, nothing is drawn. */}
      {(passage.note || !readOnly) && (
      <button
        type="button"
        className={`pdf-railcard-note${passage.note ? "" : " empty"}`}
        onClick={() => onOpenPassage?.(passage.id)}
        title={passage.note ? "Open this passage in your work" : "Write a note on this passage"}
      >
        {passage.note ? short(passage.note, 140) : "add a passage note"}
      </button>
      )}
    </>
  );
}

export default function ConceptRails({
  enabled,
  twoPage,
  passages,
  concepts,
  onOpenPassage,
  onOpenConcept,
  onUnfile,
  children,
}: {
  enabled: boolean;
  twoPage: boolean;
  passages: Passage[];
  concepts: Concept[];
  onOpenPassage?: (passageId: string) => void;
  /** Open Your work at a concept — the badge's destination. */
  onOpenConcept?: (conceptId: string) => void;
  /** Take one concept off this passage, in place. The only act the card does
   *  itself: it changes nothing about the card's height, so it cannot start
   *  the scale-reflow loop that keeps editing out of here. */
  onUnfile?: (passageId: string, conceptId: string) => void;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});

  /**
   * Anchors come off the DOM: the first mark per passage id, in document
   * order, measured relative to the wrapper. Which page a mark sits on is
   * read from the page elements' own positions rather than threaded page
   * numbers — the leftmost page annotates leftward, everything else right.
   */
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width === 0) return;

    const pages = Array.from(wrap.querySelectorAll<HTMLElement>(".react-pdf__Page")).sort(
      (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left
    );
    const leftPage = twoPage && pages.length >= 2 ? pages[0] : null;

    const next: Record<string, Anchor> = {};
    for (const mark of wrap.querySelectorAll<HTMLElement>(".loom-passage-highlight")) {
      const id = mark.getAttribute("data-loom-passage-id");
      if (!id || next[id]) continue;
      const rect = mark.getClientRects()[0];
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      const side: Side = leftPage && mark.closest(".react-pdf__Page") === leftPage ? "left" : "right";
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
  }, [twoPage]);

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
    <div className="pdf-rail" aria-label={side === "left" ? "Cards for the left page" : "Cards for this page"}>
      {cards
        .filter((c) => c.anchor.side === side)
        .map((c) => {
          const id = c.passage.id;
          const s = placement.scales[side];
          // No `first`/`chips` split any more: the card shows every concept
          // as a badge of equal weight. Promoting concepts[0] to a heading was
          // the asymmetry the passage view was built to stop — earliest-filed
          // is not most important, and the model has them as equals.
          return (
            /**
             * THE CARD IS ITS CONCEPTS AND ITS NOTE (TJ, 2026-08-17) — the
             * passage card without the passage, because the leader line to the
             * highlight IS the passage. It carried a concept label, that
             * concept's gloss, and nothing of the student's own.
             *
             * NOTHING IS EDITED IN HERE, deliberately, and not for want of a
             * write path — `editPassageNote` exists now. Cards are CSS-scaled
             * when a side crowds (`railScale` above), so a field in here would
             * loop: typing grows the card, the height changes the scale, and
             * the scale moves every card on the side including the one under
             * the cursor. Each control opens the panel at the right place
             * instead, where the same edit is a normal field.
             *
             * So the card is no longer one door but three, and is therefore no
             * longer a `role="button"` with controls inside it — that was a
             * control within a control. The badges, the +, and the note are
             * each their own target.
             */
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
            >
              <RailCardBody
                passage={c.passage}
                concepts={c.concepts}
                onOpenPassage={onOpenPassage}
                onOpenConcept={onOpenConcept}
                onUnfile={onUnfile}
              />
            </div>
          );
        })}
    </div>
  );

  return (
    <div className="pdf-spread-wrap" ref={wrapRef}>
      {enabled && twoPage && renderRail("left")}
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
