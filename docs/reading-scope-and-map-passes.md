# Reading-first: scope and map passes — strategy

Design strategy for two asks, drafted 2026-07-30, revised the same day when the IA
question was settled (below). Not a spec change yet: §7 says spec changes go by PR
reviewed against the §4 red lines, and §1 of the deployment notes says design changes
route through a single design authority (JC). This is the argument to take into both.

**The two asks**

1. **The reading is the entry point.** You pick a reading, and from it get bytes →
   concepts → threads → map. `01 Open → 02 Throw → 03 Read → 04 Map` is the sequence you
   run *inside* a reading, not a set of course-wide tabs.
2. The map needs history and versions — student-named, `‹ ›` beside the map and the read,
   same concepts throughout but hierarchy and inclusion varying per version — plus *show
   definition* moved onto the cards as a hover menu, and *show byte* added as a quote.

**Settled: reading-first, not a filter.** An earlier draft proposed a lens — a filter
chip over the existing course-wide tabs. Rejected. The course's own chain of
transformations (deployment notes §2: text → notes → concepts → weave → concept map →
chalk talk) runs *per text*, twice a week, twenty-six times. A filter models that as an
exception to the course-wide view; reading-first models it as the shape of the work. The
consequences of that choice, including the one it makes harder, are §A.5 and §A.8.

**Why the two asks are one change.** Today `concept.tier`, the `read` row, and
`views.cardTable.positions` are each single-valued per `(user, course)`. Ask 1 says a
student has 26 reading-sized workspaces; ask 2 says each of those has a stack of
arrangements. Both are the same missing dimension: *the graph is one thing, the maps of
it are many.* A filter would have let this wait; reading-first cannot — see §A.8.

---

## 1 · Strategy A — the reading is the entry point

### A.1 The shelf is the home screen

Today the app opens on `01 Open` with six sibling tabs and the Library sitting at `00`
as one of them (`src/app/page.tsx:46`). Invert it:

```
SHELF  (home)                          the course's readings, by week
  │                                    + "your whole weave"  + 05 Keep
  │
  ├── READING WORKBENCH   /reading/[sourceId]
  │       01 Open · 02 Throw · 03 Read · 04 Map      — scoped to this reading
  │
  └── WHOLE WEAVE         /weave
          02 Throw · 03 Read · 04 Map                — across everything
```

The shelf is the course: `course_source` already carries `week`, `isCore`, `position`
and `isVisible` (`src/db/schema.ts:184`), so grouping the shelf by week *is* the syllabus,
with weeks 2–13 holding their two core readings each. None of that needs new schema.

Each shelf card carries the student's own counts for that reading — *"7 bytes · 4
concepts · 3 threads · 2 passes"* — which is the 26-readings progress surface the course
wants, made of nothing but counting the student's own acts. Keep it counted, never
scored: no checkmarks, no "not started" in red, no completion bar. Red line #7 holds only
if the shelf reports and never grades.

### A.2 Two kinds of scope, and the room for a third

Reading-first does not mean everything is a reading. It means **the entry point is always
a scope**, and a reading is the common one:

| Scope | `scopeKey` | Holds |
| --- | --- | --- |
| one reading | `<sourceId>` | its bytes, its concepts, its internal threads, its read, its map passes |
| the whole weave | `""` | everything — the axial read, the quilt map, all bridges |
| *(later)* a set | `"idA,idB"` | the union of those readings |

`scopeKey = [...sourceIds].sort().join(",")`. One indexed text column keys the read and
the pass stack (§B.4), and single, whole and multi behave identically — which is what
makes "later, several readings" a change of degree rather than a rewrite. **Every row
that exists today has `scopeKey = ""`**, which already means "across everything", so
today's read *is* the axial read and today's map *is* the quilt map, with no migration
and no reinterpretation of anyone's work.

The whole weave is a real place on the shelf, not an escape hatch: weeks 12–14 are the
section quilt, and week 11 is "mine your graph for final-project themes".

### A.3 Membership stays derived — the doors change, the graph does not

**A concept does not belong to a reading — a byte does.** A concept *emerges from* a
reading, and may then be evidenced in several. So the only relation the tool records is
the byte's, and a concept is *evidenced in* a reading when one of its bytes came from
there. Nothing else: no `concept.sourceId`, no per-reading concept identity, no copies,
no ownership.

This is not optional. Spec §2 makes a concept *"deduplicated by label, case-insensitive
— one label is one concept, reused across readings and weeks"*, and that reuse is the
island-bridging the course is trying to teach (deployment notes §8). Reading-first is an
inversion of **navigation**, not of the data model: the readings are doors into one
graph, never twenty-six graphs.

`byte.sourceId` already exists and is stamped on every PDF capture
(`CaptureModal.tsx:39`), so membership is derived per render and discarded — counting,
not deciding, and it cannot go stale.

**A byte does not exist until it is named.** A highlight *is* a byte: selecting text in
the PDF is the capture gesture, not a separate uncoded object, and the passage is filed
under a concept in the same act. Spec §5 already says it — *"in-tool highlights → bytes
(capture only; the student still names every concept)"* — and `byte.conceptId` is
`NOT NULL` accordingly. Nothing in this plan should introduce a holding pen of unnamed
marks: an uncoded highlight is a note, and Loom is not a note tool. Naming at capture is
the coding.

Given a scope `S`:

| Set | Rule |
| --- | --- |
| **in scope** | concepts with ≥1 byte whose `sourceId ∈ S` |
| **bridging** | edges with exactly one endpoint in scope |
| **off-shelf** | concepts whose only bytes have no `sourceId` — see A.6 |

A concept with **zero** bytes appears in every scope, flagged "no evidence": red line #4
already makes that a visible failure state, and this way we never invent a hidden
concept↔reading link to place it.

### A.4 The seam: make concept reuse the moment it is

The obvious worry about reading-first is that it shatters the graph into weekly silos.
The answer is the one seam that stitches the readings together — **concept identity** —
and the tool should show it every time it is crossed.

When a student in week 9's reading names a concept whose label already exists, dedup
gives them the *same* concept, now evidenced by two readings. That is the most valuable
thing that happens all term, and today it is silent. Under reading-first it should be
visible and celebrated, in counting language:

> *"You've named this before — in Star (2010). Your passage joins its evidence there."*

Same for the reverse direction on the shelf: a reading card can say *"3 of these concepts
you first met elsewhere."* Counted, never advised — the tool is not saying the reuse is
correct, only that it happened.

### A.5 Throwing out of a reading

Weeks 6–13 are about threading this week's concepts to prior weeks'. Under a filter that
was "turn the filter off"; under reading-first it needs a real mechanic, and this is the
one piece the chosen IA makes *harder*. It must be designed, not left to the whole-weave
tab.

Inside a reading's `02 Throw`, the warp list has two bands:

- **this reading's concepts** — the default working set;
- **from your other readings** — searchable, collapsed, never absent.

Pulling one in and throwing creates a **bridge**. An edge is not owned by a reading: it
shows up in *every* scope containing either endpoint, so the bridge is visible from both
readings' workbenches and from the whole weave. No `edge.sourceId` is needed, and none
should be added — an edge's placement is fully determined by its endpoints' evidence.

Render bridges as their own counted band inside the reading — *"4 threads run out of this
reading"* — not as noise the scope hides. Same for the shuttle: it draws within the
reading by default, with "draw across readings" once a second reading has concepts.

### A.6 Off-shelf sources: mint a shelf card

Manual capture (`OpenTab.tsx:52`) writes free-text `source` and no `sourceId`, so those
bytes have no door. Reading-first turns the ragged case into the normal one: **if you are
coding something, it is a reading, so it gets a card on your shelf** — title and author,
no PDF. Deployment notes §9 already ratified students adding papers.

Mechanically: a `source` row with `createdByUserId = me` and no `course_source` row, so it
sits in "your own readings" on the student's shelf and on nobody else's. That part needs
no schema change; `source.storageKey` being `NOT NULL` does — either make it nullable or
agree a sentinel for a reference-only card.

Backfill for existing free-text bytes: offer, never guess. A "which reading is this
from?" chip on the byte, and a one-click "make a card for *Suchman, Plans and Situated
Actions*". Fuzzy-matching `byte.source` text against library titles is the tool deciding
what a student meant.

The worked example (`src/lib/example.ts`) has no source ids at all and must land
somewhere real — give it its own shelf card, *Star & Griesemer (1989)*, when it loads.
Otherwise loading the example under reading-first shows an empty shelf and an empty app.

### A.7 Routing and mounted state

Two consequences of making the reading a place rather than a filter, both of which will
bite silently if ignored:

- **Give readings real URLs.** `/reading/[sourceId]` makes week 5 bookmarkable, gives back
  the back button, and lets an instructor link a reading directly. Keep the 01–04 tabs as
  in-page state *within* that route, so `KEEP_ALIVE` (`page.tsx:34`) keeps doing its job
  and a half-typed throw sentence survives a tab switch.
- **But a half-typed throw sentence belongs to a reading.** Today those drafts — the
  picked pair, the traced prompt, the naming field — live in component state that would
  survive a scope change and quietly attach to the wrong reading. Key the workbench by
  scope (`<Workbench key={scopeKey}>`) so switching readings remounts it.

`LoomProvider` keeps fetching the whole graph once (spec §6: kilobytes per student) and
gains `scope` plus a derived, memoized scoped view. Mutations still write to the one
graph; capture stamps `sourceId` from the active scope. No new queries.

### A.8 What reading-first forces early

A filter would have let `04 Map` keep working exactly as it does today — one set of tiers
for the whole course — while the rest of the scoping shipped, and fixed it later.
Reading-first cannot wait: every reading gets its own Map from day one, and
`concept.tier` holds one value per concept. Sort Star's concepts into primary and
secondary and you have sorted Wenger's too, in every other reading's map, visibly and
immediately. **Reading-first pulls per-scope placement out of "later" and onto the
critical path** (§B.3).

Honest staging if that PR is not ready: the reading workbench ships with `01–03` only,
and `04 Map` stays at the whole-weave level until per-scope tiers land. Wrong-but-shipped
is not an option here — the map is the artifact the chalk talk is built from.

---

## 2 · Strategy B — passes (map history and versions)

### B.1 Two histories, deliberately different

The app already has a history — `graph_event` / "the cloth, over time"
(`HistoryPanel.tsx`). Do not extend it for this; they are opposites, and conflating them
ruins both:

| | the cloth, over time | **passes** (new) |
| --- | --- | --- |
| written by | the tool, on every act | the student, deliberately |
| granularity | one act | one interpretation |
| named | no | **yes — the student's sentence** |
| survives reset | yes | no (it names concepts that are gone) |
| purpose | replay how the weave grew | *"here is how I read it, and how I read it after Thursday"* |

A pass is a student act with student prose in it, so cutting one gets its own
`graph_event` (`map.pass`) — the involuntary record recording the voluntary one.

**Naming.** "Version" is the code word; the student-facing word should carry the register
the rest of the tool uses (warp, weft, throw, coin, byte). *Pass* — one pass of the
shuttle, and "another pass at it" — is the candidate here. *Draft* also works (a weaving
draft is literally the pattern notation) but collides with "Draft from PDF" on the admin
Readings tab. JC's call, per deployment notes §1.

### B.2 The model: linear, append-only, edit the head

**The newest pass is the working pass and the only editable one.** Cutting a pass names
the current head and opens a fresh head copied forward from it. `‹ ›` walks the sealed
ones read-only, banded so you can see you are back in time — the same "now" language
`HistoryPanel` already uses. Restoring is *"restore as a new pass"*: copy forward, never
overwrite.

This is the load-bearing decision. Editable history means branching, branching means merge
UI, and the student is here to read a book. Linear and append-only also satisfies red line
#5 — nothing a student made is destroyed by moving through time — and matches the loom's
existing append-only ethos.

**Cutting is explicit and named by the student.** Auto-versioning on every drag would be
the tool deciding what counts as a reading of the text. And the tool must never *suggest*
a pass name from the read: that is inference on a student's own words, outside both
ratified §4/#6 exceptions and squarely against red lines #1 and #2.

### B.3 Where tiers live — settled: not on the concept

Today `tier` is on the concept, deliberately: §6 calls it *"placement's meaning, extracted
into the graph"*, with the residual x/y left in `views`. That has to change, and the
reason is not merely that passes need snapshots.

**A tier is a rank relative to the concepts it sits among.** Primary means "this reading
hangs on it" — among *this reading's* concepts. A concept shared by two readings will
carry a different rank in each, and both are right: "boundary objects" can be the spine
of Star and a supporting detail in Wenger. That is not a conflict to reconcile; it is two
correct judgments about two different sets, and a single `concept.tier` cannot hold them.
Reading-first does not create this — it makes it visible, because now both maps exist.

**So the meaning moves onto the pass, and the geometry stays in `views`** — splitting
exactly along the line §6 already draws.

- **Pass (artifact, part of `graph`)** — `{ name, read, tiers: { conceptId: Tier } }`. The
  name is student prose; the tiers are student judgment. Both belong to the artifact.
- **Geometry (projection, in `views`)** — one row per pass, key `pass:<id>`, holding
  today's `{ positions, bends, order }` shape. No migration: `views` is key-based
  (`schema.ts:344`) and §6 explicitly sanctions adding a key.

Inclusion needs no new field — `x` ("left off the map") already says it and `''` says
"unsorted", so the existing `Tier` vocabulary covers "hierarchy and inclusion may change
per version" as-is.

`concept.tier` survives as **a mirror of the whole-weave head pass**, so the §6 export
keeps its shape and every import of an existing file still round-trips. But say plainly
in the spec PR that its *meaning narrows*: it stops being "this concept's tier" and
becomes "this concept's tier on your course-wide map", one rank among many. The export
gains one additive array — `graph.mapPasses[]`, in exactly the way `byte.anchor` was
added in the 29 July rev — and that array, not the mirror, is where a consumer looks for
what a concept was in a given reading.

Three places read `concept.tier` today and all of them must take the active pass's tiers
instead:

- `MapTab` — sort chips, band placement, the counted mirror.
- **`buildMapKit`** (`src/lib/mapKit.ts:27-31`) — groups the hand-off by tier. Miss this
  and the map kit for every reading prints the course-wide hierarchy, which is precisely
  the artifact the chalk talk is drawn from.
- `graphExport` / `KeepTab` — writing the mirror on export, remapping `mapPasses` on
  import.

One more, quieter: `concept.retier` events (`actions/loom.ts:222`) record a tier with no
scope, and `HistoryPanel.foldEvents` applies them globally. Nothing currently draws tier
in the replay — the cloth is the arc map, which does not use it — so this is not a
rendering bug today, but the payload should carry `scopeKey` from the same PR, or the
record of *which map you were sorting* is lost for good.

### B.4 Data model

```sql
-- drizzle/0011_reading_scope_and_passes.sql

ALTER TABLE "read" ADD COLUMN "scopeKey" text NOT NULL DEFAULT '';
-- replace unique(userId, courseId) with unique(userId, courseId, scopeKey) NULLS NOT DISTINCT

CREATE TABLE "map_pass" (
  "id"        text PRIMARY KEY,
  "courseId"  text REFERENCES "course"("id") ON DELETE SET NULL,
  "userId"    text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "scopeKey"  text NOT NULL DEFAULT '',      -- '' = the whole weave; else sorted sourceIds
  "seq"       integer NOT NULL,              -- 1..n; highest = the working head
  "sealed"    boolean NOT NULL DEFAULT false,
  "name"      text NOT NULL DEFAULT '',      -- the student's sentence
  "read"      text NOT NULL DEFAULT '',      -- the read as it stood when cut
  "tiers"     jsonb NOT NULL,                -- { conceptId: '' | 'p' | 's' | 't' | 'x' }
  "createdAt" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("userId", "courseId", "scopeKey", "seq")   -- NULLS NOT DISTINCT
);
```

Geometry rides in existing `views` rows under `pass:<id>` — no DDL. Widen
`saveView(key: "cardTable", …)` (`actions/loom.ts:454`) and `LoomViews`
(`lib/types.ts:153`) to a key union.

Gotchas worth writing down now:

- **Import must remint ids inside `tiers`**, the way `importGraph` already remaps
  `positions` and `bends` (`actions/loom.ts:621-634`). A pass whose tier keys point at
  pre-import ids is a silently empty map.
- **Reset clears passes** — they name concepts that no longer exist — but the
  `graph_event` record of having cut them survives, same rule as everything else. Say so
  in the reset confirm copy: *"your named passes go with it."*
- **`tiers` holds only concepts the student has touched.** A concept added after a pass
  was sealed is simply absent from it — render as unsorted, never backfill.
- **A fresh reading opens with an unsorted map, and that is correct** — you have not
  ranked this reading yet. Do not offer to seed it from the whole-weave map or from
  another reading: those ranks were judged against a different set of concepts, which is
  the exact error §B.3 exists to prevent. `make all primary` is already the bulk starting
  gesture, and the empty table already says what to do (`MapTab.tsx:502`). Copy-forward
  belongs *between passes within one scope*, where the set is the same — and there it is
  already how the head works.

### B.5 The `‹ ›` bar

Sits where the current `.mapbar` is, spanning both the map and Your read, since a pass
carries both:

```
‹  pass 3 of 5 · "the boundary object does the coordinating"  ›   [cut a pass]
```

At the head: everything editable, `›` disabled. Behind the head: map and read read-only,
a band saying which pass and when, and two ways out — *restore as a new pass* and *back
to now*. Sealed passes are immutable including their name; renaming one would be editing
an interpretation you already left.

### B.6 The cards: definition on hover, byte as a quote

Today `showDefs` is one global checkbox (`MapTab.tsx:48`, `:466`) that also drives
`cardW`/`cardH` (`:86-90`) — so flipping it resizes every card on a table whose positions
were arranged at the other size.

**Render the menu as an HTML layer over `#tableWrap`, not inside the SVG.** The wrapper
div already exists, positions come straight from `effPos`, quotes need real text wrapping
(SVG has none — hence the hand-rolled `wrapLabel`), and `.bytequote` in `globals.css:138`
is already the right style. `<foreignObject>` is the alternative and is worse to size.
A bonus falls out: cards stop resizing, so stored positions stop shifting.

Contents, per card:

- **definition** — the working definition.
- **byte** — the passage as a quote with `source · location`, using `.bytequote`. Several
  bytes per concept is normal; list them, and **inside a reading show that reading's bytes
  first**, others behind "from your other readings" — which is also the cheapest place to
  make A.4's seam visible. Long passages truncate with a path back to `01 Open`, reusing
  the existing `goto` affordance.
- **where else this sits** — for a shared concept, its rank on your other maps:
  *"primary here · tertiary on your whole weave."* Counted, never advised. This is where
  §B.3's point becomes something a student can see: the same idea carries different weight
  depending on what it is sitting among. Keep it in the menu, not on the card face.

Three interaction constraints, all of which will bite if ignored:

1. **Hover alone is not enough** — hover *or* focus *or* tap opens it; Esc closes. Cards
   need `tabIndex` and `role="button"` regardless.
2. **The card is a drag handle.** A menu opening on hover of the whole card fights every
   drag. Put the trigger on a small corner affordance. The HTML overlay sits outside the
   SVG, so its pointer events never reach `onPointerDown`'s `[data-card]` lookup — that
   part is free.
3. **Keep an inline mode.** The popover is transient and the chalk talk needs definitions
   *visible* on the table. Per-card "pin definition" renders inline as today and persists
   in the pass's view geometry (`showDef: string[]`) — a student gesture, red line #7
   clean. The global checkbox goes away; the map kit already carries definitions to paper,
   so the hand-off is unaffected.

---

## 3 · Red-line review

| Red line | Reading |
| --- | --- |
| #1, #2 no AI inference / naming | Untouched. Pass names are typed by the student; the tool must not offer to distil one from the read. |
| #4 concepts trace to a byte | Strengthened — scope membership is *built* from byte provenance, and evidence-less concepts stay visible in every scope. |
| #5 work never inaccessible | Passes are append-only; export stays whole and lives on the shelf, not inside a reading; restoring copies forward. |
| #7 render and count, never decide | Scope membership is derived per render and discarded; only student gestures write the scope, tiers, geometry and pass names. Shelf counts, bridge counts and reuse notices are counts. |
| #8 social displays wait | Untouched — all of this is single-student. |
| §6 graph vs. views | Held: meaning (tiers, names, read) → artifact; geometry (positions, bends, order) → `views`, one key per pass. |

Spec edits this implies: §3 gains the reading as the entry point and "cut a pass" under
Map; §6 gains `scopeKey`, `mapPasses[]`, and the `pass:<id>` view key; §2's
concept-identity paragraph gains a sentence saying a reading is a door into one graph and
never re-homes a concept.

---

## 4 · Phasing

1. **Shelf + routes + scope.** Home becomes the shelf (by week, with counts);
   `/reading/[sourceId]` mounts a scoped workbench keyed by `scopeKey`; provider gains
   `scope`. Ships `01–03` scoped; `04 Map` and `05 Keep` stay at whole-weave level. No
   migration.
2. **Stamp capture with the active reading**; off-shelf cards and the "which reading?"
   backfill chip; give the worked example a card. Small migration if `storageKey` goes
   nullable.
3. **Bridges** — the "from your other readings" band in Throw, the bridge count, the
   reuse notice at A.4. No migration.
4. **Card menus** — definition + byte popover, per-card pin, global checkbox retired.
   Independent of everything above; ship it whenever.
5. **Passes** — `0011`, the `‹ ›` bar, tiers onto the pass, `concept.tier` as mirror.
   This is the migration and the spec PR.
6. **`04 Map` moves into the reading workbench**, now honest because tiers are per-scope.
7. **Multi-reading scopes** — the shelf allows selecting several. If everything is keyed
   by `scopeKey` from step 1, this is UI only.

Steps 1–4 are additive and reversible. Step 5 is the one that needs JC and the red-line
review before it is written, and step 6 cannot precede it (§A.8).

---

## 5 · Decisions still open

1. **Does 01 Open become the PDF itself?** Reading-first argues the reading should be
   *open* beside the coding log rather than a tab away — capture in `PdfViewer` already
   works, so this is layout, not mechanism. Bigger build; the cheap intermediate is a
   one-click "open the PDF" from within the workbench.
2. **The student-facing word for a pass** — pass / draft / version (§B.1). JC's, per the
   deployment notes.
3. **Does "your read" version with the map, or run alongside it?** This assumes it versions
   with the map, because you asked for `‹ ›` beside both. The consequence is that stepping
   back makes the read read-only — a real cost worth confirming.

## 6 · Settled, recorded so they are not reopened

- **The reading is the entry point, not a filter** (§1 preamble).
- **There is no uncoded byte** (§A.3). The chain in the ask — bytes → concepts → map — is
  the order of the *objects*, not a gap in time where unnamed marks accumulate.
- **A tier is per-map, not per-concept** (§B.3). A concept shared by two readings holds a
  different rank in each, because rank is relative to the set it sits among, and both are
  correct.
