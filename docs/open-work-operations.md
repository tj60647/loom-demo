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

**Why Loom is the one that has to move, and not the others.** The other seven
apps share a trust boundary: same owner, same stakes, same consequences. A
shared key across apps that share a trust boundary is a defensible design.
`loom-db` is the exception on all three counts — a different owner after
2026-09-11, real student work since 2026-08-22, and students who cannot do the
reading when it is down. **Moving it fixes the exposure for every other app at
the same time**, because none of them would hold a key to student work any more.

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

> A health route nobody polls is a diagnostic, not a monitor. On 1 September a
> sibling app had an `/api/health` returning 503 for two days and nobody saw it,
> because nothing was asking.

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
