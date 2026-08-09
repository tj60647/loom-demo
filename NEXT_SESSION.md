# Next Session Prompt

## Addendum, 2026-08-09 later (the Weave ruling, 2.1 and 2.2 ruled and built)

`npm run check` (8 scripts), `next build` and the Playwright suite (**51 passed
/ 1 skipped** — the 49 plus two new) are green. **No migration.** Read
[docs/open-work.md](docs/open-work.md) first — it is the plan and it is current.

**Three of TJ's calls landed this session:** 05 Weave (§1 below), and **2.1 and
2.2 — the naming paths and the Source override — now ruled AND built** (§7).

### 1. The 05 Weave ruling: "not now", which releases the gate rather than answering it

> **TJ:** *"the whole weave path is unresolved… **the ambiguity about how they
> manifest should not inform the current design.** the keep… is more about the
> student library or cloth collection than a whole weave. it may be easier to
> **remove the weave concept** and reintroduce the collab and quilt at a later
> date."*

So **build nothing for the whole weave**, and **Keep is not its home**. Phase 2
is unblocked. Whether the concept is *removed* is still open; the for/against
is in `open-work.md` §Phase 1, and the two facts that bear on it are:

- **Production is three migrations behind** — 20 applied, so it never saw 0021,
  0022 or 0023. Its schema is the pre-rename one, and 5 of its 10 projections
  sit at `scopeKey ''`. A removal migration would land three migrations *plus* a
  removal at once.
- **Dev's whole-weave rows that carry text are `seed-demo.ts` fixtures**, not
  student work.

**A first pass was written on the earlier reading of this ruling and reverted in
full** — `loom-model-build.md`, `ClothFold`, `KeepTab` and `ThrowTab` are back
to their original state. Only verified fact was kept.

### 2. "Keep links to /weave" was false, and one of the three liars was a rendered diagram

Nothing links to `/weave` — grepped, every site. Three places said otherwise:
`JourneyNav`'s header comment, a `contracts.md` row, and **`src/lib/workflows.ts`,
which drew a student-flow node reading "Every reading at once · /weave — station
hidden, reached from Keep".** The diagram asserted a step no student could take.
Node removed, `write → keep` direct, layout re-flowed itself. **This is exactly
the failure AGENTS.md warns about** — `check-workflows.ts` passes on a picture
that has fallen behind the build.

### 3. Phase 2.3 — all three leads verified in source, one fixed

- **A · The shuttle's `crossed` check is unscoped.** [ThrowTab.tsx:157] tests
  `state.edges` (all of them) against `scoped.concepts` (this reading's), so a
  pair linked in *another* reading is withheld here — and since the 08-09 band
  removal **the edge causing it is invisible from this tab**. Milder than the
  note claimed: there is an `every pair crossed — drawing any` fallback.
  **Not fixed** — it is a behaviour change of the same family as 2.1.
- **B · Import re-scopes a projection to the whole weave** when its readings do
  not resolve ([loom.ts:1185]). Its own comment justifies the fallback as
  keeping the work *"reachable"*; it is not. **Blocked** on the weave decision.
- **C · The import confirm described the file by what survived reading it.
  FIXED.** See below.

### 4. What was fixed

- **The import confirm under-reported a destructive replace.** `parseImport`
  drops blank-label concepts and the links left dangling by that drop, so every
  count it returns is what *lands* — and the dialog quoted them as *"It holds N
  concepts…"* on the branch that replaces the cloth outright. `ParsedImport`
  now carries `dropped {concepts, passages, edges}`, and the dialog says both
  numbers, mentioning losses only when there are any. Edge losses are counted
  **before** the legacy `triples` are appended.
  **Guarded** — four new assertions in `check-import-compat.ts` (now 9). A
  round-trip test cannot cover this: the current code never *emits* a
  blank-label concept, so the triggering shape cannot come from an export.
- **Every back-edge label in a workflow diagram was drawn at the same `x`**, so
  two returns with similar midpoints printed on top of each other — "next
  reading" over "another passage", 6px apart, 14px text. **Pre-existing**,
  proven by laying out the pre-edit and post-edit graphs and getting identical
  coordinates. Lanes were separated one-per-return deliberately; their labels
  were not. `flowLayout.ts` now de-collides them deterministically — which
  matters because that arithmetic runs on server *and* client, and a tie broken
  differently would be a hydration mismatch.

### 5. Traps

- **`next start` sets `NODE_ENV=production`, so `/api/auth/test-login` 403s** —
  the Playwright suite cannot run against a production build. It needs `next
  dev`. (`reuseExistingServer` will happily hand it a prod server that then
  fails every spec at global setup.)
- **Killing the dev server while Playwright is tearing down makes it exit 2**
  with every test green. Read the log before believing the exit code.
- **`check-vocabulary.ts` flags a doc that names the `byte` table** — including
  a true statement about a production database that predates 0023. The exemption
  is a ±3-line window mentioning the rename, so *say why* the old name is there
  rather than suppressing it.

### 6. Phase 2.1 and 2.2 — ruled and built

Full rationale, including the alternatives rejected and why, is in
[docs/naming-decisions.md](docs/naming-decisions.md) §2a and §4a.

- **2.1 — one shared `ReuseOffer`, on all three capture paths.** It reports the
  join and offers the way out; it does not rule and does not block. Fires only
  when the concept was evidenced in a **different** reading — a second passage
  under the same concept in the same reading is not ambiguous and gets nothing.
  - **Not a blocking confirm**, because recurrence across readings is the v1
    substrate the model names; a dialog that fires on it teaches that it is
    exceptional, and it is the goal.
  - **Not left silent**, because the "they picked it off the datalist" defence
    fails: the list offers every concept undifferentiated, so nothing
    distinguishes one made here from one made weeks ago elsewhere.
  - **A toast with a decision in it does not count down.** The plain capture
    toast clears after 6s; with an offer, the timer is never started.
  - **Separating MOVES a borrowed gloss.** If this capture filled the reused
    concept's empty Description, the split gives that sentence to the new
    concept and clears it from the old — never touching one written earlier.
- **2.2 — "Source" is "Citation".** The override was never real, so the promise
  went and the field stayed, renamed for the job it does. The filing it never
  mentioned is now stated: *"Filed under <reading> — the reading you have
  open."* Honouring the override was rejected because there is no route from
  free text to a `sourceId`, and a shelf picker would defeat the case the field
  exists for: quoting a work that is **not** on your shelf.

### 7. Next

The **weave-removal decision** (§1), then **lead A** — the shuttle's unscoped
`crossed` check, which is the same family as 2.1 and should probably get the
same treatment: offer the pair and say where you already linked it. **Lead B**
stays blocked on the weave.

---

## Addendum, 2026-08-09 (TJ's rulings, the Passage rename, and access made legible)

**Seventeen commits on `dev`, `0636b9a`…HEAD, all pushed.** `npm run check` —
now **seven** scripts — `next build` and the Playwright suite (**49 passed / 1
skipped**) are green at the end. **One migration: 0023**, the only one all week.

This replaces the nine sections written as the day went. Nothing below is lost
from them; the ordering is now by subject rather than by the hour.

**Start with §8.** The one ruling that gates the most is still unmade.

---

### 1. The capture side is "Your work", and a capture says so

TJ: *"the current capture log button is a little weird… it seems like it should
be 'notes' at least, if not having the ux also changed."* Then, on the first
cut: *"still very disruptive… i thought we were making a slide out panel from
the side like toast thing."*

- **The word is "Your work"** — not "Notes", which already names a field on the
  Passage. The model doc's object stays **Capture Log**; only student-visible
  strings changed. Both authority docs already used "Capture Log" for
  `graphEvents`/`HistoryPanel`, so the rail was the impostor and this rename
  *resolved* a collision.
- **A card over the text, not a wall across it.** `#yourwork`: inset 12px,
  380px, height-capped to clear the footer, rendered inside `.pdf-shell` (a new
  `.pdf-body` wrapper) so it survives fullscreen, which is `position:fixed;
  z-index:6000` and swallowed the old rail whole. Always mounted, parked
  off-screen — drafts survive the toggle and a landed capture has a layout box
  to scroll to.
- **The toolbar button no longer changes shape.** It went narrow-ghost to
  wide-filled and reflowed the toolbar under the reader's eye.
- **`.captoast` is what actually answered the complaint.** A capture from the
  page used to land in *silence* — `CaptureModal` saved and vanished, and the
  only sign was 1500ms of "· saved ·" in the header. That is why the panel had
  to be opened at all: to check, not to browse.

### 2. The hover tips were broken nearly everywhere — measured, not guessed

Audited in Chromium across ~70 `[data-tip]` sites: the header's, **including
`?`, ~90% clipped on every page** by `body{overflow:hidden}`; all six
reading-toolbar tips 80% (93% below 900px); the journey nav's 100% below 900px;
`.scrollbox` lower rows 100%.

Two mechanisms. Most of it is **overflow clipping, which no z-index can fix**;
on top of that `.pdf-toolbar` is a flex item with `z-index:10`, and a flex item
with a z-index makes a stacking context, so a bubble asking for 30 painted at an
effective 10 — under Your work at 25.

**`src/components/ui/TipLayer.tsx`** draws one element at the document root
using the native `popover` attribute, so it lives in the **top layer**: above
every stacking context by construction, clipped by nothing, carrying **no
z-index**. Listeners are delegated — not one of the ~70 call sites changed.

### 3. Linking, Keep, and the whole weave

- **Linking shows this reading's threads only** (TJ). The main list was already
  correct; the offender was the *"Threads that run out of this reading"* band.
  Decisive: the 08-08 ruling removed the across-readings shuttle, so a student
  can no longer **make** a bridge from inside a reading — every row there had
  been thrown somewhere else.
- **The Link List is offered at coin-time** — the permissive half of the same
  ruling, which did not exist at all. Capped at 12 **and it says so**.
- **Keep is every reading**, and **02/03/04 grey out** wherever they are not a
  live tab. **01 Reading greys too** (TJ): its href went to `/`, the station
  immediately to its left — a second door to one room dressed as a door to
  another.
- **The Capture Log moved to Keep**, and this was not cosmetic. It rendered in
  exactly one place (`MapTab`, behind `wholeWeave &&`) and appears in **no
  export** — so withdrawing `/weave` would have made it unreachable *and*
  unkeepable at once, on the page whose reset dialog promises the history
  survives. Red line 5.

### 4. Access is legible now

- **One bar.** `JourneyNav` carries a `.staffgroup` on the right, in sage,
  unnumbered: **Courses · Readings · Roster · Cohort Graph · Workflows ·
  Access** (admin-only pair first, so faculty do not open with two gaps). It
  renders on every surface including `/admin`; `AdminNav` keeps only the
  course/section pickers. That is the model's own account of the role —
  capabilities are additive — and two navigations said the opposite.
- **View as student** — a lens beside the pill, which now reads **Admin** or
  **Faculty** from the *course* rather than the session. A **cookie**, because
  three differences are decided server-side: `/workflows` (three flows vs one),
  the Library query (an admin's shelf carries `isVisible=false` rows), and
  `getActiveCourse` itself. Masked **once**, in `getActiveCourse`;
  `staffTruly` rides along unmasked for one purpose — drawing the way back out.
  **It withholds, never grants**, and no authorization path consults it.
- **`/access`** is the role/capability matrix, its own tab, staff only (each row
  cites the file and line that enforces it). `src/lib/capabilities.ts` **is** the
  matrix and `check-workflows.ts` asserts every gate still exists — it caught a
  wrong row on its first run.
- **`MetaPage`** gives `/workflows` and `/access` the scopebar/journey/footer, so
  a reference page changes what is below rather than replacing the frame.

### 5. Two authorization holes, found by building the matrix

Both verified in source before changing anything:

- **`peersOf` excluded `FACULTY` but not `INSTRUCTOR`.** `enrolInvitedCourses`
  writes `INSTRUCTOR` for an admin who joins by invitation, so **an admin's own
  captures counted as a peer in both overlay bands** — which is decision 4 in
  that same file, eight lines above the query. Now matched positively as
  `LEARNER`, which cannot rot the same way when the next role string appears.
- **`createPassage` never authorized its `sourceId`**, while `attributePassages`
  in the same file does, with a comment naming the risk. UI-hidden and
  server-permissive: a direct Server Function POST could file a passage against
  a staged reading or another student's private upload.

### 6. bytes → Passages, everywhere, including the database

**Migration 0023** renamed the tables, the join, the column, three indexes,
seven constraints, and the `graph_event.kind` / `entityType` values. Verified
against the database: no object named `byte` remains, 46 passages and 46 join
rows intact, all 95 events renamed, and `drizzle-kit generate` reports **no
drift** — the hand-derived snapshot matches.

**It took four passes**, and the reasons are worth keeping:

1. A word-boundary regex **cannot see camelCase** (`pageBytes`, `bytesByConcept`,
   `conceptIdsByByte`, `handleAddByte`, the `.bytequote` class — 41 of them).
2. A case-insensitive grep **matches `getByText`**, which made whole test files
   look guilty and hid the real ones in the noise.
3. **`tsc` cannot see a string.** The first pass renamed `pgTable("byte")`,
   `text("byteId")`, 13 raw-SQL references and the `graph_event.kind` values —
   and everything type-checked and built, because the types were consistent;
   they just pointed at tables and values that did not exist. 23 tests caught
   it. Had the event kinds shipped, every Capture Log would have gone silent.
4. The **docs** are where the vocabulary is defined, and they were last. `README`
   still described the object as "bytes" in its feature list; `AGENTS.md` still
   declared *"code speaks the July names"*, so anyone handed the repo would have
   concluded it called Passages bytes **on purpose**.

**Where the word legitimately survives, and nowhere else:** file data
(`formatBytes`, `byteLength`, `textLayerRepair`'s `bytes: Buffer`,
`storage.ts`), the import fallback, the migration note, and history — the
archive, the v14 audits, and `course-deployment-notes.md`, which records the
**etymology**: CAVEAT called a captured datum a "byte", which is where the word
came from.

**Two new guards, both proven by watching them fail:**

- **`scripts/check-import-compat.ts`** — the export key became `passages`, and
  every `.json` exported before today says `bytes`. `parseImport` reads both.
  The suite could never have caught this: it round-trips what the *current* code
  emits, which is exactly the shape blind to a key rename.
- **`scripts/check-vocabulary.ts`** — no Passage is called a byte, in code or in
  the live docs; and **every event kind emitted has a `case` in HistoryPanel**,
  which guards a silent truncation of a student's history.

### 7. Defects fixed, and the red lines they crossed

Phase 0 of [docs/open-work.md](docs/open-work.md), plus what the copy sweep found:

- **The trim bug** — `handleAddConceptOnly` matched **untrimmed** and wrote
  **trimmed**, so `"boundary objects "` skipped the homonym confirm and minted a
  silent duplicate at the exact gesture designed to ask.
- **Merge picked among homonyms by label.** Not a bad lookup — asking for a
  *label* to identify an *object*, which the model rules out in as many words
  while also making homonyms legal. Now a **picker holding concept ids**.
- **`getUserLoomDataAsAdmin`** never checked the target's membership, so a
  **removed** member's loom stayed readable to faculty.
- **`mapKit` gave a student advice** — *"the top few are your primary
  candidates"*, *"one spine to hang the rest on"*, *"STILL LOOSE (decide: …)"* —
  from a student tab. Red line 3: counted, never judged, **no advice**.
- **Two red warnings on a legal state**, in `VocabularyTab` and its twin in
  `CardMenu`: *"every concept **should** trace to a passage"*, in `var(--red)` —
  which `globals.css` reserves for *"the one selected thing"*. Eight days after
  the ruling that a Concept may precede its evidence.

**The lesson worth carrying:** red lines 3 and 4 have **no test**. Everything
else this session was caught by a gate; these were caught by reading the copy
against the rules. A `check-copy.ts` scanning student-facing strings for
imperatives would not be airtight, but it would have caught all four.

### 8. The three kinds — and the ruling that gates everything

TJ: *"aren't there 3 states for concepts?"* Yes, and `scope.ts` already computed
them. Your work now draws them: **In this reading · No evidence · In your other
readings**, the third naming the concepts where it used to give a bare count.

**KINDS, NEVER STAGES.** Transitions run every direction (name-then-find 3→1,
unfile 1→3, find-again 2→1), so no numbering, no counting one against another,
and no "yet" in a heading.

That came out of TJ's larger stance, which is worth ratifying into the model:
**the tool helps students build concepts, not document complete ones.** The word
to avoid is *incomplete* — the model's own 08-08 ruling says zero Passages is
reached three ways, *"all legal and indistinguishable in the data"*, and
"incomplete" is true of only one of them. **"Never" is a conclusion, not an
unfinished state.**

**Proposed and not built:** let the student designate *"looked, not here"* per
(concept, reading). Record **conclusions, never intentions** — "still looking"
is the default and needs no storage — which takes it from N×M cells to the few
rows where a judgement was actually formed. Guards: never counted, aggregated,
or sorted by; never in the overlays.

---

### 9. Traps this session

- **Never edit source while the Playwright suite is running** — the dev server
  hot-reloads and you get a confusing mid-run failure.
- **A `const` used in a `useEffect` dep array must be declared above it** —
  siting it below is a temporal-dead-zone crash on first render.
- **The CSS in `PdfViewer` is a JSX template literal**: a backtick in a comment
  closes the string and the whole reading fails to parse.
- **`overflow: clip` vs `hidden`**: clip makes no scroll container, but
  **`scrollWidth` reports the overflow either way** — the scrolling *area* is a
  different question from whether the box scrolls.
- **`useSearchParams` forces a Suspense boundary** or it takes the whole route
  client-side; inline in `JourneyNav` it broke the build on the prerendered
  `/keep`.
- **`next/headers` cannot be imported into a client bundle** — hence
  `viewAs.ts` (the cookie name) and `viewAsServer.ts` (the read).
- **A migration's `when` must be a real clock reading after the last applied
  one**, or the migrator silently skips it. A hand-written migration needs a
  hand-derived snapshot, verified by `drizzle-kit generate` reporting no drift.
- **`drizzle-kit generate` cannot see a rename** — it diffs and emits DROP +
  CREATE. Write renames by hand.

### 10. Where to start

**[docs/open-work.md](docs/open-work.md) is the ordered plan.** Phase 0 is done.

**Next is Phase 1 — the 05 Weave ruling**, and it gates the most: the
whole-weave Cloth, the whole-weave Projections and `ShelfSearch`'s three
`/weave` links are all stranded, and **if Weave comes back as a station they
un-strand themselves.** Building homes for them first means building twice.

Then Phase 2 (capture provenance and naming — the offer-not-assertion change and
the Source override, one sitting), Phase 3 (the two access decisions), Phase 4
(the model doc's drift, now demonstrable), Phase 5 (Link-as-object, the snip,
cloth co-authorship), Phase 6 (CI — the `e2e` gate has never run, and every push
to `dev` reports *"Bypassed rule violations — 2 of 2 required status checks"*,
so the protection is decorative).

**Still true and still untested by a human:** the fresh-GitHub-account sign-in.

---

## Addendum, 2026-08-08 (a long day of TJ's rulings — history, but still true)

**Nineteen commits on `dev`, `c3761a0`…`c50c5c4`, all pushed.** `npm run check`
(now including `check:workflows`), `next build` and the Playwright suite
(**43 passed / 1 skipped**) are green at the end of every one. **No migration
all day** — nothing this session changed the database.

This replaces five separate 08-08 addenda written as the day went; they each
said "read this first", which stopped being useful. Nothing below is lost from
them.

---

### 1. What TJ ruled, in the order it happened

Each of these is recorded in `docs/loom-model-build.md` (the authority) and
reflected in `docs/contracts.md` (as built).

- **Station 03 is Vocabulary** — the User's holdings: every Concept and Link
  Label across all readings, filter, edit Descriptions, **merge** (its only
  home). The cloth prompts and a *duplicate* read editor moved to the graph tab
  as `ClothReflection`.
- **00 Reading and 01 Open merged** into one **Reading** station: the text, with
  the capture log in a rail beside it.
- **05 Weave is hidden** (not deleted — `hidden: true` in `JourneyNav`'s
  `STATIONS`); **Keep stays** as a ratified deviation (D4 answered).
- **Linking works on this reading's concepts only.** The "from your other
  readings" band and the across-readings shuttle draw are gone. A concept met
  elsewhere joins the warp by capturing a passage here under it.
- **A Concept may precede its evidence** — name it, gloss it, then read for
  support. "No evidence" is a designation, never a warning.
- **A cloth starts in Reading**, is *named* there too (`ClothFold` moved), and
  the reading card is **the one door**: no Create Cloth button, the cloth row is
  metadata (title, "edited …").
- **Cloth cardinality**: *one cloth per reading per user, but a cloth may have
  several users.* Ratified; **not built**. See §5.
- **Overlays are faculty/admin only**, with a **section picker** (off · All
  sections · each by name).
- **03 and 04 swapped**: 03 Knowledge Graph, 04 Vocabulary.
- **Workflows moved to `/workflows`**, out of `/admin`, into the header beside
  About. Students see the student flow only.

### 2. The sentence the model now hangs on

> **The Cloth is the evidence; the Projection is the lens — and they work
> together, because the evidence is subject to interpretation by the reader.**

TJ's, and then TJ's own correction of it, which is the important half: choosing
which passage to keep is *already* judgment, so a Cloth is never raw evidence
and its Description is interpretive **by design**. The difference between a
Cloth and a Projection is **level, not kind** — the Cloth is the reading you
made while gathering, the Projection re-reads it by arranging.

That one line settles four things that arrived as separate questions: why a
second cloth is redundant *for interpretation*, why the read paragraph belongs
to the Projection, why the cloth is named where its evidence is gathered, and
why Cloth Description stays put. Model doc §2, "Reading · Cloth · Projection".

### 3. Bugs found by looking, not by type-checking

Each of these compiled and shipped fine:

- **`/admin/library` 500'd for faculty.** It had no page-level gate and leaned
  on `getLibraryOverview` *throwing* `Unauthorized`. Invisible until the shell
  learned to admit faculty. **House rule: a page under `/admin` gates itself.**
- **The header's "?" was dead on every `/admin` page.** It dispatches
  `loom:walkthrough`; `FirstRunWalkthrough` was mounted only on the shelf, Keep
  and the workbench. Now mounted once in the root layout.
- **React 19 hoists `<title>` into `<head>`**, so an SVG `<title>` per diagram
  node threw a hydration error.
- **JSX drops a literal space after an expression at a line end** — "7
  conceptsfrom your other readings". Fixed with an explicit `{" "}`.
- A **faculty viewer's Section band was structurally empty** (they sit in the
  Faculty Section, which `peersOf` excludes) — which is what the picker fixed.

### 4. Traps that cost time today

- **The suite's summary line never flushes** when a dev-server child holds the
  output open — this affects a redirect to a file, not just a pipe.
  **`grep -c "^  ok "` with no `^  x ` is the reliable signal.**
- **A failed run leaves capture residue** on Test User A (duplicate test
  concepts) which then fails the *next* run for an unrelated reason.
  **`npm run seed:demo` before believing a second failure.**
- `enterReadingFromCard` in `tests/helpers.ts` is now the single way a spec
  enters a reading — **six spec files** go through it rather than clicking
  `.shelfmain` themselves.
- Station numbers are **derived** from the visible stations
  (`JourneyNav.VISIBLE_STATIONS` / `stationNumber()`), and the workbench footer
  reads from the same place. **Student copy should name a station, not number
  it** — "Keep", not "06 · Keep".
- **`src/lib/workflows.ts` IS the diagram.** A workflow change is not finished
  until that file says so; `npm run check` fails on dangling edges and orphan
  nodes but cannot tell you the picture has fallen behind. `AGENTS.md` says so.

### 5. Open — TJ's calls

- **Cloth co-authorship** (the several-users half of the ratified cardinality).
  Not built. The blocking work is `cloth_member`, membership-based
  authorization across **84** row-ownership checks, and an export contract that
  can name more than one author. Full analysis, including why sharing beats
  partitioning: **`docs/cloth-cardinality.md`**.
- **05 Weave** — hidden pending a decision on what it becomes. `JourneyNav`'s
  old comment claimed TJ ratified it as its own station on 8/1; that is an
  agent's summary, not TJ's word, so treat it as unverified.
- **The section picker lists the Faculty Section**, which always reads empty
  (ruling 4 excludes faculty from peer counts). Drop it from the list?
- **Several modes of reading** are expected inside 01 · Reading (TJ). Nothing
  built; noted in the model doc's tab 2.

### 6. Next, and ready to start

Two items TJ raised and asked for, in size order:

1. **Capture log → "Notes", as a slide-out.** TJ: *"the current capture log
   button is a little weird. it seems like it should be 'notes' at least, if
   not having the ux also changed."* Today it is a rail toggled from the PDF
   toolbar (`.readinglog`, `openCaptureLog` in `tests/helpers.ts` drives it).
   The rename is small; the slide-out/toast behaviour is the real work.
2. **Manual capture for unselectable diagrams**, and possibly a **screen snip**.
   TJ: the concept maps in *Learning How to Learn* (p56 is the known-damaged
   sideways one) have no selectable text, so highlighting cannot reach them —
   which is a better justification for by-hand capture than the copy currently
   in the fold. **A snip is a bigger feature**: `passage` has no image column and
   the blob store would need a path for it, so scope it separately.

### 7. Carried over, still true

- **Next's queue bug** (vercel/next.js#90467) is routed around, not fixed;
  re-measure with `scripts/repro-action-bounce.mjs` after a Next upgrade.
- **CI's `e2e` gate has never run** — it needs `CI_DATABASE_URL` and
  `CI_BLOB_READ_WRITE_TOKEN` (deployments.md §CI). Until then only `checks`
  gates a PR, so the 43-test suite is *not* the gate.
- **The fresh-GitHub-account sign-in** has still never been run by a human.
- The pulled Vercel env file is now **`.env.production.pulled`** — `next build`
  runs clean with it in place, and `LOOM_ENV_FILE` still reaches production.
  It holds a **real** production `DATABASE_URL` and blob tokens; only
  `GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are
  `[SENSITIVE]` placeholders.

---

> **Everything below is history.** It is kept for the reasoning and the
> measurements, not as a description of the build. Where it disagrees with the
> 08-08 addendum above — and it does, on the station list, the reading card, the
> Overlays and station 03 — **the addendum above wins**, and
> `docs/loom-model-build.md` wins over both.

## Addendum, 2026-08-07 latest (the shelf bounce, fixed at the mechanism)

**Read this first. The navigation bounce — the highest-value open item the
previous addendum left — is fixed, and the fix is measured, not reasoned.**

One commit on `dev` after `5af0aa2`. `npm run check`, `next build` and the
Playwright suite are green; **no migration** — this is a transport change, not
a data one.

### What it actually was

Not a race between the shelf's own fetch and the `<Link>`, which is what the
previous session guessed. Instrumenting Next's client router (patched, traced,
restored) showed a **queue-corruption bug in Next itself**:

1. Three read Server Functions queue on load at `/` — `getSources`,
   `getActiveCourse` (both ReadingsProvider) and `getUserLoomData`
   (LoomProvider). The one in flight at click time is `getActiveCourse`.
2. The click dispatches a navigation. Next marks **only the currently pending**
   action discarded — the ones queued *behind* it are untouched.
3. The discarded action's late response still drives the queue: it advances
   `pending` past the still-running navigation and starts the next queued read
   **early, against the pre-navigation state** — so `getUserLoomData` POSTs to
   `/`.
4. That read returns no redirect, no revalidation and no flight data, so the
   reducer takes its bail-out path and hands back **its input state**, which
   `handleResult` commits — silently rolling the queue's `canonicalUrl` back to
   `/` *after* the navigation had committed `/reading/<id>`.
5. Nothing looks wrong yet: React applies the transition updates in dispatch
   order, so the rendered URL stays right while the queue quietly holds `/`.
   Seconds later the first workbench read POSTs to `/`, the server answers with
   the library, and the student is thrown out of the reading.

Upstream this is **vercel/next.js#90467** — a regression introduced in Next
16.0.0, still unfixed in 16.2.x (the only candidate patch, PR #91044, is
unmerged). The margins are milliseconds: in the one clean run of six, the
discarded response landed 11 ms *after* the nav commit instead of before.

### The fix: client components do not invoke Server Functions for reads

Next's own docs (vendored, `01-getting-started/07-mutating-data.md` and
`02-guides/backend-for-frontend.md`) already say not to: *"Server Functions are
designed for server-side mutations… Server Actions are queued. Using them for
data fetching introduces sequential execution."* Reads were only ever on the
queue because that is the path of least resistance.

- **[src/lib/reads.ts](src/lib/reads.ts)** — the client's read surface. Same
  names, same signatures, same shapes as the actions; each one GETs a thin
  route. Client components import reads from here, **never** from
  `@/actions/*`. JSON drops `Date`, so the loom and the capture log are revived
  on arrival.
- **Twelve route handlers** under `src/app/api/` (loom, loom/events, sources,
  course, three search, two overlays, repairs/settings, two draft-metadata),
  each calling the *same* action function server-side —
  [src/lib/readRoute.ts](src/lib/readRoute.ts) maps `Unauthorized`/`Not found`
  to 401/404 and everything else to a logged, generic 500. **Auth is unchanged
  and unduplicated**: it still lives in the action, so both transports enforce
  the same gate (including overlays' deliberate no-dev-backdoor rule).
- Route handlers "do not participate in layouts or client-side navigations"
  (`15-route-handlers.md`), so a read can no longer move the router. Mutations
  stay Server Functions — that is their sanctioned use.

Verified all twelve are **ƒ (Dynamic)** in the build output. Worth checking if
you add another: a statically prerendered `/api/course` would serve one
student's course to everyone.

### The one thing the transport change broke, and how it is handled

Through the queue, reads were serialized *behind* writes. They are not any
more, so a "reload the truth" response could set out before a student's gesture
and land after it — erasing a row they can see, and leaving an in-flight
`createConcept` with no temp row to swap its server id onto (the concept would
vanish until reload). LoomProvider now keeps a **write epoch**: every
optimistic write goes through `applyLocal` and bumps it, whole-truth
replacements (`applyTruth`: merge, the imports, reset, worked example, the
sign-out blank) bump it too, and `loadLoom` applies only if the epoch it set
out under still holds. All raw `setState` calls now live inside those three
appliers — grep it if you add one.

### Measured

`scripts/repro-action-bounce.mjs` is now a **check, not a reproduction**: it
expects 0 and exits 1 on any bounce. Against a production build (`next build &&
next start -p 3100`), Test User A, "Object Worlds":

| entry | action | before | after |
|---|---|---|---|
| shelf click | reading search | 2/4 bounced | **0/6** |
| shelf click | passages overlay | 2/4 bounced | **0/6** |
| direct load | passages overlay | 0/4 | **0/4** |

The per-run trace line now reads `GET /api/search/reading` where it used to
name an action POST — the read is off the queue, which is the fix, not a
mitigation of it. `tests/reading-search.spec.ts` (which enters by **clicking**
the card) gained end-of-test still-on-the-reading assertions, so the suite
would catch a regression; `tests/overlay.spec.ts` still enters by href, now for
tidiness rather than avoidance.

### What remains

- **Next's queue bug is still there**, and this fix routes around it rather
  than repairing it: a *mutation* in flight when a navigation commits can still
  corrupt the queue's canonical URL. Every mutation here is gesture-driven and
  the debounced ones flush on `pagehide`, so no known user path hits it —
  watch #90467/#91044 and re-measure after a Next upgrade.
- **Faculty path still untested through a browser** (carried over): the gates
  are asserted and the shell builds, but no spec signs in as FACULTY — the
  backdoor mints Test User A only. Worth a manual pass.
- **D4 and the Open/Reading merge** are still TJ's calls (08-07 morning
  addendum). Station 03 is labelled Vocabulary but still holds the
  read-the-cloth prompts.
- The [SENSITIVE] `.env.production.local` still breaks `next build`; this
  session moved it aside and restored it. Delete it or re-pull real values.

## Addendum, 2026-08-07 (P3.14 — the refactor spec is executed end to end)

**Read this first. P0–P3 are all landed; the work order has nothing left in it.**

One commit on `dev` after `6cffa02`. `npm run check` (now including
`check:overlay`), `next build` and the full Playwright suite (32 passed / 1
skipped) are green; dev DB unchanged — **no migration**, the overlays are pure
reads over rows that already existed.

### P3.14 — student Overlays (ruling 28), on TJ's four decisions

TJ ruled the open privacy/UX questions this session; they are enforced in
`src/actions/overlays.ts` and nowhere else, and written into that file's header
so the next reader doesn't have to reconstruct them:

1. **The gate stays, per reading.** The archived spec's red line #8 — "the crowd
   must not pre-code the text" — carries into v1. An overlay opens on a reading
   only once you have captured a passage in it yourself; at the whole weave the
   comparison covers exactly the readings you have coded.
2. **Section and Cohort only.** No "me + colleague" band in v1, so nothing the
   server returns is a name, an id, or resolves to one. Counts are of **people**
   (one student filing four passages under a label counts once).
3. **Shared objects only** — spans, Concept Labels + Descriptions, Link Labels +
   Descriptions. The passage query selects no `content`. Notes, questions,
   pull-quote flags, passage tiers, cloth and projection text never travel.
4. **Faculty are not peers** in either band: an exemplar cloth read as "your
   cohort" would be the instructor pre-coding the text.

What shipped: `getPassagesOverlay` / `getVocabularyOverlay` (a fifth
`"use server"` module — shapes and arithmetic in `src/lib/overlay.ts`, asserted
without a database by `scripts/check-overlay.ts`); an **Overlay · Section ·
Cohort** control in the PDF toolbar that shades peer spans in five slate steps
under a status line that states the denominator; and **What others named** below
the read on 03 · Vocabulary. Both are off until asked for, and re-ask when your
own capture count changes so the capture that opens the gate opens the overlay.

Two details worth not re-deriving:

- **Depth comes from a sweep line, not from row counts.** Overlapping captures
  become disjoint runs carrying their overlap depth (`heatSpans`), so eleven
  people on one sentence is one span at depth 11, not eleven spans.
- **Your own yellow nests inside the wash and paints over it.** Since "did
  anyone else mark what I marked?" is the most interesting thing the view
  answers, the overlay also draws a slate rule *above* the words — yellow
  underlines, slate overlines, neither hides the other.

`npm run seed:demo` now seeds **Test User C and D** into a new **Section 1**
alongside A (B stays unplaced and empty — it is still the fresh-account
fixture). They each capture the same passage A did on each reading plus one of
their own, and share two labels, so the overlay has a real depth-2 run and a
word held by two people. Without them every assertion in `tests/overlay.spec.ts`
would pass against an empty comparison.

### Found while verifying: a pre-existing navigation bug, not fixed

**Enter a reading by clicking its shelf card, then call any Server Function, and
about half the time the function POSTs to `/` instead of `/reading/<id>` — the
server answers with the library's tree and the App Router replaces the workbench
with the library.** The student is in a reading one moment and on the shelf the
next, mid-work. Measured against a **production build**, so it is not a dev
artifact:

| entry | action | bounced |
|---|---|---|
| shelf click | reading search (`searchReading`) | 2/4 |
| shelf click | passages overlay (`getPassagesOverlay`) | 2/4 |
| **direct load** | passages overlay | **0/4** |

So it is the client-side entry, not the action — the overlay only made it easy
to hit. Same family as audit finding U-3 (navigation racing in-flight action
POSTs); the likely culprit is the shelf's own `getUserLoomData` POST still in
flight when the `<Link>` navigation commits, leaving the router's canonical URL
behind on `/`. The tell in the trace is `history.replaceState -> /` from Next's
own router mount effect.

- Reproduce: `node scripts/repro-action-bounce.mjs 4 overlay` (and the control,
  `DIRECT=1 … `). It is a **reproduction, not a check** — it exits 0 either way
  and is expected to report bounces until this is fixed.
- `tests/overlay.spec.ts` enters by href for this reason and asserts it is still
  on the reading at the end of every test, so it can never pass through a
  bounce. **`tests/reading-search.spec.ts` still enters by click and is latently
  flaky for the same reason** — worth fixing with the bug.
- Left alone deliberately: the fix is in `LoomProvider`'s fetch lifecycle, which
  is its own piece of work with its own risk, and nothing in P3.14 depends on it.

### What remains

- **The navigation bounce above** — now the highest-value open item: it is
  user-visible, reproducible, and pre-existing.
- **Faculty path still untested through a browser** (carried over): the action
  gates are asserted and the shell type-checks and builds, but no spec signs in
  as FACULTY — the backdoor mints Test User A only. Worth a manual pass.
- **D4 and the Open/Reading merge** are still TJ's calls (see the 08-07 morning
  addendum). Station 03 is labelled Vocabulary but still holds the read-the-cloth
  prompts rather than the model's Concept/Link lists; the overlay was added there
  because that is where the ruled tab lives, and it will sit correctly when the
  tab's own content is reconciled.
- The [SENSITIVE] `.env.production.local` still breaks `next build`; this session
  moved it aside twice and restored it. Delete it or re-pull real values.

## Addendum, 2026-08-07 late (P3.13 and P3.12's auth side — P3.14 is all that remains)

**Read this first; the morning addendum below is now history except where noted.**

Two commits on `dev` after `78d3b19` (the auth workstream, which unblocked all
of this). Typecheck, build and the Playwright suite are green; dev DB unchanged
(no new migrations); `docs/contracts.md` re-stamped.

- **P3.13 — the cloth reaches the card.** A reading card is now a `<div>`
  whose reading link is `.shelfmain` (Playwright specs click that, not the
  card); below it the cloth row: badge (count, titles on hover), **Create
  Cloth** (explicit — creates the row via `saveCloth`, then walks in) and
  **Open Cloth** labeled by title. One cloth per scope still (schema unchanged)
  — the row renders a list so several-per-reading lands free. Cloth
  Title/Description are edited in a fold on **02 · Linking** (`ClothFold` in
  ThrowTab) — which also restores an editor for the whole-weave cloth's
  description, orphaned since 0021 absorbed `read`. `updateCloth` in
  LoomProvider now takes an optional explicit scopeKey and returns success.
  Shelf's July strings converted ("N passages", `00 — LIBRARY` footer).
  New spec: `tests/cloth.spec.ts` (idempotent — no cloth delete exists, so it
  takes whichever of Create/Open the card offers).
- **P3.12 auth side.** `/admin` now admits course FACULTY to the read-side:
  layout gate via `listFacultyCourseIds`, nav shows them Roster + Cohort Graph
  only, pages resolve their course through the new `getStaffViewer` (so
  faculty entering `/admin` bare land on *their* course), and the roster
  renders write controls admin-only. Roster rows carry `role`; a **Make
  faculty / Return to learner** toggle posts `setMemberRole`. Enrolment-time:
  an invitation pre-assigned to the course's `faculty`-slug Section enrols as
  FACULTY — fresh enrolment only, asserted in `scripts/check-auth.ts --db`
  (the invite hint on the roster explains this to instructors).

### What remains

- **P3.14 (student Overlays, ruling 28)** — untouched, deliberately: it needs
  TJ's privacy/UX decisions (below). Server side can largely reuse
  `getAggregateLoomData` behind a member-level gate.
- **Faculty path untested through a browser.** The action gates are asserted;
  the shell (nav filtering, getStaffViewer resolution) type-checks and builds
  but no Playwright spec signs in as a FACULTY member — the suite's backdoor
  mints Test User A only. Worth a manual pass: promote a second account on
  `/admin`, sign in as them, confirm Roster + Cohort Graph and nothing else.
- The [SENSITIVE] `.env.production.local` still breaks `next build`; this
  session moved it aside for the build and restored it. Delete it or re-pull
  real values — it costs a mv/mv every build until then.

## Addendum, 2026-08-07 (the refactor spec, executed: P0–P2 complete, P3 partial)

**The spec is no longer behind the build — the build now speaks the model.**
Five commits on `dev`: `068dcac` (docs reorg: `docs/loom-model-build.md` is the
authority, the work order is `docs/loom-refactor-spec.md`, superseded specs are
stamped in `docs/archive/`), `38a8298` (P0 — migration 0021: `byte_concept`
pointers, Unlabeled Passages legal, passage margin fields, `edges.sentence`
optional, `cloth` table absorbing `read`, mirror dropped, `byte.capture` +
`unfilePassage`), `ca97b4a` (P1 — `mergeConcepts` + homonyms warned-never-forbidden,
unified search over own concepts/links/passages with migration 0022, the
unattached Unlabeled-Passages group in the projection view), `f647b82` (P2 —
the naming sweep: projection / passage / label / description / one-line /
Knowledge Graph / Capture Log everywhere a student reads, tongues removed),
`22247cf` (P3.12 core — Faculty Section per course, `setMemberRole`,
`checkCourseFaculty` on the four read-side admin actions). Typecheck, build and
the full Playwright suite (28 passed / 1 skipped) are green after every one;
`docs/contracts.md` is re-stamped at each step. Dev DB is migrated through 0022.

### What remains of P3, and why it waits

- **P3.13 (reading-card Create Cloth / Open Cloth buttons, count-with-hover,
  rulings 20–22/33)** — lives in `Shelf.tsx`, which carries the UNCOMMITTED
  auth workstream; land that first, then also convert Shelf's July strings the
  P2 sweep deliberately skipped ("N bytes" tally line, `00 — READINGS` footer).
- **P3.12 auth-side** — faculty entry in the UI and any enrolment-time role
  assignment live in `src/lib/auth.ts` (same uncommitted workstream). The
  action-layer gate is already in.
- **P3.14 (student Overlays, ruling 28)** — Passages heatmap in the Reading
  tab; Concepts/Links overlays in Vocabulary; me+colleague · Section · Cohort
  granularity. Untouched: it needs privacy/UX decisions (what a student sees of
  a colleague's work, how a colleague is picked) that deserve their own session.
  The server side can largely reuse `getAggregateLoomData`'s shape behind a
  member-level gate.

### Decisions still open (TJ)

- **D4**: Keep as a ratified sixth tab, or folded into Linking/Knowledge Graph.
- **Open/Reading merge**: the ruled five tabs assume one integrated Reading
  tab; stations 01 Open and 00 Reading are still separate (labels kept pending
  the structural merge).
- URL tab params (`?tab=map`) deliberately kept legacy (code-side per §F);
  rename only with a redirect plan.

### Toolchain notes from this pass

- Never hand-space a migration timestamp ahead of real time: drizzle's
  migrator skips any migration stamped earlier than the max applied
  `created_at` — 0021's future stamp silently swallowed 0022 until repaired.
- Hand-written migrations need a hand-derived `meta/*_snapshot.json` (0021's
  was derived from 0020's and verified by `drizzle-kit generate` reporting no
  drift) or the next `generate` re-emits the whole changeset.
- `.env.production.local` still holds literal `[SENSITIVE]` values and breaks
  any local production build; restore real values or delete it.

## Start here

`RepairPanel` is mounted and the loop **has been run end to end through the UI**
— detect → read → review → accept → apply, on *Design as Critique* page 9, with
the repaired revision written to blob and re-ingested. What that turned up is in
the evening addendum immediately below; it was none of the three things this
file predicted.

**The next open item is the one that has been at the top of the list for two
sessions: the spec is behind the build** (open item 2 under "Open items"). It
blocks the freeze, and nothing in the repair subsystem stands in its way.

## Addendum, 2026-08-04 evening (the repair loop, run for the first time)

**Read this before the morning addendum below; it corrects part of it.**

`npm run check` green. Uncommitted on `chore/alpha-foundation`.

### The panel is mounted

`/admin/library` — a **Repair Text** disclosure in each reading's action row,
next to Rescore, because rescore re-measures and this fixes. The summary says
where the reading is in the loop (`· 2 to review`, `· 1 to write`) so an admin
does not open eleven panels to find the one with a decision waiting. The page
fetches full proposal rows only for readings that have any, from one grouped
count (`getRepairSummary`), and passes each reading's `byte` count as
`hasHighlights`. `maxDuration = 300` is set on the page, which is what lets a
synchronous single-region read survive a serverless round trip.

**The panel had no Apply button** — `applyRepairs` existed and nothing called
it. Added, along with the result lines each act now reports.

### What the run cost and produced

Page 9, one region, **68s and $0.20**, 4 of 5 readers answering. Opus 5 took
66s and **$0.15 of the $0.20 — 77% of the spend** — and returned 2,097
characters against Grok's 7,561, because on the small type it wrote *commentary*
(`[two columns of body text, type too small to read reliably…]`) instead of
transcribing. That is the same shape as the reader the panel was built to
expose, now visible in the cost table rather than argued about.

`qwen/qwen3.8-max` did not answer. Measured directly afterwards: it returns
**HTTP 200 with an empty body after 184s**. Open item 2 is still TJ's call; the
timeout below stops it hanging a request either way.

### Four bugs, each found by running the thing

1. **The improvement guard passed a page deletion.** `applyRepairs` refuses a
   repair that "does not measure better" by comparing `garbledPageRate` — but a
   page with almost no text left is not *measurable*, so emptying a damaged page
   drops it out of both numerator and denominator and the rate falls. Measured:
   replacing page 2's 2,290 characters with the single word accepted for it
   moved the rate 0.750 → 0.727 and the guard **kept it**. Deleting a page read
   as repairing it. Now guarded per page, before the rate is consulted.

2. **The unit of repair was wrong.** `textLayerRepair` cannot edit a PDF's text
   operators in place, so it rasterises the page and lays a fresh text layer over
   it from the accepted transcription *and nothing else*. Sub-region crops
   therefore repair one paragraph by deleting the rest of the page — page 9 was
   proposed as **five** boxes, and applying them would have replaced 1,485
   characters with whatever those five held. The unit is now the page.
   `locateGarbleRegions` is deleted; `locatePageRepairRegion` replaces it.

3. **Detection measured the database; apply measured the file.** Detection read
   `source_page`, whose rows are a cache. On *Design as Critique* those rows were
   **stale**: nine pages of fused words (`oneofthe`,
   `mostinterestinguses`) where the same pages extracted from the blob read
   `For us, one of` at a 1–2% rate. Detection reported nine damaged pages on a
   reading that has one. Both halves now extract the file. *(This corrects the
   "lost spaces" reading of those pages — the file never had that defect; the
   rows did. The lost-space case is real and still reported as `unlocatable`,
   it just was not what was happening here.)*

4. **`REQUEST_TIMEOUT_MS` was `30`, not `30_000`** — 30 milliseconds, changed in
   83eab85. Every judge call aborted before a TLS handshake could finish, so
   **the judge had silently stopped running**: `structure` abstaining and
   `legibility` unrefined on every Rescore since. Verified by a live call failing
   at 35ms with `TimeoutError`, and verified fixed (3.5s, "OK").
   `VISION_TIMEOUT_MS` was `120_000_000` — 33 hours — where the comment says 120
   seconds; now 240s, above the slowest observed reading and under the page's
   `maxDuration`.

Also: expected refusals are now **return values, not throws** (Next redacts
thrown Server Function messages in production, and every refusal here is a
sentence someone has to read); crops are capped at 2,560px on the long edge,
because the readers downscale past ~2,576 and a 300dpi page was 3.7MB of base64
sent five times for pixels nobody saw; and region boxes are whole pixels, since
they become a canvas.

### Verified, not assumed

- *Design as Critique*: 1 damaged page before, **0 after**; page 9 replaced,
  every other page byte-identical in extraction (same chars, words, item
  counts) — the pdf-lib round trip changed nothing it was not asked to.
- *Learning How to Learn*: detection finds **p56** (75%, the sideways concept
  map — `peuosiad`, `paionnsuoo`), plus p57 and p58; its one highlight
  correctly renders the refusal notice.
- The crop route's auth was **fine** — no 4xx across any run.

### Worth knowing before touching this again

- **26% of page 9's sentences carried a majority.** 92 disagreements, 105 of 124
  distinct sentences backed by one reader alone. That is a photographed
  newspaper in dense columns and it may be the honest ceiling for such a page —
  but it means the *agreed* text alone (325 characters) can never pass the
  page-coverage guard, and a reviewer must compose from the readers. That is
  what the panel is for, but nobody had seen how much composing it takes.
- **`acceptedTextMatchesReadings` cannot catch a reader's own commentary** — it
  checks the text came off the page, and Opus's bracketed notes *are* a reader's
  words. Documented as a limit; now observed. The accepted text was checked and
  carries none.

## Addendum, 2026-08-04 morning (extraction, anchoring and repair session)

**Read this first; it supersedes parts of what follows.**

Branch `chore/alpha-foundation`, uncommitted. `npm run check` is green and now
runs lint, tsc, and two assertion scripts (`check:remap`, `check:scoring`).
`npm run check:textlayer` needs real PDFs and is run by hand.

### Landed in production (both databases migrated)

- **Migration 0016** — the `source_page` and `byte` foreign keys that
  `schema.ts` had declared since 0000 and that existed in **no** database.
  `deleteSource` had been relying on a cascade that was not there; 15 orphaned
  page rows were cleared from each environment. Plus indexes on `byte.sourceId`
  and `source_page(sourceId, pageNumber)`.
- **Migrations 0017 / 0018 / 0019** — `source_repair` and
  `source_repair_reading`, with per-reading token, cost and duration accounting,
  and the vote record for each region.
- **All 23 readings re-extracted.** The canonical text join changed (below), so
  every `source_page` row was rewritten. **23/23 highlight anchors survived** —
  verified, not assumed.

### The join fix, and why it mattered

`extractPdfPageText` joined pdf.js text items with `""`, discarding every line
boundary pdf.js had already computed. Consequence, measured against real
Postgres: `CraftBuilding` tokenises to `craftbuild`, matching neither `craft`
nor `building`, and **58–77% of line ends in this library fused two words**.
Reading search was silently missing them.

Stored text now records the boundaries; `textLayerProjection()` strips them back
out to recover **the browser's** text-layer string, which is where every
`startOffset`/`endOffset` actually lives — not the stored column. Anything
reconciling a client capture against stored page text must go through it.
`scripts/check-text-layer-projection.ts` asserts the round trip (42/42 pages
exact). Result: **+321 page-hits across ten common terms**, and the search index
shed ~26,600 junk tokens (42,940 → 16,333).

The warning that used to head `pdfText.ts` — "changing any of it silently moves
every existing anchor" — was **wrong**, and is corrected in place.

### Scoring, substantially reworked

Every change came from a measurement that contradicted the previous rule:

- `coverage` counted **all** pages, so a thesis of diagrams was penalised for
  being illustrated. It now counts pages that were supposed to carry text —
  `pdfStructure.ts` classifies each as `text` / `scanned` / `picture` / `blank`
  from a row-band profile (text bands at 5.0–8.9 per 100 rows, pictures at
  0.0–0.8; a six-fold gap with nothing between).
- `anchorability` was "at least 300 characters per page" — a proxy for whether a
  highlight holds that **never tested whether a highlight holds**. It now
  simulates captures (`highlightProbe.ts`) at 30/80/200 characters, sizes drawn
  from the real capture distribution where the shortest byte is 27 characters.
  Both readings that were failing on it anchor **100%** of simulated highlights.
- All character floors are gone. `PAGE_TEXT_FLOOR` stood in for "is this content
  or a running header", answered with length; repetition answers it properly,
  and catches the SAGE-watermark case the 120-character floor *admitted* (the
  stamp runs to ~159 characters).
- `legibility` used to be granted a **5** when there was too little text to run
  the language check — 693 characters of OCR noise scored 5/5/5 and passed. It
  now abstains, `pass` is three-valued, and the card shows "Unverified".
- The judge prompt was **telling the model to forgive** run-together words, the
  defect that matters most for quoting. Fixed. The judge can also no longer
  raise legibility past the measured ceiling, and a bug where the raw verdict
  was stored while the capped value drove `pass` is fixed.

### Gibberish detection and repair (new subsystem)

`garble.ts` finds scan-induced nonsense every aggregate misses — the characters
are valid, the letter distribution is perfect, and the page reads
`ihe feacier refigian haa`. Two restrictions make it honest: only **lowercase**
tokens count (proper nouns are capitalised, so bibliographies stop
false-alarming), and a page needs enough body words for the rate to mean
anything. Clean pages measure 1–2%; broken ones 30–81%.

`garbleRegion.ts` locates damage to a pixel box from the text layer, so crops
are exact rather than guessed. `repairPipeline.ts` sends the crop to five
independent frontier models. `repairConsensus.ts` computes agreement
**mechanically** — an adjudicator agent once returned a paragraph *describing*
the agreement, which was written into a PDF and improved every automatic measure
while being unrelated to the page. Agreement is by **majority**, not unanimity,
and the vote is recorded per reader: with-majority, outvoted, and *solo* counts.
Solo is the invention detector — `"from Saddam"` where three readers wrote
`"from Sadda"` shows as solo=1. Deciding a vote is exact (so `religions` and
`televisions` never merge); grouping the losers for display is fuzzy (so a
reviewer sees both variants of a disputed passage together).

`textLayerRepair.ts` writes an accepted transcription back as a replaced page. `src/actions/repairs.ts` and
`components/library/RepairPanel.tsx` are the admin surface.

### Open decisions — TJ's, not the next session's

1. ~~**Mount `RepairPanel`**~~ — done, and the loop has been run. See the
   evening addendum.
2. **`qwen/qwen3.8-max`** took 210 seconds when this was written, and on the
   run of 8/4 evening returned **HTTP 200 with an empty body after 184s** — so
   it is currently costing a reader slot and contributing nothing. Either it
   goes, or transcription moves fully behind `after()`. A 240s per-reader
   timeout now stops it hanging a request, which makes this a question about
   panel quality rather than about uptime.
3. **The panel is five readers** — Opus 5, Qwen3.8 Max, Gemini 3.6 Flash,
   Grok 4.5, Inkling Small. Odd on purpose: a majority cannot tie.
4. **Majority voting is in, with per-reader stats** (item 2 is what to spend
   them on). Nothing to decide unless the stats show a reader worth replacing —
   watch the `solo` column, which is where invention shows up. **First real
   numbers, page 9:** agreement 29% / 33% / 12% / 9% (Opus 5, Gemini, Grok,
   Inkling), solo counts 10 / 11 / 41 / 43. Read them as a property of the page
   before a property of the readers — a dense newspaper photograph is the
   hardest thing in this library — but Opus 5 spent 77% of the region's money
   for the shortest transcription of the four, which is the pattern this column
   exists to make visible.
5. **Upload gate** — spec line 139 says scoring is "advisory, not blocking".
   TJ's stated goal makes a gate unnecessary: a bad score means *source a better
   copy*, not *block*. Treat as decided against unless TJ reopens it.
6. **Git history** still holds the copyrighted seed PDFs. They are out of HEAD
   and gitignored. A purge needs `git filter-repo`, a force-push across six
   branches, and a GitHub Support request — the rewrite alone does **not**
   remove them. TJ chose to skip; not urgent, not closed.
7. **`tesseract.js` is installed and unused.** Measured as unnecessary here:
   every "scanned" page in this library is a cover, a blank leaf or a figure.
   Drop it unless a future upload needs it.

### Facts worth not re-deriving

- **`.env.local` is what every script reads.** `vercel env pull` writes
  `.env.production.local`, which nothing loads by default, and Vercel returns
  the literal string `[SENSITIVE]` for `DATABASE_URL` and five other variables —
  a pulled production file is **not usable as-is**. Use `LOOM_ENV_FILE`, and
  read the `database:` line every script now prints. PowerShell has no inline
  env prefix: `$env:LOOM_ENV_FILE = '.env.production.local'`.
- **Red line #6 is about students not outsourcing their thinking**, not about
  faculty preparing source material (TJ, 2026-08-04). Faculty-facing repair is
  not gated by it.
- **What text matters in a reading is not the tool's call.** A figure's labels
  and a reproduced newspaper are content a student may code.
- **The registry MCP is the authority on models.** Three things are not
  inferable from a model name, and all three would have shipped broken: image
  *generators* (`->text+image`) masquerading as vision models; `temperature`
  rejected by reasoning models; and `max_tokens` vs `max_completion_tokens`.
  Sorting by price is not sorting by recency.
- **Costs come from OpenRouter's `usage` reporting**, never a price table in
  this repo. Measured panel cost is **$0.18 per region**; the first estimate was
  50× low.
- **The two known-damaged pages** for testing: *Design as Critique* p9 (a
  photographed spoof newspaper) and *Learning How to Learn* p56 (a hand-drawn
  concept map printed sideways). Non-LLM rungs — rotation-aware re-OCR at
  400dpi — were measured and **fail on both**.

---


You are continuing work on Loom after the journey build of 2026-08-01 (which
followed the multiple-maps build of 07-31 and the reading-first pass of 07-30/31).

## Addendum, 2026-08-02 (alpha-foundation session — PR #4)

Read this first; it supersedes parts of what follows.

- **Open item 3 is closed.** The order-dependent `maps.spec` failure was a
  test-synchronization bug: `#saveDot` was still showing the *previous* save's
  1500ms flash on a warm server, so the spec reloaded early and **aborted the
  essence POST in flight** (the `ECONNRESET` in the server logs). Fixed by
  waiting on each action POST matched by its body, plus a strand sweep. The
  suite is now **24 tests in 8 files, all green in ~2.2m** — including new
  learner (00→06, Throw and Read covered for the first time) and admin journey
  specs. The underlying *product* bug (navigation aborts debounced saves;
  rename-during-create invisible in UI) is audit finding U-3.
- **New authorities:** [docs/audit-2026-08-02.md](docs/audit-2026-08-02.md)
  (full audit + alpha verdict), [docs/contracts.md](docs/contracts.md) (every
  contract surface), [docs/deployments.md](docs/deployments.md) (open item 1's
  plan in durable, checklisted form — the fresh-GitHub-account smoke test
  still stands and still cannot be automated),
  [CONTRIBUTING.md](CONTRIBUTING.md) (branch/PR/test rules).
- **Demo accounts:** `npm run seed:demo` → `test-user-a@loom.local` (3 maps
  from 2 readings, anchored verbatim passages, mirror-consistent) and
  `test-user-b` (enrolled, empty). Idempotent; the journey specs assert
  against it.
- **The gate exists:** `.github/workflows/ci.yml` (`checks` + `e2e`),
  CODEOWNERS, PR template; master branch protection requires a PR, the
  `checks` status and a code-owner review (`e2e` joins once its three CI
  secrets are configured — deployments.md §CI). A long-lived `dev` branch now
  exists for the tester deployment.
- The unpkg/pdf.js item in §5 below is **fixed** (worker vendored, 0f9f01b).
- Machine note: if the app serves pages but every `/api/*` route 404s, you
  have a stale `next dev` — kill the PID and `rm -rf .next`. And C: was found
  at 100% full on 8/2 (npm cache was ~14GB; cleaned to 15GB free) — check
  `df -h /c` before long runs.

## Where things stand

The app implements the v14 tool in full, on top of the production surfaces v14
has no equivalent for (auth, courses, the shared reading collection with
extraction scoring, PDF capture with anchored offsets). It is **reading-first**
(the reading is the entry point), maps are **per-scope, parallel and plural**,
and as of 8/1 the whole arc is **one journey bar** visible on every learner
surface.

- **The journey (ratified TJ 8/1):** `00 Readings · 01 Open · 02 Throw ·
  03 Read · 04 Map · 05 Weave · 06 Keep`, rendered by
  [src/components/ui/JourneyNav.tsx](src/components/ui/JourneyNav.tsx) under the
  header everywhere. A station you can work at *here* is a button (a workbench
  tab); every other station is a link. Outside a reading, Open routes to
  Readings — opening IS picking a text. On `/weave` the underline stays on
  **Weave** while throw/read/map act as its tools, so the bar always answers
  "where am I on the journey", never "which panel is showing".
- **Routes:** `/` is Readings (the course's readings by week, with the
  student's own counts); `/reading/[sourceId]` is one reading's workbench;
  `/weave` is every reading at once (`?tab=throw|read|map` deep-links);
  `/keep` is the whole artifact. **05 Weave is a station, not an escape hatch**
  — weeks 11+ mine and quilt the whole graph (deployment notes §4).
- **Say "readings", not "library".** The home screen is Readings in all student
  copy; "shelf" survives only as component and CSS names, which nobody sees.
  "Library" now means only the *instructor's* collection on `/admin/library`.
- **Maps (ratified TJ 7/31, spec §3 Map / §6):** tier is per concept PER MAP —
  `concept.tier` and the `reads` table survive only as expand-phase MIRRORS of
  the oldest whole-weave map, dual-written by `updateMap`/`saveView`/`deleteMap`
  in [src/actions/loom.ts](src/actions/loom.ts), so code rollback stays safe.
  The first sorting gesture in a fresh scope auto-creates "Map 1"
  (`ensureActiveMap` in LoomProvider). Export adds `graph.maps[]` +
  `views.maps` additively; import remints tier keys and synthesizes "Map 1"
  from pre-maps files, and re-scopes a map to the whole weave when its
  `scopeKey` doesn't resolve.
- **A map is a keepable artifact (ratified TJ 7/31 — see open item 2).** Each
  map exports as its own `loom-map` .json from 04 Map or 06 Keep, carrying its
  tiers, essence, paragraph, in-scope cards with their whole evidence, threads
  and arrangement — it stands alone — plus a readable .md outline. Importing a
  map file ADDS a parallel sibling (matched by card id, misses counted and
  reported); it never re-weaves missing cards and can never reach the replace
  path. The whole-cloth export remains the complete backup behind every map.
- **Scope** is read off the route in `LoomProvider`, and membership is derived
  from `byte.sourceId` in [src/lib/scope.ts](src/lib/scope.ts). **A concept does
  not belong to a reading — a byte does.** A concept emerges from a reading and
  may then be evidenced in several; nothing owns or re-homes one. See
  [docs/archive/reading-scope-and-map-passes.md](docs/archive/reading-scope-and-map-passes.md).
- **Every byte belongs to a reading.** Capture inside one stamps it; a student
  can mint a reference-only reading (title/author, no PDF) for anything the
  collection does not hold; passages with no reading are placed by *asking*,
  never by matching their citation text against titles.
- **Invitation, enrolment and access are three things (8/1).** The sign-in gate
  admits an invite, an active membership, the legacy allowlist, or an admin.
  Removal ends the *membership* — soft, `removedAt` (`0013`), work survives,
  re-invitation reinstates — and revokes sessions only when no access remains.
  Enrolment happens in `events.signIn`, not the `signIn` callback, because a
  first-time OAuth user's `user.id` is GitHub's, not ours, and the old insert
  could never survive its FK. Course resolution no longer falls back to "first
  course on the site" for non-members; admins keep the site-wide view.
- **One word per move.** A reading is **scheduled** (week, order, on
  `/admin/courses`); a learner is **placed** (into a section, on `/admin`). The
  header names the course you are working in, from a learner-safe
  `getActiveCourse()` resolved through the same enrolment that scopes the work.
- **Roster** is on `/admin`: invite in bulk (one email per line, optionally
  `email, Section name`), invited and enrolled shown as one list, pending first.
- **Graph vs. projections** (spec §6) is enforced in the schema: `concept.tier`
  is graph; card-table positions, edge bends, sort order and pinned definitions
  live in `view` rows; `read` has its own table; `graph_event` is the
  append-only development history, replayed in Read as "the cloth, over time".
- **Parity is reconciled, the audit docs are not.**
  [docs/v14-parity-audit.md](docs/v14-parity-audit.md) and
  [docs/v14-ui-language-diff.md](docs/v14-ui-language-diff.md) (123 items:
  A closed, B a review list, C production-only) were both last touched 7/31 and
  predate the whole journey build.

Verified at hand-off (8/1): `npm run check` (eslint + tsc) clean, `next build`
clean, migrations applied through `0013` in Neon (14 rows), `master` level with
`origin/master`. The suite is **12 Playwright tests in 6 files** (one worker,
signed in as Test User A via `test-login?as=testa`) and it is **not green end to
end** — see open item 3.

## Open items, in the order they matter

1. **Monday's dev deployment (8/3).** Testers were warned. The setup, reasoned
   through in the session log: a **Neon branch** for `DATABASE_URL` (one
   long-lived branch, not Vercel's auto-branch-per-deployment, which would
   reset tester data on every push); a **second GitHub OAuth app** whose
   callback is the stable branch alias, since an OAuth App allows exactly one;
   `NEXTAUTH_URL` set per-environment **with the protocol**; and the **same**
   blob store, or every reading 404s against the branched `source` rows.

   **First smoke test: sign in with a genuinely fresh GitHub account and
   confirm it enrols and lands on Readings.** 8/1 moved enrolment from the
   `signIn` callback to `events.signIn` — the bug that locked invited newcomers
   out at the door. Playwright reaches the app through the `test-login`
   backdoor and therefore cannot cover this path at all; it has only ever been
   reasoned about, never run. If it is wrong on Monday, every tester is locked
   out and nothing else in the deployment matters.

   (The old "add a reading of your own is untrodden" note has expired — the
   database behind this repo's `.env.local` now holds one `isOwn` reading.)

2. **The spec is behind the build — this blocks the freeze.**
   [docs/loom-spec-v1.md](docs/loom-spec-v1.md) is still rev **30c**, and three
   things the build now does are recorded only in commit bodies and code
   comments. Per §7, changes go by PR reviewed against the §4 red lines; these
   never got that PR, so the wording that is *supposed* to be authoritative now
   contradicts the shipped app:
   - §3 says Keep "is always the whole artifact and never a slice of it (red
     line #5)". The build keeps a single map. The commit (dc6a7f9) says TJ
     ratified this on 7/31, superseding a code comment that had over-claimed
     the whole-artifact-only reading — but the supersession never reached the
     spec, so the file still argues the opposite.
   - The revision history lists map **passes** as "proposed, not yet ratified".
     Per-map tiers are built, shipped and load-bearing.
   - §3 numbers Keep as **05** and has no station 05 Weave.

   Write the spec PR (rev 31) and, for each item, confirm with TJ that the
   ratification is real rather than inherited from an agent's summary. The spec
   and TJ are the authority; a commit message is not.

3. **`maps.spec.ts` fails in a full-suite run and passes alone.** Measured 8/1,
   both ways, against a dev server on 3100:
   - Whole suite: **8 passed, 1 failed, 3 did not run.** The failure is
     `maps.spec.ts:42 "a new map holds its own tiers and essence"` — after the
     reload, `#mapEssence` is still `""` where the spec wrote "One line written
     by the Playwright suite.", so the `toPass` block times out at 45s.
   - `maps.spec.ts` on its own: **4/4 in 21.6s.** `pdf-viewer.spec.ts` on its
     own: **3/3 in 30.6s** (those were the three that "did not run").

   So it is order-dependent, not a broken feature — the essence save is fine
   when nothing ran before it. f55190a on 8/1 fixed a race in this same spec by
   waiting on `#saveDot` instead of network-idle; this looks like the same class
   of problem one layer down, in the map the spec lands on rather than the save
   it waits for. Worth pinning before Monday, because a suite that only passes
   file-by-file cannot be the gate on the deployment.

   *Note for whoever runs it:* pipe the suite to a file, not to `tail`. Playwright
   starts the dev server as a child that inherits stdout, so a pipe never sees
   EOF and the command appears to hang long after the run is done.

4. **The maps contract migration (the "contract" half of expand/contract).**
   `concept.tier` and the `reads` table are still dual-written as mirrors of the
   oldest whole-weave map. Once the build has soaked (post-Monday testers), a
   follow-up should: stop writing `concept.tier` from `updateMap`/`deleteMap`,
   stop the `reads` upsert and the `cardTable` geometry echo in `saveView`,
   retire the deprecated `saveRead` action ([src/actions/loom.ts:517](src/actions/loom.ts#L517)),
   then drop the columns/table in a migration. Until then two known quirks are
   accepted: a student who works only in reading-scoped maps leaves the mirror
   columns reflecting older whole-weave work, and a failed re-mirror after
   deleting the mirror map leaves them stale until that map is next edited —
   the `map` table is authoritative either way.

5. **Auth / ops residue — blocks a freeze.** All pre-existing:
   - Dev-mode auth fallback impersonates `tjm@tjmcleish.com`
     ([src/actions/loom.ts:19](src/actions/loom.ts#L19)); `/api/readings` and
     `getSourceFile` skip auth whenever `NODE_ENV !== 'production'`;
     [src/lib/auth.ts:9](src/lib/auth.ts#L9) carries hardcoded admin fallback
     emails.
   - pdf.js loads its worker from unpkg at runtime
     ([src/components/pdf/PdfViewer.tsx:12](src/components/pdf/PdfViewer.tsx#L12)).
   - `scripts/apply-db-compat.ts` is an ad-hoc schema patcher behind the real
     schema — decide whether it retires.

6. **Section B review, now with a round 2.** The UI/language diff has a fresh
   **[round 2](docs/v14-ui-language-diff.md#round-2--2026-08-01-the-surfaces-built-since)**
   (8/1) covering everything the reading-first, maps and journey builds changed:
   3 small copy regressions to fix, 7 deliberate departures to confirm, 3
   production-only. Section A's nine priority fixes were re-checked and all
   survived the rebuild. That sits on top of round 1's untouched 40-item
   section B. No code needed until you pick.

7. **Deferred by decision, not oversight:** byte→concept is still one-to-many
   (re-file copies the byte, per spec §2's v1 semantics); markdown export exists
   but has not been reconciled with Lingxiu's fork; cohort/heat-map views remain
   admin-only and would need red line #8's "has coded this reading themselves"
   gate before any student-facing use — that gate does not exist in the data
   model yet. Multi-reading scopes are keyed for but not exposed.

## Local environment notes

Port 3000 is inside a Windows excluded port range on this machine
(`netsh int ipv4 show excludedportrange protocol=tcp` → 2969-3068 reserved), so
`npm run dev` on the default port fails with `EACCES`. Reboot, or as admin
`net stop winnat && net start winnat`.

Meanwhile **run on 3100 and it all works**, including admin pages: cookies are
not port-scoped, so `NEXTAUTH_URL=http://localhost:3000` still yields the right
session-cookie name. It was the missing protocol that broke it, never the port.

The suite has its own committed config for this — it starts the dev server
itself, and keeps `globalSetup` + `storageState` (drop them and the
authenticated specs run signed-out, which reads as a product failure and is
not one):

```bash
npx playwright test --config=playwright.3100.config.ts
```

Two things that will waste your time if you don't know them:

- **Next 16 allows one `next dev` per project.** A second one exits with
  "Another next dev server is already running" and prints the PID to kill.
- `Get-NetTCPConnection` and `taskkill` have both hung in this shell. Kill the
  dev server with `Stop-Process -Id <pid> -Force`, taking the PID from the
  message above.

## Kickoff commands

```bash
git status -sb
npm run check          # eslint · tsc · remap · scoring · auth · overlay · workflows
npm run seed:demo      # wipes and rebuilds Test Users A–D; do this before believing a test failure
npm run dev -- -p 3100 # 3000 is inside a Windows excluded range on this machine
```

Then the suite, in its own terminal — **redirect to a file, never a pipe**, and
read the count rather than waiting for the summary line (see §4 above):

```bash
npx playwright test --config=playwright.3100.config.ts > run.txt 2>&1
grep -c "^  ok " run.txt      # 43 is green
grep    "^  x  " run.txt      # empty is green
```

`npx tsx scripts/check-migrations.ts` still reports what Neon actually has;
nothing this session needed it, because no migration was written.

## Definition of done for the next session

Pick one open item above and close it end to end — with the red lines in
[docs/loom-spec-v1.md](docs/loom-spec-v1.md) §4 checked before merge, per §7.
