# Add Concept card

**Status: shipped 2026-08-18, ungated, in both of its homes.** This file was a
proposal ("Add Concept card — interaction prototype") until the surface landed;
it is now a record of what exists. Where the two disagreed, the code won and
this document was rewritten to match it — the divergences are named in
[What the proposal asked for and did not get](#what-the-proposal-asked-for-and-did-not-get)
rather than quietly dropped.

## The problem it solved

The `+` on a passage card used to open **Your work**, switch it to the Passages
view and scroll to the passage. The requested act is smaller: file this passage
under one more Concept while remaining beside the text.

The model makes the subject clear. A Passage has Concept pointers `[0..n]`, and
Concept identity belongs to the User rather than to one Reading
([loom-model-build.md](loom-model-build.md), §2). This surface therefore starts
from a Passage, searches the User's whole vocabulary, and either reuses one
object or coins one new object before adding the pointer.

## Where it appears

`src/components/cards/AddConceptCard.tsx`. One component, three hosts, opened by
the `+` on a passage card:

| Host | Where | Geometry |
| --- | --- | --- |
| `ConceptRail` | page mode, in the margin | `joined` — welded under the passage card |
| `SpreadCanvasView` | Canvas | `joined`; see the two thresholds below |
| `PassageCard` (`mode="edit"`) | Your work's passage card | standalone, inside the card |

It moved out of `src/components/pdf/` and lost `Rail` from its name when Your
work adopted it. **It is not the rail's.**

`joined` is opt-in because the two homes want opposite things. Beside the page
there is one passage card and its editor is the second half of one object, so
the two are drawn as one: `margin-top: -1px` pulls the two 1px borders into a
single shared line, the editor's top corners square, and the passage card's
bottom corners are squared to match by the `[data-add-open]` rule in PdfViewer's
sheet. In Your work the list is already a column of boxes, so a welded edge
would read as the next row rather than as part of this one; there the default
7px margin and full 4px radius apply.

**On Canvas there are two thresholds, and the gap between them is the point.**
`READ_ONLY_RATIO` (1.05) is where the card's own controls go, because past one
page width you are reading a map. `EDITOR_CLOSE_RATIO` (1.6) is where an open
editor is torn down, and it is deliberately far away: d3's wheel step here is
`2^(-deltaY * 0.002)` = 0.871 for one 100px notch, so one notch multiplies the
ratio by 1.149 and it takes three deliberate notches to cross 1.6. With one
threshold it took exactly one, and the editor went with whatever had been typed
into it. Between the two ratios the card offers no `+` and no `×`, but an editor
already open stays open.

## What the card contains

1. A **Concept label** field (`aria-label="Concept label"`), autofocused on
   open, backed by a native `<datalist>` of every concept the student owns.
   Blank labels are filtered out of that list — an `<option value>` is what
   lands in the field and is then matched to reuse or coin, so a placeholder
   there would mint a Concept literally named "(unlabeled concept)".
2. A **Concept description** textarea (`aria-label="Concept description"`),
   `rows={2}`, fixed at `min-height: 52px` with `resize: vertical`. It does not
   auto-grow — that is what keeps typing in it from reflowing the whole rail.
3. One submit button, whose caption says which act it will perform:
   **create + add to passage** or **add to passage**.
4. A close `×`, and an inline `role="alert"` error.

There is no Cancel button, no quotation of the passage, and no separate
description row — the description belongs to the concept block.

## Behaviour

| State | What happens |
| --- | --- |
| Open | The label field takes focus. The datalist offers the whole vocabulary, sorted. |
| Exact label match | Case-insensitive, trimmed, against every concept the User owns. Selecting reuse, not copy — the caption flips to **add to passage**. |
| Match with a description | The matched concept's Description autofills the textarea. Changing the label to a non-match clears it again. |
| Empty label | Matches **nothing**, deliberately. A Concept may carry a Description and no Label, so an unguarded match on `""` would resolve to the first label-less Concept and borrow its words. |
| Already filed | Submit is disabled and both fields carry `title="Already on this passage"`. The refusal is pre-emptive, not a dialog after the press. |
| Commit | The card closes and focus returns to the `+` that opened it. |
| Dismiss | `Escape`, the `×`, or pressing the `+` again. No write occurs. |

`Escape` calls `stopPropagation`. It has to: both of the viewer's keydown
listeners are on `window` in the bubble phase, and the sheet's deliberately lets
Escape through from inside itself ("Escape is the one key that gets out"), so
without it one press dismissed this card **and** the whole Your work panel —
against the rule PdfViewer states three lines above: *One Escape, one thing*.

Only one card stands open at a time in Your work. Several open editors in a
scrolling column is a form, not a card.

## The write path

- **Coin**: `addConcept(label, def?)` → `createConcept`, which records a
  `concept.create` event carrying the reading it was named in.
- **Reuse**: no write to the concept, unless it has **no** Description and one
  was typed — then `editConcept(id, { def })`. Fill-if-empty, never overwrite,
  which is the rule the other two doors into `addConcept` already keep
  (`CaptureModal`, `OpenTab`: *"the gloss never overwrites what you wrote
  before"*).
- **File**: `refilePassage(passageId, conceptId)` — additive by ruling 37; the
  passage gains a pointer, no row is copied. The server throws
  *"Already filed under that concept."* if it is reached anyway.

A Concept with a Description and no Label is legal (TJ, 2026-08-18: *"a concept
needs either or both a description and a label"*), so a description-only submit
is a real act, not an accident. Such a concept renders as **(unlabeled
concept)** in `--ink-soft` everywhere it appears — see `src/lib/conceptName.ts`.

## What it deliberately does not do

It does not edit the Passage note, remove filings, delete the Passage, switch
between Passages and Concepts, or browse the whole Reading's work. Those remain
acts of their existing homes.

It is **not** offered from Concept-first evidence lists. `PassageCard` in `read`
mode — which is what a Concept card renders its evidence with — never mounts it.
Read from that end the act would be "add passage to concept", and there is
nothing there to add: the passages are in the text.

## What the proposal asked for and did not get

Named because a document that quietly drops its own specification teaches the
next reader to trust it less.

| Proposed | Shipped |
| --- | --- |
| A short quotation identifying the Passage | **Absent.** The card is attached to the passage card, which is the quotation. |
| Matching concepts showing Description and evidence count | **Partial.** A native `<datalist>` — labels only, no descriptions, no counts, and its presentation is the browser's. |
| Recently-used Concepts offered with no query | **Absent.** The list is alphabetical, whole. |
| An explicit secondary path to coin a homonym | **Absent**, and this is the sharpest gap. An exact case-insensitive match always reuses, so a homonym cannot be coined here at all. [loom-model-build.md](loom-model-build.md) §2 is explicit: *"Distinct Concepts may share a Label (homonyms) — warn at coin-time, don't forbid."* `OpenTab.handleAddConceptOnly` warns and offers "Make a homonym"; this card forbids by omission. |
| A collapsed naming aid that appends words from the Passage | **Absent.** `ConceptNamingAssist` is still capture-only. |
| Click-outside dismissal | **Absent.** Escape, `×`, or the `+` again. |
| "Create and add" | Reads **create + add to passage** / **add to passage**. |

## Coverage

`tests/add-concept-card.spec.ts` — the `+` opens the margin card and **not** the
sheet, opening it moves the passage card less than 12px, a concept is coined and
its chip lands on the card, a concept already filed disables the commit while
the caption flips to reuse, and Escape dismisses without writing.

Note that `concept-rail.spec.ts` presses the **badge** (`.pdf-chip-open`), which
still opens Your work and is a different door.

## The flow diagram

`src/lib/workflows.ts` names both doors on the student flow's `file` step:
*"01 · Reading — the card beside the passage, or Your work slid out over the
text."* No step, gate, route or order changed when Your work adopted the card —
the same act is offered in the same two places by a different control.

## History

| Commit | |
| --- | --- |
| `29aceab` | the card, behind a `NODE_ENV` + `?prototype=` gate |
| `13ca95c` | three defects in what it wrote: a description bleeding between concepts, an empty label matching label-less concepts, a typed description dropped on reuse |
| `1a53eb8` | the gate removed — the `+` just opens the card |
| `3611cb6` | joined to its passage card instead of floating below it |
| `bce411f` | the wheel-notch threshold, the card's drift off its highlight, the page-mode pan guard, and the spec above |
| `590facf` | Your work adopts the same `+` and the same card; the component moves to `cards/` |

The seven `add-concept-card-prototype-*.png` screenshots beside this file
predate all of it and show the gated prototype. They are stale.
