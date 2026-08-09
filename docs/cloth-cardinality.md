# Cloth cardinality — a design note

**Status: for TJ's ruling. Nothing here is built, and nothing should be built
until the §7 question is answered.** Written 2026-08-08 at TJ's request, after
they asked to enable three things: a Cloth with more than one Reading, a Cloth
with more than one User, and a Reading with more than one Cloth.

The three axes look like one feature. They are not: **two of them are nearly
free and one is a re-keying of the whole graph**, and which is which depends
entirely on a single question — §7 — that has not been decided.

---

## 1. What the build does today

| | |
| --- | --- |
| A Cloth is | a Title + a Description, addressed **by scope**, not by id |
| `scope.key` is | `''` (the whole weave) or one Reading id |
| The DB allows | exactly one: `unique(userId, courseId, scopeKey)`, named `onePerScope` |
| A Passage belongs to | a **User** and a **Reading** (`byte.userId`, `byte.sourceId`) — **there is no `clothId` on `byte`, `edge` or `map`** |
| Authorship is | row ownership: **84** `eq(row.userId, session.user.id)` filters across `src/actions` and `src/lib` |
| Scope is | reading-keyed: **99** `scopeKey` sites across **25** files, plus `scoped()` in `src/lib/scope.ts`, which every tab consumes |

So today a Cloth is **a name over one Reading's work**, not a container of it.
That is the mechanical reason a Reading and its Cloth "kind of mean the same
thing" (TJ, 2026-08-08).

Worth noticing: **a Cloth with many Readings already exists.** The whole-weave
Cloth (`scopeKey = ''`) covers every Reading. What is missing is not the
capability but its generality — the scope key can say "all" or "one", and
nothing in between.

---

## 2. The two readings of "a Reading with more than one Cloth"

### A — SHARE: a Cloth is a *lens*

Two Cloths on one Reading see the **same** Passages. Each carries its own
Title, Description and Projections. A second Cloth is a second *interpretation
of the same evidence* — the materials reading and the negotiation reading of
Bucciarelli, over one set of captures.

- `byte` / `edge` / `map` are untouched. No `clothId`.
- A Cloth gains a **set of Readings** (`cloth_reading`) and a **set of Members**
  (`cloth_member`). `scopeKey` generalises from "one or all" to "these".
- The graph stays owned by `(user, reading)`, exactly as now.

### B — PARTITION: a Cloth *owns* its evidence

What the model currently says: *Cloth = Title + Description + one Reading +
**Passages + Concepts + Links + Capture Log** + Projections*. Two Cloths on one
Reading are two separate bodies of work; a Passage captured in one is not in
the other.

- `byte`, `edge` and `map` each need a `clothId`, backfilled.
- `scoped()` re-keys from Reading to Cloth — the primitive 25 files read.
- Every capture path must decide *which Cloth* it is capturing into.

---

## 3. Against the red lines (§6)

Neither option breaks one outright. Two deserve attention.

**Red line 5 — "the student's work is never inaccessible or partial;
whole-artifact export always available."** Under **B** a Cloth export is
self-evidently whole: the Cloth holds its own evidence. Under **A** the phrase
needs a definition — exporting one lens must still carry the Passages it reads,
which means a Cloth export includes evidence another Cloth also shows. That is
not a violation (nothing is withheld) but "the whole artifact, never a slice"
should be restated for lenses before A ships.

**Red line 3 — "counted, never judged."** Unaffected either way.

**Red line 4 — empty states visible.** Unaffected. A Cloth with no Passages is
already legal.

---

## 4. Against the Overlay rulings (TJ, 2026-08-07)

This is where **many Users per Cloth** bites, and it bites the same way under A
and B.

**Ruling 2 — "counts are of PEOPLE, never of rows that carry an author."** The
overlay arithmetic counts distinct `byte.userId`. If a Cloth has several
members, a capture still needs a *person* on it, or "eleven people marked this
sentence" becomes "eleven cloths did". **Per-row authorship must survive
co-authorship.** Cloth membership can never replace `byte.userId`; it can only
sit beside it.

**Ruling 1 — the gate, per Reading.** An overlay opens on a Reading only once
*you* have captured a Passage in it. In a shared Cloth, does a co-author's
capture open **your** gate? If it does, the crowd pre-codes the text for you —
which is exactly what archived red line #8 and this gate exist to prevent. **The
gate must stay per-person, not per-cloth.**

**Ruling 4 — faculty are not peers.** A shared Cloth with a faculty member in
it (an exemplar) would leak instructor work into peer counts unless
`cloth_member` carries a role and the overlay excludes it — the same exclusion
`courseMemberships.role <> 'FACULTY'` already does.

**None of these is an argument against shared Cloths.** They are three
constraints any implementation must satisfy, and they all say the same thing:
*authorship is a property of the capture, not of the container.*

---

## 5. Against the export contract (§6, `src/lib/graphExport.ts`)

`buildExport(state, student)` writes a single `graph.student`. A Cloth with
several Users has no single student, so the contract needs either an authors
list or per-row attribution — otherwise the export quietly claims one person
made work several people made. This is a **contract change with a version
implication**: importers (including the map-import path) read that shape.

Again true under both A and B, and again driven by *many Users*, not by many
Cloths.

---

## 6. What each axis actually costs

| Axis | Under A (share) | Under B (partition) |
| --- | --- | --- |
| **Reading → many Cloths** | join table + a cloth id in scope; UI picks which lens | `clothId` on `byte`/`edge`/`map`, `scoped()` re-keyed, every capture path chooses a Cloth |
| **Cloth → many Readings** | generalises the whole-weave Cloth that already exists — `cloth_reading` replaces the `''`-means-all special case | same, plus the above |
| **Cloth → many Users** | `cloth_member`; authorship stays on the row; overlay gate stays per-person; export gains authors | identical work — this axis is orthogonal to A/B |

The honest summary: **many-Users is the expensive axis and it costs the same
either way.** It converts 84 ownership checks into membership checks — an
authorization change, not a data change, and the one place where getting it
wrong exposes one student's work to another.

**Many-Readings is nearly free under A** and is the axis that most resembles
something already shipped.

---

## 7. The question to rule on

**Does a second Cloth on a Reading share its Passages, or hold its own?**

A recommendation, with the reasoning rather than the conclusion:

The model's own definition points at **B**. But every contract built since —
the overlay arithmetic, the per-Reading gate, the export's single `student` —
was designed on the assumption the build already makes: that **authorship and
evidence belong to a (user, reading) pair**. Choosing B does not remove that
assumption; §4 shows the overlays need per-row authorship *regardless*. So B
would leave the system carrying **both** cloth-ownership and user-authorship —
the complexity of both models, to gain a separation students may never ask for.

**A is therefore the cheaper and, I think, the truer story**: a Cloth is *a
reading of a Reading* — a lens with a title, a paragraph, and projections, over
evidence that belongs to the person who captured it. It generalises the
whole-weave Cloth instead of contradicting it, and it leaves the 84 ownership
filters alone.

Choosing A costs **one line of the model** (Cloth's definition stops claiming
its own Passages and Capture Log). Choosing B costs **the overlay rulings and
the export contract**, which are newer, more specific, and were ratified more
recently.

That asymmetry is the argument. But it is TJ's call, not mine.

---

## 8. On "add it now, even if we don't use it"

Half right, and worth splitting:

- **The data shape is genuinely cheaper now.** Backfilling join tables while
  there is one Cloth per scope and little real data is trivial; after a term of
  student work it is a migration under live data.
- **The capability is not cheaper now.** It costs the same later, minus one
  thing: code no UI exercises will be subtly wrong by the time it is switched
  on, so most of the "already built it" saving is spent re-verifying at flip
  time. Admin checkboxes that toggle scoping semantics per course mean **both**
  paths must stay correct forever — a doubled test matrix on the app's most
  load-bearing primitive.

And the ordering matters: adding `clothId` "just in case" would add a column
whose meaning is undecided, which is worse than not adding it. §7 first.

**TJ's decision, 2026-08-08: build nothing yet; keep it recorded as deferred.**
That deferral stands with the model doc's existing line — *Join, Quilt, and
Shared / co-created Cloths are defined, deferred; do not build, do not delete
stubs.*
