# Open work — the order to take it in

**Written 2026-08-09, after a day of TJ's rulings.** Everything here is recorded
in more detail somewhere else; this file is only the *sequence*, and the reasons
for it. Where a line says "TJ's call", it is not a nag — it is a fork the work
cannot pass without an answer.

The ordering principle: **fix what is wrong before building what is missing, and
do not build anything that a pending ruling could throw away.** One ruling (05
Weave) gates four items; taking it first is worth more than any code below it.

---

## Phase 0 — defects. **DONE 2026-08-09**

Four things that are simply wrong. None needs a decision, none is more than a
few lines, and each is currently costing something.

| # | What | Where | Size |
|---|---|---|---|
| 0.1 | **The trim bug.** `handleAddConceptOnly` matches the label **untrimmed** (`:191`) and writes it **trimmed** (`:207`), so `"boundary objects "` misses the homonym confirm entirely and silently mints a duplicate with a byte-identical stored label — at the exact gesture designed to ask. A trailing space is what a paste leaves. | `OpenTab.tsx` | 1 line |
| 0.2 | **Merge picks among homonyms by label.** `handleMerge` resolves the target with `.find()` on the label string, so with two legal concepts named "framing" it silently absorbs the first — and the confirm renders `target.label`, identical for both, so the dialog cannot say which. Pick by **object**: the row already knows its id. | `VocabularyTab.tsx` | small |
| 0.3 | **`getUserLoomDataAsAdmin` never checks the target is on the roster.** It gates the *course* with `checkCourseFaculty` and then takes `targetUserId` unchecked. A **removed** member's work stays fully readable to faculty; the only thing stopping worse is that the queries are `courseId`-scoped, which is a filter, not a gate. | `admin.ts:473` | small |
| 0.4 | **`mapKit` gives a student advice.** `buildMapKit` writes *"CONCEPTS (busiest first — **the top few are your primary candidates**)"* and *"**A POSSIBLE ARMATURE** (your largest chain — one spine to hang the rest on)"* into a copyable kit, from `MapTab` — a student tab. Red line 3: *counted, never judged: no scoring, no completion states, **no advice**.* Counting is fine; ranking with an interpretive gloss is not. Reword to describe, not direct. | `mapKit.ts:49,63` | copy only |

**A fifth, found while fixing 0.2 and fixed with it.** Directly above the merge
control, an un-evidenced concept was labelled — in `var(--red)` — *"No passage
evidences this yet — every concept **should** trace to something you captured."*
That is an instruction to repair a state the model made first-class the same
week: *a Concept may precede its evidence* (TJ, 2026-08-08), and red line 4,
*"empty states are visible, not blocked"*. Now black, and descriptive: "You may
have named it ahead of finding it, or its passages may have moved on."

**How 0.2 was fixed matters more than that it was.** The bug was not a bad
lookup — it was asking for a **label** to identify an **object**, when the model
says outright that "identity is by object, not label string" and homonyms are
legal. So the text field became a picker holding concept **ids**; homonyms carry
their passage count, because that is the only thing on screen that tells two of
them apart, and the choice is not recoverable ("There is no unmerge"). The
`conceptOptions` datalist lost its last consumer and went with it.

*Copy note for TJ:* 0.4's three headings now read "CONCEPTS (most threads first
— the number is how many touch each)", "THE LONGEST CHAIN (the most threads that
connect end to end)" and "NO THREAD TOUCHES THESE YET". Each says what was
counted and how it was ordered; none says what to do about it. Reword freely —
the rule is the point, not the wording.

---

## Phase 1 — **05 Weave: ruled 2026-08-09, and the answer is "not now"**

> **TJ, 2026-08-09:** *"the whole weave path is unresolved. i know we will want a
> way for students to collaborate on a cloth, and there is an idea about a
> quilt. **the ambiguity about how they manifest should not inform the current
> design.** the keep will allow downloading of content, but **it is more about
> the student library or cloth collection** than a whole weave. it may be easier
> to **remove the weave concept** and reintroduce the collab and quilt at a later
> date. the whole weave will only confuse things in this moment."*
>
> So: **build nothing for the whole weave, and do not shape anything around
> Quilt or co-authorship.** That releases the gate below rather than answering
> it — Phase 2 may proceed. Keep is **not** the whole weave's home; the
> "every reading at once" framing is what this narrows.
>
> **Still open, and TJ's:** whether the weave concept is *removed* outright.
> Two facts bearing on it, both measured 2026-08-09 —
> **(1)** the dev DB holds 2 whole-weave cloths and 5 whole-weave projections,
> but the ones carrying text are `seed-demo.ts` fixtures, not student work;
> **(2)** **production is three migrations behind** — 20 applied, so it has
> never seen 0021, 0022 or **0023, the rename**: its schema is still the
> pre-rename one (`byte` and `read` tables, and no `cloth` or `passage`). It
> holds 5 of its 10 projections at `scopeKey ''`. So any removal migration has
> to be planned against a database three steps back, not against dev — and
> landing 0021–0023 *and* a removal together is the highest-risk sequencing this
> repo has attempted.

**Superseded framing, kept for the reasoning.** The whole weave was hidden
from the journey, its stations grey out, and nothing links to `/weave` — but the
route still works and three pieces of student work live only there:

- the **whole-weave Cloth** (title + description; its only editor is `ThrowTab`),
- **whole-weave Projections** (Keep names and exports them; nothing opens them),
- `ShelfSearch`'s **three links into `/weave`**, one of which is the last live
  route to an untethered passage.

Three ways out, and they cost very differently:

1. **Weave comes back** as a station — the strandings evaporate and Phase 2
   mostly disappears.
2. **Weave is retired** — then those three need homes (probably Keep, which is
   already "every reading at once" and already carries the Capture Log for
   exactly this reason), and `ShelfSearch` needs a new destination for concept
   and link hits.
3. **Weave becomes the Quilt space** the refactor spec files it as — a phase of
   its own, and the strandings need an interim home regardless.

**Building viewers for stranded whole-weave work before this is answered means
building them twice.** That is the whole reason this phase was first — and the
ruling above resolves it by forbidding the building rather than by choosing one
of the three.

**One claim in the framing above was false and is now corrected.** It said the
route "still works and Keep links to it". **Keep never linked to it** — verified
by grepping every `/weave` in the repo. Three places asserted otherwise and have
been fixed: `JourneyNav`'s header comment, this table's row in
[contracts.md](contracts.md), and — worst — `src/lib/workflows.ts`, which
**rendered a student-flow node** reading *"Every reading at once · /weave —
station hidden, reached from Keep"*. The diagram drew a step no student could
take. That node is gone and `write → keep` is direct.

---

## Phase 2 — capture provenance and naming. One sitting, then one build

These are three questions about the same surface, and answering them separately
would mean touching the capture path three times. Full analysis:
[naming-decisions.md](naming-decisions.md).

- **2.1 The three naming paths disagreed. RULED AND BUILT 2026-08-09.** Naming
  ahead of evidence *asked*; capture by hand joined silently then *asserted*
  ("it is one concept, not two"); capture from the PDF — the busiest path —
  joined silently and said nothing. All three now render one shared
  `ReuseOffer`: it fires only when the concept was evidenced in a **different**
  reading, reports the join, and offers *"Not the same idea? Make it a separate
  concept."* The PDF path carries it inside the capture toast (TJ: that path is
  the quieter of the two), and a toast with a decision in it does not count
  down. Rationale and the rejected alternatives:
  [naming-decisions.md §2a](naming-decisions.md). Guarded by
  `tests/reuse-seam.spec.ts`.
- **2.2 The Source field promised an override it did not have. RULED AND BUILT
  2026-08-09.** It is a **Citation** field now — the promise is gone, the field
  stays, and the filing it never mentioned is stated outright ("Filed under
  <the reading> — the reading you have open"). *Honouring* the override was
  rejected: there is no route from free text to a `sourceId`, and a shelf picker
  would defeat the very case the field exists for — quoting a work that is
  **not** on your shelf. [naming-decisions.md §4a](naming-decisions.md).
- **2.3 The three leads — all now VERIFIED in source (2026-08-09), none fixed.**
  Each was read against the code rather than inferred, and two came out sharper
  than the note that raised them.

  - **A · The shuttle's `crossed` check is unscoped.**
    [ThrowTab.tsx:157](../src/components/tabs/ThrowTab.tsx#L157) tests
    `state.edges` — **every** edge the student owns — while the candidate list
    is `scoped.concepts`, this reading's. So two concepts both evidenced here,
    already linked in a *different* reading, are dropped from the draw. Not
    absolute, which the original note overstated: if every pair is crossed it
    draws one anyway and flashes *"every pair crossed — drawing any"*. The
    defect is the common case — a pair silently never comes up, and since the
    "threads that run out of this reading" band was removed on 2026-08-09
    **the edge causing it is invisible from here**, so there is nothing on
    screen that could explain the absence.
  - **B · Import re-scopes a Projection to the whole weave, silently.**
    [loom.ts:1185-1189](../src/actions/loom.ts#L1185-L1189): unresolvable
    reading ids filter to none, and `scopeOf([]).key` is `""`. The comment
    above it justifies the fallback as keeping *"the student's tiers, essence
    and read reachable (red line #5)"* — **they are not reachable**, because
    nothing links to `/weave`. The fallback that exists to protect the work is
    what buries it. Fixing it needs the whole-weave question answered first.
  - **C · Import drops rows, and the confirm reported the post-drop count as
    the file's contents. FIXED 2026-08-09** — the one of the three that needed
    no ruling. [graphExport.ts:316](../src/lib/graphExport.ts#L316) drops
    concepts with a blank label; [:378](../src/lib/graphExport.ts#L378) drops
    edges whose endpoints did not survive that. `parseImport` returns the
    **filtered** arrays, and `KeepTab`'s dialog read them as *"It holds N
    concepts … N threads"* — a claim about the file, measured after the losses,
    on the **destructive** branch ("What is on the table now is replaced, not
    merged").

    `ParsedImport` now carries `dropped: {concepts, passages, edges}` and the
    dialog says both numbers — *"… will arrive"*, then what "cannot be read and
    will not", and only when there is something to report, so an ordinary
    import is unchanged. Edge losses are counted **before** the legacy
    triples are appended, or the number would be a diff against a list that
    grew again.

    **Guarded**, because this class of bug is invisible by construction:
    `scripts/check-import-compat.ts` gained four assertions on a deliberately
    lossy file. A round-trip test could never catch it — the current code never
    *emits* a blank-label concept, so the shape that triggers the drop cannot
    arise from an export.

---

## Phase 3 — access, after the matrix

Two findings the matrix surfaced that are decisions rather than defects.
Recorded in `MATRIX_NOTES` and rendered on `/access`.

- **3.1 `INSTRUCTOR` is written and never read.** `enrolInvitedCourses` writes it
  for an admin who joins by invitation; no gate matches it. It is now harmless
  (`peersOf` matches `LEARNER` positively), but it still shows up literally in
  the roster's role column. Either write `"FACULTY"`, or accept it and make the
  roster render it as something a human recognises.
- **3.2 `authorizeSourceAccess` falls fully open to unauthenticated callers when
  `NODE_ENV !== "production"`.** Deliberate and commented, but it is the only
  gate whose *shape* changes by environment rather than its strictness — a
  preview built as development would serve every reading to anyone. Worth
  deciding whether the dev convenience is worth that, now that there is a tester
  deployment.

---

## Phase 4 — the model doc has drifted, and the matrix proves it

`docs/loom-model-build.md` is the authority, so this is TJ's to correct, but the
gaps are now demonstrable rather than suspected:

- **§4** describes Library as one "Admin/Faculty" view including staging. The
  build gives Library, People and course creation to **admin alone**; faculty
  hold Roster and Cohort Graph. Faculty cannot even *see* a staged reading in
  their own course.
- **§3** (lines 158, 160) still promises students the Passages Overlay and the
  Concepts/Links Overlays. The 2026-08-08 ruling removed both.
- **§Capture Log** says it surfaces "in both the Reading tab and the Linking
  tab". It surfaces in neither: it is `HistoryPanel`, and since 2026-08-09 it is
  on Keep.

---

## Phase 5 — features, each its own phase

- **5.1 Link as object** — [link-as-object.md](link-as-object.md). Link becomes a
  User-level object (Label + its own gloss), Thread carries the references and
  the per-pair sentence. **Ship tap-to-attach in the same phase** so chips attach
  a `linkId` instead of copying a string; defer `mergeLinks` until the vocabulary
  is observed to silt up, because prevention decides nothing on a student's
  behalf and repair always risks it. Migration: additive except dropping
  `edge.handle`. Watch `edge_search_idx`, which spans both columns.
- **5.2 The screen snip** — [screen-snip.md](screen-snip.md). Much smaller than
  it looks: a snip of a library PDF needs **no image storage**, only a rect.
  TJ settled export (the image embeds). One number open: the size cap, worth
  measuring against *Learning How to Learn* p56 rather than guessing.
- **5.3 Cloth co-authorship** — [cloth-cardinality.md](cloth-cardinality.md).
  The biggest: `cloth_member`, membership-based authorization across **84**
  row-ownership checks, and an export contract that can name more than one
  author. Ratified, not built, not urgent.
- **5.4 Several modes of reading** inside 01 · Reading. Wanted (TJ), nothing
  specified.

---

## Phase 6 — trust the gate before leaning on it

Not features, but the reason to believe any of the above.

- **6.1 CI's `e2e` gate has never run.** It needs `CI_DATABASE_URL` and
  `CI_BLOB_READ_WRITE_TOKEN` (deployments.md §CI). Until then only `checks`
  gates a PR, so the 49-test suite is **not** the gate.
- **6.2 `dev`'s branch protection is being bypassed.** Every push on 2026-08-09
  reported *"Bypassed rule violations — 2 of 2 required status checks are
  expected."* The protection is currently decorative. Fixing 6.1 is what makes
  it real.
- **6.3 The fresh-GitHub-account sign-in has still never been run by a human.**
  Playwright reaches the app through the `test-login` backdoor and cannot cover
  it. If it is wrong, every tester is locked out and nothing else matters.
- **6.4 Next's queue bug** (vercel/next.js#90467) is routed around, not fixed.
  Re-measure with `scripts/repro-action-bounce.mjs` after any Next upgrade.

---

## Where I would start

~~Phase 0~~ **done 2026-08-09** — five fixes, no rulings spent. Since then, and
also unblocked by no ruling: the **bytes → Passages** rename through code, docs
and the database (migration 0023), the **three kinds** a Concept can be relative
to a reading, and two guards that did not exist —
`scripts/check-import-compat.ts` and `scripts/check-vocabulary.ts`.

~~**Next: the 05 Weave ruling** (Phase 1).~~ **Ruled 2026-08-09** — *build
nothing for the whole weave* (§Phase 1). Nothing was built for it; three false
claims that it had a door were removed, one of which was **rendering as a step
in the student workflow diagram**.

**Next: Phase 2.** Its three leads (2.3) are now verified in source and written
up above with file and line — that was the work the plan asked for before 2.1
and 2.2 get built. **2.1 and 2.2 are still TJ's calls** and are what to take
next; lead **C** (import under-reports what a destructive replace will drop) is
the one of the three that needs no ruling at all and can be fixed on its own.
Lead **B** is blocked on whether the weave concept is removed.

**Found on the way, unrelated to any of it and now fixed:** every back-edge
label in a workflow diagram was drawn at the same `x`, so two returns whose
spans had similar midpoints printed **on top of each other** — "next reading"
sat over "another passage" on the student flow, 6px apart with 14px text. The
lanes were separated one-per-return on purpose and the labels naming them were
not, which undid it. `check-workflows.ts` catches invisible connectors but had
nothing to say about an illegible label; the layout now de-collides them
deterministically ([flowLayout.ts](../src/lib/flowLayout.ts), and see the note
there on why determinism is load-bearing for a diagram rendered on both server
and client).
