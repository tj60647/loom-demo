# Next Session Prompt

You are continuing work on Loom after the reading-first pass of 2026-07-30.

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
  from `byte.sourceId` in [src/lib/scope.ts](src/lib/scope.ts) — a reading is a
  door into one graph, never one of many. See
  [docs/reading-scope-and-map-passes.md](docs/reading-scope-and-map-passes.md).
- **Graph vs. projections** (spec §6) is enforced in the schema: `concept.tier`
  is graph; card-table positions, edge bends, sort order and pinned definitions
  live in `view` rows; `read` has its own table; `graph_event` is the
  append-only development history, replayed in Read as "the cloth, over time".
- **Parity is reconciled.** [docs/v14-parity-audit.md](docs/v14-parity-audit.md)
  holds the gap analysis and the record of what was built;
  [docs/v14-ui-language-diff.md](docs/v14-ui-language-diff.md) holds the 123-item
  UI/language comparison — section A (66 divergences) is closed, section B (40
  deliberate departures) is a review list, section C is production-only.
- **Spec** is at rev 30a and is the build target; §4 red lines are the
  acceptance criteria.

Verified at hand-off: `tsc`, `eslint src/`, `next build` clean; Playwright 7/8.

## Open items, in the order they matter

0. **Migration `0011` is committed but NOT applied**
   (`drizzle/0011_own_readings_and_reference_only_sources.sql`: `storageKey`
   becomes nullable, `source.isOwn` is added). The app will not run against a
   database without it. Check `drizzle.__drizzle_migrations` first, then
   `npx drizzle-kit migrate`.

0b. **Passes need a §7 decision before they are built** — spec §3 Map states
   the proposal and §6 states the contract change. It moves `tier` off the
   concept, and until it lands `04 Map` stays at the whole weave and "your
   read" is shared across readings (both say so in the UI). `buildMapKit`
   ([src/lib/mapKit.ts](src/lib/mapKit.ts)) reads `concept.tier` directly and
   must take the active pass's tiers, or every reading's kit prints the
   course-wide hierarchy. `concept.retier` events need a `scopeKey` in their
   payload in the same PR.

1. **Auth / ops residue — blocks a freeze.** All pre-existing:
   - `playwright/.auth/user.json` is **tracked in git and holds a live session
     token**. Gitignore it and rotate.
   - `NEXTAUTH_URL` in `.env.local` is malformed (no protocol), which is why
     `/api/auth/test-login` mints a session row that `getServerSession` never
     resolves — the one failing Playwright spec, and the reason every other spec
     uses a client-side session mock.
   - Dev-mode auth fallback impersonates `tjm@tjmcleish.com`; `/api/readings`
     and `getSourceFile` skip auth whenever `NODE_ENV !== 'production'`;
     `src/lib/auth.ts` carries hardcoded admin fallback emails.
   - pdf.js worker loads from a CDN at runtime.
   - `scripts/apply-db-compat.ts` is an ad-hoc schema patcher behind the real
     schema — decide whether it retires.
2. **Section B review** — 40 deliberate departures from v14 listed in the
   UI/language diff. No code needed; confirm each is still wanted so they stay
   decisions rather than drift.
3. **Deferred by decision, not oversight:** byte→concept is still one-to-many
   (re-file copies the byte, per spec §2's v1 semantics); markdown export exists
   but has not been reconciled with Lingxiu's fork; cohort/heat-map views remain
   admin-only and would need red line #8's "has coded this reading themselves"
   gate before any student-facing use — that gate does not exist in the data
   model yet.

## Local environment note

Port 3000 is inside a Windows excluded port range on this machine
(`netsh int ipv4 show excludedportrange protocol=tcp` → 2969-3068 reserved), so
`npm run dev` and `npx playwright test` fail with `EACCES`. Reboot, or as admin
`net stop winnat && net start winnat`. To run the suite meanwhile, copy
`playwright.config.ts` to a scratch config on another port — and set
`reuseExistingServer: false`, or it will latch onto a zombie dev server and hang.

## Kickoff commands

```bash
git status -sb
npm run check                 # eslint + tsc
npx drizzle-kit migrate       # check drizzle.__drizzle_migrations first
npx playwright test
```

## Definition of done for the next session

Pick one open item above and close it end to end — with the red lines in
[docs/loom-spec-v1.md](docs/loom-spec-v1.md) §4 checked before merge, per §7.
