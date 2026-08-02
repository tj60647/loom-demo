## What this changes

<!-- One paragraph. What a tester will see differently, or what a developer can now rely on. -->

## Red lines check (spec §4)

<!-- docs/loom-spec-v1.md §4 is the acceptance bar. Delete lines that can't apply; keep and answer the ones that could. -->

- [ ] No AI inference, suggestion, or naming of relations/concepts anywhere near student work (#1, #2, #7)
- [ ] No new in-tool model call outside the two ratified exceptions (extraction scoring, metadata drafting) (#6)
- [ ] Student work stays exportable and never inaccessible (#5)
- [ ] Only student gestures write to `view` rows; derived geometry is computed and discarded (#7)
- [ ] Cohort/social displays still gated (#8)

## Spec impact

- [ ] No spec change needed — behavior already matches docs/loom-spec-v1.md
- [ ] Spec change included in this PR (rev bump + revision-history entry)

## How it was verified

<!-- `npm run check`, which Playwright specs ran, manual steps taken. "Not verified" is an answer, but say it. -->
