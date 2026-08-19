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
 * drift grid is the precedent). The geometry still writes nothing; the cards
 * do, since 2026-08-18 — the + opens one add-concept card beside the passage
 * (cards/AddConceptCard), which coins or reuses a Concept and files it.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Concept, Passage } from "@/lib/types";
import { layoutRail, railScale } from "@/lib/railLayout";
import { short } from "@/lib/clothMath";
import ConceptName from "@/components/ui/ConceptName";
import { conceptNameText } from "@/lib/conceptName";
import AddConceptCard from "@/components/cards/AddConceptCard";

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
  onAddConcept,
  addConceptExpanded,
  addConceptControls,
  onUnfile,
  onRemovePassage,
  onEditNote,
  readOnly = false,
}: {
  passage: Passage;
  concepts: Concept[];
  onOpenPassage?: (passageId: string) => void;
  onOpenConcept?: (conceptId: string) => void;
  onAddConcept?: (passageId: string) => void;
  addConceptExpanded?: boolean;
  addConceptControls?: string;
  onUnfile?: (passageId: string, conceptId: string) => void;
  /** Delete the capture, after the shared confirm — see useRemovePassage. */
  onRemovePassage?: (passage: Passage) => void;
  /**
   * Write the passage's note from the card itself. Given, the note stops being
   * a door to Your work and becomes a field — see the note block below.
   */
  onEditNote?: (passageId: string, note: string) => void;
  /**
   * No × and no + — the card is only a way IN (TJ, 2026-08-17: "i think that
   * zoomed out editing these things is a bad idea").
   *
   * The canvas sets it while the viewport spans more than one page width. At
   * that scale you are reading a concept map: the controls are counter-scaled
   * dots over a page thumbnail, and an unfile is one mis-click from a pan.
   * Once one page fills the viewport, the same body becomes editable again.
   */
  readOnly?: boolean;
}) {
  const [editingNote, setEditingNote] = useState(false);
  /** Escape must not save. The field unmounts on cancel, and React does not
   *  guarantee a blur event on an unmounting node, so the flag is read by the
   *  blur we trigger ourselves rather than by a race. */
  const cancelNote = useRef(false);
  const canEditNote = !readOnly && !!onEditNote;
  return (
    <>
      <div className="pdf-railcard-badges">
        {concepts.map((concept) => (
          <span key={concept.id} className="pdf-railcard-chip">
            <button
              type="button"
              className="pdf-chip-open"
              onClick={() => onOpenConcept?.(concept.id)}
              title={`Open “${conceptNameText(concept)}” in your work`}
            ><ConceptName concept={concept} /></button>
            {!readOnly && (
              <button
                type="button"
                className="pchip-x"
                onClick={() => onUnfile?.(passage.id, concept.id)}
                aria-label={`Remove ${conceptNameText(concept)} from this passage`}
                title={`Remove “${conceptNameText(concept)}” from this passage. The passage stays.`}
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
            onClick={() => (onAddConcept ?? onOpenPassage)?.(passage.id)}
            aria-expanded={addConceptExpanded}
            aria-controls={addConceptControls}
            data-add-concept-for={passage.id}
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
        editingNote ? (
          /* WRITTEN HERE, not in Your work (TJ, 2026-08-19: "the passage rail
             card passage note should be editable in place"). Same contract as
             Your work's field in cards/PassageCard: uncontrolled, saved on
             blur, and keyed on the SAVED value so the optimistic write cannot
             go stale without fighting the caret.

             The height is FIXED, and that is the whole reason an inline field
             is safe here where the concept editor was not. The rails measure
             card heights and re-pack — railScale shrinks a crowded side — so a
             field that grew as you typed would move and rescale the very card
             under the cursor. This one changes the card's height once when it
             opens and once when it closes, which is the same event the
             add-concept editor already causes. */
          <textarea
            className="pdf-railcard-note-edit"
            defaultValue={passage.note ?? ""}
            key={passage.id + ":" + (passage.note ?? "")}
            placeholder="what struck you, what to come back to"
            aria-label="Note on this passage"
            autoFocus
            onBlur={(e) => {
              const cancelled = cancelNote.current;
              cancelNote.current = false;
              setEditingNote(false);
              if (!cancelled && e.target.value !== (passage.note ?? "")) {
                onEditNote?.(passage.id, e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // Stop here: the viewer listens for Escape to leave fullscreen
                // and to shut the sheet, and neither should happen because
                // somebody abandoned a note.
                e.stopPropagation();
                cancelNote.current = true;
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={`pdf-railcard-note${passage.note ? "" : " empty"}`}
            onClick={() => (canEditNote ? setEditingNote(true) : onOpenPassage?.(passage.id))}
            title={
              canEditNote
                ? "Write a note on this passage"
                : passage.note
                  ? "Open this passage in your work"
                  : "Write a note on this passage"
            }
          >
            {passage.note ? short(passage.note, 140) : "add a passage note"}
          </button>
        )
      )}
      {/* LAST, SMALLEST, AND IT ASKS (TJ, 2026-08-18: "we should add the small
          remove passage to the passage rail cards with the standard 'are you
          sure' type flow").

          The only act on this card that destroys anything, so it is set apart
          from the rest — the badges and the + are things you do to a passage,
          this ends it. Read-only hides it with the others: at zoom-out the
          controls are counter-scaled dots over a page thumbnail and a delete is
          one mis-click from a pan.

          The confirm is not local. useRemovePassage carries it, so this and
          Your work's button make the same promise about what goes. */}
      {!readOnly && onRemovePassage && (
        <button
          type="button"
          className="pdf-railcard-rm"
          onClick={() => onRemovePassage(passage)}
          title="Delete this capture. Its filings go with it; the concepts stay."
        >remove passage</button>
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
  onRemovePassage,
  onCreateConcept,
  onAddConcept,
  onEditConcept,
  onEditNote,
  draft,
  children,
}: {
  enabled: boolean;
  twoPage: boolean;
  passages: Passage[];
  concepts: Concept[];
  onOpenPassage?: (passageId: string) => void;
  /** Open Your work at a concept — the badge's destination. */
  onOpenConcept?: (conceptId: string) => void;
  /** Take one concept off this passage, in place. Changes nothing about the
   *  card's own height, so it cannot start a scale reflow — unlike opening the
   *  add-concept card below it, which does. */
  onUnfile?: (passageId: string, conceptId: string) => void;
  /** Delete the capture, after the shared confirm — see useRemovePassage. */
  onRemovePassage?: (passage: Passage) => void;
  onCreateConcept?: (label: string, def?: string) => Promise<Concept>;
  onAddConcept?: (passageId: string, conceptId: string) => Promise<Passage>;
  /** Fill a reused concept's empty description — see cards/AddConceptCard. */
  onEditConcept?: (conceptId: string, data: { def: string }) => Promise<void>;
  /** Write the passage's note from the card. Changes the card's height when it
   *  opens and closes, like the add-concept editor, and not while typing. */
  onEditNote?: (passageId: string, note: string) => void;
  /**
   * A capture in progress. Placed like any other card — the viewer has painted
   * a highlight on the selection under this passage's id, so the anchor sweep
   * below found it the ordinary way. See PdfViewer's DRAFT_ID.
   */
  draft?: { passage: Passage; card: React.ReactNode } | null;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const [passageCardHeights, setPassageCardHeights] = useState<Record<string, number>>({});
  const [activeAddPassageId, setActiveAddPassageId] = useState<string | null>(null);
  const restoreAddFocusFor = useRef<string | null>(null);

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

    // A page turn removes the originating highlight and therefore its rail
    // card. Close the adjacent editor in the same observer callback that
    // discovered that external DOM change, so it cannot reopen when the page
    // later comes back into view.
    setActiveAddPassageId((active) => active && !next[active] ? null : active);

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
      const nextPassageCards: Record<string, number> = {};
      for (const [el, id] of cardIdByEl.current) {
        const host = el as HTMLElement;
        next[id] = host.offsetHeight;
        nextPassageCards[id] = host.querySelector<HTMLElement>(".pdf-railcard")?.offsetHeight ?? CARD_FALLBACK_H;
      }
      setCardHeights((prev) => {
        const nk = Object.keys(next);
        if (Object.keys(prev).length === nk.length && nk.every((id) => prev[id] === next[id])) return prev;
        return next;
      });
      setPassageCardHeights((prev) => {
        const nk = Object.keys(nextPassageCards);
        if (Object.keys(prev).length === nk.length && nk.every((id) => prev[id] === nextPassageCards[id])) return prev;
        return nextPassageCards;
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
    // The draft packs into the rail with everything else — it is a card about
    // a passage, and the rail has no reason to treat it differently until it
    // is saved and becomes one of them.
    if (draft && anchors[draft.passage.id]) {
      out.push({ passage: draft.passage, concepts: [], anchor: anchors[draft.passage.id] });
    }
    return out.sort((a, b) => a.anchor.midY - b.anchor.midY);
  }, [enabled, passages, concepts, anchors, draft]);

  const closeAddConcept = useCallback((passageId: string) => {
    restoreAddFocusFor.current = passageId;
    setActiveAddPassageId(null);
  }, []);

  const toggleAddConcept = useCallback((passageId: string) => {
    setActiveAddPassageId((active) => active === passageId ? null : passageId);
  }, []);

  useLayoutEffect(() => {
    if (activeAddPassageId || !restoreAddFocusFor.current) return;
    const passageId = restoreAddFocusFor.current;
    restoreAddFocusFor.current = null;
    wrapRef.current
      ?.querySelector<HTMLButtonElement>(`[data-add-concept-for="${passageId}"]`)
      ?.focus();
  }, [activeAddPassageId]);

  const placement = useMemo(() => {
    const tops: Record<string, number> = {};
    const scales: Record<Side, number> = { left: 1, right: 1 };
    if (!wrapSize.h) return { tops, scales };
    for (const side of ["left", "right"] as Side[]) {
      const group = cards.filter((c) => c.anchor.side === side);
      if (group.length === 0) continue;
      const hs = group.map((c) => cardHeights[c.passage.id] ?? CARD_FALLBACK_H);
      // Centre the PASSAGE card, pack against the whole STACK. One number
      // until the add-concept card could open below the passage card; then
      // centring the stack lifted the passage card by half the editor's
      // height and the leader — which aims at the passage card's middle
      // (see the leader path below, which already uses passageCardHeights) —
      // came away bent. Measured at 1536: a 187.8px editor moved the card
      // 94px up off its own highlight.
      const ph = group.map((c) => passageCardHeights[c.passage.id] ?? CARD_FALLBACK_H);
      const s = railScale(hs, CARD_GAP, wrapSize.h);
      scales[side] = s;
      const placed = layoutRail(
        group.map((c, i) => ({
          // Ideal top puts the PASSAGE card's middle on the highlight, so the
          // leader stays horizontal whether or not the editor is open.
          id: c.passage.id,
          desired: c.anchor.midY - (ph[i] * s) / 2,
          h: hs[i] * s,
        })),
        wrapSize.h,
        CARD_GAP * s
      );
      for (const c of group) tops[c.passage.id] = placed[c.passage.id];
    }
    return { tops, scales };
  }, [cards, cardHeights, passageCardHeights, wrapSize.h]);

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
             * THE PASSAGE CARD ITSELF STILL EDITS NOTHING: the note and the
             * badges are doors to Your work, because cards are CSS-scaled when
             * a side crowds (`railScale` above) and a field inside this box
             * would loop — typing grows the card, the height changes the scale,
             * and the scale moves every card on the side including the one
             * under the cursor.
             *
             * The + is the exception, and it dodges the loop by construction
             * rather than by argument: its card mounts as a SIBLING inside
             * `.pdf-railcard-stack`, so the passage card's own height never
             * changes. The stack's does, which is why `passageCardHeights` is
             * measured separately for the leader line. The editor's fields are
             * fixed-height (`cards/AddConceptCard.module.css`: the textarea is
             * `min-height: 52px`, `resize: vertical`, and does not auto-grow),
             * so typing in it does not reflow the rail either. Opening and
             * closing it does — a known displacement, not yet fixed.
             *
             * So the card is no longer one door but three, and is therefore no
             * longer a `role="button"` with controls inside it — that was a
             * control within a control. The badges, the +, and the note are
             * each their own target.
             */
            <div
              key={id}
              ref={(el) => registerCard(id, el)}
              className="pdf-railcard-stack"
              data-add-open={activeAddPassageId === id ? "true" : undefined}
              data-draft={draft && id === draft.passage.id ? "true" : undefined}
              data-side={side}
              style={{
                top: placement.tops[id] ?? c.anchor.midY,
                transform: s < 1 ? `scale(${s})` : undefined,
                // Scaled cards hug the rail's inner edge, where the leader
                // line arrives.
                transformOrigin: side === "left" ? "top right" : "top left",
              }}
            >
              {draft && id === draft.passage.id ? draft.card : (<>
              <div className="pdf-railcard">
                <RailCardBody
                  passage={c.passage}
                  concepts={c.concepts}
                  onOpenPassage={onOpenPassage}
                  onOpenConcept={onOpenConcept}
                  onAddConcept={toggleAddConcept}
                  addConceptExpanded={activeAddPassageId === id}
                  addConceptControls={activeAddPassageId === id ? `add-concept-${id}` : undefined}
                  onUnfile={onUnfile}
                  onRemovePassage={onRemovePassage}
                  onEditNote={onEditNote}
                />
              </div>
              {activeAddPassageId === id && onCreateConcept && onAddConcept ? (
                <div id={`add-concept-${id}`} className="pdf-add-concept-host">
                  <AddConceptCard
                    passage={c.passage}
                    concepts={concepts}
                    onCreateConcept={onCreateConcept}
                    onAddConcept={onAddConcept}
                    onEditConcept={onEditConcept}
                    onClose={() => closeAddConcept(id)}
                    joined
                  />
                </div>
              ) : null}
              </>)}
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
            const h = (passageCardHeights[id] ?? CARD_FALLBACK_H) * s;
            const x2 = c.anchor.side === "left" ? RAIL_W : wrapSize.w - RAIL_W;
            return <path key={id} d={`M ${c.anchor.edgeX} ${c.anchor.midY} L ${x2} ${top + h / 2}`} />;
          })}
        </svg>
      )}
    </div>
  );
}
