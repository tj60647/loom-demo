# Loom — Environments and deployments

Three environments, one Vercel project (`loom-demo`), one blob store, one Neon
project with three branches — `main`, `dev`, and `ci`, of which only the first
two back a deployment. The reasoning for the dev setup was worked through in the
8/1 session (NEXT_SESSION item 1); this document is its durable form. Stood up
8/3.

| | local | dev (alpha testers) | production (students) |
| --- | --- | --- | --- |
| Git | working tree | `dev` branch (protected) | `master` (protected) |
| URL | `http://localhost:3000` (or 3100) | the **stable** dev branch alias | the production domain |
| Neon branch | `dev` (via `.env.local`) | `dev` | `main` |
| GitHub OAuth app | none — backdoor only | **dev app** (callback = dev alias) | production app |
| `NEXTAUTH_URL` | `http://localhost:3000` | `https://<dev-alias>` | `https://<prod-domain>` |
| Blob store | the one store | the one store | the one store |
| test-login backdoor | works (`next dev`) | **403s** (production build) | **403s** |
| Mark | red weft | red weft + "dev" caption | bare mark |

The `ci` branch backs the e2e gate and belongs to no deployed environment
(see §CI). Local setup starts from
[.env.example](../.env.example), which says where each value comes from —
**not** `vercel env pull`, which would aim local work at production.

**The deployment wears its colours** (947e0e8). `VERCEL_ENV` decides: production
serves `public/icon.svg` and a bare wordmark; every other build — the dev alias
and local — serves `public/icon-dev.svg`, the same mark with one red thread
through it, plus a quiet red `dev` in the wordmark caption
([src/app/layout.tsx](../src/app/layout.tsx),
[src/components/ui/Header.tsx](../src/components/ui/Header.tsx)). The two GitHub
OAuth apps carry the matching pair (`public/oauth-logo.png`,
`public/oauth-logo-dev.png`), so the consent screen says which environment you
are signing in to before you sign in. A tab that looks like production and isn't
is how tester data gets written to `main`.

## The five invariants

1. **One long-lived Neon branch per environment — never Vercel's
   branch-per-deployment.** Auto-branching would reset tester data on every
   push. Create the `dev` branch once in Neon and point the Vercel *Preview*
   `DATABASE_URL` (scoped to the `dev` git branch) at it permanently.
2. **A second GitHub OAuth app for dev.** An OAuth App holds exactly one
   callback URL, so production's app cannot serve the dev alias. The dev app's
   callback is `https://<dev-alias>/api/auth/callback/github`; its client
   id/secret go in the Preview-scoped `GITHUB_ID`/`GITHUB_SECRET`.
3. **`NEXTAUTH_URL` always carries the protocol.** The missing protocol — not
   the port — is what actually broke sessions in the past. Set it
   per-environment in Vercel, `https://` included.
4. **One blob store for every environment.** `source.storageKey` values in the
   branched databases all reference the same store; a second store would 404
   every reading against branched `source` rows. (Consequence: **never delete a
   reading in one environment that another environment's rows still reference**
   — `deleteSource` removes the blob itself. Archive on dev; delete only in
   production, or only for readings that exist nowhere else.)
5. **`NODE_ENV` must be `production` on every deployed build.** Three dev
   conveniences key off it (see [audit](audit-2026-08-02.md) S-1..S-3): the
   loom actions' fallback identity, the reading routes' auth skip, and the
   test-login backdoor. Vercel sets it for production *and* preview builds;
   anything self-hosted must too. Checking this is part of the smoke test.

## Standing up the dev deployment

Done 8/3 — steps 1–5 below are the record of how, and the recipe if it ever has
to be rebuilt. **Step 6 is the part that is still owed:** the fresh-GitHub-account
sign-in has no recorded result, and until someone runs it and writes the date
here, treat it as unverified. It is the one path the suite structurally cannot
reach (CONTRIBUTING §Tests, audit condition 1).

1. Neon → create branch `dev` from `main` (schema + data snapshot; migrations
   applied through `0015` on `main`, `dev` and `ci` as of 8/3 — check with
   `npx tsx scripts/check-migrations.ts`, never the journal alone).
2. GitHub → Settings → Developer settings → New OAuth App:
   homepage = dev alias, callback = `https://<dev-alias>/api/auth/callback/github`.
3. Vercel → project → Settings → Domains: give the `dev` branch a stable domain
   (branch aliases are stable per branch; a custom `dev.` subdomain also works).
4. Vercel → Settings → Environment Variables, **Preview scope, `dev` branch**:
   `DATABASE_URL` (Neon dev branch), `GITHUB_ID`/`GITHUB_SECRET` (dev OAuth
   app), `NEXTAUTH_URL` (`https://` + dev alias), `NEXTAUTH_SECRET` (fresh,
   not production's). `BLOB_STORE_ID` / blob access is project-wide already.
5. Push `dev`; Vercel builds it as a preview on the stable alias.
6. **Smoke test, in order:**
   - Sign in with a **genuinely fresh GitHub account** whose email you invited
     on `/admin` — it must enrol and land on Readings. This is the
     `events.signIn` path Playwright can never cover; if it is wrong, every
     tester is locked out and nothing else matters.
   - Open a reading (blob auth + streaming), capture a byte, sort a tier,
     export from Keep.
   - Confirm `/api/auth/test-login` returns 403.

Tester data on the dev branch survives every deploy; refresh the demo accounts
whenever you want with `npm run seed:demo` pointed at the dev `DATABASE_URL`.

## Working together: the loop from idea to production

Two developers, one `dev` branch. Branches map to changes, never to people —
a personal long-lived branch drifts for weeks and turns review into "approve
my month"; a change branch is a ten-minute read.

1. **Cut a branch from `dev`, one per change, days not weeks.** Push it —
   Vercel builds a throwaway preview. That preview is for *looking at UI*:
   GitHub sign-in cannot work there (an OAuth app holds exactly one callback
   URL, and preview URLs are ephemeral), and that is by design, not a bug to
   fix. Anything needing a session is exercised locally (`next dev` +
   the test-login backdoor) or on the dev alias after merge.
2. **PR into `dev`; the other developer reviews.** `dev` is protected: both
   CI jobs — `checks` **and** `e2e` — are required, and neither branch takes
   force pushes. `dev` requires no approving review, so a CI-green self-merge
   is the lane for typo-grade changes; `master` requires one code-owner
   approval on top. Keep the PR small enough that the review is genuinely a
   read.
3. **A schema change and its migration are one commit.** `drizzle-kit
   generate` runs in the same PR that edits `schema.ts` — never later. (The
   `category` column shipped without its migration once; a dev server's
   stale compiled schema masked it all day, and the first clean rebuild took
   every `source` query down. The failure surfaces far from the cause.)
   Whoever lands the PR applies the migration to the Neon `dev` branch —
   and `ci`, so the e2e gate stays truthful.
4. **Merge to `dev` deploys the alias automatically.** Both developers and
   the alpha testers now exercise the *combination* on real (dev-branch)
   data with real sign-in. Experiments soak here; disagreements get settled
   by what testers actually do with it.
5. **Aligned? Promote by PR from `dev` to `master`.** This PR is the
   production gate — branch protection wants green CI plus review — and it
   reviews a different question than code review did: *is this what
   students should meet?* Merging deploys production; the migration goes to
   the production `DATABASE_URL` at merge time (next section).

Rhythm in one line: `branch → PR → review → dev alias → soak → PR to master`.

## Onboarding a developer

What a new developer needs, in order:

1. **Repo access: collaborator with write.** Not a fork — fork PRs never
   receive the CI secrets, so the required `e2e` gate can only pass for
   branches pushed to this repo.
2. **Local setup:** clone, `npm ci`, copy `.env.example` → `.env.local` and
   fill it in (the file says where each value comes from). The non-negotiable
   line: `DATABASE_URL` points at the Neon **`dev`** branch — `seed:demo`
   wipes the demo course on whatever database it is aimed at, and aimed at
   `main` that is production data.
3. **Local sign-in is the backdoor,** `GET /api/auth/test-login` (admin) or
   `?as=testa` (learner) — real GitHub OAuth only exists on the deployed
   environments, whose OAuth apps hold those callbacks. Deployed builds
   answer 403 there; that is invariant 5 working.
4. **Read "Working together" above.** Both long-lived branches are protected:
   `dev` requires green `checks` + `e2e` (so work arrives by PR), `master`
   additionally requires review and is the production trigger. Neither takes
   force pushes.
5. **What they do not need:** Vercel or Neon dashboard access. Previews
   deploy from git on their own; the environment variables are already
   scoped. Grant dashboards later if someone ends up debugging deploys.

Two data rules worth saying at hello (both are invariants above): the blob
store is shared by every environment — never delete a reading locally that
another environment still references — and the demo accounts (Test User A/B)
belong to the test suite; human testing happens with real accounts.

## Production

`master` deploys to production on merge — and merging to master is the *only*
way anything reaches production (no `vercel --prod` from laptops). The branch
protection on master (green CI + owner review) is therefore the production
gate. Production env vars: Neon `main`, the production OAuth app, production
`NEXTAUTH_URL`/`NEXTAUTH_SECRET`.

Migrations: applied to dev first (by whoever lands the PR), to production at
merge time via `npx drizzle-kit migrate` against the production
`DATABASE_URL`. Check `scripts/check-migrations.ts` before and after —
`drizzle.__drizzle_migrations` is the record of truth.

## CI (GitHub Actions)

[.github/workflows/ci.yml](../.github/workflows/ci.yml) — two jobs.

- `checks` (lint + types + build) needs no secrets and runs on every PR,
  including forks.
- `e2e` runs the Playwright journey suite — **26 tests in 9 files**, one worker
  — against a **third Neon branch, `ci`**, created once from `dev`. It migrates,
  seeds readings and demo accounts, then runs the suite via `next dev` (the
  backdoor needs a non-production build). Runs queue on a shared concurrency
  group because the suite owns its demo account exclusively.

Both jobs run on pull requests to **and** pushes of `master` and `dev`.

Repository secrets, all three configured 8/3 (Settings → Secrets → Actions):

| Secret | Value |
| --- | --- |
| `CI_DATABASE_URL` | Neon `ci` branch connection string |
| `CI_BLOB_READ_WRITE_TOKEN` | a blob read-write token (same store) |
| `CI_NEXTAUTH_SECRET` | any fresh random string (optional; has a default) |

If `CI_DATABASE_URL` or `CI_BLOB_READ_WRITE_TOKEN` goes missing, the `e2e` job
**fails with a pointed message** rather than skipping — a gate that silently
skips is not a gate. Fork PRs don't receive secrets, so the required `e2e`
context can never go green on one; collaborators push branches to this repo.

### Branch protection, as configured

| Branch | Required contexts | Reviews | Force push |
| --- | --- | --- | --- |
| `master` | `checks`, `e2e` | 1, code-owner ([CODEOWNERS](../.github/CODEOWNERS)) | no |
| `dev` | `checks`, `e2e` | none | no |

Read it back rather than trusting this table, which will drift:

```bash
gh api repos/tj60647/loom-demo/branches/master/protection \
  --jq '{checks: .required_status_checks.contexts, reviews: .required_pull_request_reviews}'
```

## Rollback

Vercel → Deployments → promote the previous production deployment. Database
rollbacks don't exist in this stack — migrations are forward-only, which is why
destructive migrations (the mirror retirement, NEXT_SESSION item 4) wait for
their own PR with a soak period behind them.
