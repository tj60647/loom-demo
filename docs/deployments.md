# Loom — Environments and deployments

Three environments, one Vercel project (`loom-demo`), one blob store, one Neon
project with three branches. The reasoning for the dev setup was worked through
in the 8/1 session (NEXT_SESSION item 1); this document is its durable form.

**Precedence, since 2026-08-16.** [data-environments.md](data-environments.md)
is the authority on what each database and the blob store hold, and on who may
destroy what; [build-and-test-workflow.md](build-and-test-workflow.md) is the
authority on how work moves through these environments and where each kind of
testing belongs. This file remains the authority on standing an environment up
and on the OAuth smoke test. Both were written against the live Vercel and Neon
configuration and name several hazards this file predates — read them before
changing environment variables.

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

   A second consequence, live since re-ingest exists: the blob is shared but the
   *page text* is per-environment, in three separate Neon databases. Re-ingesting
   reads production bytes wherever it is run and writes rows only to the database
   it was pointed at, so the environments can silently disagree about what a
   reading says. Run it once per environment, and check the `database:` line the
   script prints before believing its output.
5. **`NODE_ENV` must be `production` on every deployed build.** Three dev
   conveniences key off it (see [audit](audit-2026-08-02.md) S-1..S-3): the
   loom actions' fallback identity, the reading routes' auth skip, and the
   test-login backdoor. Vercel sets it for production *and* preview builds;
   anything self-hosted must too. Checking this is part of the smoke test.

### Reaching another environment from your machine

Scripts load `.env.local`. `vercel env pull` writes `.env.production.local`, which
nothing reads by default — so a run intended to inspect production reports on
development instead, and the output is similar enough to be believed.
`LOOM_ENV_FILE` redirects them. This repo is developed on Windows, so the
PowerShell form is the one you will actually type — there is no inline
`VAR=value cmd` prefix:

```powershell
$env:LOOM_ENV_FILE = '.env.production.pulled'
npm run diagnose:readings
$env:LOOM_ENV_FILE = $null      # it persists for the session otherwise
```

**Rename the pulled file, don't leave it where Vercel put it.** Next auto-loads
`.env.production.local` during `next build`, and the `[SENSITIVE]` placeholder it
carries for `NEXTAUTH_URL` fails the prerender of `/_not-found` with
`ERR_INVALID_URL` — every local production build breaks until the file is moved
aside. `LOOM_ENV_FILE` takes any path, so keeping it as `.env.production.pulled`
costs nothing and ends that (2026-08-08; `.env*` is gitignored either way).

Every script prints the database it reached before it reports anything. Read that
line; it is the whole point of it existing.

Vercel also refuses to export values for variables marked **sensitive**: it writes
the literal string `[SENSITIVE]`. In this project that includes `DATABASE_URL`,
`NEXTAUTH_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_URL` and
`OPENROUTER_API_KEY` — so a pulled production file is not usable as-is, and the
connection string has to come from the Neon console. `src/db/index.ts` fails with
that instruction rather than letting it surface as an opaque driver error.

## Standing up the dev deployment

1. Neon → create branch `dev` from `main` (schema + data snapshot; migrations
   applied through `0016` as of 2026-08-03 — check `drizzle/meta/_journal.json`
   rather than trusting this line, and note that
   `npx tsx scripts/check-migrations.ts` reports which migrations *ran*, not what
   the database is shaped like: 0016 exists precisely because a constraint
   `schema.ts` had declared since 0000 was never in any database).
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
   - Open a reading (blob auth + streaming), capture a passage, sort a tier,
     export from Keep.
   - Confirm `/api/auth/test-login` returns 403.

Tester data on the dev branch survives every deploy; refresh the demo accounts
whenever you want with `npm run seed:demo` pointed at the dev `DATABASE_URL`.

## Working together: the loop from idea to production

Two developers, one `dev` branch. Branches map to changes, never to people —
a personal long-lived branch drifts for weeks and turns review into "approve
my month"; a change branch is a ten-minute read.

1. **Cut a branch from `dev`, one per change, days not weeks.** Push it —
   Vercel builds a preview on a **stable branch alias**,
   `loom-demo-git-<branch>-aroughidea.vercel.app` — only the per-deployment URL
   is ephemeral. GitHub sign-in still cannot work there: next-auth on Vercel
   builds `redirect_uri` from the request host, and an OAuth App holds exactly
   one callback URL, so every branch would need its own app. Today that makes
   the preview a place for *looking at UI* only, and — until the gaps in
   [data-environments.md](data-environments.md) close — a **read-only** one,
   because non-`dev` previews are pointed at the production database and share
   production's blob objects. Anything needing a session is exercised locally
   (`next dev` + the test-login backdoor) or on the dev alias after merge.
2. **PR into `dev`; the other developer reviews.** CI's `checks` job gates
   every PR; `e2e` joins it once its secrets are configured. Keep the PR
   small enough that the review is genuinely a read, and agree on a
   CI-green self-merge lane for typo-grade changes so process never
   outweighs the work.
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
rather than skipping — a gate that silently skips is not a gate.

**Both jobs run Node 22** (`engines` declares `>= 22.7.0`). This is not
housekeeping: below 22.7 pdf.js cannot import its no-wasm JPX fallback, every
server-rendered scan comes back blank behind a *warning*, and four specs fail
for reasons nothing in their own code explains. Nothing enforces `engines` —
`npm ci` ignores it — so the runner is the only place this is true.

**Fork PRs cannot run `e2e`, ever.** GitHub does not pass secrets to a
`pull_request` run from a fork, so the guard fires and the job is red no matter
what the branch contains. Both jobs are REQUIRED (below), so such a PR cannot
merge as-is: mirror the branch into this repo and open a same-repo PR —

```bash
git fetch https://github.com/<owner>/loom-demo.git <branch>
git push origin FETCH_HEAD:refs/heads/<branch>
```

— or add the contributor as a collaborator so they push here directly. Not
`pull_request_target`: that hands the CI database and blob token to unreviewed
code. Note the Actions UI shows a fork PR's branch with no owner prefix, so it
reads as a local branch; `gh api repos/tj60647/loom-demo/pulls/<n> -q
.head.repo.full_name` is the way to settle it.

**Branch protection requires BOTH `checks` and `e2e`, on `master` AND `dev`**
(verified 2026-08-15). This paragraph described the bootstrap state — "`master`
initially requires only `checks`" — for as long as it took someone to run the
command below, and then went on saying it, which cost a wrong call about
whether a red `e2e` blocked anything. It does. Read the config, not this line:

```bash
gh api repos/tj60647/loom-demo/branches/master/protection/required_status_checks
```

## The one gate CI cannot close: the OAuth round trip

The e2e suite signs in through `/api/auth/test-login`, so it never touches
GitHub. `npm run check:auth` covers everything on Loom's side of the callback
— which verified address stands for a student, who the roster admits, what
each refusal says — but *that GitHub returns the payload we parse* is only
ever established by a person. Run this after any change to `src/lib/auth.ts`,
`src/lib/signIn.ts`, the OAuth app's settings, or the callback URLs.

Five minutes, on the deployment you changed:

1. **A real student, first time.** Invite a spare GitHub account's verified
   address (Admin → Roster), then sign in as it in a private window. Expect:
   GitHub's consent screen asking for **"Email addresses (read-only)" and
   nothing else** — if it also asks to read profile data, the scope narrowing
   has been reverted. You land on the shelf with the course's readings.
2. **Idempotent second time.** Sign out, sign in again. Same landing, and
   Admin → Roster still shows exactly one row for them.
3. **The address that is not primary.** On that account, add the course
   address as a *secondary* verified address and make something else primary.
   Sign in: Loom should still find the course. This is the case most students
   are actually in.
4. **Not on the roster.** Remove them from the roster, sign in again. Expect
   "That email is not on a course roster", naming the address GitHub gave —
   not a NextAuth error page, and not a generic "access denied".
5. **No confirmed address.** Hard to stage on a real account; if you have a
   throwaway with an unverified email only, expect "GitHub sent no confirmed
   email address". Otherwise read `/auth/error?error=NoVerifiedEmail` directly
   and confirm the copy still makes sense.

If step 1 fails on a fresh deployment, check the OAuth app's callback URL
against `NEXTAUTH_URL` before anything else — dev and production have separate
GitHub OAuth apps, and a mismatch surfaces as a generic callback failure.

### The guest door

Some people invited to a course have no GitHub account and will not get one.
For them the sign-in page carries a folded-away "no GitHub account?" form that
mails a single-use link, good for 24 hours.

It exists **only where `RESEND_API_KEY` and `EMAIL_FROM` are both set** — leave
them empty in dev and CI and GitHub is the only provider, which is what those
environments want. `EMAIL_FROM` must sit at a domain verified in Resend, or
every send is refused. Neither variable is a secret you can recover from
Vercel once set: `vercel env pull` writes `[SENSITIVE]` for both.

The roster still decides, and decides first. NextAuth runs the sign-in gate
*before* it mails anything, so an address no course invited receives no email
at all — it gets the same "not on a course roster" page the GitHub door gives.
That is the property to re-check if the gate is ever touched:

```bash
# uninvited → refused, and nothing sent (no "[auth] Resend refused" in the log)
curl -s -c /tmp/j http://localhost:3000/api/auth/csrf   # take csrfToken
curl -s -b /tmp/j -o /dev/null -w '%{redirect_url}\n' -X POST \
  -d "csrfToken=$CSRF&email=stranger@example.com" \
  http://localhost:3000/api/auth/signin/email
# expect: /auth/error?error=NotOnRoster&email=stranger%40example.com
```

Two smoke steps to add for a guest, after inviting their address:

6. **Guest, first time.** Open the disclosure, enter the invited address,
   expect "Check your inbox" and a link that lands them on the shelf enrolled.
7. **Guest, uninvited address.** Enter something not on any roster: expect the
   roster refusal page and, in the logs, **no send attempt**.

One consequence worth knowing: a person who signs in by link first and later
tries GitHub with the same address hits `OAuthAccountNotLinked` — NextAuth will
not join a GitHub account to an existing user row on its own. Keep the door
guest-only rather than advertised, and it stays a non-issue.

## Rollback

Vercel → Deployments → promote the previous production deployment. Database
rollbacks don't exist in this stack — migrations are forward-only, which is why
destructive migrations (the mirror retirement, NEXT_SESSION item 4) wait for
their own PR with a soak period behind them.
