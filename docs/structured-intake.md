# Structured intake

**Status: adopted 2026-08-26.** This file was a proposal
(`docs/proposals/structured-intake.md`) until TJ answered its gate; it is now
the record of how a new feature enters Loom. Its own adoption followed the
process it describes — proposal, numbered questions, recorded answers — and it
moved here from `proposals/` on shipping, exactly as it says shipped proposals
do.

## Why it exists

A feature used to enter as one line in a conversation, with its shaping
decisions made mid-build and recorded after the fact. The failure mode was
specific and recurring: **the decisions that were never surfaced were the ones
that shipped wrong.** Three cases, none hypothetical: `add-concept-card.md`
carries a section titled "What the proposal asked for and did not get";
"filter by role" (2026-08-24) shipped on the Enrolled tab only, and that it
should cover Invited surfaced two days later, from the running app; and two
branches sat on the remote for seven weeks with no statement anywhere of what
they were for.

Debugging is out of scope, deliberately. An investigation ("why is this
happening?") cannot be specced in advance — its questions are discovered, not
decidable up front. Investigations keep their own discipline: reproduce,
instrument, measure, fix, regression spec, commit message as the record. The
one connection is the **handoff**: when an investigation's finding implies a
missing capability (Cheng's sign-in → "nothing records refusals" → the
Sign-ins tab), the finding becomes a proposal's problem statement and enters
intake.

## The lifecycle

1. **Proposal** — one file in `docs/proposals/`, following the template below:
   the problem in the reader's terms; where it sits in the model, citing
   [loom-model-build.md](loom-model-build.md) by section; which
   [contracts.md](contracts.md) rulings constrain it; explicit non-goals; and
   **open questions, numbered** — each a decision reserved for TJ.
2. **Gate** — TJ answers the numbered questions. Answers are transcribed into
   the document as quoted rulings — `"…" (TJ, date)` — the citation form the
   repo already uses, so later work quotes a ruling rather than an impression
   of one.
3. **Plan + tasks** — appended to the same file after the gate: hosts, reuse,
   any migration with its expand-only argument, and the commit sequence —
   which, under one-decision-per-commit, IS the task list. The evidence is
   named in advance: which widths get measured, which spec must fail against
   the stub.
4. **Record or archive** — on shipping, the file is rewritten as a record of
   what exists and **moves to `docs/`** (the `add-concept-card.md` pattern:
   where proposal and code disagreed, the code won and the document was
   rewritten to match, divergences named). A refused or abandoned proposal
   moves to `docs/archive/` with one line saying why. `docs/proposals/`
   therefore always means: not yet decided, or not yet built.

## When intake applies

| the ask | mode | intake? |
| --- | --- | --- |
| new surface, new object, new route, anything touching the model or a migration | feature | **yes** |
| an investigation's finding that implies a missing capability | handoff | **yes** |
| copy changes, a sort column, one control on an existing surface | small feature | no — build it, evidence in the commit |
| "why is this happening?" | investigation | no — reproduce first; the artifact is the finding |

Boundary cases go to judgment, stated in the moment: "this looks intake-sized,
want a proposal first?" costs one sentence.

## Precedence

See AGENTS.md, which is the authority; the paragraph is reproduced here so
this record is complete: proposals are **intent, not authority** — ranked
below `loom-model-build.md` and `contracts.md`, citing rather than restating
them; where a proposal and the model disagree, the model wins until the model
is amended; nothing is implemented from a proposal whose numbered questions
are unanswered.

GitHub's Spec Kit was considered and set aside: its generated `specs/` tree
would compete with `docs/` as an authority, and its scaffolding adds nothing
this repo's discipline lacks. Revisitable.

## Non-goals, still standing

- **No CI enforcement** — no script polices format or blocks merges on a
  missing proposal. If the process earns its keep, enforcement can come later.
- **No retroactive proposals** — shipped features keep their commit messages
  and docs as the record.
- **No new tooling** — a directory, this template, one AGENTS.md paragraph.
- **No change to investigations.**

## The decisions that adopted it

All four gate questions were answered together: *"i will follow your
recommendations"* (TJ, 2026-08-26), which resolved them as:

1. **Threshold** — intake for new surface / new object / migration; smaller
   work builds directly.
2. **Answers** — chat rulings transcribed into the file as `(TJ, date)`
   quotes, matching how rulings are recorded everywhere else.
3. **Record's home** — shipped proposals move to `docs/`; `proposals/` holds
   only the undecided and the unbuilt.
4. **First use** — a dry run against the dormant `weekly-concept-map` branch
   (`docs/proposals/weekly-concept-map.md`).

## The template

```markdown
# <Feature name> — proposal

**Status: proposal.** <One line: what this is, in the reader's terms.>

## The problem
<What a person cannot do today, in their terms — not the solution's.>

## Where it sits in the model
<Objects touched, citing loom-model-build.md sections. What is reused.>

## Rulings that constrain it
<contracts.md citations. Red lines it must not cross.>

## Non-goals
<What this deliberately does not do. The most load-bearing section.>

## Open questions
1. <A decision reserved for TJ. Numbered so the answer can cite it.>

---
<!-- After the gate: -->
## Decisions
1. <The answer, quoted: "..." (TJ, date)>

## Plan
<Hosts, reuse, migration + expand-only argument, evidence named in advance.>

## Tasks
1. <Each task is a future commit message's first line.>
```
