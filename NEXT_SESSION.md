# Next Session Prompt

You are continuing work on Loom after the v14 parity pass of 2026-07-29/30.

## Where things stand

The app now implements the v14 tool in full, on top of the production surfaces
v14 has no equivalent for (auth, courses, the shared reading library with
extraction scoring, PDF capture with anchored offsets).

- **Tabs:** 00 Library · 01 Open · 02 Throw · 03 Read · 04 Map · 05 Keep.
- **Graph vs. projections** (spec §6) is enforced in the schema: `concept.tier`
  is graph; card-table positions, edge bends and sort order live in `view` rows;
  `read` has its own table; `graph_event` is the append-only development
  history, replayed in Read as "the cloth, over time".
- **Parity is reconciled.** [docs/v14-parity-audit.md](docs/v14-parity-audit.md)
  holds the gap analysis and the record of what was built;
  [docs/v14-ui-language-diff.md](docs/v14-ui-language-diff.md) holds the 123-item
  UI/language comparison — section A (66 divergences) is closed, section B (40
  deliberate departures) is a review list, section C is production-only.
- **Spec** is at rev 30a and is the build target; §4 red lines are the
  acceptance criteria.

Verified at hand-off: `tsc`, `eslint src/`, `next build` clean; Playwright 7/8.

## Open items, in the order they matter

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
