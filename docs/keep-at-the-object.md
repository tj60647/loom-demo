# Keep at the object

**Status: ruled 2026-08-10 by TJ, NOT built.** Nothing described here exists
yet except where marked *already built*. The build order in §6 is the safety
rule: **Keep cannot hide until its replacements exist**, or a student's work
is stranded — the precise thing red line 5 forbids.

---

## 1. What TJ ruled

> "i think that keep will be hidden. we want to move to a download at the
> object, so the downloading of the knowledge graph, the downloading of
> particular projections, the downloading of threads, happens where they are
> made, not in a separate tab."

> "we are keeping the capture log, i think this goes in the knowledge graph.
> and is specific to that reading, not all readings."

> "import goes away" · "clear the table goes away" · "take it all out goes
> away" · "keep a projection happens at projections"

> "we can interpret whole artifact export as being by object, not necessarily
> all the objects in one click."

> "include sourceid in new events" — **done**, commit `f78fdf0`.

Still open: whether Vocabulary gets a home outside a Reading (see §7), and
how concept/thread entries appear in a per-Reading Capture Log (§4).

## 2. This restores the model rather than deviating from it

The reassuring finding, and the reason this is smaller than it sounds:

- **The model already sites export at the objects.**
  [loom-model-build.md:139](loom-model-build.md): *"**Export** — both levels: a
  Cloth (the full data — always the whole artifact, never a slice) and a
  Projection."* Note the parenthesis: the model's own phrasing of
  whole-artifact-ness is **per object**, which is exactly TJ's red-line-5
  interpretation — already written, eighteen months of rulings ago.
- Tab 3 Linking says *"export the Cloth"* (:161); tab 5 Knowledge Graph says
  *"export a Projection"* (:163). Both are the model's words.
- **Keep appears once in the whole model doc.** It is not a ruled station.
- The fork was written down and is being re-taken:
  [loom-refactor-spec.md:39](loom-refactor-spec.md) — *"**Keep** (export/import/reset)
  ha[s] no ruled tab … Keep's exports fold into Linking (Cloth) and Knowledge
  Graph (Projection) per rulings 5/32 — **or** keep Keep as a deliberate
  deviation and ratify it (see D4)."* D4 took the second branch on 2026-08-08.
  This ruling takes the first. **A recorded fork, re-decided — not a new idea.**

## 3. The state of play

| Object | Downloads at its object today? |
|---|---|
| A Projection | **Yes — already built.** `MapTab.tsx:679-690` ("keep .json" / "keep .md"), handlers `:526-544`. `buildMapExport` ([graphExport.ts:580](../src/lib/graphExport.ts)) and its file **stands alone**: every member concept's passages travel whole, unlabeled ones too |
| A Cloth (one Reading) | **No builder exists** — the nearest needs a Projection to exist first |
| Threads | **No** — only inside aggregates |
| Vocabulary | **No** — `VocabularyTab` has no export code at all |
| The Capture Log | **No, and never has** — in none of the four builders |

Keep's per-Projection list is a **cross-scope index**, not a separate
capability: the only thing lost by deleting it is reaching another Reading's
Projection without navigating there.

## 4. The Capture Log — to 03, scoped to the Reading

It rendered at `MapTab.tsx:920-924` behind `wholeWeave &&` — unreachable since
`/weave` was hidden — which is why it was parked on Keep. TJ's ruling puts it
back on the Knowledge Graph with the scope **inverted**: this Reading, not the
whole weave. That is what makes it reachable.

**What resolves to a Reading, and what does not:**

- **Passages** — now stamped. `sourceId` rides in the payload of
  `passage.capture` / `.refile` / `.unfile` / `.delete` (commit `f78fdf0`), so
  an event still names its Reading after the row is deleted. Events written
  **before** that commit carry none and can only be resolved through the live
  row.
- **Cloth and Projections** — carry `scopeKey`, which *is* the sourceId for a
  single-Reading scope. Resolve cleanly.
- **Concepts and threads** — **no Reading exists to record.** By the model a
  Concept does not belong to a Reading (a Passage does), and nothing
  server-side knows which Reading was open when one was named.

**Open, TJ's call:** how concept/thread entries appear in a per-Reading log —
*evidence-derived* (a concept event shows in Reading R when that concept has a
passage in R; a thread when both ends do — the same rule contextual search now
uses, derivable with no migration, but entries can appear later when evidence
arrives) or *strictly stamped* (only what carries a Reading shows, so naming a
concept appears in no Reading's log at all).

**Also open:** whether the Log itself downloads. Under "every object exports
whole" it is arguably an object, and it is the one thing that has never been in
any file.

## 5. What gets deleted, and what breaks

**Deleted:** `KeepTab.tsx`, the `/keep` route, whole-cloth export
(`buildExport` / `buildMarkdown` — unless kept for a Cloth-level download,
§6), all import (`parseAnyImport`, `importGraph`, `importMapArrangement`,
`importFromText`, `importMapFile`), and reset (`resetAll`, `resetGraph`).

**Breaks, each needing a decision or a rewrite:**

1. **The worked example can no longer be cleared.** Reset is its only exit, and
   `Shelf.tsx:305` instructs *"Explore it, then clear it from Keep to start
   your own."* Deleting reset strands the example in the loom of anyone who
   loads it. **This one needs an answer before Keep hides.**
2. **`scripts/check-import-compat.ts`** (9 assertions) exists solely to protect
   old exports on import. With import gone its purpose goes; drop it from the
   `check` chain rather than leave a guard over nothing.
3. **HistoryPanel must keep its cases for `graph.import`, `graph.reset` and
   `map.import`.** Nothing will emit them, but students who already imported or
   reset have those events, and the Log is append-only. `check-vocabulary`
   asserts emitted kinds have cases — removing emitters is safe; removing cases
   is not.
4. **`src/lib/workflows.ts`** — the student flow ends at a `keep` node. AGENTS.md's
   rule fires: update the flow in the same commit.
5. **`KeepPage.tsx:51`** renders `{stationNumber("keep")} — KEEP`, and
   `stationNumber` returns `""` for a hidden station — a footer reading `" — KEEP"`.
   Moot if the route is deleted rather than hidden.
6. **Specs**: `journey-learner`'s "06 · keep" section and anything driving
   export/import/reset.
7. **Numbering: nothing moves.** Keep is last, and station numbers derive from
   `VISIBLE_STATIONS` (`JourneyNav.tsx:51-54`). The bar becomes exactly the
   model's five: 00–04.

## 6. Build order (the safety rule)

1. **Cloth download at 01 · Reading** — a per-Reading builder: its passages,
   the concepts they evidence, the threads between those, plus Cloth Title and
   Description. Closes the gap where a Reading with captures but no Projection
   has no file at all. *This is the one that makes hiding Keep safe.*
2. **Thread download at 02 · Linking** — TJ named it; needs a builder.
3. **Vocabulary download at 04** — concepts + link labels; needs a builder.
4. **Provenance header on every object export** — student · course · section ·
   when · what object · schema version. Today the header is one field,
   `student` (`graphExport.ts:29`). Section is *not* stamped on events by
   design (it is a fact about a membership, not about an act); it is looked up
   once at export time. Note the builders are pure client-side functions today
   and the section is not available where they run — this needs a read.
5. **Capture Log to 03**, reading-scoped, per §4.
6. **Then, and only then:** hide Keep and delete what §5 lists.

## 7. Vocabulary at the library level (still open)

Its own question, entangled with this one: with Keep gone there is **no
library-level surface for student work at all**, and Vocabulary is the only
genuinely unscoped object a student owns — the model calls it *"the User's
holdings"* across all Readings (:162), and `contracts.md` already concedes it
*"is UNSCOPED in the model and is the one that would be legitimate outside a
text — greyed anyway, because /weave is its only surface."*

The fork: **dual surface** (a tab inside a Reading, so the PDF stays mounted;
a `/vocabulary` route outside it, reusing `VocabularyTab` in the `MetaPage`
frame that `/workflows` and `/access` already use) versus **route-only**
(simpler, but clicking 04 mid-reading unmounts the workbench and the PDF
reloads on return). Recommendation: dual surface — the holdings render
identically either way, which `contracts.md` already states.

## 8. TJ's remaining calls

1. ~~**The worked example's exit**, once reset is gone (§5.1).~~ **Answered
   2026-08-10** — the practice loom (`/sandbox`) replaced it. The example is
   deleted rather than given an exit; see §9.5.
2. ~~**Concept/thread entries in a per-Reading Log**~~ — **ruled
   evidence-derived** (TJ, 2026-08-10); built in `src/lib/logScope.ts`.
3. ~~**Does the Capture Log download?**~~ — **yes** (TJ, 2026-08-10); built.
4. **Vocabulary at the library level** — dual surface or route-only (§7).
5. **The student-facing whole weave** — new, and §9 is the assessment TJ
   asked for on 2026-08-11: *"at this moment there should be no student
   facing whole weave projection. at most it appears in the faculty."*

---

## 9. The Capture Log, act by act (2026-08-11)

TJ, on being asked where the acts that belong to no reading should live:
*"i am concerned this question suggests some changes have been overlooked. i
propose we break this down and assess by act."* This is that breakdown. Every
row was traced to its emitter and stepped through the placement rule; three
independent verifiers then went back over the table and corrected seven claims
in it, including the one the question rested on (§9.4).

### 9.1 How an act is placed

`eventBelongsToReading` ([logScope.ts](../src/lib/logScope.ts)) asks five
questions in order, and the first that answers wins:

1. **The act said so** — `payload.sourceId`. Present-and-null counts: it means
   "no reading", which is not the same as not knowing.
2. **Its scope said so** — `payload.scopeKey` must equal the reading.
3. **It happened to the whole loom** — `graph.import`, `graph.reset`,
   `graph.example`, and only those three.
4. **The evidence says so** — a concept where it has a passage, a thread where
   both ends do, a passage from its live row.
5. Otherwise, no reading.

### 9.2 The acts

| # | The act, and where a student does it | Event | Placed by | Shows in a reading's log? |
|---|---|---|---|---|
| 1 | Capture a passage — **01** | `passage.capture` | 1 | Yes. An **untethered** capture stamps null → nowhere |
| 2 | File / refile a passage — **01** | `passage.refile` | 1 | Yes — but the stamp is copied from the row, so an untethered passage → nowhere |
| 3 | Unfile a passage — **01** | `passage.unfile` | 1 | Same as 2 |
| 4 | Delete a passage — **01** | `passage.delete` | 1 | Same as 2 |
| 5 | Place an untethered passage — **00 Library** | `passage.attribute` | 1 | Yes, always: the act names the reading it is claiming |
| 6 | Name a concept — **01**, and **03** (naming an unlabeled passage) | `concept.create` | 1 | Yes inside a reading. Named at the whole weave → null → nowhere |
| 7 | Sharpen a description / rename a concept — **01** and **04** | `concept.update` · `concept.rename` | 4 | Only in readings where that concept has a passage. **A concept named ahead of its evidence → nowhere** |
| 8 | Merge two concepts — **04** | `concept.merge` | 4 | Only where the *target* has a passage |
| 9 | Delete a concept — **01** and **04** | `concept.delete` | 4 | **Never.** The rule asks where the concept has passages; the row and its pointers are already gone |
| 10 | Throw a thread — **02** | `edge.throw` | 1 | Yes. Thrown at the whole weave → nowhere |
| 11 | Coin or edit a thread's label — **02** (typed, or by tapping a chip) | `edge.coin` | 4 | Only where **both** ends have a passage — so **never for a cross-reading bridge**. And it reads the *live* thread, so removing the thread later drops it from every log |
| 12 | Reword a thread's sentence — **02** and **04** | `edge.update` | 4 | Same as 11 |
| 13 | Remove a thread — **02** | `edge.delete` | 4 | Same rule, but the event carries both ends itself, so it survives the deletion |
| 14 | Coin a Link Label from the Vocabulary field — **04** | `link.coin` | 5 | **Never.** `entityType: "link"` matches no branch |
| 15 | Give a Link its description — **04** | `link.update` | 5 | **Never**, same reason |
| 16 | Title or describe the cloth — **01** / **02** | `cloth.update` | 2 | Yes for a reading's cloth. The whole-weave cloth is `scopeKey: ""` → nowhere |
| 17–21 | Make, rename, tier, write, or delete a projection — **03** | `map.create` · `.rename` · `.retier` · `.update` · `.delete` | 2 | Yes for a reading's projection. **A whole-weave projection → nowhere** |
| 22 | Arrange the cards, bend a thread — **03** | *(no event)* | — | By design: geometry is not part of the graph's development |
| 23 | Import a whole cloth · reset · load the worked example — **05 Keep**, and the example from **00 Library** | `graph.import` · `graph.reset` · `graph.example` | 3 | Every reading |
| 24 | Import a projection — **05 Keep** | `map.import` | **2**, not 3 | The reading its scope resolves to — and **nowhere** when it resolves to the whole weave, which is the fallback when the file's readings are not on this deployment |

**Two acts write nothing at all.** Typing a new label on a thread mints the
Link through `resolveLink` with no event — only `edge.coin` is recorded, so the
Link's coining is nowhere in the log. And reaching for a word you already own
returns it before `recordEvent`. `link.coin` therefore fires only for a
standalone coinage at 04, which makes row 14 rarer than it looks and the gap
larger: the vocabulary can grow with no record of growing.

**Most of a real log is synthesized.** `getGraphEvents` manufactures a create
event for any concept, passage, thread or projection with no recorded one —
including every row the seed writes. Synthesized concept and thread events
carry **no** `sourceId`, so they place by evidence (rule 4), not by stamp. Row
6 is rule 1 only for acts recorded since 2026-08-10.

### 9.3 What lands nowhere

- every `link.coin` and `link.update` — always
- every `concept.delete` — always
- rows 7, 8, 11, 12, 13 whenever the work has no evidence in one reading —
  which is exactly **the cross-reading bridge**, the payoff the course notes
  name for the back half of term
- rows 16–21, and 24, whenever the object is whole-weave
- rows 1–4, 6, 10 whenever the stamp is null — an untethered passage, or
  anything done at the whole weave

Measured on the seeded account (8 concepts, 10 passages, 6 threads, 6 links, 3
projections): 27 entries, 3 of which place nowhere — the evidence-less concept,
the one cross-reading thread, and the whole-weave projection. Across a term the
share is of the order of 10–20%, but it is not a random tenth: it is the Link
vocabulary 5.1 just made an object, the cross-week bridges, the concepts named
ahead of their evidence, and the whole-weave capstone.

### 9.4 The claim that was wrong

I asked TJ where the residue should live "once Keep is gone", on the premise
that KeepTab holds the only unscoped view of the record. **That premise is
false.** `MapTab` mounts the Capture Log with `sourceId={wholeWeave ?
undefined : …}` — so at `/weave` the Knowledge Graph already shows the whole
record, residue included, and its download already carries it. Deleting Keep
does not hide the residue. **The whole weave is what shows it, and the whole
weave is the thing TJ says should not be student-facing.**

### 9.5 The student-facing whole weave, today

TJ: *"at this moment there should be no student facing whole weave projection.
at most it appears in the faculty."* That is **not true of the build**, on four
counts:

1. **`/weave` has no gate** — no role check, no redirect, no middleware
   anywhere in the repo. The only check is "is anyone signed in". A learner who
   arrives gets Linking, Knowledge Graph and Vocabulary at `scopeKey: ""`,
   where they can title the whole-weave cloth, thread across every reading, and
   **make, tier, name and keep a whole-weave projection**.
2. **Four doors open it, all in the Library's search results** —
   [ShelfSearch.tsx:214](../src/components/shelf/ShelfSearch.tsx#L214) (a
   concept), [:228](../src/components/shelf/ShelfSearch.tsx#L228) (a link
   label — **added 2026-08-11 with 5.1c**),
   [:244](../src/components/shelf/ShelfSearch.tsx#L244) (a thread),
   [:261](../src/components/shelf/ShelfSearch.tsx#L261) (an untethered
   passage). The journey bar is *not* a door: those stations render greyed and
   inert outside a reading.
3. **Keep lists and exports whole-weave projections**, and **both import paths
   mint them** — an imported projection whose readings are not on this
   deployment falls back to the whole weave *by design*, to satisfy red line 5.
4. **The seed ships one** — Test User A's "The whole cloth".

Three docs say otherwise and are stale: [open-work.md](open-work.md) and
[contracts.md](contracts.md) both say "nothing links to `/weave`" and count
**three** ShelfSearch links (there are four), and the generated student flow in
[workflows.ts](../src/lib/workflows.ts) dropped its weave node on that same
reasoning.

### 9.6 What this means for Step 4

Deleting Keep is safe for the *record* — `/weave` still shows and downloads it.
It is not safe for the *strandings* [open-work](open-work.md) Phase 2 lists,
because the home that note proposes for them is Keep itself. And closing the
whole weave to students — which is what TJ's sentence asks for — would remove
the only unscoped view of the record at the same stroke, so the two must be
decided together, not in sequence.
