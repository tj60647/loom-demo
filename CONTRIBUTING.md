# Contributing to Loom

Loom moves fast and has exactly one hard rule: **nothing reaches master that the
test suite and a project owner have not both passed.** Everything else below is
convention, kept light on purpose.

## The one rule, mechanically

`master` is production. It is protected: changes land by pull request, and a PR
merges only when

1. **CI is green** — `checks` (eslint + tsc + build) and `e2e` (the Playwright
   journey suite against the CI database), and
2. **a project owner has approved** — enforced via
   [CODEOWNERS](.github/CODEOWNERS). Add teammates there as they earn review
   rights.

No other process. No issue templates, no mandatory tickets, no release trains.

## Branches and deployments

| Branch | Deploys to | Purpose | Protection |
| --- | --- | --- | --- |
| `master` | **production** (Vercel) | What students use. | `checks` + `e2e` green, 1 code-owner review, no force push |
| `dev` | the stable dev alias (Vercel preview) | What alpha testers use. Long-lived; every change arrives by PR. | `checks` + `e2e` green, **no review required** — CI-green self-merge is the lane for small changes. No force push |
| anything else | per-PR preview | Short-lived work branches: `feat/…`, `fix/…`, `docs/…`. Delete after merge. | none |

**Cut work branches from `dev`, not `master`, and PR them into `dev`.** `master`
is reached only by promoting `dev` — the full loop, with the reasoning for each
step, is [docs/deployments.md](docs/deployments.md) §"Working together". Per-PR
previews are for *looking at UI*: GitHub sign-in cannot work on one (an OAuth
app holds exactly one callback URL), so anything needing a session is exercised
locally through the backdoor, or on the dev alias after merge.

Environment wiring (Neon branches, OAuth apps, `NEXTAUTH_URL`, the shared blob
store) is documented in [docs/deployments.md](docs/deployments.md) — read it
before touching env vars, and never point two environments at one database
branch.

## Writing a PR

The [template](.github/pull_request_template.md) asks for four things; the two
that are non-negotiable:

- **Red lines** ([spec §4](docs/loom-spec-v1.md)) — Loom's acceptance bar is
  what the tool *refuses* to do (no AI near student judgment, work never
  inaccessible, render-and-count-never-decide). If your change is anywhere near
  a red line, say so and say why it holds. Reviewers review against these.
- **Spec impact** — the spec is the build contract (§7): when behavior diverges
  from it, the same PR bumps the spec (rev + revision-history entry), and TJ
  ratifies. A commit message is not a ratification.

Small PRs, reviewed same-day, beat big ones. A PR that only moves docs or tests
still goes through the gate — the gate is cheap when the change is.

## Local development

```bash
cp .env.example .env.local        # then fill it in — the file says where each value comes from
npm ci
npx tsx scripts/check-migrations.ts   # what the DB actually has
npx drizzle-kit migrate               # apply pending migrations
npm run seed:sources                  # the readings + page text
npm run seed:demo                     # test-user-a/b@loom.local demo accounts
npm run dev                           # port 3000 (see below if it EACCESses)
```

- **`DATABASE_URL` points at the Neon `dev` branch. Never `main`.** Do not use
  `vercel env pull` for it — that hands you production, and `seed:demo` wipes
  the demo course on whatever database it is aimed at.
- Sign in locally as the demo learner via `/api/auth/test-login?as=testa`
  (admin: no query). The route 403s on production builds by design, and it is
  the *only* local sign-in — real GitHub OAuth exists only on the deployed
  environments, whose apps hold those callbacks. `GITHUB_ID`/`GITHUB_SECRET`
  can stay dummies locally.
- On some Windows machines port 3000 sits in a Hyper-V excluded range — run
  `npm run dev -- -p 3100`. If a stale dev server haunts a port (app loads,
  `/api/*` 404s), kill it and delete `.next`.

## Tests

```bash
npm run check                    # eslint + tsc — before every push
npx playwright test              # the suite: 26 tests in 9 files, port 3000
$env:PORT='3100'; npx playwright test    # same suite on a free port (Windows)
```

- `playwright.config.ts` reads `PORT`, so one config covers both — it starts
  the dev server itself, or reuses one already listening there.
  `playwright.3100.config.ts` predates that and is now a redundant copy; prefer
  `PORT`.
- The suite runs one worker and signs in through the test-login backdoor;
  specs share the `test-user-a@loom.local` account. **Every mutation a spec
  makes, it must remove** — the journey specs are the pattern to copy.
- The demo accounts are a fixture contract: `test-user-a` carries 10 bytes from
  2 readings, 6 threads and 3 maps (one per reading, one whole-weave mirror —
  see [scripts/seed-demo.ts](scripts/seed-demo.ts)); specs assert against it, so
  don't repurpose it — re-run `npm run seed:demo` to restore it.
- New learner-facing behavior gets a journey assertion; new admin capability
  gets one in `journey-admin.spec.ts`. A feature only a human has ever clicked
  is not done.
- What the suite structurally cannot cover: the real GitHub-OAuth first
  sign-in → enrolment path. Any PR touching `src/lib/auth.ts` sign-in or
  enrolment requires a manual smoke test with a fresh GitHub account before
  merge, and says so in the PR.

## Database changes

Schema lives in `src/db/schema.ts`; migrations are generated, committed, and
applied — never pushed from the schema:

```bash
npx drizzle-kit generate --name=what_changed
npx drizzle-kit migrate
```

Apply to the dev Neon branch first (and to `ci`, or the e2e gate stops being
truthful); production only after the PR merges. `drizzle.__drizzle_migrations`
is the record of truth.

**A schema change and its migration are one commit — and so is `schema.ts`
itself.** Both halves have been dropped once each: `source.category` shipped in
`schema.ts` with no migration (every `source` query died on the first clean
rebuild), then its fix shipped the migration without staging `schema.ts`. Run
`git status` before you push a schema change and confirm all three of
`src/db/schema.ts`, `drizzle/NNNN_*.sql` and `drizzle/meta/` are in it.

## Docs

Two kinds of document live here, and the difference is the whole convention:

- **Live docs must match `master`.** [README.md](README.md), this file,
  [docs/contracts.md](docs/contracts.md),
  [docs/deployments.md](docs/deployments.md),
  [docs/loom-spec-v1.md](docs/loom-spec-v1.md). If your PR makes one of these
  wrong, it is not done. Fixing them is part of the change, not a follow-up —
  a follow-up is what produced the drift audited on 8/3.
- **Dated records are never rewritten.** Audits, parity passes, strategy notes
  — anything with a date in its name or header. They are true *as of* their
  date. When one goes stale, add a short status header saying what moved (see
  [docs/audit-2026-08-02.md](docs/audit-2026-08-02.md)); when it is wholly
  spent, move it to [docs/archive/](docs/archive/) in its own PR.

What to update, by what you touched:

| If your PR changes… | …update |
| --- | --- |
| `src/db/schema.ts`, `drizzle/` | contracts §1 |
| a server action or API route signature | contracts §2/§3 |
| export/import shape | contracts §4, spec §6 |
| an enforced invariant | contracts §5 |
| a learner-visible capability | README features, and the spec if behavior diverges from it |
| env vars, CI, branch protection, environments | deployments.md **and** `.env.example` |
| local setup, test layout, the gate | this file |

Docs-only PRs go through the same gate — it is cheap when the change is.

## Reviewing

Review against: the red lines, the [contracts](docs/contracts.md) (does the
change keep the invariants in §5?), and the copy voice (one word per move;
"readings", never "library", in student-facing text). The
[audit](docs/audit-2026-08-02.md) lists the known debts — don't block a PR for
pre-existing ones, do block one that adds to them silently.
