# Loom — Environments and deployments

Three environments, one Vercel project (`loom-demo`), one blob store, one Neon
project with three branches. The reasoning for the dev setup was worked through
in the 8/1 session (NEXT_SESSION item 1); this document is its durable form.

| | local | dev (alpha testers) | production (students) |
| --- | --- | --- | --- |
| Git | working tree | `dev` branch | `master` |
| URL | `http://localhost:3000` (or 3100) | the **stable** dev branch alias | the production domain |
| Neon branch | `dev` (via `.env.local`) | `dev` | `main` |
| GitHub OAuth app | dev app | **dev app** (callback = dev alias) | production app |
| `NEXTAUTH_URL` | `http://localhost:3000` | `https://<dev-alias>` | `https://<prod-domain>` |
| Blob store | the one store | the one store | the one store |
| test-login backdoor | works (`next dev`) | **403s** (production build) | **403s** |

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

1. Neon → create branch `dev` from `main` (schema + data snapshot; migrations
   already applied through `0013`).
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
- `e2e` runs the Playwright journey suite against a **third Neon branch,
  `ci`**, created once from `dev`. It migrates, seeds readings and demo
  accounts, then runs the suite via `next dev` (the backdoor needs a
  non-production build). Runs queue on a shared concurrency group because the
  suite owns its demo account exclusively.

Repository secrets to configure (Settings → Secrets → Actions):

| Secret | Value |
| --- | --- |
| `CI_DATABASE_URL` | Neon `ci` branch connection string |
| `CI_BLOB_READ_WRITE_TOKEN` | a blob read-write token (same store) |
| `CI_NEXTAUTH_SECRET` | any fresh random string (optional; has a default) |

Until `CI_DATABASE_URL` is set, the `e2e` job **fails with a pointed message**
rather than skipping — a gate that silently skips is not a gate. Fork PRs
don't receive secrets; collaborators should push branches to this repo.

Branch protection on `master` initially requires only the `checks` context (so
an unconfigured e2e gate can't block everything); **once the secrets are in
and the job is green, add `e2e` to the required status checks** — Settings →
Branches → master, or:

```bash
gh api -X PATCH repos/tj60647/loom-demo/branches/master/protection/required_status_checks \
  -f "contexts[]=checks" -f "contexts[]=e2e"
```

## Rollback

Vercel → Deployments → promote the previous production deployment. Database
rollbacks don't exist in this stack — migrations are forward-only, which is why
destructive migrations (the mirror retirement, NEXT_SESSION item 4) wait for
their own PR with a soak period behind them.
