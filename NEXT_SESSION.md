# Next Session Prompt

You are continuing work on Loom after the reading-first pass of 2026-07-30/31.

## Where things stand

The app implements the v14 tool in full, on top of the production surfaces v14
has no equivalent for (auth, courses, the shared reading library with
extraction scoring, PDF capture with anchored offsets) — and the tool is now
**reading-first**: the reading is the entry point, not a filter over
course-wide tabs.

- **Routes:** `/` is the shelf (the course's readings by week, with the
  student's own counts); `/reading/[sourceId]` is one reading's workbench
  (00 Reading · 01 Open · 02 Throw · 03 Read); `/weave` is every reading at
  once (02 · 03 · 04 Map); `/keep` is the whole artifact.
- **Scope** is read off the route in `LoomProvider`, and membership is derived
  from `byte.sourceId` in [src/lib/scope.ts](src/lib/scope.ts). **A concept does
  not belong to a reading — a byte does.** A concept emerges from a reading and
  may then be evidenced in several; nothing owns or re-homes one. See
  [docs/reading-scope-and-map-passes.md](docs/reading-scope-and-map-passes.md).
- **Every byte belongs to a reading.** Capture inside one stamps it; a student
  can mint a reference-only reading (title/author, no PDF) for anything the
  library does not hold; passages with no reading are placed by *asking* on the
  shelf, never by matching their citation text against library titles.
- **Roster** is on `/admin`: invite in bulk (one email per line, optionally
  `email, Section name`), with invited and enrolled shown as one list, pending
  first. Enrolment is on the course; section is a placement within it.
- **Graph vs. projections** (spec §6) is enforced in the schema: `concept.tier`
  is graph; card-table positions, edge bends, sort order and pinned definitions
  live in `view` rows; `read` has its own table; `graph_event` is the
  append-only development history, replayed in Read as "the cloth, over time".
- **Parity is reconciled.** [docs/v14-parity-audit.md](docs/v14-parity-audit.md)
  holds the gap analysis and the record of what was built;
  [docs/v14-ui-language-diff.md](docs/v14-ui-language-diff.md) holds the 123-item
  UI/language comparison — section A (66 divergences) is closed, section B (40
  deliberate departures) is a review list, section C is production-only.
- **Spec** is at rev 30c and is the build target; §4 red lines are the
  acceptance criteria.

Verified at hand-off: `npm run check` (eslint + tsc) and `next build` clean;
**Playwright 8/8** against a running server; migration `0011` applied to Neon.
`master` is pushed and deployed.

## Open items, in the order they matter

1. **Passes need a §7 decision before they are built.** Spec §3 Map states the
   proposal and §6 states the contract change; §5 lists it under "awaiting a
   decision". It moves `tier` off the concept, because a tier is a rank
   *relative to the concepts it sits among* — a concept shared by two readings
   holds a different rank in each and one field cannot carry both.

   Until it lands, `04 Map` stays at the whole weave and "your read" is shared
   across readings (both say so in the UI). Three traps for whoever builds it:
   - `buildMapKit` ([src/lib/mapKit.ts](src/lib/mapKit.ts)) reads `concept.tier`
     directly. Miss it and every reading's kit prints the course-wide
     hierarchy — and that kit is what the chalk talk is drawn from.
   - `concept.retier` events carry no scope; without a `scopeKey` in the
     payload, the record of *which map you were sorting* is lost for good.
   - It must land expand/contract (add new → backfill → dual-write → stop
     reading old → drop), like `0011` did, or code rollback stops being safe.

2. **Monday's dev deployment.** Testers were warned. The setup, reasoned
   through in the session log: a **Neon branch** for `DATABASE_URL` (one
   long-lived branch, not Vercel's auto-branch-per-deployment, which would
   reset tester data on every push); a **second GitHub OAuth app** whose
   callback is the stable branch alias, since an OAuth App allows exactly one;
   `NEXTAUTH_URL` set per-environment **with the protocol**; and the **same**
   blob store, or every reading 404s against the branched `source` rows.

   First thing to try once live: add a reading of your own. Nothing in
   production has `isOwn = true` yet, so that path is still untrodden.

3. **Auth / ops residue — blocks a freeze.** All pre-existing:
   - Dev-mode auth fallback impersonates `tjm@tjmcleish.com`; `/api/readings`
     and `getSourceFile` skip auth whenever `NODE_ENV !== 'production'`;
     `src/lib/auth.ts` carries hardcoded admin fallback emails.
   - pdf.js worker loads from a CDN at runtime.
   - `scripts/apply-db-compat.ts` is an ad-hoc schema patcher behind the real
     schema — decide whether it retires.
   - *(Closed 7/31: `NEXTAUTH_URL` now carries its protocol, which is what made
     `getServerSession` fail and every admin page redirect;
     `playwright/.auth/` is gitignored.)*

4. **Section B review** — 40 deliberate departures from v14 listed in the
   UI/language diff. No code needed; confirm each is still wanted so they stay
   decisions rather than drift.

5. **Deferred by decision, not oversight:** byte→concept is still one-to-many
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

Two things that will waste your time if you don't know them:

- **Next 16 allows one `next dev` per project.** A second one exits with
  "Another next dev server is already running" and prints the PID to kill.
- `Get-NetTCPConnection` and `taskkill` have both hung in this shell. Kill the
  dev server with `Stop-Process -Id <pid> -Force`, taking the PID from the
  message above.

To run the suite, point a scratch Playwright config at 3100 and keep
`globalSetup` + `storageState` from `playwright.config.ts` — drop them and the
admin specs run unauthenticated, which reads as a product failure and is not one.

## Kickoff commands

```bash
git status -sb
npm run check                 # eslint + tsc
npx drizzle-kit migrate       # check drizzle.__drizzle_migrations first
npm run dev -- -p 3100
```

## Definition of done for the next session

Pick one open item above and close it end to end — with the red lines in
[docs/loom-spec-v1.md](docs/loom-spec-v1.md) §4 checked before merge, per §7.
