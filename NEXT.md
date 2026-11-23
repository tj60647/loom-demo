# Next

Updated: 2026-11-22

## Where it stands

Loom is live and in use, and its health check answers: production can reach its database and the heartbeat is green. The last merges were on 13 and 14 September (code owners, the sign-in outage record, a reading fix). Three pull requests are open, and the scheduled health check still runs about every 15 minutes.

## Next step

Review and merge PR 62, which moves the scheduled health check (`.github/workflows/heartbeat.yml`) from every 15 minutes to every two hours, as TJ asked. Only the schedule and the text describing it change. After merging, confirm in the Actions tab that runs come about two hours apart.

## After that

- Review PR 60 (README brought up to date with the build and the model).
- Review PR 61 (page mode stops painting PDF highlights a second time), sent by another code owner.
- Read `NEXT_SESSION.md` and `docs/open-work.md`; `NEXT_SESSION.md` was last rewritten on 19 August and may no longer be true.

## Blocked or waiting

- All three open pull requests wait on review.

## Open questions

- Should `NEXT_SESSION.md` be retired now that this file holds the plan?
- This plan was drafted by Claude on 2026-11-22 from the code and its history. Is the next step right?
