# Data environments — Postgres and blob storage

What the backend *is*, in every environment, and the rules that keep the
environments from reaching into each other.

This document is the authority on **where data lives and who may destroy it**.
[deployments.md](deployments.md) remains the authority on how a deployment is
stood up and wired; [build-and-test-workflow.md](build-and-test-workflow.md) is
the authority on how work moves through those environments. Where this file and
an older one disagree about databases or storage, this one wins — it was written
against the live Vercel and Neon configuration on 2026-08-16, not from memory.

## What this file claims

Everything below describes the running system, verified against it rather than
intended for it. Where something is not yet true it is called out in place and
listed under **Open gaps** at the end — those are the only forward-looking
statements here.

The file previously carried a live/gap/target legend, because most of it was
aspiration. It is not any more, and a legend for marks that no longer appear is
just another thing to keep true.

## State of play — 2026-08-17

The three hazards this document was written to name are closed, and the shape
they were closed into is not the one first proposed here.

1. **Previews no longer share a database, or borrow production's.** Every open
   PR gets a Neon branch of its own, cut from the `preview` template, migrated
   for that branch, and deleted when the PR closes
   ([.github/workflows/preview-db.yml](../.github/workflows/preview-db.yml)).
   The earlier plan — one long-lived `preview` branch shared by every preview —
   was argued for here partly on a branch cap that does not exist: the project's
   limit is 5000. Four branches reprocessing PDFs against one database is not a
   shared database's failure mode, it is its absence.

2. **Each environment writes into its own blob drawer.** Derived-asset keys are
   pure functions of `source.id`, which a database branch copies verbatim, so
   every environment computed identical keys and `put` allows overwrite. The dev
   alias had been overwriting production's covers for as long as it existed.
   Storage now reads through to the shared originals and writes only into
   `env/<name>/` — production alone writes bare keys, so nothing migrated.

3. **The `preview` template carries nobody's real work.** It was branched from
   `dev`, which carried six real accounts and everything they had made; those
   were removed, leaving the readings, the course structure and the fixture
   accounts. That is what allows the preview sign-in door to need no key.

Two remain open, and one of them cannot be closed the obvious way:

- **Previews are publicly reachable.** Vercel Authentication would wall them —
  and would also wall the dev alias, because that is a Preview deployment too,
  locking alpha testers out of the tester site. Password Protection is a $150/mo
  add-on. So previews stay public, and the door's safety rests on the preview
  database holding nothing that matters.
- **The guest email door is configured nowhere.** `RESEND_API_KEY` and
  `EMAIL_FROM` are unset in every environment, so `emailSignInConfigured()` is
  false and the form never renders. The half of this that lied is fixed
  (2026-08-20, `05c3235`): the signed-out shelf's "no github account?" no
  longer navigates to the missing door — it opens in place with the way to
  create a GitHub account using the invited address, and /auth/signin shows
  the same fold whenever mail is unconfigured. Configuring Resend remains
  optional, for a true no-GitHub path.

## The shape, in one paragraph

One Vercel project, one Neon Postgres project, one blob store. Postgres is
branched — a long-lived branch per environment, copy-on-write from its parent,
diverging in data forever and converging in schema only through committed
migration files. The blob store is **not** branched, because the object store
has no branching primitive; isolation there is achieved with key namespacing and
read-through instead. Nothing flows downward from production but schema, and
nothing flows upward from anywhere but code.

## Matrix 1 — the environments

| | local | CI | feature preview | dev alias | production |
| --- | --- | --- | --- | --- | --- |
| **Git ref** | working tree | PR head | any non-`dev` branch | `dev` | `master` |
| **URL** | `localhost:3000/3100` | ephemeral | `loom-demo-git-<branch>-aroughidea.vercel.app` | `loom-demo-git-dev-aroughidea.vercel.app` | `loom.aroughidea.com` |
| **URL stable?** | n/a | no | **yes, per branch** (live) | yes | yes |
| **Neon branch** | `dev` | `ci` | `preview/pr-<n>`, cut per PR from the `preview` template | `dev` | `main` |
| **Blob namespace** | `env/local/` | `env/ci/` | `env/preview-<branch>/` | `env/dev/` | bare keys |
| **`NODE_ENV`** | `development` | `development` | `production` | `production` | `production` |
| **`VERCEL_ENV`** | unset | unset | `preview` | `preview` | `production` |
| **Sign-in** | test backdoor | test backdoor | the preview door — keyless, or key-gated where `PREVIEW_LOGIN_SECRET` is set | real GitHub OAuth | real GitHub OAuth |
| **Audience** | one developer | no humans | the dev team | alpha testers | students |
| **Data class** | tester + inherited | synthetic | QA churn, disposable | tester + inherited | **real student work** |
| **Blast radius if wrong** | one machine | one run | that PR alone | alpha testers | everyone |

Two rows carry the day's work. **Neon branch** is now per-PR rather than one
shared database, so a branch may change schema and contents freely. **Blob
namespace** is what stops four branches reprocessing PDFs from overwriting each
other's covers, and stops any of them reaching production's.

## Matrix 2 — credentials and access

Where each secret is scoped, and what it unlocks. Scopes are Vercel environment
scopes; "branch" means a git-branch-scoped override.

| Credential | production | dev alias | feature preview | CI | local |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Production scope → `main` | Preview + branch `dev` → `dev` | Preview + PR branch → `preview/pr-<n>`, written by CI; unscoped Preview → the template | `CI_DATABASE_URL` secret → `ci` | `.env.local` → `dev` |
| `NEXTAUTH_SECRET` | Production, unique | Preview + branch `dev`, unique | Preview unscoped, unique | repo secret | `.env.local` |
| `GITHUB_ID` / `GITHUB_SECRET` | production OAuth app | dev OAuth app (branch-scoped) | unused — GitHub cannot complete a sign-in on a preview | dummy | dummy |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | project-wide, one store | same | same | `CI_BLOB_READ_WRITE_TOKEN` | `.env.local` |
| `RESEND_API_KEY`, `EMAIL_FROM` | **unset** — guest door dark, still open | unset | unset | unset | unset |
| `PREVIEW_LOGIN_SECRET` | **never set** | never set | unset — the door is keyless; set it to lock previews again | n/a | n/a |
| `NEON_API_KEY`, `VERCEL_TOKEN` | — | — | GitHub repo secrets — read only by the workflow, never by the app | — | — |
| Vercel dashboard | owner | owner | owner | — | — |
| Neon console | owner | owner | owner | — | — |

Three standing rules about this matrix:

- **No secret spans a trust boundary.** A `NEXTAUTH_SECRET` shared between
  preview and production is not a convenience, it is one environment holding
  another's keys. Every environment gets its own.
- **A variable with two environments checked is one value.** Vercel's
  `Preview, Production` scope is not "a preview value and a production value" —
  it is a single value serving both. That is the mechanism that had every non-`dev` preview reading production.
  When you want previews to differ, add an **unscoped Preview** entry and narrow
  the shared row to Production only.
- **Developers need neither dashboard.** Previews deploy from git and the
  variables are already scoped. Grant console access when someone is actually
  debugging deploys, not at onboarding.

## Matrix 3 — who may destroy what

Destruction is the only irreversible operation in this system. Postgres has no
rollback here (migrations are forward-only) and the blob store has no undelete.

| Operation | local | CI | preview | dev alias | production |
| --- | --- | --- | --- | --- | --- |
| Write rows | yes | yes | yes | yes | yes |
| Run a migration | yes | yes, per run | no — inherits `preview` | yes, at PR landing | yes, at merge to master |
| Regenerate a derived asset (cover, page image, sheet) | own namespace | own namespace | own namespace | own namespace | yes |
| Delete a reading (`deleteSource`) | own namespace only | own namespace only | own namespace only | own namespace only | yes, admin |
| Delete a blob object outright | **no** | **no** | **no** | **no** | yes |
| `seed:demo` (wipes the demo course) | yes, against `dev` | yes, against `ci` | no | yes | **never** |

Every cell above is now what the storage layer actually does — see `blobNamespace` in [src/lib/storage.ts](../src/lib/storage.ts), and the assertions in `npm run check:blobns`.

## Postgres — the branching model

### One long-lived branch per environment, and one per open PR

`main` (production), `dev` (alpha testers), `ci` (the e2e suite), and
`preview` — which is not an environment but a **template**: the readings, the
course structure and the fixture accounts, and nobody's real work.

Every open pull request gets `preview/pr-<n>`, cut from that template on open
and deleted on close. Copy-on-write, so a twelve-branch week costs almost
nothing, and the project's limit is 5000 branches.

**This document previously argued for a single shared `preview` branch**, on
three grounds: it was configuration rather than an integration, nothing had to
delete databases, and "Neon caps branches per project". The last is false — the
cap is 5000 — and the first two are worth less than what sharing costs. Two
people reviewing two branches edit the same rows, and a branch that reprocesses
PDFs rewrites `source_page` wholesale, which invalidates every stored passage
offset for every other preview at once.

Per-PR databases also close the drift problem: **a PR that changes the schema
migrates its own copy**, and nothing else is touched by it.

One gap remains in the teardown. A PR *closed without merging* while its branch
is deleted leaves GitHub no ref to resolve the workflow from, so the database
and its pinned variable survive. A merged PR is fine. Until a scheduled sweep
exists, an abandoned PR wants a look at `neon branches list`.

### Schema flows down; data never flows anywhere

This is the part most often modelled wrongly. Production is **not** "updated to
match development" at promote time. What happens is narrower:

- **Schema** converges through committed, forward-only migration files. `dev`
  runs a migration first, production runs the identical file at merge. 27
  migrations exist today, latest `0026_page_dims_and_byte_length`.
  `drizzle.__drizzle_migrations` is the record of truth; `npx tsx
  scripts/check-migrations.ts` reports what actually ran.
- **Data** never moves between environments in either direction after the branch
  point. `dev` was cut from `main` and has diverged ever since: production holds
  real student work, `dev` holds tester churn. They converge in shape and stay
  permanently apart in content.

A "sync the databases" mental model eventually produces someone restoring
production from a lower environment. There is no such operation, and there must
never be one.

### Migration ordering

1. Schema edit and generated migration land in **one commit**
   (`npx drizzle-kit generate --name=what_changed`). Never `db push` to a shared
   branch — a schema pushed rather than migrated leaves no record, and a stale
   compiled schema on someone's dev server will mask it for a day.
2. Whoever lands the PR applies it to the **`dev`** Neon branch, and to **`ci`**
   so the e2e gate stays truthful.
3. The **`preview`** branch is refreshed from `dev` — see the runbook — or
   re-cut. A preview running new code against an old schema fails in ways
   nothing in its own code explains.
4. Production runs it at merge to `master`, against the production
   `DATABASE_URL`. Check `check-migrations.ts` before and after.

### Drift is the standing tax of branching

A branch is a snapshot. Every migration that lands on the parent after the
branch point makes the child stale, silently. Short-lived branches make this a
non-issue; the `preview` branch is long-lived and therefore needs the periodic
refresh in the runbooks. This is the failure mode behind the `category` column
incident: the mismatch surfaces far from its cause.

## Blob storage — one store, namespaced keys

### Why one store

`source.storageKey` values in every branched database reference the same
objects. A second store would 404 every reading whose row was copied — this is
[deployments.md](deployments.md) invariant 4, and it is why "just give preview
its own blob store" is not a fix but a different outage.

### Why the environments currently collide

Two properties combine badly:

```
src/lib/pdfCover.ts:43   covers/${sourceId}.png
src/lib/pdfPages.ts:42   pages/${sourceId}/${pageNumber}.w${width}.webp
src/lib/pdfPages.ts:46   pages/${sourceId}/sheet.w2560.webp
src/lib/storage.ts       put(..., { addRandomSuffix: false, allowOverwrite: true })
```

Derived keys are **pure functions of `source.id`**, and a database branch copies
`source.id` verbatim. So two environments compute byte-identical keys and the
second writer wins. Only the uploaded PDF escapes collision, because its key is
minted fresh per upload (`crypto.randomUUID()`); it remains exposed to deletion.

Three classes of destruction follow, in ascending order of likelihood:

1. **Explicit** — `deleteSource` removes the PDF and cover from the shared store
   ([sources.ts:899-900](../src/actions/sources.ts#L899-L900)). Admin-gated.
2. **Silent overwrite** — cover regeneration and page/sheet rendering rewrite
   production's objects in place. The row survives, so nothing looks wrong.
3. **The read that writes** — [the cover route](../src/app/api/readings/%5BsourceId%5D/cover/route.ts#L68)
   renders and persists a cover on a plain `GET` whenever the cached one is
   missing or undersized, and the Library page fires one per card. **Browsing
   the shelf is a write.** Its failure is swallowed with a `console.warn`, so a
   bad render replaces a good production cover in silence.

Class 3 is why gating `deleteSource` is a stopgap and not a fix: the destructive
path most likely to fire is a page view.

### Target design — copy-on-write namespacing

Isolation belongs at the storage class, not at twenty-odd call sites, because
the next call site added would silently miss a call-site guard. Inside
[src/lib/storage.ts](../src/lib/storage.ts):

| Method | Behavior outside production |
| --- | --- |
| `put(key)` | writes `env/<name>/<key>` — never the bare key |
| `delete(key)` | removes `env/<name>/<key>` only; a no-op if this environment never wrote it |
| `get` / `getStream(key)` | tries `env/<name>/<key>`, falls back to the bare key on miss |

That is, for objects, exactly what Neon already does for rows: **read through to
the shared originals, write only into your own space.** A lower environment
becomes physically incapable of touching a production object, while staying
fully functional — testers still see real covers, uploads still work, deletes
become free.

`<name>` derives from `VERCEL_ENV` plus the branch (`VERCEL_GIT_COMMIT_REF`), so
previews are isolated from each other as well as from production. Production
alone writes bare keys, which keeps every existing object addressable and makes
the change non-migrating.

Costs, stated honestly: one extra round trip on a namespaced miss (only outside
production), and namespaces accumulate objects until something prunes them — see
the runbook.

## Data classification

| Class | Where it lives | Rule |
| --- | --- | --- |
| Real student work | `main` only | Never copied downward without scrubbing. |
| Alpha tester work | `dev` | Survives every deploy. Not disposable — testers are people. |
| QA churn | `preview/pr-<n>` | Disposable by definition — deleted when the PR closes. |
| Suite fixtures | `ci` | A contract: `test-user-a` carries 3 maps from 2 readings. Restore with `seed:demo`, don't repurpose. |
| Reading PDFs | the one blob store, shared | Source of truth, irreplaceable. Only production may delete. |
| Derived assets | namespaced per environment | Regenerable. Losing one costs a re-render. |

**The branching consequence worth naming:** cutting a Neon branch from `main`
copies whatever real student work `main` held at that moment into a
lower-trust environment. `dev` was cut from `main`, and alpha testers reach the
dev alias. Going forward, cut lower environments from `dev`, not from `main` —
and if a branch from `main` is ever genuinely needed, scrub before anyone
outside the owner reaches it. Data minimization is cheaper than a disclosure.

## How this follows standard practice

Each rule above is an instance of something general. The mapping, so the team
can reason from principle when this document doesn't cover a case:

| Principle | How it appears here |
| --- | --- |
| **Environment parity** (12-factor III) | One build, one codebase; environments differ only by configuration. `NODE_ENV=production` on every deployed build so no dev convenience survives deployment. |
| **Config in the environment** | Every environment-varying value is a Vercel variable, never a code branch on hostname. |
| **No shared credentials across trust boundaries** | Separate `NEXTAUTH_SECRET`, separate OAuth apps, separate database URLs per environment. |
| **Least privilege** | Developers get git, not dashboards. Destructive operations are admin-gated and production-only. |
| **Forward-only, versioned migrations** | Generated files committed with the schema change; applied low → high; `__drizzle_migrations` as the ledger. Never `db push` to a shared database. |
| **No downward data flow** | Schema converges, data does not. Production is never restored from a lower environment, and lower environments do not receive fresh production data. |
| **Data minimization** | Lower environments branch from `dev`, not `main`, so real student work stays in one place. |
| **Copy-on-write isolation** | Neon branches for rows; the same read-through/write-local pattern hand-built for objects, because the object store offers no branching primitive of its own. |
| **Isolation must cover every stateful backend** | The lesson this repo learned the hard way: branching the database while sharing the object store produces *apparent* isolation, which is worse than none — it invites confident destructive action. |
| **Immutable source, regenerable derivatives** | Uploaded PDFs are the source of truth and never deleted by a lower environment; covers, page images and sheets are regenerable and therefore safe to namespace and prune. |
| **Guard at the chokepoint** | One storage class, two methods, rather than a guard at every call site that the next call site will forget. |
| **Fail closed** | Environment gates test `VERCEL_ENV === 'preview'` positively; a missing variable must deny, not permit. |

## Failure modes to recognize

| Symptom | Likely cause |
| --- | --- |
| A reading 404s in one environment but not another | A row references an object that another environment deleted. Invariant 4, violated. |
| A cover is blank or is the wrong reading | Another environment overwrote it — class-2 or class-3 destruction. Check whether the writer was on Node < 22.7. |
| A preview behaves as if a column doesn't exist | Branch drift: new code, old schema. Refresh or re-cut the branch. |
| A script reports on the wrong database | `.env.local` won, or `LOOM_ENV_FILE` wasn't set. Every script prints its database first — read that line. |
| Sessions behave strangely across environments | Sessions are **database rows**, not signed tokens. Two environments on one database share a session table. |
| `[SENSITIVE]` in a pulled env file | Vercel refuses to export sensitive values. Get it from the Neon console, not the pull. |

## Runbooks

### Point a script at another environment

```powershell
$env:LOOM_ENV_FILE = '.env.production.pulled'
npm run diagnose:readings
$env:LOOM_ENV_FILE = $null      # it persists for the session otherwise
```

Rename any pulled file away from `.env.production.local` — Next auto-loads that
name during `next build` and its `[SENSITIVE]` placeholder breaks the prerender.

### Cut the `preview` branch (**target**, one-time)

1. Neon → branch `preview` **from `dev`**, not from `main`.
2. Vercel → Environment Variables → add **Preview, unscoped**: `DATABASE_URL`
   (the new branch), `NEXTAUTH_SECRET` (fresh).
3. Narrow the existing `Preview, Production` rows for `DATABASE_URL`,
   `NEXTAUTH_SECRET`, `GITHUB_ID`, `GITHUB_SECRET` to **Production only**.
4. Redeploy any open preview and confirm it reports the `preview` database.

Order matters: add before narrowing, or open previews lose their database
between steps.

### Refresh `preview` after migrations land on `dev`

Re-cut it from `dev` (it holds nothing worth keeping), or apply the same
migration files to it. Re-cutting is preferred — it clears QA churn and closes
drift in one action.

### Prune a blob namespace

Namespaced objects are all regenerable by definition. Deleting
`env/preview-*/**` is always safe; the next request re-renders. Schedule it or
do it by hand — but never write a prune that can match a bare key.

### Before deleting anything in production

Confirm no other environment's rows reference the object. In practice: prefer
`setSourceArchived` to `deleteSource` everywhere, and reserve real deletion for
readings that exist nowhere else.

## Open gaps, tracked

| Gap | Fix | Blocking |
| --- | --- | --- |
| Previews publicly reachable | Not Vercel Authentication — it would wall the dev alias too and lock alpha testers out. Password Protection is $150/mo. Mitigated instead by the preview database holding nothing real. | nothing today |
| Safe Browsing lists the apex `aroughidea.com` (2026-08-20), and browser enforcement covers every subdomain — Chrome/Safari/Firefox draw the red interstitial at production sign-in (Edge, on SmartScreen, is unaffected) | Done 2026-08-20: legacy apex site retired and replaced, Search Console property verified, review requested. Awaiting Google's verdict (~1 day documented). Confirm via the transparency API, then delete this row. Full state: [deployments.md](deployments.md) | production sign-in on Safe Browsing browsers, until the verdict |
| Guest email door unconfigured | The lying link is fixed (2026-08-20, `05c3235` — "no github account?" now opens guidance to create one with the invited address). What remains, optional: `RESEND_API_KEY` + `EMAIL_FROM` at a Resend-verified domain, for someone who truly will not make a GitHub account | only that last person |
| Teardown misses abandoned PRs | A scheduled sweep reconciling `preview/pr-*` against closed PRs | orphan databases and stale pinned variables |
| The pinned `DATABASE_URL` is written non-sensitive | `type: "sensitive"` in the workflow's API call | consistency with every other secret here |
