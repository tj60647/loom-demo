# Next Session Prompt

You are continuing work on the Loom repo audit from 2026-07-01.

## Session Goal
Re-align database schema with the current app model, then verify source-text extraction and PDF highlight offset integrity end-to-end.

## Current Status (Verified)
- Branch: `master`
- Schema alignment complete for local dev DB:
  - `byte.sourceId`, `byte.pageContentHash` columns present
  - `source`, `source_page` tables present
- `drizzle/meta/_journal.json` includes migration entry `0000_sad_payback`.
- Source seeding repaired and rerun successfully.
- Focused PDF suite now passes.

## Evidence and Context
- Verified DB counts after migration + seed:
  - `source`: 3 rows
  - `source_page`: 42 rows
  - bytes with non-empty `source` and null `sourceId`: 0 rows
  - bytes with offsets: 9 rows
  - bytes with `pageContentHash`: 3 rows
- Focused tests passing:
  - `tests/pdf-viewer.spec.ts`
  - `tests/pdf-fit.spec.ts`
  - `tests/audit-seed2.spec.ts`

## Required Next Steps (Execute In Order)
1. Decide whether to keep `scripts/apply-db-compat.ts` as a permanent recovery utility or remove it after commit.
2. Decide whether to keep non-production read access relaxation in `src/app/api/readings/[sourceId]/route.ts` and `src/actions/sources.ts`, or gate it behind an explicit env flag.
3. Optional hardening: add a tiny integration test that asserts `/api/readings/[sourceId]` returns 200 in local Playwright setup.

## DB/Highlight Verification Checklist
- [x] `source` rows load in library view.
- [x] `source_page` rows exist with non-empty `textContent` and `contentHash`.
- [x] Newly captured bytes include `sourceId`, `pageNumber`, and offsets.
- [x] `pageContentHash` is written for captured PDF bytes.
- [x] Existing legacy bytes without hashes still highlight via fuzzy mode.
- [x] No `column does not exist` / `relation does not exist` errors in server logs during focused suite.

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
- Completed in this session.
