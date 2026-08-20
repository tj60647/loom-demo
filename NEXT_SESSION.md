# Next Session Prompt

**Rewritten 2026-08-19.** The previous contents described 2026-08-09 and had
stopped being true in most particulars — it claimed a 51-test suite (it is 78)
and a plan that has since been executed. What is still live from it is carried
forward below rather than left to be found.

**Read [docs/open-work.md](docs/open-work.md) for the plan and
[docs/ui-cleanup-pass-1.md](docs/ui-cleanup-pass-1.md) for the decision
record.** This file is only the handoff: where the branch stands, what is
verified, and what is waiting.

---

## Where `dev` stands

**304 commits ahead of `master`, 3 behind.** `master` is at `d400378` (the
PR #6 merge). Promoting is a release decision nobody has taken; the 3 commits
`master` has that `dev` does not need looking at first.

**Verified 2026-08-19, locally:**

- Playwright: **78 tests**, all passing. One (`repair-panel` › "a proposed page
  shows a crop") skips itself when the fixture holds no proposed pages.
- `npm run check`: **63 checks**, 0 failing.
- `tsc --noEmit` and `eslint`: clean (3 pre-existing `<img>` warnings).

**Verified on CI, 2026-08-19** — the first time this branch had ever been
through the gate, via a `dev → master` PR opened for that purpose and closed
without merging (#24). `checks` and `e2e` both green: 44 passed in the read
pass, 33 passed / 1 skipped in the write pass.

It found a break on the first run that no local run reproduces: an ambiguous
`getByRole("button", { name: "Add" })` colliding with an aria-label added
2026-08-18, which bites only when that control is on screen — fixture-dependent,
so CI's provisioned database saw it and this machine's dev database did not.

`ci.yml` was then split by cost (`eef2c77`): `checks` (~90s, no database) runs
on every push to `dev`, while `e2e` holds the shared CI database's lock and
stays on pull requests and master pushes. So a working branch now gets build,
lint and the 63 check scripts on every push without contending for the database.

> **A trap worth knowing.** `npx playwright test … | tail -n` reports *tail's*
> exit code, not Playwright's. A run with failures still prints
> `[exited with code 0]`. Read the pass/fail counts, never the exit code, when
> the command is piped.

---

## The one operational risk

**Production may be several migrations behind.** The 2026-08-09 note in this
file said it had applied 20 of the then-23 — never seeing the passages rename
(0023). There are now **27 migrations** on disk (journal ends `0026`). Nothing
in the repo records production catching up.

This is a doc's claim ten days stale, not a measurement — nobody has looked at
production from here. **Look before assuming either way.** If it is true, a
deploy lands seven migrations at once, one of them a table rename.

---

## Waiting on a ruling (model doc first)

- **Expected concepts** — a concept in a reading BEFORE evidence. Needs a
  `cloth_concept` join, a widened `isIn`, and a third grouping. Today "no
  evidence here" and "no evidence anywhere" are the same set *because* `isIn`
  guarantees it. `loom-model-build.md` §Concept says a Concept with no Passages
  "belongs to no Reading" — that sentence changes first.
- **Optional concept name.** The model already allows it. Needs the "one or the
  other or both" constraint TJ added, a validation, and a display decision
  across 67 label sites.
- ~~**The Weave.** Whether the concept is removed is still open~~ — **it was
  ruled on 2026-08-11**: the whole weave is out of the app (open-work.md §Phase
  1), there is no `/weave` route, and rows already written at `scopeKey ''`
  render nowhere. This entry was carried forward from the 2026-08-09 handoff
  without checking whether it had been settled since; it had. What IS still
  open behind it is narrower: `import re-scopes a projection to the whole
  weave` when its readings do not resolve, which now sends work somewhere the
  app cannot show.

## Decided, not built

- Filter the coin-a-concept list to concepts not already in the reading.
- Auto-populate the description when an existing concept is picked.
- `ThrowTab`'s `crossed` check is unscoped — it tests all edges against this
  reading's concepts, so a pair linked in another reading is withheld here.
  There is an "every pair crossed — drawing any" fallback, so it is mild.
- Highlights at full zoom-out still miss any page never promoted; closing it
  needs the `getTextContent()` route recorded in `ui-cleanup-pass-1.md`.

## Housekeeping

- `@media (max-width: 900px)` in `PdfViewer.tsx` is dead by contracts §2c-iii,
  which puts the floor at 1280.
- ~~**PR #10**~~ — closed 2026-08-19 with the disposition of all 13 items.
- `docs/loom-model-build.md` may be sitting modified in the working tree. It is
  the build authority, so an uncommitted edit there is worth resolving rather
  than leaving to be swept into someone's next `git add`.

---

## Fixture debris — fixed, and worth understanding

Specs that write tear down at the end, and **a spec that fails never reaches its
teardown**. The rows accumulated run after run until they changed what the next
run saw. On 2026-08-19 the sweep found **89 orphaned readings**, and three
orphaned `addcard seed …` passages had already broken a passing assertion in
`add-concept-card.spec.ts` — `railScale` shrinks a crowded rail, so opening the
editor rescaled the card and moved it 56px against a 12px tolerance. The spec
was right, the code was right, the fixture was wrong, and the failure pointed
at neither.

`scripts/clean-fixtures.ts` sweeps it, and `playwright/global-teardown.ts` runs
it after **every** run — the failing run being the one that skipped its own
cleanup is exactly why per-spec teardown could not be the answer.

Two properties of that script are load-bearing:

- **Both conditions, always.** Only the suite's own account
  (`test-user-a@loom.local`), and only labels matching the shapes the specs
  generate. Patterns use `______` rather than `%` for the six-digit stamp so
  they cannot widen.
- **It recognises rather than assumes.** A reading being debris does not make a
  passage on it debris. Unrecognised content on a debris reading **stops the
  run** instead of guessing. That guard fired on its first outing: 4 passages
  were riding on the 89 readings, and a naive sweep would have taken them.

`npm run clean:fixtures` reports without deleting; `--apply` deletes.

---

## Where I would start

1. **Find out where production's schema actually is.** Everything about a
   release depends on it and nobody has looked in ten days.
2. ~~Get CI to run the branch~~ — done 2026-08-19, green. `checks` now runs on
   every dev push; open a `dev → master` PR when the full `e2e` gate is wanted,
   and close it afterwards so it does not hold the database's turn on every
   push.
3. Then the rulings above, model doc first.
