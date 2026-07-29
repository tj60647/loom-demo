# Loom — Spec v1

Build contract. Functionality only — pedagogy, staging, and governance live in the [Course Deployment notes](course-deployment-notes.md). This is the target the build freezes to and the release gate checks against.

**Status:** DRAFT (freeze target) · **Version** v1 · rev July 29 (reflects tool v14 + the July 28–29 calls) · **Freeze date:** TBD

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

### Concept (node)

Fields: `label`, `def` (working definition), `note`, `tier` (`''` | `p` | `s` | `t` | `x`).

The label is a short noun phrase naming the idea — often the author's own term ("boundary objects").
The working definition is the student's own-words gloss — a sentence is fine; entered at capture time.
(The swap, 7/29: your definition is your concept; your concept is your working definition.)

**Identity:** deduplicated by label, case-insensitive — one label is one concept, reused across readings and weeks.

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

### Open: capture & code

- Enter source, location, passage; name the concept (noun phrase); gloss it in the working definition; add byte → coding log.
- From a log row: edit the definition; re-file the passage under a second concept; rename; remove.

### Throw / relate

- Pick two concepts; write the sentence (how they relate); throw → creates an edge.
- Optional: shuttle-draw (chance picks a pair). On a thrown edge: coin / edit a term (tongues as suggestions); remove.

### Read the cloth

- **Arc map:** concepts on a beam in reading order, edges as arcs above. Click a concept to pull its thread; click an arc to read one crossing.
- **Report** ("what the cloth shows"): computed by counting only — spine, centre, gap, recurring terms, no-evidence concepts, sentence-only edges. No AI.
- **Your read:** one short paragraph, the student's synthesis; copy.

### Map (the card table)

- **Sort:** the student assigns each concept a tier — primary / secondary / tertiary / leave-off. Every assignment is a student act.
- **Arrange:** draggable cards on a three-band canvas (general above, specific below). Dropping a card into another band re-tiers it — placement is the decision. Edges render between placed cards, labeled with the student's terms; edges are draggable too (bow a line, re-seat its label — display only). Working definitions show as card captions (toggle).
- **Check:** a counted mirror — tiers, propositions drawn, possible cross-links — echoing the chalk-talk rubric (list → tiers → cross-links). Counted, never advised.
- **Your read** is writable here too (same text as Read, synced).
- **Map kit** (also on Read): copies concepts (grouped by the student's tiers when set, else busiest-first), all propositions with term + sentence, largest chain as a possible armature, loose concepts — the hand-off to the hand-drawn map.

### Global

Export `.json`; export markdown (production); import; reset; student name.

## 4. Red lines (acceptance criteria)

1. No AI inference, suggestion, or naming of a relation between two concepts. Ever.
2. Automating capture is allowed (paste, tidy, juxtapose, re-file). Automating judgment (naming a concept or a relation) is not.
3. Relation terms are coined free text, never a fixed dropdown. Tongues are generic suggestions only.
4. Every concept must be able to trace to a byte; evidence-less concepts show as a visible failure state.
5. The export is the student's artifact; their work is never inaccessible to them.
6. No AI runs inside the tool. AI use happens outside it, on the export, by course policy, disclosed.
7. Render and count, never decide. The tool may draw what the student authored and count what it sees; it never tiers, places, links, or arranges for them. Auto-layout as output is out.
8. Social displays wait. Cohort views (highlight heat maps, group overlays — production) render for a student only after they have coded that reading themselves; instructor views are exempt. The crowd must not pre-code the text.

## 5. Scope

### In v1 (single-file, reflects tool v14)

Byte capture (+ re-file under a second concept); noun-phrase concept coding with working definition at capture; dedup; sentence-first edges; coined terms + tongues; arc map + pull-thread + counted report; your-read (Read + Map, synced); Map tab (sort / arrange / mirror, def captions, bendable edges); map kit; JSON export; import; per-browser persistence; reset; first-run walkthrough + coaching copy throughout.

### Production v1 (TJ build — ratified 7/28–29)

- Reading library: preloaded, standardized "gold" texts (approved by HD/JC); student-added papers with dedupe-and-redirect; OCR quality gate before release (many course PDFs are scans with no text layer).
- In-tool highlights → bytes (capture only; the student still names every concept).
- Highlight heat maps per reading group + comparisons — subject to red line #8 (timing).
- Hosting (Vercel), GitHub OAuth, per-student persistence in Postgres, section tags (enables December quilting), positions stored proportionally, markdown export (reconcile from Lingxiu's fork), weekly class export.

### Out (happens, but not in the tool)

Reading the source deeply; the final hand-drawn concept map; the chalk talk; self-found and supplemental readings.

### Deferred to v2

Formal term promotion (recurrence-surfacing may be enough — open); tag hierarchies; cross-student "quilt" merge (December, per-section, student steward).

## 6. Data

One JSON document per student (kilobytes). Schema:

```json
{
  "student":   "",
  "concepts":  [ { "id": "", "label": "", "def": "", "note": "", "tier": "" } ],
  "bytes":     [ { "id": "", "conceptId": "", "source": "", "location": "", "text": "" } ],
  "edges":     [ { "id": "", "fromId": "", "toId": "", "sentence": "", "handle": "" } ],
  "positions": { "conceptId": { "x": 0, "y": 0 } },
  "bends":     { "edgeId": { "dx": 0, "dy": 0 } },
  "read":      ""
}
```

`tier`: `''` unsorted · `p`/`s`/`t` · `x` left off the map.
`positions`/`bends` are display geometry (production: store proportionally, and byte→concept becomes many-to-many).

**Export:** `.json` (contract above) and markdown (production) — for Obsidian / notes / agents.

**Stored:** student name + graph. Nothing else.

v1 persistence is browser-local; the hosted version persists per signed-in student, tagged by section.

## 7. Change control

This spec lives in the repo (TJ's GitHub) beside the code, with a changelog; it is the build target and the release-gate reference.

Changes are made by pull request and reviewed against the §4 red lines before merge.

Editable knobs in code: `REGISTERS` (tongues), `OPENERS`, seed / example data.

Version v1 freezes on the date above; anything not in §5 "In v1" / "Production v1" is out until v2.
