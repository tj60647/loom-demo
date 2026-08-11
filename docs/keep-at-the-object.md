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

1. **The worked example's exit**, once reset is gone (§5.1).
2. **Concept/thread entries in a per-Reading Log** — evidence-derived or
   strictly stamped (§4).
3. **Does the Capture Log download?** (§4)
4. **Vocabulary at the library level** — dual surface or route-only (§7).
