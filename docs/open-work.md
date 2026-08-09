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

## Phase 1 — the ruling that gates the most: **05 Weave**

**Take this before anything in Phase 2.** The whole weave is currently hidden
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
building them twice.** That is the whole reason this phase is first.

---

## Phase 2 — capture provenance and naming. One sitting, then one build

These are three questions about the same surface, and answering them separately
would mean touching the capture path three times. Full analysis:
[naming-decisions.md](naming-decisions.md).

- **2.1 The three naming paths disagree.** Naming ahead of evidence *asks*;
  capture by hand joins silently then *asserts* ("it is one concept, not two");
  **capture from the PDF — the busiest path — joins silently and says nothing.**
  Proposed: turn the note into an offer ("Not the same idea? — Make it a
  separate concept") and give the PDF path a note at all. Not "ask every time":
  most of the time the reuse is the move the course teaches. **TJ's call**, because
  it is a behaviour change on the busiest path in the app.
- **2.2 The Source field promises an override it does not have.** The label says
  *"this reading, unless you say otherwise"*, but saying otherwise sets
  `byte.source` (a string) while `byte.sourceId` — what `scopedGraph`, the
  tallies, the overlays and the export anchors all read — is stamped from the
  open reading. `attributeBytes` is guarded by `isNull(sourceId)`, so it can
  never be re-attributed afterwards. **Honour the override, or stop offering
  it.** The second is one string. **TJ's call.**
- **2.3 The unverified leads**, which should be checked before either of the
  above is built, because two touch the same code: `ThrowTab`'s `crossed`
  suppression (a pair already linked *anywhere* is never offered by the shuttle,
  with no reason given — and since 2026-08-09 those other-reading threads are
  not even visible); import silently re-scoping a Projection to the whole weave;
  and import dropping blank-label concepts and dangling links while Keep reports
  the *post-drop* counts as the file's contents.

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

~~Phase 0~~ **done 2026-08-09** — five fixes, no rulings spent.

**Next: the 05 Weave ruling** (Phase 1). It is the one answer that changes how
much of Phase 2 exists at all, and nothing below it should be built first.

Everything else can wait for that to land.
