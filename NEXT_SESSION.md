# Next Session Prompt

You are continuing work on Loom after the journey build of 2026-08-01 (which
followed the multiple-maps build of 07-31 and the reading-first pass of 07-30/31).

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
  [docs/reading-scope-and-map-passes.md](docs/reading-scope-and-map-passes.md).
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
npm run check                              # eslint + tsc
npx tsx scripts/check-migrations.ts        # what Neon actually has
npm run dev -- -p 3100
```

## Definition of done for the next session

Pick one open item above and close it end to end — with the red lines in
[docs/loom-spec-v1.md](docs/loom-spec-v1.md) §4 checked before merge, per §7.
