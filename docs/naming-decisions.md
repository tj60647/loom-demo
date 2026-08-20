# Where the tool decides what the student meant — the naming paths

**Status: CLOSED. Raised by TJ, 2026-08-09, and ruled the same day.** §1's
homonym hole and §3's trim bug were defects, not decisions, and were fixed with
Phase 0 of [open-work.md](open-work.md). **§2 and §4 were TJ's calls and are now
ruled and built** — see §2a and §4a below for what shipped and why.

> **§2 — the offer, not the verdict and not the question.** All three capture
> paths now render one shared component, `ReuseOffer`. It fires only when the
> concept was already evidenced in a **different** reading, says so, and offers
> *"Not the same idea? Make it a separate concept."* The PDF path — the busiest
> — carries it inside the capture toast rather than as its own card, because TJ
> ruled that path the quieter of the two.
>
> **§4 — the Source field is a Citation field.** The override was never real, so
> the promise is gone rather than the field. It is named for the job it actually
> does, and the filing it never mentioned is now stated: *"Filed under <the
> reading> — the reading you have open."*

Red line 2 (`loom-model-build.md` §6, binding):

> The tool never decides what a student meant — ambiguity is resolved by asking.

TJ, in the context of merge: *"these could be making decisions on the student's
behalf and I want to avoid that."* Merge turned out to be the clean one. This
note is what the check turned up instead.

**On provenance:** §§1–4 below were each read in the source and are quoted from
it. §6 is a list of leads from a sweep that I have **not** verified line by
line — it is written as leads, not findings, and one claim in it was overstated
badly enough to be worth correcting in place (§5).

---

## 1. Merge is clean — and it is worth saying why

`VocabularyTab.handleMerge` makes the student **choose** the concept to keep
(a text field until 2026-08-09, see the second caveat below); it refuses rather
than guesses when nothing is chosen; the confirm is `danger: true` and states
the consequence — *"Every
passage and thread of the first will point at the second, and the first goes
away. There is no unmerge."* Nothing in the repo proposes, ranks or detects a
merge candidate.

So the rule to preserve, and to bind any future `mergeLinks`
([link-as-object.md](link-as-object.md) §6):

> **Merge is always student-initiated and never suggested. The tool may show
> that two labels coincide; it may never say that they *should* be one.**

Two caveats found while confirming it:

- **`recordEvent` is best-effort.** `loom.ts` wraps the insert in `try/catch`
  and only warns, so a merge can succeed while its provenance row does not.
  Fine as a design (the graph tables are the source of truth) but it means the
  Capture Log is not a guaranteed record of a destructive act.
- **Merge resolved its target by label — among homonyms the model explicitly
  permits. FIXED 2026-08-09.** It matched with
  `state.concepts.find(c => c.label.trim().toLowerCase() === …)`, which returns
  the *first* match. Homonyms are a ratified legal state and `updateConcept`
  says outright that "identity is by object, not label string" — so with two
  concepts named "framing", merge silently absorbed one, and the confirm
  renders `target.label`, **identical for both**, so the dialog could not even
  say which. The fix was not a better lookup: asking for a *label* to identify
  an *object* was the bug. The field is now a **picker holding concept ids**,
  and homonyms carry their passage count, because that is the only thing on
  screen that tells two of them apart and the act is not recoverable.

## 2. The three naming paths disagree

| Path | On a label you already have |
|---|---|
| `OpenTab.handleAddConceptOnly` — name a concept ahead of evidence | **Asks** — "Make a second, distinct concept with the same name?" (but see §3) |
| `OpenTab.handleAddPassage` — capture by hand | **Joins silently**, then a post-hoc note |
| `CaptureModal.handleCapture` — capture from the PDF, **the main path** | **Joins silently**, no note |

`findConcept` matches `label.toLowerCase()` across the whole graph. So typing
"boundary objects" in a second reading — where you may well mean a different
sense — is resolved **by string match, not by asking**.

The by-hand path's note does not soften it, because it asserts the decision
rather than offering it: *"This passage joins its evidence there; **it is one
concept, not two.**"* And it only fires when the concept was met in a
*different* reading, which is the right trigger — that is exactly where the
ambiguity lives.

**The proposed fix is not "ask every time."** Most of the time it really is the
same concept, and that reuse is the move the course teaches. Turn the existing
note from an assertion into an offer:

> This passage joins the **boundary objects** you named in *Wenger*.
> Not the same idea? — **Make it a separate concept**

No friction in the common case, no data loss, and the student holds the
decision. The PDF path needs the same note, which it has never had.

## 2a. What shipped (2026-08-09) — and the two arguments that decided it

`src/components/ui/ReuseOffer.tsx`, rendered by **both** capture paths, so they
can no longer drift apart. Trigger unchanged from the hand path's existing one:
`metElsewhere.length > 0`, computed **before** the passage lands so the capture
does not count itself as prior evidence.

**Against asking (a blocking confirm), which was the obvious alternative:**
cross-Reading Concept recurrence is the v1 substrate the model names (§1), so a
dialog that fires on recurrence and not on novelty teaches that recurrence is
the exceptional case. It is the goal.

**Against leaving it silent:** the datalist defence — "they picked the label off
a list, so they chose it" — does not hold. `CaptureModal`'s datalist offers
**every** concept undifferentiated, so nothing on screen distinguishes one made
in this reading from one made three weeks ago in another.

Two details worth not re-deriving:

- **A toast carrying a decision does not count down.** The plain capture toast
  clears after six seconds; with an offer in it, the timer is not started. A
  choice that expires is a choice made for you.
- **Separating MOVES the gloss it borrowed.** If this capture is what filled the
  reused concept's empty Description, that sentence was written about the *new*
  idea — so the split gives it to the new concept and clears it from the old.
  It never touches a Description the student wrote earlier. `ReuseOffer` gets
  `filledDescription` for exactly this, empty in the common case.

Guarded by `tests/reuse-seam.spec.ts`: the offer appears across readings, does
**not** appear for a second passage in the same reading, and taking it leaves
two same-label concepts holding one passage each.

## 3. A real bug: the homonym confirm can be skipped by a trailing space — **FIXED 2026-08-09**

`OpenTab.handleAddConceptOnly` matches **untrimmed** and writes **trimmed**:

```js
// the input is bound raw: value={newConceptOnly}
const existing = state.concepts.find(
  c => c.label.toLowerCase() === newConceptOnly.toLowerCase())   // ← not trimmed
if (existing) { /* ask: "Make a homonym?" */ }
await addConcept(newConceptOnly.trim(), …)                        // ← trimmed
```

Type `"boundary objects "` against an existing `"boundary objects"`: the match
misses, **no confirm fires**, and a second concept is minted with a
byte-identical stored label. Silently, at the exact gesture designed to ask.

A trailing space is what a paste leaves, and what tapping a suggestion chip can
leave. **Fix: trim once, at the top of the handler, and compare the trimmed
value** — the same trim the write already does.

(Same line: `if (!newConceptOnly) return` admits `" "`, and `createConcept` does
not validate, so an empty-label concept is insertable. Same one-line cause.)

## 4. The Source field promises an override it does not have

`LoomProvider.addPassage`:

```ts
const stampedSourceId = sourceId ?? soleSourceId(scope) ?? undefined
```

A hand capture stores the typed citation in `passage.source` (free text) and sets
`passage.sourceId` — the field **every lens actually reads**: `scopedGraph`, the
per-reading tallies, the overlays, the export anchors — from the open reading.

The interface says otherwise. The Source label reads *"(this reading, **unless
you say otherwise**)"*, and the capture help says the passage "may be quoting
someone else". Saying otherwise changes the citation string and **not** the
attribution.

It is also effectively permanent: `attributePassages` is the only writer of
`passages.sourceId` and it is guarded by `isNull(passages.sourceId)`, so an
already-stamped passage can never be re-attributed. Deleting it is the only
escape.

Worth noting the stamp is usually *right* — you are typing a passage while
reading that text. The defect is the promise, so the fix is a choice: either
honour the override, or stop offering it. Both are TJ's call, and the second is
one string.

## 4a. What shipped (2026-08-09) — and why NOT "honour it"

The field is now **"Citation — author, work"**, with no "unless you say
otherwise", plus a line naming the filing: *"Filed under <reading> — the reading
you have open. The citation travels with the passage and may name someone else;
the filing follows the reading."* `CaptureModal`'s read-only twin says
"Citation" too — and "Source" was a July word anyway (the vocabulary map has
`sources` = **Readings**).

**Honouring the override was rejected on three grounds**, and the third is the
one that settles it:

1. There is no route from free text to a `sourceId`. "Suchman, *Plans and
   Situated Actions*" is not a reading id, so the field would have to become a
   picker over the shelf — a different field with a different meaning.
2. It would have to respect `createPassage`'s `sourceId` authorization (added
   2026-08-09), so the picker must be shelf-scoped.
3. **Which defeats the case that motivates the field.** The whole point of
   "this passage may be quoting someone else" is that the quoted work is *not*
   on your shelf. A picker cannot express it; a citation string can.

So the interface now states what it does. That is strictly more than the old
label offered — a student previously could not see where their passage was
filed at all.

## 5. A finding I am correcting rather than passing on

The sweep flagged `resolveActiveCourseId` as "HIGHEST — data destruction of
student prose", because it deletes `cloth` rows. Read in full, that is
overstated:

- it fires **only** on rows with a **null `courseId`**, which are
  pre-course-scoping legacy rows — a modern deployment has none;
- it deletes **only** on a collision, where a properly scoped cloth for the same
  `scopeKey` already exists, and it keeps the scoped one;
- the comment explains the alternative — a blind `UPDATE` — would violate a
  unique constraint and "wedge the student out entirely", at the top of *every*
  action.

So: a narrow legacy migration whose alternative is worse, not a general
behaviour. Recorded here because the overstatement is instructive — a sweep that
ranks by mechanism alone will call a migration path a catastrophe.

## 6. Leads, not findings — unverified

Flagged by the sweep, plausible, **not read closely enough by me to assert**.
Each deserves its own look before anyone acts:

- **`ThrowTab`'s `crossed` suppression.** The shuttle will not offer a pair
  already linked *anywhere*, using `state.edges` while drawing from
  `scoped.concepts`. Since 2026-08-09 those other-reading threads are
  deliberately not shown here — so the pair is withheld for a reason the student
  cannot see. Nothing stops linking the pair by hand, so it is an opinion rather
  than a constraint. If real, the fix is to offer the pair *and say* "you linked
  these in *Star & Griesemer*" — which is the recurrence the course teaches.
- **Import re-scopes a Projection to the whole weave** when its readings do not
  resolve, reports skipped cards but not the re-scoping, and there is no way to
  move a projection between scopes afterwards.
- **Import drops blank-label concepts and dangling links**, then Keep's confirm
  reports the *post-drop* counts as the file's contents.
- **`mapKit.ts`** prints "CONCEPTS (busiest first — the top few are your primary
  candidates)" and "A POSSIBLE ARMATURE (your largest chain…)". That is
  degree-ranking with an interpretive gloss, in a student-facing export. Red
  line 3 says counted, never judged — this is the sharpest test of it in the
  repo.

## 7. Recommendation

1. ~~Fix §3~~ — **done 2026-08-09**, along with §1's homonym hole.
2. **Rule on §2** — the offer-not-assertion change, and giving the PDF path the
   note it never had. This is a behaviour change on the busiest path in the app,
   which is why it is written down rather than done.
3. **Rule on §4** — honour the Source override, or stop promising it.
4. **Fix §1's homonym hole** whenever merge is next touched: pick by object, not
   by label, or disambiguate in the dialog.
5. **Verify §6 before believing it**, and treat `mapKit.ts` as the one most
   likely to be a genuine red-line-3 problem.
