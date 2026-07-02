# Next Session Prompt

You are continuing work on the Loom repo audit from 2026-07-01.

## Session Goal
Re-align database schema with the current app model, then verify source-text extraction and PDF highlight offset integrity end-to-end.

## Current Status (Verified)
- Branch: `master`
- App code expects new schema fields/tables:
  - `byte.sourceId`, `byte.pageContentHash`
  - `source` table
  - `source_page` table
- Runtime failures prove DB is behind app schema:
  - `column "sourceId" does not exist` when querying `byte`
  - `relation "source" does not exist` when loading library sources
- `drizzle/meta/_journal.json` now exists but has zero migration entries.
- `npx drizzle-kit check` reports config is readable, but DB shape still mismatches app runtime.
- Focused PDF tests fail because library cards never render due to DB query failures.

## Evidence and Context
- Query failing in `src/actions/loom.ts` while selecting `bytes` rows with `sourceId` and `pageContentHash`.
- Query failing in `src/actions/sources.ts` while selecting from `sources`.
- Schema expects these objects in `src/db/schema.ts`.
- Tests blocked at library load:
  - `tests/pdf-viewer.spec.ts`
  - `tests/pdf-fit.spec.ts`
  - `tests/audit-seed2.spec.ts`

## Required Next Steps (Execute In Order)
1. Regenerate and commit schema migrations from current `src/db/schema.ts`.
2. Apply migrations to target DB (dev environment in `.env.local`).
3. Verify DB objects exist (`source`, `source_page`, new `byte` columns).
4. Run source seeding:
   - `npm run seed:sources`
5. Re-run verification suite:
   - `npm run check`
   - `npx tsx audit.ts`
   - `npx playwright test tests/pdf-fit.spec.ts tests/pdf-viewer.spec.ts tests/audit-seed2.spec.ts`
6. Confirm highlights render in precision mode when hashes match, and fuzzy fallback when mismatch occurs.

## DB/Highlight Verification Checklist
- [ ] `source` rows load in library view.
- [ ] `source_page` rows exist with non-empty `textContent` and `contentHash`.
- [ ] Newly captured bytes include `sourceId`, `pageNumber`, and offsets.
- [ ] `pageContentHash` is written for captured PDF bytes.
- [ ] Existing legacy bytes without hashes still highlight via fuzzy mode.
- [ ] No `column does not exist` / `relation does not exist` errors in server logs.

## Notes for the Agent
- Treat this as a migration + data integrity session first, lint cleanup second.
- There are many pre-existing lint errors; do not scope-creep into broad style cleanup unless requested.
- Keep changes minimal and preserve current prototype behavior.

## Suggested Kickoff Commands
```bash
git status -sb
npm run check
npx drizzle-kit generate
npx drizzle-kit migrate
npm run seed:sources
npx tsx audit.ts
npx playwright test tests/pdf-fit.spec.ts tests/pdf-viewer.spec.ts tests/audit-seed2.spec.ts
```

## Definition of Done
- App loads Library and Loom data without DB schema errors.
- Source documents are queryable from DB and readable in the viewer.
- Captured highlights map correctly with offsets/hash when possible.
- Playwright PDF tests pass (or have clearly documented remaining blockers).
