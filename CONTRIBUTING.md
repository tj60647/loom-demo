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

| Branch | Deploys to | Purpose |
| --- | --- | --- |
| `master` | **production** (Vercel) | What students use. Protected. |
| `dev` | the stable dev alias (Vercel preview) | What alpha testers use. Long-lived; merge or fast-forward from master freely. |
| anything else | per-PR preview | Short-lived work branches: `feat/…`, `fix/…`, `docs/…`. Delete after merge. |

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
vercel env pull .env.local        # hosted values (or ask TJ)
npm ci
npx tsx scripts/check-migrations.ts   # what the DB actually has
npx drizzle-kit migrate               # apply pending migrations
npm run seed:sources                  # the readings + page text (see below)
npm run seed:demo                     # test-user-a/b@loom.local demo accounts
npm run dev                           # port 3000 (see below if it EACCESses)
```

- `seed:sources` reads three PDFs from `storage/readings/`, and they are **not in the
  repo** — they are published, copyrighted course readings and this repo is public. The
  script names the file it wants and stops. Supply your own copies, or skip seeding
  sources and work against the dev database.
- Sign in locally as the demo learner via `/api/auth/test-login?as=testa`
  (admin: no query). The route 403s on production builds by design.
- On some Windows machines port 3000 sits in an excluded range — run
  `npm run dev -- -p 3100` and use `playwright.3100.config.ts`. If a stale dev
  server haunts a port (app loads, `/api/*` 404s), kill it and delete `.next`.

## Tests

```bash
npm run check                                   # eslint + tsc + offset-remap assertions — before every push
npx playwright test                             # the suite (port 3000)
npx playwright test --config=playwright.3100.config.ts   # Windows/3100 variant
```

- There is no unit-test runner. Two `scripts/check-*.ts` files stand in for one where
  the logic is safety-critical and cheap to assert: `check:remap` (pure, no fixtures, so
  it runs inside `npm run check`) and `check:textlayer`, which needs real PDFs and so is
  run by hand — it asserts that stored page text still projects back to the exact string
  every stored highlight offset indexes into.
- The suite runs one worker and signs in through the test-login backdoor;
  specs share the `test-user-a@loom.local` account. **Every mutation a spec
  makes, it must remove** — the journey specs are the pattern to copy.
- The demo accounts are a fixture contract: `test-user-a` carries 3 maps built
  from 2 readings (see [scripts/seed-demo.ts](scripts/seed-demo.ts)); specs
  assert against it, so don't repurpose it — re-run `npm run seed:demo` to
  restore it.
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

Apply to the dev Neon branch first; production only after the PR merges.
`drizzle.__drizzle_migrations` is the record of truth.

## Reviewing

Review against: the red lines, the [contracts](docs/contracts.md) (does the
change keep the invariants in §5?), and the copy voice (one word per move;
"readings", never "library", in student-facing text). The
[audit](docs/audit-2026-08-02.md) lists the known debts — don't block a PR for
pre-existing ones, do block one that adds to them silently.
