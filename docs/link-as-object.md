# Should a Link be an object? — a design note

**Status: OPEN. Raised by TJ, 2026-08-09. Not built. TJ's ruling.**

This began as a vocabulary worry — *"I have concern that we are misusing Link
object and Link Label, which is a parameter of the object"* — and turned into a
question about the shape of the graph. It is written down here because the
answer changes a table, and because the reasoning is worth more than the
conclusion.

---

## 1. What the model says today

[loom-model-build.md](loom-model-build.md) §Link:

> **Link** = Beginning Concept + Ending Concept + Link Description [< 100 words,
> may be null] + Link Label [< 6 words, may be null].
> - Links live in a Cloth; directed (from → to); exactly two Concepts — **the
>   two Concepts are structural, not a tag**.

and §Thread:

> **Thread** = Concept 1 + Link + Concept 2 — subject–predicate–object; should
> read aloud as a sentence. **Backgrounded in the UI (a definition, not a
> surface).**

So **the Link holds the references and the Thread holds nothing.** A Thread has
no id, no table, no independent existence — it is the name for reading a Link
*aloud*. One `edge` row is both:

```
edge = { id, courseId, userId, fromId, toId, handle, sentence, createdAt }
         handle   = Link Label       (nullable, '' default)
         sentence = Link Description ('' default, not null)
```

The **Link List** (§Student) is therefore *derived*: there is no link-label
table, and `handle` is grouped case-insensitively wherever the vocabulary is
shown — `clothMath.recurringHandles()`, `VocabularyTab`'s `labelGroups`, and
(since 2026-08-09) `ThrowTab`'s coined-label chips.

## 2. The tension this creates

Two asymmetries, both noticed by TJ rather than by the code.

**A Concept may precede its evidence; a Link may not precede its Thread.**
Ratified 2026-08-08: naming an idea you expect to meet, glossing it, and *then*
reading for support is a first-class move. There is no equivalent for a verb.
You cannot coin "sets the terms for", say what you mean by it, and then hunt for
the pair it joins — because a Label with no Link has nowhere to live.

**Vocabulary half-lies.** §3 tab 4 promises "browse/filter Concepts (**full
objects**) and Link Labels". Concepts are full objects. Link Labels are grouped
strings.

## 3. The proposal (TJ, 2026-08-09)

> *"A Thread is Concept–Link–Concept, and it contains the references, correct?
> Not the link itself."* … *"Can't a Link have a description that is independent
> of the concepts it links? … My hunch is that a Thread will have its own
> description."*

Which yields three levels instead of two:

- **Link** — a User-level object spanning Cloths: **Label** + **Description**.
  The Description is *what I mean by this verb*: "sets the terms for" → "the
  first constrains what the second can even be, without causing it."
- **Thread** — lives in a Cloth: **Concept + Link + Concept + Description**. The
  Description is *the sentence about this pair* — today's `edges.sentence`.
- **Concept** — unchanged: Label + Gloss, with pointers to its Passages.

The symmetry that results is the argument for it:

| | User-level object | Its instances |
|---|---|---|
| **noun** | Concept = Label + Gloss | the Passages evidencing it |
| **verb** | Link = Label + Gloss | the Threads using it |

A Concept "has pointers to its Passages"; a Link would have pointers to its
Threads. Recurrence already means the same thing on both sides.

### The split that makes it work

**The Label is shareable; the Description is not.** "A boundary object holds
different meanings for each community without collapsing them" is about *those
two Concepts* and cannot be reused for another pair. So a shared Link carries
the Label and its own verb-gloss; the per-pair sentence must move to the Thread,
or every Thread reusing a Link inherits a sentence written about somebody else.

This is mostly **writing down a distinction the data already makes**: every
surface that shows the vocabulary groups by `handle` and treats `sentence` as
per-edge. Nothing today reuses a sentence across pairs.

### `linkId` must be nullable

The golden path is "connect first, describe when ready" and "naming not required
first" — a Thread can be thrown with a sentence and no label at all. That is the
`loose` / `beaten` distinction the UI already draws. So:

- **Thread with a Description and no Link** = today's unlabelled edge. Legal,
  common, and the normal starting state.
- **Coining the label** = creating (or reusing) a Link and attaching it.
- **Link with no Threads** = the new state this whole proposal exists to allow —
  a verb named ahead of its use. Exactly parallel to a Concept with no Passages,
  and it should be a designation, never a warning (red lines 1 and 7).

## 4. What it costs

### The migration is cheaper than it looks

Per [AGENTS.md](../AGENTS.md) §F the DB may keep the July names, so `edge` does
**not** have to be renamed to `thread`. The change is:

1. New `link` table: `{ id, userId, courseId, label, description, createdAt }`.
   **No unique constraint on label** — homonyms are warned, never forbidden, as
   with Concepts.
2. Backfill one row per distinct `(userId, lower(handle))` where `handle <> ''`.
3. Add `edge.linkId` (nullable, FK to `link`), backfill from the same key, then
   drop `edge.handle`.

`edge.sentence` stays exactly where it is and simply *means* Thread Description.

### What has to move in lockstep

- **The search index.** `edge_search_idx` is a GIN index spanning `handle`
  (weight A) and `sentence` (weight B), and the schema comment warns that "query
  side repeats this expression verbatim". After the split it becomes two
  indexes — `link(label, description)` and `edge(sentence)` — and both the index
  and the query must change together.
- **The export contract.** `types.ts` declares
  `edges: { id, fromId, toId, sentence, handle }[]`. It gains `links[]` and
  `edges[].linkId`. **Import must still read pre-split files** by synthesising
  Links from `handle` — the same move `import` already makes when it synthesises
  "Map 1" from a pre-maps file.
- **`mergeLinks` — and this one is not optional.** `mergeConcepts` exists
  because reuse-by-label sometimes fails and leaves two objects meaning one
  thing. Links-as-objects inherit that problem exactly ("leads to" /
  "leads towards"), and **there is no link merge anywhere in the codebase
  today**. Without it the Link List silts up, and the whole point of the change
  was to make that list trustworthy.
- Derived helpers become direct reads: `clothMath.recurringHandles()`,
  `VocabularyTab.labelGroups`, `ThrowTab`'s coined-label chips.
- The vocabulary Overlay counts Link Labels **by people** across a section.
  Links are per-user objects, so the comparison still matches on the label
  string, not on `linkId` — this gets no harder, but it does not get simpler
  either, and the code should say why.

## 5. The one design rule to hold

**Never prompt for the Link Description at throw time.** The golden path is
Description-before-Label *for the Thread*; adding a third writing task at the
moment of throwing would be ceremony, and worse, it would push a student to pick
a verb before they have said what they mean — the exact inversion the model
warns against.

The Link gloss belongs in **Vocabulary**, written when you *notice* you are
reusing a verb. That is the same surface and the same moment where Concept
glosses get sharpened. Null by default; most everyday verbs ("leads to",
"is part of") will stay null forever, and that is fine. The value is in the
coined ones.

## 6. What it buys

1. **A Link may precede its Thread** — the missing symmetry with
   *a Concept may precede its evidence*.
2. **Vocabulary stops half-lying** — Link Labels become the full objects §3
   already promises.
3. **A real teaching signal.** A student using "leads to" for both causation and
   mere sequence ends up with one Link whose gloss does not fit half its
   Threads. That is visible, countable, and *descriptive* — the tool shows it,
   it does not judge it.

## 7. Recommendation

**Do it, as its own phase, and only with `mergeLinks` in the same phase.**

The change is coherent, it resolves two asymmetries TJ found rather than
inventing a need, and the migration is additive except for dropping one column.
The risk is not technical: it is that Links-as-objects without a merge action
produces a vocabulary list nobody trusts, which is worse than the derived list
we have now.

**Not urgent.** Nothing shipped depends on it, and the derived Link List built
on 2026-08-09 is correct under the current model.

## 8. Open

- **Does a Link belong to the User or to the Course?** Concepts are User-level.
  A course-supplied starter vocabulary (the six `PLAIN_VERBS` in `ThrowTab`
  today) would argue for a course-level or seeded tier. Out of scope until
  asked for, but it is the obvious next question.
- **Do Links get recurrence designations** the way Concepts do (distinct
  Readings evidencing it)? A Link's Threads span Cloths, so the number exists.
  Whether it is worth showing is a judgement about what it would teach.
- Whether `edge` is eventually renamed to `thread` in the DB. Optional per §F;
  cosmetic; do it only if something else is already touching those rows.
