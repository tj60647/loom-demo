# Build and test workflow — production, dev, and branches

How a change moves from someone's machine to a student's screen, and **where
each kind of testing actually happens**. Five environments exist; each can prove
something the others cannot, and most wasted debugging comes from testing a
thing in the one place that cannot show it.

Precedence: [CONTRIBUTING.md](../CONTRIBUTING.md) is the authority on the PR
gate and review expectations. [data-environments.md](data-environments.md) is
the authority on what the backend is and who may destroy what. This file is the
authority on **sequence** — what you do, in what order, and what you check
before moving on. Where it repeats another file, that file wins on its own
subject.

Marks follow [data-environments.md](data-environments.md): **live** is true
today, **gap** is a known hole, **target** is where we're going.

## The loop, in one line

`branch → build locally → push → preview QA → PR → CI → merge to dev → soak → PR to master → production`

Nine steps, days not weeks. Branches map to **changes, never to people** — a
personal long-lived branch drifts and turns review into "approve my month"; a
change branch is a ten-minute read.

## What each environment is for

| Environment | Question it answers | Audience | Wrong to use it for |
| --- | --- | --- | --- |
| **local** | Does the logic work? | you | anything about the production build path |
| **CI** | Did anything regress? | nobody | exploratory or visual judgment |
| **feature preview** | Does it look and feel right, built? | the dev team | real-data behavior, sign-in flows |
| **dev alias** | Does the *combination* hold up in use? | alpha testers | anything you haven't already reviewed |
| **production** | — | students | testing, ever |

The line that matters most: **production is not an environment you test in.**
Everything else exists so that it isn't.

## The lifecycle, step by step

### 1. Cut a branch from `dev`

One change per branch, named `feat/…`, `fix/…`, `docs/…`. Days, not weeks — the
longer it lives, the further its schema drifts from `dev`'s.

### 2. Build it locally

Sign in through the backdoor: `/api/auth/test-login` for admin,
`?as=testa` for a learner, `?as=faculty` for faculty. Your `DATABASE_URL` points
at the Neon **`dev`** branch — never `main`. `npm run seed:demo` wipes the demo
course on whatever database it is aimed at.

Before you push:

```bash
npm run check        # eslint + tsc + the check:* assertions
npx playwright test  # or --config=playwright.3100.config.ts on Windows
```

If port 3000 EACCESses on Windows it sits in a Hyper-V excluded range — use
3100. If the app loads but `/api/*` 404s, a stale dev server is haunting the
port: kill it and delete `.next`.

### 3. Push, and get a preview

Vercel builds every branch. **The branch alias is stable** —
`loom-demo-git-<branch>-aroughidea.vercel.app` — and survives every push to that
branch. Only the per-deployment URL (`loom-demo-<hash>-…`) is ephemeral. Use the
alias; share the alias.

### 4. QA the preview

This is the step the whole environment story exists to make safe, and today it
is **only partly usable**:

- ✅ Visual and layout review, built and deployed.
- ✅ Anything reachable without a session.
- ⚠️ **gap** — no sign-in path works on a preview today. OAuth cannot complete
  (an OAuth App holds one callback URL and the origin is the preview host), the
  guest email door is unconfigured, and the backdoor 403s on production builds.
- ⚠️ **gap** — previews are pointed at the **production database** and share
  production's blob objects. Until [data-environments.md](data-environments.md)
  gaps 1 and 2 close, treat a preview as **read-only** and do not create,
  ingest, or delete anything.

At **target**, this step becomes: sign in with the secret-gated backdoor, work
against the `preview` database in your own blob namespace, and break whatever
you like.

Check layouts at **1280 · 1536 · 1728 · 1920** CSS px. Loom is a desktop tool;
there are no phone layouts and none should be added. A 1920×1080 panel does not
hand you 1920 CSS px — at Windows' default 125% scaling it hands you 1536.

### 5. Open the PR into `dev`

The [template](../.github/pull_request_template.md) asks for four things; two
are non-negotiable — **red lines** (does the change go near "no AI in student
judgment", "work never inaccessible", "render and count, never decide"? say why
it holds) and **spec impact** (behavior diverging from
[loom-model-build.md](loom-model-build.md) bumps the spec in the same PR; TJ
ratifies — a commit message is not a ratification).

If you changed how a student, faculty member or admin moves through Loom, update
the matching flow in [src/lib/workflows.ts](../src/lib/workflows.ts) **in the
same commit**. `check-workflows` catches dangling edges and orphan nodes; it
cannot tell you the picture has quietly fallen behind the build.

### 6. CI gates it

- `checks` — eslint + tsc + build. No secrets; runs on every PR including forks.
- `e2e` — the Playwright journey suite against the Neon `ci` branch, seeded, via
  `next dev` (the backdoor needs a non-production build).

Both are required on `dev` **and** `master`. **Fork PRs can never pass `e2e`** —
GitHub withholds secrets from fork runs — so mirror the branch into this repo or
add the contributor as a collaborator. Check the *job* conclusion, not the run's.

### 7. Merge to `dev`

The alias redeploys automatically. Whoever lands the PR applies any migration to
the Neon `dev` branch and to `ci`, so the gate stays truthful.

### 8. Soak

Alpha testers exercise the *combination* on real tester data with real sign-in.
Disagreements get settled by what testers actually do, not by argument. This is
also the only place the GitHub OAuth round trip is ever exercised — see below.

### 9. PR from `dev` to `master`

The production gate, and it reviews a different question than code review did:
**is this what students should meet?** Merge deploys production; the migration
goes to the production `DATABASE_URL` at merge time. Merging to `master` is the
only path to production — no `vercel --prod` from a laptop.

## Where each kind of testing happens

The matrix worth internalizing. ✅ do it here · ⬜ possible, not the right place ·
❌ cannot work here.

| | local | CI | preview | dev alias | production |
| --- | --- | --- | --- | --- | --- |
| Unit-ish assertions (`check:*`) | ✅ | ✅ | ⬜ | ⬜ | ❌ |
| Playwright journey suite | ✅ | ✅ | ❌ backdoor 403s | ❌ | ❌ |
| Exploratory clicking | ✅ | ❌ | ✅ **target** | ✅ | ❌ |
| Visual / layout at real widths | ⬜ | ❌ | ✅ | ✅ | ❌ |
| Production build path (`NODE_ENV=production`) | ❌ | ⬜ | ✅ | ✅ | ✅ |
| Server-side PDF decode (needs Node ≥ 22.7) | ⬜ | ✅ Node 22 | ✅ Node 24 | ✅ Node 24 | ✅ Node 24 |
| Migration applies cleanly | ✅ | ✅ | ⬜ | ✅ | ✅ |
| **GitHub OAuth round trip** | ❌ | ❌ | ❌ | ✅ **only here** | ✅ don't |
| Enrolment on first sign-in | ❌ | ❌ | ❌ | ✅ **only here** | ✅ don't |
| Guest email door | ❌ | ❌ | ✅ **target** | ✅ **target** | ⬜ |
| Real-data behavior at scale | ❌ | ❌ | ❌ | ⬜ | observe only |

Two columns of ❌ in the OAuth rows are the point: **the suite structurally
cannot cover first sign-in and enrolment.** `npm run check:auth` covers
everything on Loom's side of the callback; that GitHub returns the payload we
parse is established only by a person, on a deployment, by hand.

### The manual OAuth smoke test

Required after any change to [src/lib/auth.ts](../src/lib/auth.ts),
[src/lib/signIn.ts](../src/lib/signIn.ts), an OAuth app's settings, or a
callback URL — and the PR says it was done. Five minutes on the dev alias:

1. **A real student, first time.** A genuinely fresh GitHub account whose
   verified address you invited on `/admin`. Expect GitHub to ask for **"Email
   addresses (read-only)" and nothing else** — if it asks for profile data, the
   scope narrowing has been reverted. You land on the Library with the course's
   readings.
2. **Idempotent second time.** Sign out, sign in. Same landing, still exactly
   one roster row.
3. **A non-primary address.** Add the course address as a secondary verified
   address with something else primary. Loom should still find the course — this
   is the case most students are actually in.
4. **Not on the roster.** Remove them, sign in. Expect "That email is not on a
   course roster" naming the address GitHub gave, not a NextAuth error page.
5. **No confirmed address.** Read `/auth/error?error=NoVerifiedEmail` directly
   if you can't stage it, and confirm the copy still makes sense.

If step 1 fails on a fresh deployment, check the OAuth app's callback URL before
anything else — dev and production have separate apps and a mismatch surfaces as
a generic callback failure.

## Signing in, per environment

| Environment | Path | Notes |
| --- | --- | --- |
| local | `GET /api/auth/test-login[?as=testa\|faculty]` | Dev builds only. |
| CI | same | The suite's only door. |
| preview | **gap** — nothing works | **target:** the same route, gated on `VERCEL_ENV === 'preview'` **and** a `PREVIEW_LOGIN_SECRET`, with `__Secure-` cookie naming so it works over https. |
| dev alias | real GitHub OAuth (dev app) | Also the only place to test enrolment. |
| production | real GitHub OAuth (prod app) | |

Two facts that explain most confusion here. Sessions are **database rows**, not
signed tokens, so two environments sharing a database share a session table. And
next-auth on Vercel derives its origin from the forwarded host and **ignores
`NEXTAUTH_URL`** — which is why OAuth can never work on an arbitrary preview
URL, and why a magic link *would* (it points back at whatever host issued it).

## Migrations inside the flow

| When | Who | Against |
| --- | --- | --- |
| Same commit as the schema edit | the author | — (`drizzle-kit generate`) |
| At PR landing | whoever lands it | Neon `dev`, and `ci` |
| Before preview QA of that branch | whoever needs it | `preview` (**target**) — refresh or re-cut |
| At merge to `master` | whoever merges | production `DATABASE_URL` |

`npx tsx scripts/check-migrations.ts` before and after; it reports which
migrations *ran*, not what the database is shaped like. Never `db push` to a
shared branch.

## Definition of done

A change is done when all of these are true:

- `npm run check` and the Playwright suite pass locally.
- New learner-facing behavior has a journey assertion; new admin capability has
  one in `journey-admin.spec.ts`. **A feature only a human has ever clicked is
  not done.**
- Every mutation a spec makes, it removes.
- The UI was **looked at** in the running app at desktop widths — a screenshot
  in the PR beats a paragraph, and a green suite misses what a reader sees first.
- If any of the three workflows moved, `src/lib/workflows.ts` moved in the same
  commit.
- Student-facing copy speaks the model's vocabulary: **Projections**, **Links**,
  **Readings**, **Library**, **Passages**. Code may still speak the older names;
  UI never does, and `npm run check` enforces the part of that it can see.
- If auth was touched, the manual OAuth smoke test was run and the PR says so.

## Destructive operations while testing

Until the storage namespacing lands, these reach production from **any**
environment:

- `deleteSource` removes the PDF and cover from the shared blob store.
- Regenerating a cover, page image or sheet overwrites production's object in
  place, silently.
- **Viewing the Library** re-renders and persists any missing or undersized
  cover — a read that writes.

Standing rules meanwhile: prefer `setSourceArchived` to `deleteSource`
everywhere; delete only in production, and only for a reading that exists
nowhere else; never run `seed:demo` against `main`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| App loads, `/api/*` 404s | Stale `next dev` on the port. Kill the PID, delete `.next`. |
| `EACCES` on port 3000 (Windows) | Hyper-V excluded range. Use 3100. |
| Blank scans, four unexplained spec failures | Node < 22.7 — pdf.js can't import its no-wasm JPX fallback. |
| A spec fails on data another run left behind | A spec didn't clean up, or `seed:demo` needs re-running. |
| `e2e` red on a fork PR | Structural — secrets never reach fork runs. Mirror the branch. |
| Preview shows old behavior | You opened the deployment URL, not the branch alias — or the build failed and the alias still points at the previous deployment. |
| A script reports on the wrong database | Read the database line it prints. `LOOM_ENV_FILE` redirects it. |
| `OAuthAccountNotLinked` | Someone used the guest link first, then GitHub, with one address. next-auth won't join them. |

## What changes when the gaps close

Three things get materially better, in this order:

1. **`preview` Neon branch + re-scoped variables** → preview QA stops touching
   production rows; you can create and edit freely.
2. **Blob namespacing in `storage.ts`** → preview and dev QA stop overwriting
   production's objects; delete becomes safe everywhere; the dev alias stops
   quietly rewriting production covers.
3. **Secret-gated preview backdoor + Deployment Protection** → step 4 of the
   lifecycle becomes a real QA step instead of a look-but-don't-touch one.

Until then, step 4 is **read-only**, and that limitation is the reason this
document exists rather than an oversight in it.
