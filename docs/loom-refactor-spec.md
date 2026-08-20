# Loom: Conceptual Model v5.1 → loom-demo Refactor Spec

Target repo: github.com/tj60647/loom-demo @ master. Verdict up front: **the repo is genuinely close** — the Course/Section/invite layer, the extraction-score gate, forward-only archival, per-map tiers, and the append-only event log are already built and already match rulings. The refactor is targeted: **one structural schema change, a handful of semantic corrections, and a naming sweep.** The repo's own spec (`docs/loom-spec-v1.md`, rev July 30c) predates the Aug 3–7 thread and argues several positions the thread overruled — Section B lists those; that document should be superseded, not patched.

---

## Status — executed, and where the build went past it (stamped 2026-08-19)

This work order was **executed in full**. It is kept as written below — a reviewer
reads the August branches against it — but read it as history, not as a queue.
What became of each phase, checked against the code (dev @ `9ee4859`); §F is the
one section corrected **in place**, because it is the permanent bridge:

- **P0 — landed as migration 0021**, one release, the shape of C.1–C.6 with two
  deviations: `edge.sentence` stayed `NOT NULL DEFAULT ''` rather than nullable
  (render code never branches), and the `cloth` table is keyed by `scopeKey`
  rather than `sourceId`, absorbing the `read` table (dropped) rather than
  retaining it. `concept.tier` is gone (C.5); `passage.capture` events fire for
  unlabeled captures (C.6).
- **P1 — landed.** Unified search is migration 0022 (`concept_search_idx`,
  `edge_search_idx`) + `searchLoom`, grouped by kind (C.8) — though C.8's
  "persistent field" became a **contextual** search docked in the journey bar
  (TJ, 2026-08-10: loom-wide at the Library, this-reading inside one); the
  homonym warning
  is client-side at coin-time and the server never forbids (C.7); **merge** was
  built (`mergeConcepts`, logged `concept.merge`) and then its control **hidden
  2026-08-12** pending TJ's ruling on what merge means (open-work.md 5.1f). The
  unlabeled-passages group in the graph view (C.9) was built and then **removed
  2026-08-12** — TJ: "there should not be an unlabeled passages section in the
  knowledge graph"; Unlabeled Passages live in 01's Your work.
- **P2 — landed, and went further than asked.** Every student-read string
  speaks the ruled vocabulary; tongues are removed from `src/` entirely, not
  flagged off; and the **database itself renamed byte → passage** (migration
  0023: table, join, columns, indexes, already-written event kinds) — beyond
  this spec's "optional". `map`, `edge` and `source` keep the July names per §F.
- **P3.12 — landed** (Faculty Section rows, FACULTY memberships, additive
  capability bundles). **P3.13 — landed, then superseded 2026-08-08**: the
  Create/Open Cloth buttons were ruled out — the reading card is the one door,
  the cloth row beneath it is metadata. **P3.14 — landed, then overruled
  2026-08-08**: Overlays are faculty/admin-only, with a section picker; students
  never meet them.
- **B7's open fork closed twice over.** Keep was ratified as a sixth tab
  (2026-08-08, D.4), then dissolved (ruled 2026-08-10, deleted 2026-08-11,
  keep-at-the-object.md): downloads happen at each object, import is gone, and
  reset returned 2026-08-13 to the header's My Loom plus a per-reading clear.
  The Weave was **removed from the app 2026-08-11** rather than deferred in
  place: no route, no station; `scopeKey ''` rows persist unrendered.
- **D.1, D.2, D.3, D.5 — adopted** into the model as recommended.
- **The model then moved past this spec** (Aug 9–19): Links became User-level
  objects with their own gloss (migration 0024; `edge.sentence` now means
  *Thread* Description), a Thread became one card, Projections were ratified as
  *having kinds* (list · board — not yet built), and the Capture Log moved to
  03 scoped to the Reading. `docs/loom-model-build.md` carries all of it and
  stays the authority; Section A's concordance below describes the July repo
  and is left as written.

---

## A. Concordance — model object → repo

| Model (v5.1) | Repo | Status |
|---|---|---|
| **Reading** | `sources` + `sourcePages` + `courseSources` + `sourceScores` | ✔ **Strong.** Extraction gate (heuristic + LLM judge) exceeds the model. `isArchived` = ruling 30 (forward-only removal), already correct. `courseSources.week` = Assigned Date scheduling. Gap: `isCore` boolean + new `category` column vs. model's four types (Assigned History / Assigned Theory / Supplemental / Student-Contributed) — map types onto `category`. `isOwn` = Student-Contributed ✔. |
| **Course / Section / Cohort** | `courses` (term "Fall 2026" ✔), `sections`, `courseMemberships` (soft `removedAt` ✔), `courseAllowedEmails` (invites + section pre-assignment ✔) | ✔ **Strong.** Gaps: no Faculty Section (ruling 18); `membership.role` unused ("LEARNER" only) — Faculty/Admin per-course roles pending, as the schema comment itself notes. |
| **Concept** | `concepts` — userId ✔ (user-level!), `label`, `def`, `note` | ◐ Close. Two issues: (1) `tier` column on the concept — already marked in-schema as a dual-written *mirror* of the oldest map, with the drop migration planned: **finish it** (ruling: tiers are per-Projection only). (2) Identity is label-dedupe — see B2. |
| **Passage** | `passages` — content, sourceId, page/offsets, contentHash anchoring | ✗ **The one structural gap.** `conceptId NOT NULL` forbids Unlabeled Passages and forces one-concept-per-passage. Also missing: notes/questions, Pull-quote flag, Passage Tier. See P0. |
| **Link** | `edges` — fromId/toId ✔, `handle` (=Link Label), `sentence` (=Link Description) | ◐ Close. `sentence NOT NULL` contradicts the golden path ("connect Concepts without or before adding Descriptions"). Make nullable/defaulted. |
| **Thread** | implicit (edge + two concepts) | ✔ matches ruling 27 exactly — the two Concepts are structural, no tag. |
| **Cloth** | — none. Approximated by `maps.scopeKey` (per-reading scoping ✔, per rev 30c's reading-first restructure) + `reads` (one whole-weave paragraph per course) | ✗ Missing as object: no per-Reading **Cloth Title / Description**. See P0.4. |
| **Projection** | `maps` — `name` (= Projection Title), `essence` (= Projection **One-line** — rename the vague term), `read` (= Projection Description ¶), **`tiers` jsonb per map** ✔, parallel siblings ratified 2026-07-31 | ✔ **Already implements rulings 4 + C1–C3** — the repo ratified per-map tiers a week before the email thread did. Only the *name* is wrong (see B7). Tier values `p/s/t` = 1/2/3; `''` = unranked ✔; `x` ("left off") is a repo-ahead fourth state — see D2. |
| **Capture Log** | `graphEvents` — append-only, kinds per act, payload replay, survives reset | ✔ **Strong foundation.** Gaps: can't record unlabeled captures until the bytes fix; UI name (HistoryPanel → Capture Log); surface in Reading + Linking tabs (ruling 29). |
| **Concept List / Link List** | derived from `concepts` / `edges.handle` (`recurringHandles`) | ◐ Derivable ✔ (correct — lists are views of objects). Missing: **merge** affordance (ruling 36), recurrence designation display, homonym warning. |
| **Search** | readings FTS (shelf-wide + in-document), weighted, `0014_reading_search` | ◐ Scopes 1–2 done well. Scopes 3–4 (my Lists · everything) missing: no FTS over concepts/edges; no persistent field (ruling 34). |
| **Tabs** | Stations: 00 Readings · 01 Open · 02 Throw · 03 Read · 04 **Map** · 05 Weave · 06 Keep | ✗ Naming + structure diverge. See B7/P2. |
| **Roles / views** | `users.role`; `/admin/*` (library, courses, user/[id] read-only student view ✔, **aggregate** ✔ = Overlays in faculty view, ruling 28!) | ◐ Faculty read-only student view and cohort aggregate already exist. Gaps: role-typed capability bundles (ruling 17), Faculty Section. |
| **Reading card** | Shelf cards: syllabus by week ✔, per-reading counts (passages/concepts/threads) | ◐ Counts ≈ badge; verify Create Cloth / Open Cloth buttons + count-with-hover (rulings 20–22). |
| **Tongue** | present (`ThrowTab` register menus, Header copy) | ✗ Deprecated for v1 (Hugh, Aug 3). Remove or feature-flag off. |

---

## B. Repo-spec positions overruled by the Aug 3–7 thread

These are argued *with conviction* in `docs/loom-spec-v1.md` — flag them explicitly so the reversal is a decision on record, not a silent diff.

1. **"A byte does not exist until it is named... There is no holding pen of unnamed marks — an uncoded highlight is a note, and Loom is not a note tool."** → **Overruled.** JC (Aug 7): the Log holds every capture *including passages we haven't named yet*; rulings 38: **Unlabeled Passages** are first-class — in the Log, in the Reading, *and in Projections* as an unattached group. This is the single biggest philosophical reversal between repo and model.
2. **"Identity: deduplicated by label, case-insensitive — one label is one concept."** → **Overruled by ruling 36.** Identity is by *object*, established at capture time via reuse; distinct Concepts may share a Label (homonyms — warn, don't forbid); a **merge** action handles discovered duplicates. Label-string dedupe collapses homonyms and orphans a `def`.
3. **Byte → one concept** ("re-file the same passage under a second concept"). → Model: many-to-many with bidirectional pointers (ruling 37). The repo spec itself marks many-to-many as the production intent — aligned, just unbuilt.
4. **`concept.tier`** → per-Projection only. The repo already agrees (maps.tiers, dual-write mirror, planned drop). Execute the planned contract migration.
5. **Tongues** → not in v1 (Hugh, Aug 3 change log).
6. **`edges.sentence` required** → Links creatable before Description (golden path); Description-then-Label remains the *encouraged* order, not a constraint.
7. **Station names, incl. "04 — Map"** → the five ruled tabs: **Library · Reading · Linking · Vocabulary · Knowledge Graph**; nothing in the UI is called "Map" (rulings 2, 13, 32). Mapping: Readings→Library · Open→Reading · Throw→Linking · Read→Vocabulary (its recurring-vocabulary content fits; the "your read" paragraph is Cloth/Projection Description, relocating per P0.4) · Map→Knowledge Graph. **Weave** (whole-graph entry) and **Keep** (export/import/reset) have no ruled tab: Weave is the future Quilt space (defer with ruling 19); Keep's exports fold into Linking (Cloth) and Knowledge Graph (Projection) per rulings 5/32 — or keep Keep as a deliberate deviation and ratify it (see D4).

---

## C. Prioritized refactor

### P0 — Schema / contract (breaking; do first, together)

1. **`byte_concepts` join table** (passageId, conceptId, createdAt) replacing `bytes.conceptId`. Backfill from existing rows; drop the column. Delivers in one migration: Unlabeled Passages (zero rows), one-passage-many-concepts (n rows), and the bidirectional pointers of ruling 37. Cascade rule: deleting a Concept deletes join rows, never bytes (the Passage survives; symmetric with "the Concept survives its evidence").
2. **Extend `bytes`**: `note` text, `question` text, `isPullQuote` boolean, `tier` (`'' | p | s | t`) — Passage Tiers live on the Passage (ruling C2/23).
3. **`edges.sentence`** → `.default("")` nullable-equivalent.
4. **Cloth metadata**: new `cloths` table (userId, courseId, sourceId | scopeKey, **title**, **description**, createdAt) — the per-Reading workspace identity (C1: Title/Description stay Cloth-level; Projections carry their own Title/One-line/Description via `maps.name`/`essence`/`read` ✔ already — mapping per §F). Migrate the whole-weave `reads` row into it (or retain `reads` as the whole-weave Cloth's description). Optionally later: `maps.scopeKey` → `clothId`.
5. **Finish the planned mirror drop**: remove `concepts.tier` and the `reads` dual-write once P0.4 lands (the schema comments already schedule this).
6. **`graph_events`**: add `byte.capture` (fires for unlabeled captures too) so the Log is complete per JC Aug 7.

### P1 — Semantics

7. Capture-time reuse UX: existing-Concept autocomplete (verify present), **homonym warning** at coin-time, **merge** action (repoint byte_concepts + edges; log `concept.merge`).
8. **Unified search**: FTS over concepts (label/def) and edges (handle/sentence) = scope 3; combined grouped-by-kind query = scope 4; persistent field (ruling 34). Reuse the reading-search pattern verbatim.
9. **Unlabeled Passages in the graph view**: unattached cards in the card table (nameable/linkable there), separate from the unranked group (ruling 38 + 23's null-≠-lowest display rule — `''` vs `x` already models this, see D2).

### P2 — Naming sweep (UI copy; DB renames optional)

10. Tab labels per B7. Component/table renames (`bytes`→passages, `maps`→projections, `MapTab`, `ClothMap`) are cosmetic — do only where cheap; **UI-visible strings are mandatory** ("map" out; byte→Passage, handle→Link Label, sentence→Link Description, def→Concept Description, HistoryPanel→Capture Log).
11. Remove/flag-off Tongues UI (ThrowTab register menus, Header copy).

### P3 — Additions

12. Faculty Section row per course (ruling 18); wire `membership.role` FACULTY; role-gated capability bundles (ruling 17 — faculty may hold student capabilities).
13. Reading card: Create Cloth + Open Cloth buttons, count badge with hover titles / tap (rulings 20–22, 33).
14. Overlays in student view (Passages heatmap in Reading tab; Concepts/Links in Vocabulary — ruling 28); `/admin/aggregate` already covers the faculty side.

---

## D. Repo-ahead features — ratify back into the model (they're good)

1. **Reference-only Readings** — a source row with no PDF, so hand-typed passages still have a door. Solves a case the model never considered. *Recommend: adopt.*
2. **The `x` tier** ("deliberately left off the map") — a fourth state distinct from `''` unranked: *set aside* vs. *not yet judged*. The model's null-is-not-lowest rule implies exactly this distinction. *Recommend: adopt as "Set aside."*
3. **Red lines** (counted-never-judged; no model touches interpretation; derived layout never persisted; history survives reset) — governance the model lacks and should inherit wholesale.
4. **Keep tab** (export/import/reset with self-explanation) — the model folds export into two tabs; the repo's single keepable-artifacts place is arguably better UX. *Decide: fold per rulings, or ratify Keep as tab 6.*
5. **Staging** (`courseSources.isVisible`) and metadata-draft-with-instructor-approval — ahead of the model; keep.

## E. Suggested sequence

1. P0 migration set (one release; the byte_concepts backfill is the only data-shape change).
2. P1.7–9 semantics on the new shape.
3. P2 naming sweep (single PR; grep-driven).
4. P3 as capacity allows — none blocks the fall course except 12 (Faculty Section) if rosters go live.
5. Replace `docs/loom-spec-v1.md` with the conceptual model v5.1 + this delta as the build contract; move the July spec to `docs/archive/`.

## F. Terminology map — code ↔ model

**This table is corrected in place as the build moves** (last: 2026-08-19) — it is the permanent bridge where legacy names persist at the schema layer, and it is mirrored into AGENTS.md. The schema still speaks July for `map`, `edge` and `source`; `byte` was renamed through the database by migration 0023. **UI-visible strings must use the model column.**

| Code (tables / types / components) | Model | Notes |
|---|---|---|
| `passage` / `Passage` (was `bytes`; renamed by 0023) | **Passage** | A byte *was* a passage-requiring-a-concept; since P0.1 it is a Passage proper (Concepts optional, 0..n via `passage_concept`). |
| `passage.content`, offsets, `pageContentHash` | Passage characters + anchoring contract | unchanged semantics |
| `passage` with zero `passage_concept` rows | **Unlabeled Passage** | legal state; the July spec's "no holding pen" rule is overruled. Shown in the Reading and Your work — **not** in Projections (TJ, 2026-08-12) |
| `concepts` / `Concept` | **Concept** | already User-level ✔; `def` = Concept Description / Gloss; `note` = extra field, keep |
| `concepts.tier` | — (none) | mirror column, **dropped by 0021** — Tiers live on Projections |
| `edges` / `Edge` | **Thread** | the edge row IS the Thread since Links became objects (0024) |
| `edges.handle` | legacy copy of the **Link Label** | dual-written beside `edge.linkId`; the drop is parked (open-work.md 5.1d) |
| `edges.sentence` | **Thread Description** | P0.3 landed as `DEFAULT ''`, not nullable; since 0024 it is the *Thread's* sentence, never the Link's |
| `link` (new, 0024) / `edge.linkId` | **Link** | User-level object: Label + its own gloss; may precede its Threads |
| edge + its two concepts + its link | **Thread** read aloud | one card (`ThreadCard.tsx`, 2026-08-19); no longer backgrounded |
| `maps` / `Map` | **Projection** | "map" never appears in UI |
| `maps.name` | **Projection Title** | a short name — what a Projection is called in lists and pills |
| `maps.essence` | **Projection One-line** | the one-sentence take (subject + verb). "One-line" replaces the vague "essence" in all UI strings; column rename optional |
| `maps.read` | **Projection Description** | the paragraph |
| `maps.tiers` (`p/s/t/x/''`) | Concept Tiers (1 / 2 / 3 / **Set aside** / unranked-null) | already per-Projection ✔ |
| `views` | Projection display geometry | view state, never the artifact ✔ |
| ~~`reads`~~ | — | **dropped by 0021**; the whole-weave paragraph was absorbed into the whole-weave `cloth` row, itself unrendered since the weave's removal |
| `cloth` (0021) | **Cloth** | per-Reading workspace: Title + Description, keyed by `scopeKey` |
| `graph_event` / HistoryPanel | **Capture Log** | append-only ledger ✔; `passage.capture` fires for unlabeled captures too; surfaces on 03, scoped to the Reading |
| `sources` / `Source` | **Reading** | |
| `sources.isArchived` | forward-only Reading removal ✔ | |
| `sources.isOwn` | Student-Contributed Reading ✔ | |
| storageKey-null source | reference-only Reading ✔ | ratified into the model |
| `sourcePages`, `sourceScores` | canonical text + extraction gate ✔ | |
| `courseSources.week` / `position` | Assigned Date / syllabus order | drives Library default sort |
| `courseSources.isCore` + `sources.category` | Reading types (Assigned History / Assigned Theory / Supplemental / Student-Contributed) | map the four types onto `category` |
| the shelf / `Shelf.tsx` | **Library** (station 00) + Reading cards | |
| stations, internal keys `readings · open · throw · map · read` | **00 Library · 01 Reading · 02 Linking · 03 Knowledge Graph · 04 Vocabulary** | 03/04 swapped 2026-08-08; Weave **removed from the app** 2026-08-11; Keep **dissolved** 2026-08-11 — downloads at the object, reset in My Loom |
| `Workbench` | the Cloth workspace | |
| `ClothMap.tsx` | the cloth (the arc drawing on 03) | the board is `MapTab`'s card table; trace hidden behind `SHOW_TRACE = false` |
| tongues | — | removed from `src/` entirely |
| "whole weave" (`scopeKey ''`) | — removed from the app 2026-08-11 | survives only as the Library's internal scope; legacy rows persist unrendered |
