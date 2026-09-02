# Open work — operations, and the handoff

**Written 2026-09-02, after the outage of 1–2 September.** The product sequence
is [open-work.md](open-work.md); this is its counterpart for the things Loom
*runs on* — deployment, credentials, monitoring, and who is responsible for
them. Same rule: this file is the *sequence and the reasons*, and the detail
lives elsewhere. What happened and why is
[incident-2026-09-01.md](incident-2026-09-01.md).

The ordering principle: **restore, then merge what is already built, then remove
the thing that will cause it again.** The last item is not technical and gates
the value of everything above it.

**The hard date is 2026-09-11**, TJ's exit. Items marked **TJ's call** are forks
the work cannot pass without an answer, and after that date some of them cannot
be answered at all.

---

## 1. Merge what is already built. **Ready now**

Both PRs are written, tested and waiting. Nothing in #48 does anything while it
sits on a branch: the heartbeat does not run and the README badge reads "no
status" until it is on the default branch.

| PR | What | State |
|---|---|---|
| [#48](https://github.com/tj60647/loom-demo/pull/48) | Health route, 15-minute heartbeat, README status badge, corrected CI-keys section | Green on `checks`, `e2e`, `provision`, Vercel. Blocked only on owner review |
| [#49](https://github.com/tj60647/loom-demo/pull/49) | 18 README corrections each with a `file:line`, two glossaries, the `ci-suite` rename, this file and the incident record | Stacked on #48 — **merge in that order**; it retargets automatically |
| [#46](https://github.com/tj60647/loom-demo/pull/46) | `.claude/` added to `.gitignore` | Open since 2026-08-27 — **TJ's call**, see below |

**On #49's provenance commit (`e290df7`).** It attributes the weaving metaphor
— Loom, Cloth, Thread, Quilt, Join — to John Cain, and the concept-mapping
vocabulary to Novak & Gowin and Dubberly. Novak & Gowin is documented in
`contracts.md`; the other two are attested by TJ and recorded nowhere. **If that
needs Cain's or Hugh's confirmation, drop that one commit rather than hold the
other eight** — a branch here is read decision by decision, and the good work
should not wait on the contested part (AGENTS.md, and the `b8258bd` precedent).

**On #46 — TJ's call.** It ignores the whole `.claude/` directory. That also
excludes `.claude/settings.json`, which is the file a team shares Claude Code
project settings through; `.claude/settings.local.json` is the personal one.
`.claude/*` with `!.claude/settings.json` keeps that door open. Either is
defensible; ignoring everything is the safer default when the incoming team's
way of working is unknown.

---

## 2. Move `loom-db` out of the shared Neon project. **TJ's call, then a window**

This is the item that stops the outage recurring, and it is the only one that
must happen before the repository changes hands.

**The situation.** `loom-db` sits in Neon project `raspy-wave-74437268` (the
Vercel store `neon-aero-chair`) alongside seven other databases, all owned by
one role, `neondb_owner`. Six unrelated Vercel projects hold hand-set
connection strings to that role. On 1 September the role's password rotated as a
side effect of connecting an unrelated app to the store, and every one of those
copies went stale at once. Loom was down about ten hours.

**Why Loom is the one that has to move, and not the others.** The other
applications there share a trust boundary: same owner, same stakes, same
consequences. A shared key across applications that share a trust boundary is a
defensible design. `loom-db` is the exception on all three counts — a different
owner after 2026-09-11, real student work since 2026-08-22, and students who
cannot do the reading when it is down. **Moving it also removes Loom's data
from the reach of every other key on that server.**

### Why not the cheaper fix

There is one, and it should be considered and rejected explicitly rather than
overlooked, because on the evidence of the outage alone it looks sufficient:
**give Loom its own Neon role scoped to `loom-db`**, whose password the
Marketplace integration does not manage. Rotations of `neondb_owner` would stop
reaching it. No window, no dump and restore, no risk to student data. If the
credential were the whole problem, this would be the right answer.

It is not enough, for a reason that has nothing to do with credentials. After
2026-09-11 the database would still sit inside a Neon project **owned and
administered by someone who has left the project**, alongside applications Loom
has nothing to do with, where ordinary maintenance by that owner can still
affect it. A scoped role fixes the breakage; only moving the database fixes the
arrangement.

So: **the shared credential is why this is urgent; the handoff is why it is
necessary.** If the migration cannot be completed before the 11th, the scoped
role is a reasonable stopgap — but it is a stopgap, and this paragraph is the
reason to say so out loud rather than let it become the resting state.

### The sequence

1. **A new Neon project for Loom alone.** *Not* `neon-cinnabar-bucket` — that
   one belongs to TJ's own line (`aroughidea/loom`), and putting the team's
   production data inside TJ's personal infrastructure inverts the handoff.
   A fourth project, owned by whoever holds Loom after the 11th.
   Billing is `scope: installation` and usage-priced ($0.35/GB-month), so an
   extra project is not an extra subscription.
2. **Migrate in a maintenance window.** Announce it. Dump, restore, and
   **verify row counts before cutting over** — at minimum `user`, `session`,
   `passage`, `concept`, `edge`, `cloth`, `map`. The database can be named
   `loom` in its new home; the `-db` suffix and the hyphen were always out of
   step with the convention the other seven follow.
3. **Cut over and prove it with a write.** Replace production `DATABASE_URL`,
   redeploy, confirm `/api/health` returns `200 {"ok":true}` — **and then
   confirm a real sign-in completes.** On 2 September the decisive evidence was
   the user count rising from 63 to 64; a read recovering proves less than a
   write.
4. **Recreate the branch structure.** `dev`, `preview`, `ci-suite` and their
   roles, and re-issue `CI_DATABASE_URL` and `PROD_DATABASE_URL`. See
   [build-and-test-workflow.md](build-and-test-workflow.md) for which job needs
   which secret, and note `PROD_DATABASE_URL` should be a read-only role — the
   current one, `ci_migration_reader`, can read `drizzle.__drizzle_migrations`
   and nothing else.

### Do not do these

- **Do not move `loom-db` into the fork's Neon project.** It crosses the two
  lines, which TJ ruled against on 2026-08-27: *"two lines of development must
  never share a database; production holds student work and belongs to the
  loom-demo line only."*
- **Do not disconnect the unrelated app from the shared store as a first move.**
  Disconnecting is very likely to rotate the shared password again — the store
  records it as `secretRotationCompletedAt`, and every observed connect has
  rotated it. That breaks Loom a second time and six other apps with it. After
  step 3, the question stops being urgent: the key it holds is no longer a path
  to student work.
- **Do not connect `loom-demo` to the store instead.** The integration injects a
  single unscoped `DATABASE_URL` across production, preview *and* development,
  which would point unscoped previews at `main` — and previews are keyless,
  since `PREVIEW_LOGIN_SECRET` is never set.

---

## 3. Monitoring, and who receives it

**Built:** `/api/health` (`select 1`, 200 or 503, no session, no payload),
`heartbeat.yml` asking it every fifteen minutes, and a README badge. Two limits
are stated in the workflow file: GitHub delays scheduled runs and disables them
after 60 days of repository inactivity.

**Also built, and weaker than it sounds:** a Vercel alert rule on 5xx scoped to
this project. The same detector was live throughout the outage and recorded
nothing across it and the 90 days around it; the deterministic version was
refused (*"your team has reached the limit of 0 custom alerts"*); and a rate
threshold would not have fired against an overall error rate of 0.234%.

**Missing, and the point of the whole exercise:** an alert that reaches a
person. Realistically an external uptime check on
`https://loom.tjmcleish.com/api/health` — it needs no Vercel or Neon access,
which makes it the one piece of this that someone without infrastructure
permissions can own.

> A health route nobody polls is a diagnostic, not a monitor. An `/api/health`
> returning 503 that nothing is asking is indistinguishable from one returning
> 200.

### Diagnosis happens at the command line, not in a dashboard

Worth recording because it is the access question behind §4, and because the
next person should not start where this one did. None of the 1 September
diagnosis happened in a console. It was `vercel logs --json`, `vercel api`,
`vercel metrics` and `neonctl`.

That is not incidental. The answer came from **correlating three sources no
single dashboard shows together** — the application's error, Neon's operation
log, and the Marketplace store's own record of when it rotated a secret. Their
timestamps agree to the second, and that agreement is the evidence. A console
shows one system at a time.

| Question | Command |
| --- | --- |
| What is the app actually failing on? | `vercel logs <prod-url> --json` — look for `adapter_error_*` |
| Is it the database or the app's copy of the credential? | `neonctl connection-string <branch> --project-id <id> --database-name <db> --pooled --role-name <role>`, then run the failing query |
| Is the schema behind? | `npx tsx scripts/check-prod-migrations.ts` |
| How bad, and on which route? | `vercel metrics vercel.request.count -p <project> --filter "http_status ge 500" --group-by route` |
| When did the credential last change? | the role's `updated_at`, and the store's `secretRotationCompletedAt` |

Those commands were run by a coding agent working in this repository, which is
worth saying plainly rather than leaving as an implication — it is the method to
reach for, not an incidental detail of who happened to be at the keyboard.

**This repository is already set up for it, and that is part of what the team
inherits.** [AGENTS.md](../AGENTS.md) carries the document precedence, the
vocabulary map and the conventions specifically so an agent working here does
not go wrong — the `byte`/Passage rule and the "verify a claim before writing it
in a comment" rule are both there because an agent got them wrong once. This
file records the commands and the sequence so a later session resumes instead of
restarting. A procedure that recurs can go one step further and become a skill;
`~/.claude/skills/vercel-domain/SKILL.md` is the existing precedent.

**So what needs arranging is two things**, and only one of them is technical:

- **A coding agent set up against this repository, with the `vercel` and `neon`
  CLIs authenticated.** Not dashboard seats — the environment-variable wall at
  the start of this incident was a dashboard seat, and it could not have
  answered the question for anyone.
- **A decision about who holds those credentials.** An agent driving them has
  exactly the reach of the token it uses. That is an access decision and belongs
  in the table in §4, not in a tooling note.

---

## 3a. What `dev` is for. **A decision, not a task**

Found while checking something else, and worth settling before more laptops are
pointed at it.

While production was down the team could not demo from the deployed site, so
they set up local environments and demoed from those. It worked. **But an outage
does not only stop work, it displaces it** — and the fallback path here routes
to the Neon `dev` branch, which was cut from `main` and currently holds **60
real accounts, 32 readings and 926 passages** of actual coursework. Measured
2026-09-02.

So the rule in `.env.example` — local points at `dev`, never `main` — is doing
less than it appears. It protects production from being *written* to, which is
its stated purpose (`seed:demo` wipes whatever database it is aimed at). It is
**not** a claim that local development works on anonymous data, and
[data-environments.md](data-environments.md)'s "real student work stays in one
place" is true of `preview` and `ci-suite` and not of `dev`.

None of it was necessary for a demo. `npm run seed:demo` builds a synthetic
cohort for exactly this: `test-user-a@loom.local` with a worked loom across two
readings, `test-user-b` as the fresh-account experience, two colleagues besides.
A demo needs a convincing loom, not a real one.

**The decision.** `dev` currently serves two audiences with different needs —
developers, who want a seeded fixture they can wipe, and alpha testers, for whom
realistic data may be the point. It cannot be both while it is a copy of
production. If the answer is "seeded", re-seed it; if the answer is "realistic",
say so explicitly and treat a `dev` credential as carrying student data, which
changes who may hold one. Either is defensible; the current state is the one
that is not, because it is undeclared.

Worth folding into §2: the new Neon project is the natural moment to cut a
`dev` branch that was never a copy of production in the first place.

---

## 4. Ownership. **TJ's call, and it expires on 2026-09-11**

Not technical, and it gates the value of everything above. Responsibility for
the Loom deployment spans four systems that do not share an owner by default:

| System | What it controls | Owner |
|---|---|---|
| Vercel project | deployment, Sensitive variables, alert rules | — |
| Neon project | the database, branches, roles | — |
| GitHub repository | code, Actions secrets, branch protection | — |
| Monitoring | who is paged, and who acts | — |

Each needs a name, a first responder and a deputy. **An unowned alert is noise;
an unowned credential is the next outage.**

The failure this prevents is not hypothetical. During the incident the person
looking had the right hypothesis and no route to act on it, and the person who
could act did not yet know there was anything to act on. That is an ownership
gap rather than a skills gap, and it is most of the ten hours.

**Two things only TJ knows.** John Cain's authorship of the weaving metaphor and
Dubberly's contribution to the vocabulary are recorded nowhere in this
repository — they survive only in `glossary.md`, cited to a conversation. If
either matters for attribution in a paper or a syllabus, ratify it into
[loom-model-build.md](loom-model-build.md) the way other decisions are.

---

## 5. Known unknowns

Recorded so nobody re-derives them, and so nobody builds on them as settled.

- **What selects which Neon branches a rotation hits.** On 1 September it took
  `main`, `staging` and `dev` but not `ci-suite` or `preview`, which still carry
  their 2026-04-30 credential. Cold storage explains `ci-suite` and not
  `preview`. **Do not predict a rotation's blast radius** — and note this is why
  CI stayed green through the outage: every automated view of the system was
  pointed at a branch that still worked.
- **Whether the Vercel–Neon integration can target a non-default database.**
  Read from the API shape, not documentation: there is no per-project database
  field, only `envVarPrefix`. Confirm in the connect dialog before relying on it.
- **Whether renaming a Neon project renames its Vercel store.** The two names
  are currently identical. Test on a project nothing depends on first.
- **Whether `PROD_DATABASE_URL` behaves in CI over time.** It ran for the first
  time on 2026-09-02 and reported 30/30. Before that the check had existed since
  the migration-0028 incident and had never once executed.

---

## Where I would start

**Merge #48.** It is green, it is small, and nothing it contains works until it
is on `master`. Then #49.

**Then answer §4**, because it costs an afternoon and cannot be answered after
the 11th, while §2 can be executed by whoever owns it afterwards.

**Then §2**, in a window, with someone watching `/api/health`.
