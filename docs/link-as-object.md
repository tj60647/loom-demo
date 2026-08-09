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

**Vocabulary half-lies.** The model's §3 tab 4 promises "browse/filter Concepts (**full
objects**) and Link Labels". Concepts are full objects. Link Labels are grouped
strings.

## 3. The UI already has pre-existing Links — it just cannot store them

TJ, 2026-08-09: *"the UI includes sample links that don't know what the
concepts to be linked are, correct? The idea of pre-existing links is there."*

Correct, and it predates this discussion. Coining a label offers **two rows of
links with no Concepts attached**:

- `PLAIN_VERBS` (`ThrowTab.tsx:11`) — six app-supplied verbs: *leads to ·
  depends on · is part of · goes against · is the same as · sets up*.
- **"Labels you have coined before"** — the student's own, added 2026-08-09.

Both are presented as *a vocabulary you pick from before any pair is settled*,
which is the Link-as-object affordance exactly. But tapping one runs
`pickWord(word)` → `setNameDraft(word)`: it **copies a string into a text
field**. There is no identity behind the chip, and `handleSaveName` writes that
text into `edge.handle`.

Three consequences, and they are the strongest part of the argument:

1. **This makes the change a formalisation, not a new abstraction.** The main
   risk in a model change is inventing a concept the users do not have. This one
   is already on screen — a pre-existing link, unattached to Concepts, that you
   reach for and apply. Only the storage is missing.
2. **What is missing today is precisely the Link Description.** Six verbs
   offered with no gloss anywhere. A student taps "leads to" with no account of
   what it means — and "leads to" is the exact verb that gets used for both
   causation and mere sequence. The field §4 proposes is the hole in what has
   already shipped.
3. **Copy-by-string is why the vocabulary cannot be trusted.** Two uses of
   "leads to" are unrelated rows coinciding only by a `lower(handle)` match, so
   *"leads to"*, *"lead to"* and *"leads to "* are three separate entries in the
   Link List, silently. That is the same failure `mergeConcepts` repairs on the
   noun side, happening today on the verb side with nothing to repair it.

## 4. The proposal (TJ, 2026-08-09)

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

## 5. What it costs

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

## 6. Merge, and the rule that keeps it honest

TJ, 2026-08-09: *"I want to be careful with the mergeConcepts and the
mergeLinks. These could be making decisions on the student's behalf and I want
to avoid that."*

Right to raise, and the current merge survives the test — but the reasoning
matters more than the verdict, because it is the rule any link merge inherits.

**`mergeConcepts` decides nothing today.** `VocabularyTab.handleMerge` makes the
student type the concept to keep; if the name matches nothing it **refuses
rather than guesses** ("No concept by that name"); it confirms destructively
with the consequence stated plainly — *"Every passage and thread of the first
will point at the second, and the first goes away. There is no unmerge."*
Nothing in the codebase proposes a merge, ranks candidates, or detects
duplicates. It is a tool the student picks up, not advice they receive.

Two holes found while confirming that, both written up in
[naming-decisions.md](naming-decisions.md) §1: `recordEvent` is best-effort, so
a merge can succeed while its provenance row does not; and merge resolves its
target **by label**, so with two legal homonyms named "framing" it silently
picks the first and the confirm — which renders `target.label` — cannot tell the
student which one it is about to absorb. A link merge must not inherit that:
**pick by object, not by label string.**

### The rule

> **Merge is always student-initiated and never suggested. The tool may show
> that two labels coincide; it may never say that they *should* be one.**

Counting is allowed — the Link List can show that "leads to" appears eleven
times and "lead to" twice, because that is a fact about the text of the labels.
The inference that those are one verb is the student's, and so is the act.
A "3 possible duplicates" badge would be judging (red line 3), and an
auto-merge would be deciding what the student meant (red line 2).

### Prevention beats repair — which revises §5

An earlier draft of this note said `mergeLinks` was **mandatory**. That was
overstated, and TJ's concern is what exposes it.

The reason near-duplicate labels accumulate today is that tapping a chip runs
`pickWord(word)` → `setNameDraft(word)`: it **copies a string into a text
field** (§3). So *"leads to"*, *"lead to"* and *"leads to "* become three
entries with nothing relating them. Under the object model a chip can attach a
**`linkId`** instead — choosing the object rather than copying its name — and
the duplicates largely stop being *created*.

That matters for exactly the reason TJ raised: **prevention decides nothing for
anybody; repair always risks it.** Merge should be a rarely-needed escape hatch,
not load-bearing cleanup. It is still wanted — a student who free-types a label
they have used before will still make a near-duplicate, and a genuine change of
mind ("I have been using two verbs for one relation") needs somewhere to go —
but it is no longer the thing the design leans on.

**So: build tap-to-attach with the object model, and `mergeLinks` after, if the
vocabulary actually silts up.** That ordering is also cheaper.

## 7. The one design rule to hold

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

## 8. What it buys

1. **A Link may precede its Thread** — the missing symmetry with
   *a Concept may precede its evidence*.
2. **Vocabulary stops half-lying** — Link Labels become the full objects the
   model's §3 already promises.
3. **A real teaching signal.** A student using "leads to" for both causation and
   mere sequence ends up with one Link whose gloss does not fit half its
   Threads. That is visible, countable, and *descriptive* — the tool shows it,
   it does not judge it.

## 9. Recommendation

**Do it, as its own phase, with tap-to-attach in the same phase and
`mergeLinks` deferred until the vocabulary is observed to silt up.**

The change is coherent, it resolves two asymmetries TJ found rather than
inventing a need, the affordance is already on screen (§3), and the migration
is additive except for dropping one column. The risk is not technical: it is
that Links-as-objects **without tap-to-attach** would keep minting near
-duplicates by string copy, and a vocabulary list nobody trusts is worse than
the derived list we have now. Merge is the repair for that; attaching the object
is the prevention, and prevention is the half that cannot decide anything on a
student's behalf (§6).

**Not urgent.** Nothing shipped depends on it, and the derived Link List built
on 2026-08-09 is correct under the current model.

## 10. Open

- **Does a Link belong to the User, the Course, or the app?** Concepts are
  User-level. `PLAIN_VERBS` is none of those three today — it is **hardcoded in
  a component** (§3), which is why the question has never had to be answered.
  Under the object model it does: the six starters become seeded Links, and the
  choice is between a shared read-only tier and **a per-user copy at first
  use**. Per-user fits everything else — Concepts are User-level, merge operates
  at user level, and a student who can write their own gloss on "leads to" is
  doing the exact work this change exists to enable. A read-only tier cannot be
  glossed, which forfeits most of the value.
- **Do Links get recurrence designations** the way Concepts do (distinct
  Readings evidencing it)? A Link's Threads span Cloths, so the number exists.
  Whether it is worth showing is a judgement about what it would teach.
- Whether `edge` is eventually renamed to `thread` in the DB. Optional per §F;
  cosmetic; do it only if something else is already touching those rows.
