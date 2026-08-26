# Quilt — proposal

**Status: proposal — held for the quilting discussion.** The open questions
below are deliberately unanswered: they are the agenda for a group discussion
about quilting, not a gate TJ answers alone ("can we just leave the open
questions for now as things the group needs to address in a discussion about
'quilting'?" — TJ, 2026-08-26). Under AGENTS.md, nothing is implemented while
they stand; that is the holding mechanism, and it needs no further lock.

A Quilt brings several students' Cloths together on one
canvas, where the participants co-construct a **Projection** — the reframe TJ
ruled on 2026-08-26 ("bringing multiple cloths together in a knowledge graph
and co-constructing a projection on a canvas that participants can access",
recorded in [weekly-concept-map.md](weekly-concept-map.md) §Decisions), named
by him the same day: "call it a quilt." The name is the model: a quilt is made
of patches of cloth, and the cloths remain what they were.

## The problem

A professor wants students to build shared understanding from their individual
readings — the "weekly concept map" question the July prototype circled. Today
the only surface where several students' work appears together is the cohort
graph, which is staff-only and read-only: students cannot see it, and nobody
can *make* anything on it. There is no place where a group can look at what
its members have each woven and compose a shared reading of it.

## Where it sits in the model

**What a Quilt is made of — all of it already exists:**

- **Patches: the member Cloths, read whole.** Assembly is a READ. Every
  Concept, Thread, Link and Passage stays owned by its student; the quilt
  presents them with attribution, the shape the cohort graph already proves
  (`/admin/aggregate`: many students' work, one canvas, no shared objects).
  Individuals keep control of their passages (TJ, 2026-08-26, given as an
  assumption of the reframe; here it is a commitment).
- **The co-constructed artifact: a Projection.** An object the model already
  has — One-line (`essence`), Description (`read`), positions and bends.
  What widens is ONE axis: today a Projection belongs to one user; a quilt's
  Projection belongs to the quilt and takes several hands. This is the whole
  model delta of the minimal Quilt.
- **Evidence flows through existing read paths.** A concept placed on the
  quilt shows its passages the way the cohort read-out already shows them:
  read-only, attributed, in the owner's name.

**What a Quilt deliberately is NOT (the July prototype's mistakes):**

- No concepts owned by nobody. "Group connect" created cross-student concept
  objects; the model forbids it (concept identity belongs to the User,
  [loom-model-build.md](../loom-model-build.md) §2) and nothing here revives
  it.
- No machine placement. The prototype auto-placed by embedding similarity.
  Red lines 1 and 7 are explicit: no model performs interpretive judgment,
  and only student gestures persist geometry. On a quilt, participants place
  things; the tool counts and renders.

**The weave, defined at last.** The whole weave was removed 2026-08-11 "until
the faculty and the authors of the app agree on what it means to have a 'full
weave'" ([loom-model-build.md](../loom-model-build.md) §1). The Quilt is a
candidate definition: not a merged graph of everything, but an occasioned,
participant-scoped assembly of chosen cloths with one co-constructed
Projection over them. Shipping it would amend the model's weave section —
that amendment is part of the work, not a side effect (question 6).

## Rulings that constrain it

- Red lines 1, 3, 7: no interpretive automation, counts never judged, only
  gestures persist geometry — so no auto-arrange, no "readiness" scoring of
  patches, no promoted-by-count.
- Red line 5 (whole-artifact export, by object): a quilt's Projection must
  export whole, like every other object.
- The 2026-08-11 weave removal: nothing ships until the definition question
  (6) is answered — which is this proposal's job.
- Migrations expand-only; a Quilt adds tables and touches none.

## What co-construction means here — the crux

TJ's question, verbatim: "is a quilt just the preexiting concepts and threads
from the individual participants presented as items to add to a projection?"

**The minimal Quilt says yes**, and it is fully model-clean: the palette is
the participants' existing concepts and threads; co-construction is
*selection* (what goes on the canvas), *arrangement* (where it sits — owned
gestures, attributed), and *the Projection's prose*. Nothing co-authored
exists as an object; every item on the quilt has exactly one owner.

The unresolved remainder is TJ's next sentence: "it is less clear where
co-authored concepts go, co-authoered threads go, co-authored links go."
Three honest options, gated below (question 4):

- **(a) Not in v1.** The minimal Quilt ships; a connection two students see
  between their concepts is made by ONE of them saying it — in their own
  cloth if it stays within their material, or not at all if it crosses.
  Cleanest; possibly frustrating at exactly the moment the quilt exists for.
- **(b) The stitch.** A quilt-scoped connection, authored by ONE participant
  (the one who makes the gesture), allowed to point across cloths, living
  only in the quilt — never in either student's cloth, never in their
  vocabulary. "Co-authored" dissolves into "authored by one, in the shared
  place." One new object kind, but a small one: it has an author, so it
  breaks no ownership rule.
- **(c) Full co-authored objects.** Concepts/threads/links with plural
  authorship. Re-opens everything the model settled about identity; not
  recommended, recorded for completeness.

## Attribution — "who adds what"

TJ's question: "how do we track who adds what to the projection name,
description, sentence, etc."

The mechanism exists: `graph_event` already records acts by kind and author
(it is how capture history works). Every quilt act — placing a concept,
moving it, editing the One-line, writing the Description, making a stitch if
(b) — is an attributed event, and the current state is the latest text plus
its history. The POLICY is the open question (5): who may write the prose at
all, and whether the surface shows "last edited by X" or a fuller ledger.

## Non-goals

- No machine placement, clustering, or suggestion of any kind (red lines 1, 7).
- No cross-course quilts.
- No change to any existing object: cloths, concepts, threads, links and
  passages are read, never written, by quilt code.
- No revival of the July prototype's code (it predates migration 0023 and the
  model's current shape; the branch question stays open in
  [weekly-concept-map.md](weekly-concept-map.md)).

## Open questions — the agenda for the quilting discussion

Each question carries a recommendation so the discussion starts from a
position rather than a blank page; none of it is decided.

1. **Who makes a quilt?** (TJ: "how does a user make one?") Options: faculty
   only, from the teaching plane (matches how sections and invitations work;
   conservative); any participant, who then invites; or both. Recommendation:
   **faculty creates and names the occasion; students do everything else.**
   Creation is course-structure, and course-structure has lived on the
   teaching plane throughout.
2. **How does a cloth join?** (TJ: "how are cloths added?") Options: each
   owner adds their own cloth (consent — your work enters shared view only by
   your act); the creator assembles; automatic by section. Recommendation:
   **owner adds their own**, because a cloth is a student's work and the
   repo's deepest rule is that nobody else touches it. Sub-question, the
   dangling rule: when an owner withdraws their cloth (or deletes a concept),
   what does the quilt show where their material stood? (A visible absence —
   "a patch withdrew" — fits red line 4's "empty states are visible".)
3. **What is a quilt's occasion?** A Cloth has exactly one Reading. Is a
   Quilt scoped to one Reading (everyone's cloth on the same text — the
   tightest form), or to an occasion (a week, a unit) spanning readings?
   "Weekly concept map" suggests the latter; the model's cleanest first step
   is the former. Recommendation: **one Reading in v1**, occasion-scope as a
   later widening if wanted.
4. **The co-authored remainder** — option (a) minimal, (b) stitches, or (c)
   full co-authorship, as laid out above. Recommendation: **(a) for v1, with
   (b) designed but not built** — the stitch is the natural second release if
   the minimal quilt proves the surface, and deciding its shape now keeps v1
   from painting over its place.
5. **Prose policy.** Who may edit the Projection's One-line and Description —
   any participant (attributed, last-writer-wins with history), or a chosen
   scribe? And does the surface show attribution inline ("last edited by X")
   or only in a history view? Recommendation: **any participant, attributed,
   history visible** — the ledger, not a lock.
6. **Is this the weave's definition?** Shipping the Quilt amends
   loom-model-build.md §1: the weave section stops saying "removed until
   defined" and starts saying "defined as the Quilt" (or the Quilt stands
   beside a still-undefined weave). This is the faculty-agreement moment the
   2026-08-11 ruling reserved — it is TJ's and the faculty's to make, not a
   build detail.
