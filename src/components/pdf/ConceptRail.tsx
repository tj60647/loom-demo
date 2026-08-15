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
 * Directly editable (Lingxiu, 2026-08-15, reversing TJ's 2026-08-09
 * read-only ruling — the original spread canvas's cards were editors): the
 * concept's name and working definition write through the same editConcept
 * every other surface uses, with the original's save discipline — the name
 * commits on blur/Enter only (labels are concept identity, and mid-typed
 * names would collide), the definition saves on a 700ms pause and on blur.
 * The corner › is the door to Your work. Anchors are read off the mark.js
 * highlight layer (`.loom-passage-highlight`), never re-resolved from
 * offsets: whatever the applier drew — precision or fuzzy — is what a card
 * points at, and the peer-overlay wash (`.loom-overlay-heat`) is
 * deliberately not consulted, so nobody else's marks can spawn a card here.
 *
 * All geometry is derived for display and discarded (red line #7; MapTab's
 * drift grid is the precedent).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoom } from "@/components/providers/LoomProvider";
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
          return (
            <RailCard
              key={id}
              passage={c.passage}
              concepts={c.concepts}
              onOpenPassage={onOpenPassage}
              registerEl={(el) => registerCard(id, el)}
              style={{
                top: placement.tops[id] ?? c.anchor.midY,
                transform: s < 1 ? `scale(${s})` : undefined,
                // Scaled cards hug the rail's inner edge, where the leader
                // line arrives.
                transformOrigin: side === "left" ? "top right" : "top left",
              }}
            />
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

/**
 * One margin card, shared by page mode's rails and the spread canvas — the
 * original spread canvas's concept box, rebuilt on the passage card. The
 * NAME and WORKING DEFINITION edit in place, through the same editConcept as
 * every other surface; the corner › is the door to Your work. Local drafts
 * re-adopt the saved value whenever the graph changes underneath (the same
 * concept edited from another card, or from Your work).
 */
export function RailCard({
  passage,
  concepts,
  onOpenPassage,
  registerEl,
  style,
}: {
  passage: Passage;
  concepts: Concept[];
  onOpenPassage?: (passageId: string) => void;
  registerEl: (el: HTMLElement | null) => void;
  style?: React.CSSProperties;
}) {
  const { editConcept } = useLoom();
  const first: Concept | undefined = concepts[0];
  const chips = concepts.slice(1);
  const name = first ? first.label : "Unlabeled passage";

  const [label, setLabel] = useState(first?.label ?? "");
  const [def, setDef] = useState(first?.def ?? "");
  const [prevLabel, setPrevLabel] = useState(first?.label ?? "");
  const [prevDef, setPrevDef] = useState(first?.def ?? "");
  if (prevLabel !== (first?.label ?? "")) {
    setPrevLabel(first?.label ?? "");
    setLabel(first?.label ?? "");
  }
  if (prevDef !== (first?.def ?? "")) {
    setPrevDef(first?.def ?? "");
    setDef(first?.def ?? "");
  }

  // The definition saves while you type (700ms pause) — it isn't identity,
  // so partial states are harmless. The name commits on blur/Enter only:
  // labels are concept identity (spec §2), and mid-typed names would collide
  // and spam rename events into the graph history.
  useEffect(() => {
    if (!first || def === (first.def ?? "")) return;
    const t = window.setTimeout(() => void editConcept(first.id, { def }), 700);
    return () => window.clearTimeout(t);
  }, [def, first, editConcept]);

  return (
    <div className="pdf-railcard" ref={registerEl} style={style}>
      <button
        type="button"
        className="pdf-railcard-open"
        aria-label={`Open ${name} in your work`}
        data-tip="this passage in your work"
        onClick={() => onOpenPassage?.(passage.id)}
      >
        ›
      </button>
      {first ? (
        <textarea
          className="pdf-railcard-label"
          value={label}
          rows={1}
          aria-label="Concept name"
          placeholder="concept name"
          onChange={(e) => setLabel(e.target.value.replace(/\n/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          onBlur={() => {
            const v = label.trim();
            if (v && v !== first.label) void editConcept(first.id, { label: v });
            else setLabel(first.label);
          }}
        />
      ) : (
        <div className="pdf-railcard-label unlabeled">{name}</div>
      )}
      {chips.length > 0 && (
        <div className="pdf-railcard-chips">
          {chips.map((chip) => (
            <span key={chip.id} className="pdf-railcard-chip">{chip.label}</span>
          ))}
        </div>
      )}
      {first ? (
        <textarea
          className="pdf-railcard-def"
          value={def}
          rows={1}
          aria-label="Working definition"
          placeholder="working definition"
          onChange={(e) => setDef(e.target.value)}
          onBlur={() => {
            if (first && def !== (first.def ?? "")) void editConcept(first.id, { def });
          }}
        />
      ) : (
        <div className="pdf-railcard-def">{short(passage.content, 110)}</div>
      )}
      {passage.note ? <div className="pdf-railcard-note">{short(passage.note, 110)}</div> : null}
    </div>
  );
}
