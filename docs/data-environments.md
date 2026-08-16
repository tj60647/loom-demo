# Data environments — Postgres and blob storage

What the backend *is*, in every environment, and the rules that keep the
environments from reaching into each other.

This document is the authority on **where data lives and who may destroy it**.
[deployments.md](deployments.md) remains the authority on how a deployment is
stood up and wired; [build-and-test-workflow.md](build-and-test-workflow.md) is
the authority on how work moves through those environments. Where this file and
an older one disagree about databases or storage, this one wins — it was written
against the live Vercel and Neon configuration on 2026-08-16, not from memory.

## Status legend

Most of this file describes the state we want. Some of it is not true yet. Every
rule and every matrix cell carries one of:

| Mark | Meaning |
| --- | --- |
| **live** | True in the running system today, verified. |
| **gap** | Not true today. The hazard is open and named below. |
| **target** | The state this document specifies. Build toward it. |

Delete a **gap** mark only in the commit that closes it, and never leave a
**target** undated — a target with no owner is a wish.

## State of play — 2026-08-16

Three things are true today that this document exists to change.

1. **Feature-branch previews run against the production database.** Only the
   `dev` git branch carries branch-scoped Vercel variables. Every other branch
   falls through to a row scoped `Preview, Production` — one variable, one
   value, serving both — for `DATABASE_URL`, `NEXTAUTH_SECRET`, `GITHUB_ID` and
   `GITHUB_SECRET`. A preview of `feat/anything` is pointed at `main`.
   *(Verified with `vercel env ls`.)*

2. **Every environment writes to the same blob objects.** Derived-asset keys are
   pure functions of `source.id` — `covers/${sourceId}.png`,
   `pages/${sourceId}/${n}.w${width}.webp` — and `source.id` is copied verbatim
   by a Neon branch. With `allowOverwrite: true` in
   [src/lib/storage.ts](../src/lib/storage.ts), a write from any environment
   lands on top of production's object. This is live on the **dev alias** right
   now, not merely a future preview risk.

3. **Previews are publicly reachable.** Both branch aliases answer `200` with no
   Vercel SSO wall — Deployment Protection is off. Anything a preview can do,
   the internet can reach.

The exposure is currently limited by the fact that no session can be minted on a
preview: OAuth cannot complete there, the guest email door is unconfigured, and
the test backdoor 403s. **Opening any sign-in path to previews converts all
three of the above from latent to live**, which is why this document precedes
that work.

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
| **Neon branch** | `dev` | `ci` | `preview` (**target**) — `main` today (**gap**) | `dev` | `main` |
| **Blob namespace** | `env/local/` (**target**) | `env/ci/` (**target**) | `env/preview-<branch>/` (**target**) | `env/dev/` (**target**) | bare keys |
| **Blob today** | bare keys (**gap**) | bare keys (**gap**) | bare keys (**gap**) | bare keys (**gap**) | bare keys |
| **`NODE_ENV`** | `development` | `development` | `production` | `production` | `production` |
| **`VERCEL_ENV`** | unset | unset | `preview` | `preview` | `production` |
| **Sign-in** | test backdoor | test backdoor | secret-gated backdoor (**target**) — none today (**gap**) | real GitHub OAuth | real GitHub OAuth |
| **Audience** | one developer | no humans | the dev team | alpha testers | students |
| **Data class** | tester + inherited | synthetic | tester (**target**) | tester + inherited | **real student work** |
| **Blast radius if wrong** | one machine | one run | **production today (gap)**, self at target | alpha testers | everyone |

Two cells deserve emphasis. The **feature preview** column is the whole reason
this document exists: its Neon cell says `main` today and `preview` at target,
and its blast-radius cell says production. The **blob namespace** row is
uniformly a gap — whatever you do with databases, the objects are shared until
that row goes live.

## Matrix 2 — credentials and access

Where each secret is scoped, and what it unlocks. Scopes are Vercel environment
scopes; "branch" means a git-branch-scoped override.

| Credential | production | dev alias | feature preview | CI | local |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Production scope → `main` | Preview + branch `dev` → `dev` | **target:** Preview unscoped → `preview` · **today:** falls through to production's value (**gap**) | `CI_DATABASE_URL` secret → `ci` | `.env.local` → `dev` |
| `NEXTAUTH_SECRET` | Production, unique | Preview + branch `dev`, unique | **target:** Preview unscoped, unique · **today:** production's (**gap**) | repo secret | `.env.local` |
| `GITHUB_ID` / `GITHUB_SECRET` | production OAuth app | dev OAuth app (branch-scoped) | **target:** unused — no OAuth on previews · **today:** production app (**gap**) | dummy | dummy |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` | project-wide, one store | same | same | `CI_BLOB_READ_WRITE_TOKEN` | `.env.local` |
| `RESEND_API_KEY`, `EMAIL_FROM` | **unset** — guest door dark (**gap**) | unset | unset | unset | unset |
| `PREVIEW_LOGIN_SECRET` | **never set** (**target**) | never set | Preview scope, rotatable (**target**) | n/a | n/a |
| Vercel dashboard | owner | owner | owner | — | — |
| Neon console | owner | owner | owner | — | — |

Three standing rules about this matrix:

- **No secret spans a trust boundary.** A `NEXTAUTH_SECRET` shared between
  preview and production is not a convenience, it is one environment holding
  another's keys. Every environment gets its own.
- **A variable with two environments checked is one value.** Vercel's
  `Preview, Production` scope is not "a preview value and a production value" —
  it is a single value serving both. This is the exact mechanism behind gap 1.
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
| Regenerate a derived asset (cover, page image, sheet) | own namespace (**target**) | own namespace (**target**) | own namespace (**target**) | own namespace (**target**) | yes |
| Delete a reading (`deleteSource`) | own namespace only (**target**) | own namespace only (**target**) | own namespace only (**target**) | own namespace only (**target**) | yes, admin |
| Delete a blob object outright | **no** (**target**) | **no** (**target**) | **no** (**target**) | **no** (**target**) | yes |
| `seed:demo` (wipes the demo course) | yes, against `dev` | yes, against `ci` | no | yes | **never** |

Today every one of the **target** cells reads "yes, against the shared store".

## Postgres — the branching model

### One long-lived branch per environment

`main` (production), `dev` (alpha testers), `ci` (the e2e suite), and
`preview` (**target**, all feature previews). Each is a Neon copy-on-write
branch: created once from its parent at a point in time, cheap because unchanged
pages are shared, and diverging from that moment on.

**Not branch-per-deployment.** Vercel's Neon integration can cut a database per
preview deployment automatically; [deployments.md](deployments.md) invariant 1
rejects it because auto-branching resets tester data on every push. That
reasoning is about the **dev alias**, where testers accumulate work that must
survive. It does not indict a per-feature-branch database, where resetting is
the desired property.

We choose one shared `preview` branch anyway, for three reasons: it is a
configuration change rather than an integration; nothing has to delete databases
when git branches die; and Neon caps branches per project. The cost is that two
developers QAing simultaneously share one dataset. **Upgrade path:** if that
collision actually happens, per-branch databases are an env-var and integration
change with no code impact. Do not pre-build it.

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
| QA churn | `preview` (**target**) | Disposable by definition. Reset freely. |
| Suite fixtures | `ci` | A contract: `test-user-a` carries 3 maps from 2 readings. Restore with `seed:demo`, don't repurpose. |
| Reading PDFs | the one blob store, shared | Source of truth, irreplaceable. Only production may delete. |
| Derived assets | namespaced per environment (**target**) | Regenerable. Losing one costs a re-render. |

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
| **Isolation must cover every stateful backend** | The lesson of gap 2: branching the database while sharing the object store produces *apparent* isolation, which is worse than none — it invites confident destructive action. |
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

### Prune a blob namespace (**target**)

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
| Previews on the production database | Cut `preview`, re-scope variables | Any preview sign-in path |
| Shared blob keys across environments | Namespacing in `storage.ts` | Any preview sign-in path; live on `dev` today |
| Previews publicly reachable | Vercel Deployment Protection on Preview | A deployed backdoor |
| Guest email door unconfigured | `RESEND_API_KEY` + `EMAIL_FROM` | The advertised no-GitHub path, in production too |
