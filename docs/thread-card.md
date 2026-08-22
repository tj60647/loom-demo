# The thread card

**Status: plan, written 2026-08-18, executed in the commits it names.** Not
authority — `docs/loom-model-build.md` says what a Thread *is*. This says what
one should look like, and why the answer is not a free choice: two of the three
objects already have a card, and they set the shape of the third.

> TJ, 2026-08-18: "based on how the concept cards and the passage cards are set
> up, lets add a parallel 'thread card' to give some structure and consistent
> ui language."

## The rule the other two cards already state

`ConceptCard` and `PassageCard` are the same idea twice, and each says so about
the other:

- **Concept-first** — "the idea is the subject and its passages are the
  evidence under it" (`ConceptCard.tsx`).
- **Passage-first** — "the quotation is the subject, and the concepts it
  evidences are said about it … one is a passage with concept, the other is
  concept with passages" (TJ, 2026-08-13, quoted in `PassageCard.tsx`).

Both were written for the same reason, stated in `PassageCard`: *"the same
object was drawn three different ways in three places … each hand-rolled where
it was used, which is how they drifted."*

A Thread is drawn **six** different ways in six places. It is the object with
the most drift and the only one with no card.

## What a thread is drawn like today

Verified in the repo on 2026-08-18. Six row sites, two SVG drawings, one log,
one search hit.

| # | where | markup | shows | acts |
|---|---|---|---|---|
| A1 | 02 · Linking, `ThrowTab.threadRow` | `.thread` › `.trip` `.sent` `.tmeta` | ends (truncated 30), label-or-truncated-sentence, sentence, state pill | edit description · edit label · remove · undo |
| A2 | 03's reading pane, `ClothReflection.threadItem` (dark behind `SHOW_PROMPTS`) | `.readitem` › `.trip` `.sent` | ends, label-or-"description", sentence | none |
| A3 | 04 · Vocabulary, inside a Link Label | `.trip` + a `.defrow` input | ends, the label, sentence **as a field** | edit description |
| A4 | /admin/aggregate, `CohortClothPanel` | `.thread` › `.trip` `.sent` `.tmeta` | ends, label-or-"description", sentence, **author** | select |
| A5 | /admin/user/[id] | `.thread` › `.trip` `.sent` | ends, `.v` with `→`, sentence | none |
| A6 | search, `ShelfSearch` | `.searchhit` | `from —[label]→ to`, a snippet | navigate |

### The seven ways they disagree

1. **Two pill vocabularies for one fact** — `.v`/`.v.loosev` (A1, A5) and
   `.vpill`/`.vpill.loosev` (A2, A3, A4), defined separately in globals.css and
   near-identical.
2. **Three fallbacks for an unlabelled thread** — the truncated sentence (A1),
   the literal word "description" (A2, A4), and `→` (A5).
3. **A5 mislabels every loose thread.** It puts `→` inside the *solid* `.v`,
   which is the beaten-thread pill, so a thread with no label reads as
   labelled. It also drops the `<b>` on both ends and the quotation marks on
   the sentence — three departures in one nine-line block.
4. **`handle` vs `linkId`.** Every renderer branches on `e.handle` alone. Only
   04's grouping resolves through `linkId`, via `usesOf`. A thread carrying a
   `linkId` and an empty legacy `handle` renders as *unlabelled everywhere
   except 04*. `labelOf(edge, links)` in `src/lib/linkResolve.ts` is the one
   right answer and is called by nobody who draws a row.
5. **Name truncation** — `short(…, 30)` in A1 only; full names everywhere else.
6. **Attribution** exists only in A4.
7. **`.tmeta` has two jobs** — the acts on 02, the author on /admin/aggregate.

## The card

`src/components/cards/ThreadCard.tsx`, beside its two siblings.

**Relation-first.** The two concepts are the ends, and the description is the
substance — "the description IS the thread", which this repo says in four
places. So the head is the trip and the body is the sentence, which is the
order all six sites already use. The card is not a new arrangement; it is the
best of the six, made the only one.

### Anatomy

```
.thread  [data-edge-id]                 ← the root, one per thread
  ├─ .trip     from · label pill · to   ← identity
  ├─ .sent     "the description"        ← substance — A DIRECT CHILD, see below
  └─ .tmeta    state pill · by · acts   ← what it is, whose it is, what you may do
  └─ .distill  (edit mode, one fold at a time)
```

### Modes

- **`read`** — shown, never changed. A2, A4, A5.
- **`edit`** — 02's row: the two folds and the remove. A1.

Selection (`selected` + `onSelect`) and attribution (`by`) are **props, not
modes** — A4 needs both on a read card, and neither is a different card.

**`compact`** (added 2026-08-22) is the same: a prop, not a mode. It withholds
`.sent`, and the caller that sets it also stops passing `by` — so the card
reduces to `.trip` plus `.tmeta`'s state pill. The Cohort Graph's Threads
panel is the only user: it is a 316px list of every thread in the course,
scanned to find one, and a description on each made a wall (TJ, 2026-08-22:
"the thread cards need to be simpler, jsut show the thread, not description or
contributor, that will show up below when selected"). The sentence and the
student are shown in that page's read-out when a card is picked.

The state pill is NOT optional under `compact`. It is the invariant the card
exists to hold, and it is what the cloth's solid-vs-dashed arcs agree with.

### What it fixes by existing

- One pill vocabulary: `.v` in the trip, `.pill` in the meta. `.vpill` is left
  where non-thread callers still use it.
- One fallback for unlabelled: the label pill is simply **absent**, and
  `.tmeta`'s pill says `description`. No `→`, no word standing in for a label,
  no truncated sentence pretending to be one.
- **`labelOf(edge, links)`** — the card resolves the Link object first and the
  legacy string second, so a `linkId`-only thread is labelled everywhere.
  `links` is optional and defaults to `[]`, which is exactly what
  /admin/user/[id] has and gives the legacy fallback for free.
- Ends are never truncated. A1 truncated to 30 because the column is narrow;
  the card wraps instead, as `ConceptCard` does with a concept name.

### The spine

`.ywcard.ywpassage` is highlighter yellow, `.ywcard.ywconcept` is `--ochre`.
The palette already names the third: `--sage: #6f7d5c; /* weft — beaten
(distilled) threads */`. `.ywcard.ywthread` takes sage. No colour is invented
and the cloth's own legend already teaches it.

## What must not break

Eight assertions across three specs bind to this markup, and two hazards make a
green suite worthless if they are ignored.

**Load-bearing — kept verbatim:** `.thread` on the root (exactly one per
thread; `sandbox.spec.ts:77` is an exact page-wide count), `.sent` as a
**direct child** of it, `.pill` with the text `label`/`description`, `.act`
containing "edit label", `.rm` containing "remove", exactly one `.v` per row
matching the handle, `.distill` for the fold, `.verbchip.borrowed`, the button
name "Save label", the dialog button "Remove thread", and the label input's
placeholder character-for-character.

**Hazard 1 — the parent hop.** `journey-learner:192` and `link-object:79`/`159`
take `page.locator(".sent").locator("..")` as their handle on the row. Any
wrapper between root and sentence breaks eight assertions at once. The card
adds `data-edge-id` (mirroring `data-concept-id` and `data-passage-id`) and
those three hops are rewritten to use it **in the same commit** — the classes
stay, so nothing goes vacuously green.

**Hazard 2 — vacuous passes.** Three assertions are `toHaveCount(0)` and one is
a `count() === 0` early return. Renaming `.sent` or `.distill` makes them pass
by matching nothing. So every spec touched here is proved to FAIL against a
deliberately broken card before it is kept, as `tests/pair-and-throw.spec.ts`
was.

## Order of work

1. **`ThreadCard`, and 02 · Linking draws it** — the richest site, so the card
   is proved to carry every act a thread has. Adds `data-edge-id` and rewrites
   the three parent hops.
2. **The read-only lists draw it too** — /admin/user/[id] (which is the one
   that is currently wrong), /admin/aggregate, and 03's reading pane.
3. **A spec for the card**, in the read-only project.

## Deliberately not converted

- **A6, the search hit.** `.searchhit`/`.searchhithead`/`.searchsnip` is the
  search panel's own language, shared by readings, concepts and links, and its
  "sentence" is a server-side `ts_headline` snippet rather than the sentence.
  A card there would make a thread hit look unlike its neighbours, which is the
  opposite of the point.
- **The SVG arcs and the capture log.** Neither is a card; both draw a thread
  as a mark in a picture or a line in a record.
- **A3, 04 · Vocabulary.** Its rows are *inside a Link Label*, the label is
  therefore known and shown by the parent, and its sentence is an editable
  field rather than a quotation. Converting it means deciding whether the label
  is said twice, which is a question for TJ rather than a refactor. Named here
  so the omission is a decision and not an oversight.
