# Loom — Spec v1

Build contract. Functionality only — pedagogy, staging, and governance live in the [Course Deployment notes](course-deployment-notes.md). This is the target the build freezes to and the release gate checks against.

**Status:** DRAFT (freeze target) · **Version** v1 · rev July 30c · **Freeze date:** TBD

**Revision history.** *29d* — reflects tool v14 and the July 28–29 calls; §6 splits the artifact from view state; §5 records how the OCR quality gate is met; §4 red line #6 gains a ratified, bounded exception for library ingest. *29e (TJ)* — §6 adds the graph **development history**, an append-only record of the student's own acts, exploratory only, and an optional capture-provenance `anchor` on exported bytes; both production-build only. *30a (TJ)* — §3 Global moves export / import / reset onto their own tab (**05 — Keep**) with instructions for each; §6 `views.cardTable` gains `order`, the student's chosen sequence for the sort list. *30b (TJ)* — §4 red line #6 gains a second ratified exception: model-drafted reading metadata on the Readings tab, admissible only as a proposal an instructor reads and accepts before it is stored (§5). *30c (TJ)* — **the reading becomes the entry point**: §3 restructures around a shelf of readings, each opening its own workbench; §2 records that a reading is a door into one graph and never re-homes a concept; §6 adds `scopeKey`, reference-only sources, and the card table's `pins`. Also **proposed, not yet ratified**: map **passes**, which move a tier off the concept and onto the pass it belongs to (§3 Map, §6). The reasoning for all of it is in [reading-scope-and-map-passes.md](reading-scope-and-map-passes.md).

## 1. What Loom is

A single-file web tool in which a student:

- Captures passages from a reading,
- Names the concept each passage evidences,
- Asserts labeled relations between concepts, and
- Sorts and arranges the concepts into a map draft (cards on a table).

The accumulating graph is the student's own.
The tool holds structure and offers scaffolds; it never performs the interpretive judgment.

## 2. Objects

Three first-class objects, plus a vocabulary layer.

### Byte (passage) = evidence

Fields: `source` (author, work), `location` (page / chapter / timestamp), `text` (the passage, verbatim).

A byte may evidence more than one concept. (v1 single-file: re-file the same passage under a second concept; production: model as byte→concepts many-to-many.)

**A byte does not exist until it is named.** A highlight *is* a byte: selecting text is the capture gesture, not a separate uncoded object, and the passage is filed under a concept in the same act. There is no holding pen of unnamed marks — an uncoded highlight is a note, and Loom is not a note tool.

**Every byte belongs to a reading** (production). Capture inside a reading records it, so a passage typed by hand carries the same provenance as one taken from the PDF. Something being coded that the library does not hold gets a **reference-only reading** — a card with a title and author and no file, added by the student, on their shelf and nobody else's. Passages captured before this existed are placed by *asking* the student which reading they came from; matching their typed citation against library titles would be the tool deciding what they meant (red line #2).

### Concept (node)

Fields: `label`, `def` (working definition), `note`, `tier` (`''` | `p` | `s` | `t` | `x`).

The label is a short noun phrase naming the idea — often the author's own term ("boundary objects").
The working definition is the student's own-words gloss — a sentence is fine; entered at capture time.
(The swap, 7/29: your definition is your concept; your concept is your working definition.)

**Identity:** deduplicated by label, case-insensitive — one label is one concept, reused across readings and weeks.

A reading is a **door into one graph**, never one of many graphs. Which reading a concept belongs to is *derived* from its bytes — a concept is evidenced in a reading when one of its passages came from it — and is computed for display and discarded. Nothing re-homes a concept, and meeting the same idea in a second text joins the evidence rather than minting a second concept. That reuse is the island-bridging the course is for, so the tool says plainly when it happens (counted, never advised). A concept with no bytes appears in every reading, flagged "no evidence" per red line #4.

**State:** a concept with zero bytes shows as "no evidence" (a visible failure state, not a block).

### Edge (thread) = relation

Connects exactly two concepts, directed (from → to).

Fields: `sentence` (required — the student's own articulation), `handle` (optional — a short coined term).

An edge with no term reads as "sentence only"; with a term, "coined term."

### Term + tongues (vocabulary)

The coined handle is free text in the student's words, never chosen from a fixed list.

**Recurrence:** a term reused across edges is surfaced as emerging vocabulary (counted).

**Tongues:** instructor-editable register menus offered as generic naming suggestions at coin-time. Never tailored to a specific pair.

## 3. Actions

### The shelf: pick a reading (production)

**The reading is the entry point.** The course's chain of transformations runs per text — text → notes → concepts → weave → map → chalk talk — twice a week, twenty-six times, so the shelf of readings is the home screen and the sequence below runs *inside* one of them.

The shelf is the syllabus: readings grouped by course week, each card carrying the student's own counts for that reading (passages, concepts, threads). Counted, never scored — no completion, no checkmarks, no "not started."

Two other places are entries in their own right: **your whole weave**, every reading at once, which holds the axial read and the cross-reading map; and **05 — Keep**, which is always the whole artifact and never a slice of it (red line #5).

### Open: capture & code

- Enter source, location, passage; name the concept (noun phrase); gloss it in the working definition; add byte → coding log.
- From a log row: edit the definition; re-file the passage under a second concept; rename; remove.

### Throw / relate

- Pick two concepts; write the sentence (how they relate); throw → creates an edge.
- Optional: shuttle-draw (chance picks a pair). On a thrown edge: coin / edit a term (tongues as suggestions); remove.
- **Reaching out of a reading** (production): concepts from the student's other readings stay reachable, searchable and never removed — threading this week's text to an earlier one is the move weeks 6–13 are built on. An edge is not owned by a reading: it appears in every scope containing *either* endpoint, so a **bridge** shows up in both readings and in the whole weave. Bridges get their own counted band rather than being filtered out of sight, and the shuttle can be told to draw across readings.

### Read the cloth

- **Arc map:** concepts on a beam in reading order, edges as arcs above. Click a concept to pull its thread; click an arc to read one crossing.
- **Report** ("what the cloth shows"): computed by counting only — spine, centre, gap, recurring terms, no-evidence concepts, sentence-only edges. No AI.
- **Your read:** one short paragraph, the student's synthesis; copy.

### Map (the card table)

- **Sort:** the student assigns each concept a tier — primary / secondary / tertiary / leave-off. Every assignment is a student act.
- **Arrange:** draggable cards on a three-band canvas (general above, specific below). Dropping a card into another band re-tiers it — placement is the decision. Edges render between placed cards, labeled with the student's terms; edges are draggable too (bow a line, re-seat its label — display only).
- **What a card is made of:** each card carries its own menu — the working definition, the passages behind it as quotes, and which other readings the concept was met in. A definition can be *pinned* open on the card for the chalk talk. (Replaces the global "show definitions" toggle, which also drove card geometry: flipping it resized every card on a table whose positions were arranged at the other size.)
- **Check:** a counted mirror — tiers, propositions drawn, possible cross-links — echoing the chalk-talk rubric (list → tiers → cross-links). Counted, never advised.
- **Your read** is writable here too (same text as Read, synced).

#### Passes — proposed, not yet ratified

A **tier is a rank relative to the concepts it sits among**: primary means "this reading hangs on it", among *this reading's* concepts. A concept shared by two readings therefore carries a different rank in each, and both are right. A single `tier` on the concept cannot hold them, and under reading-first this is immediately visible — sorting one reading's concepts would sort every other reading's map.

The proposal: a **pass** — one arrangement of one map, cut and named by the student, holding the tiers, the read as it stood, and its own geometry. `‹ ›` steps through them beside the map and the read. Passes are linear and append-only: the newest is the working one and the only editable one, and restoring an earlier pass copies it forward rather than overwriting. Cutting one is explicit and its name is the student's own sentence — the tool must never propose a name from the read, which would be inference on a student's own words.

Distinct from the development history (§6), which is tool-written, act-level and unnamed. This is voluntary, interpretive, and named.

**This needs a §7 decision before it is built:** it moves `tier` off the concept, which §6 currently calls "placement's meaning, extracted into the graph."
- **Map kit** (also on Read): copies concepts (grouped by the student's tiers when set, else busiest-first), all propositions with term + sentence, largest chain as a possible armature, loose concepts — the hand-off to the hand-drawn map.

### Global

Export `.json`; export markdown (production); import; reset; student name.

In the production build these live on their own tab (**05 — Keep**) rather than in the header chrome, each with a plain statement of what it is and when to use it: `.json` is the exact record and the only re-importable form, markdown is a readable outline, import replaces rather than merges, and reset clears the cloth but not the development history.

## 4. Red lines (acceptance criteria)

1. No AI inference, suggestion, or naming of a relation between two concepts. Ever.
2. Automating capture is allowed (paste, tidy, juxtapose, re-file). Automating judgment (naming a concept or a relation) is not.
3. Relation terms are coined free text, never a fixed dropdown. Tongues are generic suggestions only.
4. Every concept must be able to trace to a byte; evidence-less concepts show as a visible failure state.
5. The export is the student's artifact; their work is never inaccessible to them.
6. No AI runs inside the tool. AI use happens outside it, on the export, by course policy, disclosed. **Ratified exception (a) — extraction scoring (29 July 2026, see §5):** a model may score an uploaded PDF for extraction quality. It reads the source document, never a student's work; it must not read or write a concept, byte, edge, or read; and its output must never reach a student. **Ratified exception (b) — metadata drafting (30 July 2026, see §5):** a model may draft an uploaded reading's bibliographic metadata from that reading's own pages, *as a proposal an instructor must read and accept before it is stored*. Both exceptions are exhaustive and admit no other in-tool model call; anything else touching an instructor-uploaded file, and anything whatever touching a student's work, needs its own ratification.
7. Render and count, never decide. The tool may draw what the student authored and count what it sees; it never tiers, places, links, or arranges for them. Auto-layout as output is out. Derived geometry may be computed for display and discarded; only student gestures write to `views`.
8. Social displays wait. Cohort views (highlight heat maps, group overlays — production) render for a student only after they have coded that reading themselves; instructor views are exempt. The crowd must not pre-code the text.

## 5. Scope

### In v1 (single-file, reflects tool v14)

Byte capture (+ re-file under a second concept); noun-phrase concept coding with working definition at capture; dedup; sentence-first edges; coined terms + tongues; arc map + pull-thread + counted report; your-read (Read + Map, synced); Map tab (sort / arrange / mirror, def captions, bendable edges); map kit; JSON export; import; per-browser persistence; reset; first-run walkthrough + coaching copy throughout.

### Production v1 (TJ build — ratified 7/28–29)

- Reading library: preloaded, standardized "gold" texts (approved by HD/JC); student-added papers with dedupe-and-redirect; OCR quality gate before release (many course PDFs are scans with no text layer).
  - The library is course-agnostic: a PDF is uploaded, OCR'd, and scored once, then included in any number of courses. Week, visibility, and core/supplemental are per-course facts on the join, not properties of the reading. Readings are managed on the Readings tab; a course's reading list is assembled on the Courses tab.
  - **The OCR quality gate is an extraction score** on each reading, four dimensions scored 1–5: `coverage` (share of pages with extractable text), `legibility` (whether the characters read as language — junk-byte count *and* a letter-distribution / common-word check, since a font map that resolves to the wrong character produces clean ASCII), `anchorability` (enough text per page for highlight offsets to hold), and `structure` (reading order survived). The first three are measured deterministically at upload; `structure` and a refined `legibility` come from an optional LLM judge. A reading passes only if *every* scored dimension clears 3 — the dimensions are not compensatory, since a pure-mojibake PDF scores full marks on coverage and anchorability while being unusable.
  - Scoring is advisory, not blocking: a reading below the bar is flagged "Needs review" for an instructor, never auto-hidden. Per red line #7 the gate reports what it measured; the decision to admit or re-scan a text stays with the instructor.
  - **Ratified against red line #6 (TJ, 29 July 2026).** "No AI runs inside the tool" is absolute as written, and the `structure` / refined-`legibility` pass is a model call made inside the tool, so it needed an explicit decision rather than a silent reading. Admitted, bounded to library ingest: the call runs on the instructor's side at upload, reads the PDF's own text, and returns a number about scan quality. It never sees, names, suggests, or influences a concept, byte, edge, or read, and no student-facing surface consumes its output — so the interests #6 protects (the student's interpretive work, and disclosure of AI touching it) are untouched.
- **Metadata drafting — ratified against red line #6 (TJ, 30 July 2026).** On the Readings tab, behind *Edit*, an instructor may ask a model to read the reading's own opening pages and propose its title, author, source reference, and description.

  This needed its own ratification rather than resting on the scoring exception, and is bounded differently, because it does the one thing that exception forbade: **its output is text a student can read** (title and author appear on every library card; description appears when the instructor publishes it). The scoring judge returns a number no student sees; this returns prose.

  What makes it admissible is the review step, which is therefore part of the ratification and not a nicety: **the model's output is a draft that is never stored.** It fills the edit form; the instructor reads every field, corrects it against the PDF, and saves. No model-written sentence reaches a student that an instructor has not read and accepted, and `metadataProvenance` records which fields were drafted rather than typed, so the origin stays visible afterwards. Remove the approval step — auto-fill on upload, a bulk "draft all", anything that writes straight to the row — and this becomes an unratified in-tool model call.

  Unchanged from exception (a): it reads the instructor's PDF and never a student's work; it must not read or write a concept, byte, edge, or read; and it stays optional, so a deployment with no `OPENROUTER_API_KEY` simply types its metadata by hand.

  - The boundary is what was ratified, not the convenience. Extending a model call to anything a student authored, or to any output a student sees, is a new question and needs its own ratification — red lines #1, #2 and #7 continue to forbid inference, suggestion, or naming anywhere near the graph. The judge also stays optional: absent `OPENROUTER_API_KEY` the gate runs deterministic-only and reports `structure` as unscored rather than guessing, so a deployment that declines the exception still gets a working quality gate.
- In-tool highlights → bytes (capture only; the student still names every concept).
- Highlight heat maps per reading group + comparisons — subject to red line #8 (timing).
- **Reading-first (30 July 2026).** The shelf is the home screen and each reading opens its own workbench, with the text, the coding log, Throw and Read inside it. Membership is derived from byte provenance and discarded per render, so a reading is a door into one graph (§2). Cross-reading threads are first-class and counted (§3 Throw). Students may add reference-only readings of their own, and passages with no reading are placed by asking (§2 Byte).
  - `04 Map` stays at the whole weave until placement is per-map: with one `tier` per concept, a reading's map would show ranks sorted against another reading's concepts, and the map is what the chalk talk is drawn from.
- Hosting (Vercel), GitHub OAuth, per-student persistence in Postgres, section tags (enables December quilting), positions stored proportionally, markdown export (reconcile from Lingxiu's fork), weekly class export.

### Out (happens, but not in the tool)

Reading the source deeply; the final hand-drawn concept map; the chalk talk; self-found and supplemental readings.

### Awaiting a decision

Map **passes** and per-map tiers (§3 Map). Also open: whether several readings can be selected at once (the data model is keyed for it), and whether `01 Open` becomes the PDF and the coding log side by side rather than a tab apart.

### Deferred to v2

Formal term promotion (recurrence-surfacing may be enough — open); tag hierarchies; cross-student "quilt" merge (December, per-section, student steward).

## 6. Data

One JSON document per student (kilobytes). Schema:

```json
{
  "graph": {
    "student":  "",
    "concepts": [ { "id": "", "label": "", "def": "", "note": "", "tier": "" } ],
    "bytes":    [ { "id": "", "conceptId": "", "source": "", "location": "", "text": "" } ],
    "edges":    [ { "id": "", "fromId": "", "toId": "", "sentence": "", "handle": "" } ],
    "read":     ""
  },
  "views": {
    "cardTable": {
      "positions": { "conceptId": { "x": 0, "y": 0 } },
      "bends":     { "edgeId":    { "dx": 0, "dy": 0 } },
      "order":     [ "conceptId" ],
      "pins":      [ "conceptId" ]
    }
  }
}
```

`tier`: `''` unsorted · `p`/`s`/`t` · `x` left off the map.

`graph` is the artifact and the export contract — view-agnostic, portable, the thing an agent or a future reader consumes.
`views` holds per-view student-authored geometry; it round-trips on export so no arrangement work is lost, but no consumer of the graph is required to read it.
Adding a view adds a key under `views`, never a field on a concept or edge.

`pins` is the set of cards whose working definition the student pinned open on the table — display state like the rest of `cardTable`, written only by that gesture.

**Scope (production, 30 July 2026).** Work done *under a selection of readings* — the read, and (proposed) the pass stack — is keyed by a `scopeKey`: the selection's source ids, sorted and comma-joined, with `''` meaning the whole weave. Single and multiple selections behave identically, which is what makes "several readings at once" a change of degree rather than a rewrite; and every row written before scoping existed already carries `''`, so today's read *is* the axial read with nothing to migrate.

**Passes (proposed, see §3).** If ratified, the export gains one additive array — `graph.mapPasses[]`, each `{ name, read, tiers: { conceptId: tier } }` — in the way `anchor` was added to bytes, and `views` gains one key per pass holding that pass's `{ positions, bends, order, pins }`. `concepts[].tier` keeps its place in the contract but its meaning narrows to *the tier on the course-wide map*, one rank among several; consumers wanting a concept's rank in a given reading read `mapPasses`. Import must remint concept ids inside `tiers`, exactly as it already does for `positions` and `order`.

Placement is a decision (§3), but its meaning is already extracted into `tier` — the residual x/y is display geometry and belongs to the renderer, not the artifact. `bends` are display-only by §3's own wording. `order` is the student's chosen sequence for the sort list; it re-sequences that list only and never the graph's own capture order, which the arc map reads as reading order — so it too is display state. (Production: byte→concept becomes many-to-many.)

**Anchors (production, 29 July 2026).** A byte captured from a library PDF carries optional provenance — `anchor: { sourceId, pageNumber, startOffset, endOffset, pageContentHash }` — in the export. It records where the passage was taken from, nothing more; consumers may ignore it. It extends the byte shape above without changing it.

**Export:** `.json` (contract above) and markdown (production) — for Obsidian / notes / agents.

**Stored (v1 single-file):** student name + graph. Nothing else.

**Stored (production, ratified TJ 29 July 2026):** graph + views as above, plus a **development history** — an append-only record of the student's own graph acts (capture, name, rename, re-tier, throw, coin, remove, import, reset). The graph is the artifact; the history is how it came to be, and it belongs to the same student. Constraints, reviewed against §4:

- It records **gestures, never judgments** — no scores, no comparisons, no advice derive from it (red line #7: the tool may count what it sees; the history view renders counts and replay only).
- It is **student-facing as an exploratory instrument** ("the cloth, over time"), not an audit or grading surface; it is never shown to another student (red line #8 untouched).
- It **survives reset and import** — reset clears the cloth, not the loom's memory of weaving.
- View geometry is *not* history: positions and bends are projections, and only the graph's development is recorded.

v1 persistence is browser-local; the hosted version persists per signed-in student, tagged by section. Hosted storage maps §6 onto Postgres: `graph` → the concept/byte/edge tables plus a `read` row; `views` → one row per view key (`cardTable` first) — a new view adds a row, never a column on a concept or edge; the history → `graph_event` rows.

## 7. Change control

This spec lives in the repo (TJ's GitHub) beside the code, with a changelog; it is the build target and the release-gate reference.

Changes are made by pull request and reviewed against the §4 red lines before merge.

Editable knobs in code: `REGISTERS` (tongues), `OPENERS`, seed / example data.

Version v1 freezes on the date above; anything not in §5 "In v1" / "Production v1" is out until v2.
