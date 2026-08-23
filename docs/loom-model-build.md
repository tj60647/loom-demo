# Loom — Conceptual Model (build authority)

The object model, semantics, and UI structure for Loom v1. This is the authority on *what things are*; `loom-refactor-spec.md` is the work order for getting the code here. History and decision provenance live outside the repo. Last reconciled with the build 2026-08-19 (dev @ `9ee4859`); "build state" notes below are measured against that commit.

---

## 1. v1 scope

**v1 is the individual core**: Reading → Passage → Concept → Thread (with its Link) → Cloth → Projection → download at the object, plus Vocabulary, search, and read-only comparison Overlays.

**Future work (defined, deferred — do not build, do not delete stubs):**
- **Join** — a new Cloth formed by overlaying two Cloths on the same Reading (same or different Users).
- **Quilt** — connecting 2+ Cloths from different Readings via shared Concepts. The v1 substrate ships: cross-Reading Concept recurrence.
- **Shared / co-created Cloths**; **in-tool comments/feedback**.
- **Cloth co-authorship** — the several-Users half of the ratified cardinality (§2 Cloth): `cloth_member`, membership-based authorization across the row-ownership checks (84 when counted, 2026-08-08), and an export contract that can name more than one author. **Ratified in shape, nothing built.** The many-Readings axis is dropped (§2 Cloth). Analysis: [cloth-cardinality.md](cloth-cardinality.md).
- **The whole weave** — **removed from the app 2026-08-11** (TJ: it "should not be in the app as an idea until the faculty and the authors of the app agree on what it means to have a 'full weave'"). No station, no route, no student surface; rows already written at `scopeKey ''` stay in the database and render nowhere. Reintroduce only with a definition.
- **Tongue** — instructor register menus; not in v1, and removed from the code entirely (P2), not flagged off.

---

## 2. Objects

**Loom** = Courses + Users.

**Course** = Discussion Sections + a Library. Exists only in the admin/faculty view. v1 instances: *Design Frameworks Fall 2026* and a *Test* course (keeps test data away from students).

**Section (Discussion Section)** = a set of Users; belongs to a Course. v1: 5 student Discussion Sections + **a Faculty Section** (faculty's data-model home; pedagogically they rotate among the Discussion Sections). Every account belongs to a Section. Has a **Roster**.

**Cohort** = the set of all Users of a Course. The widest Overlay comparison set.

**Account** = Email + Login + Role. Access is invite-based: invited → link → authorized. Admin-accessible list of emails/invitations; email is the account list only — no in-tool messaging.

**Role** = Student | Faculty | Admin. Capabilities are additive per account: Faculty always hold the faculty view and **may** additionally hold Student capabilities (their own workspace, e.g. exemplar Cloths).
- **Student** = Account + Discussion Section + Concept List + Link List + Cloths.
- **Faculty** = Account + Faculty Section + the faculty read-side (Roster · Cohort Graph — §4).
- **Admin** = Account + tool management (Courses · Readings · invitations and ingestion — §4).

**Reading** = Title + Authors + Publication Date + PDF Source + PDF Cleaned + Assigned Date + Cloths [0..n].
- Types: Assigned History · Assigned Theory · Supplemental · Student-Contributed.
- A **reference-only Reading** is legal: a card with title/author and no PDF, minted by a student so hand-captured passages still have a door; it sits on their shelf only.
- PDFs are behind login, marked for educational use only; ingestion runs the extraction-score gate (deterministic pass + optional LLM judge).
- **Removal is forward-only**: an archived Reading leaves the go-forward Library; existing Cloths and their references persist untouched.
- Renders in the Library as a **Reading card** with **exactly one door** (ratified 2026-08-08, TJ):
  - **The card itself is the door**, always, and it opens at **01 · Reading**. There is no Create Cloth button, because there is no decision: one Cloth per Reading per User, and your Base Cloth is simply there (ratified 2026-08-08 — see §2 Cloth).
  - Beneath it, **metadata rather than a control**: your Title for the Cloth (or "Base cloth" until you give it one) and when you last touched it. Never a count with the title hidden on hover.
- **"Just read" is a procedure, not a path.** Browsing without capturing happens *inside* a Cloth — you open it and add nothing. There is no second way in that skips the Cloth, and no UI component for reading-without-one. This supersedes the earlier reading of "browsing is not capture" as *a Reading may be opened without a Cloth*; the phrase means **a Cloth never obliges you to capture**.
- A Cloth opens where the work starts — **01 · Reading** — which is also where it is named (the Title/Description edit at the head of Your work).

### Reading · Cloth · Projection — three levels of one reader's work

*Ratified 2026-08-08 (TJ). The sentence the rest of §2 hangs on:*

> **The Cloth is the evidence; the Projection is the lens — and they work
> together, because the evidence is subject to interpretation by the reader.**

- The **Reading** is the text. It is not yours.
- The **Cloth** is what you kept from it, and what you take that to be.
  Interpretation begins here, at selection — *choosing the passage is your
  judgment, and that is the point*. A Cloth is therefore **never raw
  evidence**, and its Title and Description are interpretive by design.
- The **Projection** interprets again, by **arrangement**: Tiers, a shape, a
  One-line and a paragraph — one take of several possible over the same
  material.

**The difference is level, not kind.** Both are the reader's. A Projection does
not add interpretation to a neutral Cloth; it re-reads an already-interpreted
one.

What this settles, and where each was ruled:
- A second Cloth on a Reading is redundant *for interpretation* — that is what
  Projections are for. What a second Cloth carries is **co-authorship**
  ([cloth-cardinality.md](cloth-cardinality.md) §9).
- The read paragraph belongs to the **Projection**, which is why Vocabulary's
  duplicate editor was retired to the Knowledge Graph.
- The Cloth is **named where its evidence is gathered** — 01 · Reading.
- **Cloth Description stays interpretive.** It is not lens-work in the wrong
  object; it is the reading you made while gathering.

**Cloth** = Cloth Title + Cloth Description + one Reading + Passages + Concepts (referenced) + Threads + Capture Log + Projections.
- Cloth Title ≠ Reading Title — a sentence or headline. Cloth Description = a short interpretation of the Reading.
- **Cardinality — ratified 2026-08-08 (TJ):**
  > **One Cloth per Reading per User — but a Cloth may have several Users.**
  - A Cloth has **exactly one Reading**. (The earlier "a Cloth with several Readings" axis is dropped; the whole-weave Cloth, `scopeKey ''`, stays the special case it already is rather than becoming the general one — and since the weave's removal it renders nowhere, §1.)
  - Several Cloths therefore exist on a Reading **across the class** — mine, Sam's, ours — but **a student never chooses between "new Cloth" and "new Projection"**. They only ever make Projections. A second Cloth on a Reading arises **only through co-creation**, never as another lens.
  - Every Reading has a **Base Cloth** for you — the default, always there, never asked for — so a Reading is never door-less and *"just read happens in a Cloth"* needs no inert card.
  - **Two Users co-creating or joining a Cloth is wanted** and is the reason this cardinality is not simply 1:1.
  - *Why this and not several per User: a Projection already carries Title, One-line, Description, Tiers and an arrangement — strictly more apparatus than a Cloth. The only thing a second Cloth can express that a Projection cannot is **co-authorship**. Full argument: [cloth-cardinality.md](cloth-cardinality.md) §9.*
  - *Load-bearing consequence: because a User has exactly one Cloth per Reading, `(user, reading)` still identifies the Cloth, so **`passage` needs no `clothId`** and co-creation costs join tables plus an authorization change rather than a re-keying of the graph. Allow a User two Cloths on one Reading and that stops being true. Overlaying two people's Cloths on one Reading is the deferred **Join**.*
- **Build state (2026-08-19).** The Cloth row is real: migration 0021 created the `cloth` table (Title + Description, `unique(userId, courseId, scopeKey)`), absorbing the old `read` table. That unique already enforces "one per Reading per User". Still unbuilt, deferred with §1's co-authorship item: the **several-Users** half (`cloth_member`, membership-based authorization) and addressing a Cloth by id rather than scope key.
- **The share-or-partition question is retired by the ratified rule.** Co-creating carries the User's existing captures on that Reading into the shared view — the evidence is shared, never partitioned — and holding a solo Cloth *beside* a shared one on the same Reading is precisely **Join**, defined and deferred ([cloth-cardinality.md](cloth-cardinality.md) §9). `passage`, `edge` and `map` carry **no `clothId`** and must not gain one: `(user, reading)` identifies the Cloth, which is what keeps co-authorship a membership change rather than a re-keying of the graph.

**Passage** = Characters (Beginning → Ending Point) + Time Stamp + Concept pointers [0..n] + Notes + Questions + Pull-quote Flag + Passage Tier.
- Anchoring contract: offsets computed against canonical server-extracted page text, hashed (contentHash) so drift is detectable.
- **A Passage with no Concepts is a legal state — the Unlabeled Passage.** It may never gain a Concept, which is fine, and the capture form never demands one: Save is always live and reads "Save without concept" when the name is blank (TJ, 2026-08-12). Unlabeled Passages appear in the Reading (highlights) and in Your work's Unlabeled group on 01, and every capture — named or not — is a Capture Log row. **They do not appear in Projections**: the earlier "unattached group" in the Knowledge Graph was built and then removed (TJ, 2026-08-12: "there should not be an unlabeled passages section in the knowledge graph"). They have no presence in the Lists or in Threads.
- Passage Tier: ordinal, may be null; belongs to the Passage.
- **Build state (2026-08-19).** The Note is the one Passage field with an editing surface — the capture form, the rail card in place, and Your work. Questions, the Pull-quote Flag and the Passage Tier are defined here and in the schema, but **no surface writes them yet**.

**Concept** = Label [< 8 words, may be null at capture] + Description/Gloss [< 100 words, may be null].
- **A Concept is a single User-level object.** Passages across Cloths and Readings *reference* it — they do not own copies. The Gloss is written in the Capture Log row but stored on the Concept.
- **Has pointers to its Passages** [0..n] — the evidence trail, crossing the Cloth boundary; the recurrence flag is derived (Passage pointers spanning >1 Reading). Zero Passages is legal (show as "no evidence," a visible state, not a block).
- **A Concept may precede its evidence** (ratified 2026-08-08, TJ). Naming an idea you expect to meet — and glossing what you take it to mean — before any Passage supports it is a first-class move, not an oddity: you name it, then read for support. So zero Passages is reached three ways, all legal and indistinguishable in the data:
  - **before** — named ahead of its evidence, awaiting a Passage (this ruling);
  - **after** — the Concept survives its evidence, its Passages having been unfiled or deleted;
  - **never** — an idea that turned out not to be in the texts, kept or deleted as the student decides.
  A Concept with no Passages therefore belongs to **no** Reading, and is in scope **everywhere** — it stands in every Reading's warp while the student hunts for what backs it. "No evidence" is a designation, never a warning to act on: the tool counts, it does not judge (red lines 1 and 7).
- **Has pointers to its Threads** [0..n]. An un-evidenced Concept may be threaded like any other — warned, never forbidden, as with homonyms.
- **Identity is by object, not label string.** De-duplication happens at capture time via reuse: typing a label resolves case-insensitively to the Concept already owned (a typeahead offers the holdings), and all three naming paths report a join through one shared ReuseOffer — "Not the same idea? Make it a separate concept." Distinct Concepts *may* share a Label (homonyms) — warn at coin-time, don't forbid. A **merge** act exists (repoints Passage and Thread references; logged as `concept.merge`) but its control is **hidden since 2026-08-12** (TJ: "we need to resolve what this really means and its consequences" — open-work.md 5.1f); until that ruling, repair is two acts by hand.
- A Label need not exist before linking; naming can follow.

**Link** = Link Label [< 6 words] + Link Description [< 100 words, may be null] — **a single User-level object spanning Cloths**, like a Concept (TJ: "links are user-level"; reasoning in [link-as-object.md](link-as-object.md), built 2026-08-11 as migration 0024).
- The Description is the **verb-gloss** — *what I mean by this verb* — never the sentence about a pair; that sentence belongs to the Thread.
- **A Link may precede its Threads** (TJ, 2026-08-10) — coined in Vocabulary with a gloss, counted at zero, found by search, offered as a chip. The missing symmetry with "a Concept may precede its evidence," now present.
- Chips **attach the object**, never copy the word; typing a label resolves case-insensitively to the Link already owned. Renaming a Link reaches every Thread that uses it. Homonyms: warn, don't forbid, as with Concepts.
- Deleting and merging Links are **not built** — deliberately deferred until a real vocabulary is observed to silt up, because prevention (attaching the object) decides nothing on a student's behalf and repair always risks it (open-work.md 5.1e).
- **Never prompt for the Link gloss at throw-time** — it is written in Vocabulary, when you notice you are reusing a verb. Null forever is fine.

**Thread** = Concept 1 + Link [0..1] + Concept 2 + Thread Description [< 100 words, may be null] — subject–predicate–object; should read aloud as a sentence.
- Threads live in a Cloth; directed (from → to); exactly two Concepts — structural, not a tag. (In the schema a Thread is still the `edge` row; `edge.sentence` is the Thread Description.)
- Description (the sentence) before Label (the verb) is the encouraged order, not a constraint. A Thread with a Description and no Link is the normal starting state ("loose"); attaching or coining the Link beats it in.
- Threads do not have Tiers.
- **No longer backgrounded**: a Thread is **one card** ([thread-card.md](thread-card.md), built 2026-08-19) — relation-first: the trip (from · label pill · to), the sentence, the meta — drawn by 02 · Linking in edit mode and by every read-only list (03's reading pane, the Cohort Graph, the faculty read-only view). One fallback for unlabelled: the pill is simply absent.

**Capture Log** — the ledger of the work.
- One row per act, timestamped: Passage captures (including Unlabeled), Concept coin/rename/merge/delete, Thread throws and label coinage, Link coinage and gloss, Cloth and Projection edits, resets. Append-only; survives reset — reset itself writes the cleared loom into its `graph.reset` row before deleting anything. Best-effort writes with the graph tables as source of truth.
- **Every act records the Reading it happened in** (TJ, 2026-08-11): by the act's own stamp, by its scope, or — for pre-stamp rows — by where the evidence is. Nothing is ever rewritten; what a Reading shows of the record can grow as evidence arrives.
- **Surfaces on 03 · Knowledge Graph, scoped to the open Reading** (TJ, 2026-08-10) — "the record" beside "the cloth" — and downloads there. (01's "Your work" sheet shows the work itself, as cards; the Log is the record of its making.)

**Concept List** — belongs to the User, spans Cloths; lives on 04 · Vocabulary. One row per Concept (the full object, drawn as the Concept card). No de-duplication at the List (it happened at capture). Shows the recurrence designation — distinct Readings evidencing it — descriptive, never evaluative. No ranking here: ranking happens only in Projections.

**Link List** — belongs to the User, spans Cloths; lives on 04 · Vocabulary beside the Concept List. One row per **Link** — the full object: Label, gloss, its Threads, use count. Since Links became objects the old asymmetry with the Concept List is retired: both sides of the vocabulary are objects now. A Link with no Threads is a row, never a warning; loose (unlabelled) Threads are counted beside the list.

**Projection** — the Cloth is the data (the Concepts evidenced here, the Passages, the Threads); a Projection is one way of projecting that data to be read. **A Projection has a kind** (ratified TJ, 2026-08-10: "there is data, and there is how you project the data"): a **list** projection is an ordering of the Cloth; a **board** projection is a layout — cards in tier bands, threads drawn. Each Projection, whatever its kind, carries Projection Title (a short name) + Projection One-line (the one-sentence take — subject + verb) + Projection Description (a paragraph) + its own Concept Tiers and arrangement. Two orderings and three layouts are five Projections.
- There is no "view" inside a Projection — a Projection *is* its kind. (The earlier "Views: List · Hierarchical · Cards" phrasing is retired; it twice misled builds toward view-switchers.) Nothing in the UI is called a "Map" ("Concept Map" refers only to the external artifact made in Figma from an export).
- **The board digitizes Novak & Gowin's concept-mapping practice** — rank concepts from general to specific, arrange movable cards (general above, specific below), link them with labeled lines so each connection reads as a proposition, and watch for cross-links between branches. Citations: Novak & Gowin, *Learning How to Learn*, Cambridge University Press, 1984; Novak & Cañas, *The Theory Underlying Concept Maps and How to Construct and Use Them*, IHMC, 2008. ("Board", not "table": Novak's cards were laid on a physical table, but on a screen "table" reads as a spreadsheet — TJ, 2026-08-10.)
- One Cloth may have many Projections — each a different take; title the takes.
- **Build note (still true 2026-08-19):** as built, each Projection still *bundles* one ordering, its tiers and one layout, shown together on 03 as Sort, the board, and "Your read of this projection" — there is no `kind` field. Kind-per-Projection is ratified, not built — the gap is recorded in contracts.md and open-work.md 5.6, and the unbundling is planned-first work.
- **Concept Tiers live here**, per-Projection: the same Concept may be Tier 1 in one Projection and Tier 3 in another.
- **A fresh Projection opens unsorted.** The tool never offers to seed its Tiers from another Projection or another scope's map — those ranks were judged against a different set of Concepts. (Ratified 2026-08-07, TJ, from the archived strategy doc's §B.4; no automation stands in for the student's sorting — of a piece with red lines 1 and 3.)
- A Projection shows the graph. **Unlabeled Passages do not appear here** — the unattached group was removed (TJ, 2026-08-12); their home is Your work on 01. Threads can still be thrown without leaving 03: pick a pair on the cloth (click one concept, shift-click a second) and the offer appears at the arc, to throw in place or open on 02 — the Linking tab stays their home; tabs are homes, not walls. The board itself is arrange-only, and Concepts are not coined here.
- A Projection downloads at its own row, and the **concept-map kit** — the material the external Figma map is drawn from — downloads at the board.
- Display geometry (positions, bends, pins, order) is view state, never part of the graph artifact; derived layout is computed for display and discarded — only student gestures persist geometry.

**Tier** = an ordinal — 1 (Primary) · 2 (Secondary) · 3 (Tertiary) · **may be null** (unranked) · **x** ("Set aside" — deliberately left off).
- Ordinal, not a score: no arithmetic; aggregations are distributions.
- Null ≠ lowest: unranked items display as their own group, never sorted below Tier 3. "Set aside" (x) is distinct from unranked (null): a judgment of exclusion vs. absence of judgment.
- Two uses, one value type: Passage Tiers (on the Passage) · Concept Tiers (on a Projection).

**Download at the object** (ruled TJ 2026-08-10, [keep-at-the-object.md](keep-at-the-object.md); built): every object exports **whole, never a slice**, at the surface where it lives — the Cloth on its own card at the head of Your work on 01 (carrying its Passages, unlabeled ones included, the Concepts they evidence, the Threads between those, and its Projections), the Threads on 02, a Projection, the concept-map kit (basis for the Concept Map in Figma etc.) and the Capture Log on 03, the Vocabulary on 04. Every file carries a provenance header (student · course · when). There is no whole-loom export button and **no import** — downloads are outbound artifacts; the Keep station that held export/import/reset was dissolved 2026-08-11. Red line 5's "whole-artifact export" is read **by object**.

**Search** — one grammar, contextual scope (TJ, 2026-08-10: "it is really about searching the 'loom' scoped by role" — and, the same day, scoped by where you stand). The journey bar docks the search on every learner surface: at the Library (and on 04, which is unscoped) it searches **your loom** — Readings (title · author · citation, and every page of text), your Cloths, Projections, Concepts, Link Labels, Links and Passages, results grouped by kind; inside a Reading it searches **your cloth** — that Reading's own work. A hit is a door: it opens the Reading **on the page it quoted**, marks the words it found at every zoom, and says how many matches a page really holds; a user-level hit opens the Reading where its first evidence lives; a hit with no Reading is shown as a dashed row that says why it is not a door. The Reading toolbar's own "In the text" searches every page of the open text. Plain full-text search; no model in the loop — a match is a fact about the text.

**Overlays** — read-only comparisons at Discussion Section · Cohort — **and, since 2026-08-22, one Student**.
- **FACULTY AND ADMINS ONLY** (ratified 2026-08-08, TJ). Students never meet them. Faculty reach them through their *own* learner surfaces — Library · Reading · Linking · Knowledge Graph · Vocabulary — which they hold alongside the faculty view, capabilities being additive.
- The per-Reading capture gate went with the student overlays: it existed so the crowd could not pre-code a *student's* reading, and there is no student reading one. An instructor seeing where a section marked is the job — `/admin/aggregate` was always ungated.
- **A STUDENT BAND, added 2026-08-22 (TJ)** — the Heatmaps tab's own picker, in the scope strip. It is the one band that resolves to a person, which ruling 28 had forbidden ("nothing here returns a name, an id, or anything that resolves to one"). The change widens no access: Open Loom already lets faculty read one named student's whole loom, highlights included (ratified 2026-08-21), so this is a second door onto work that door already opens. Section and Cohort keep their anonymity — they count people and name nobody — and only staff who could already look may use the third.
- **A picker, resolved 2026-08-08 (TJ):** the control is a dropdown — *off · All sections · each Section by name* — so faculty compare any Section they teach, or all at once. This closes the gap where "your section" had no referent for them: they sit in the Faculty Section, which the peer query excludes. Copy says "that section" and "the cohort", never "your".
- Bands (superseded phrasing, kept for the shape) — me + colleague · Discussion Section · Cohort:
- Passages Overlay (highlight heat) — the **Heatmaps tab's** "Overlay" control. It stood in the Reading toolbar from 2026-08-08 until TJ moved it out on 2026-08-23 ("the overlay view should only be available in the heatmap, not in reading"): once Heatmaps existed it was one control in two places, and the reading station is where a reader reads their own text and marks it, not where they ask how a cohort compares.
- Concepts and Links Overlay — 04 · Vocabulary's "What others named — counted, not judged."
- And the **Cohort Graph** (`/admin/aggregate`) in the staff view, at Section/Cohort granularity.

---

## 3. Student view — five stations

**00 Library · 01 Reading · 02 Linking · 03 Knowledge Graph · 04 Vocabulary**
(Plain activity names in navigation; the weaving metaphor — Cloth, Thread, Quilt, Join — lives in object names only. The internal route keys keep the July names — `readings · open · throw · map · read` — so `?tab=` never breaks; the visible labels are these five. 03/04 were swapped 2026-08-08, TJ: the graph before the words.)

- **00 · Library** — browse the Course's Readings, grouped by week (Assigned Date order); each Reading card is **the one door** and opens your Cloth at 01 · Reading, with the Cloth row beneath as metadata (its Title or "Base cloth", when last touched) and a passages · concepts · threads tally; upload Student-Contributed Readings; the "New to this?" card opens the guide.
- **01 · Reading** — the integrated Reading + capture view: highlight Passages (create/update/delete) and capture **on the rail beside the words** — the rail's draft card and the capture dialog are one shared form, and Save never requires a Concept; the Passage Note is written at capture or in place on the rail card; associate Passages with new or existing Concepts, including Concepts from other Readings (the Add Concept card files a Passage under one more Concept without leaving the text); Labels and Glosses; two ways to hold the text — page mode, and **the canvas** ("matrix" in the code): every spread on one zoomable plane — two fingers pan, a pinch zooms, cards counter-scale so at full zoom-out you are reading concepts, not shrunken text; "In the text" search; **the Cloth Title/Description are edited here**, at the head of Your work, where the Cloth also downloads and one Reading can be cleared (Concepts, Links and Threads survive — a concept does not belong to a text; a passage does); auto-save throughout.
- **02 · Linking** — throw/update/delete Threads, drawn as the Thread card; Description then Label; the student's own Links offered as chips that **attach the object**; the Threads download here. Works on **this Reading's Concepts only** (TJ 2026-08-08): a Concept met elsewhere joins the warp by capturing a Passage here under it, not by reaching across from the bench.
- **03 · Knowledge Graph** — the cloth (the arc drawing; pick a pair there — click, shift-click — and throw the Thread in place or open it on 02), then this Cloth's Projections: each shows Sort (the ordering and its Tiers), **the board** (cards in tier bands, threads drawn), and its Title, One-line and Description; **the Capture Log lives here, scoped to this Reading** (TJ, 2026-08-10), as "the record" beside "the cloth", and downloads; a Projection and the concept-map kit download at their rows. *(Future: Quilts arrive in this same space.)*
- **04 · Vocabulary** — the User's holdings, unscoped: browse/filter Concepts (full objects) and **Links** (full objects — Label, gloss, use count); recurrence designations; edit Descriptions; the Vocabulary downloads here; the Concepts/Links Overlay renders for faculty only. Concept **merge** is hidden pending its ruling (§2 Concept).

**The chrome:** the header carries the **guide** — the practice loom at `/sandbox`: the real workbench on a real reading, opening with a worked cloth (nothing is written, by construction; a reload restores the example) and walked in eight beats — *arrive · capture · name · thread · project · sort · board · kit* — each ticked by the student's own act, never by Next; and a **menu** (TJ, 2026-08-17) holding **My Loom** — a mirror and an exit: counts, the work grouped by the Reading that holds it (as doors), and **start over** (type-to-arm; it has no download button and must not grow one — downloads happen at the object) — and **About**. Workflows left the header the same day: staff reach `/workflows` from the journey bar's staff group, and a student who types the URL still reads their own flow only, decided server-side; there is no student link. (The old first-run "?" walkthrough is gone — the guide is the tutorial.) **Inside a reading the header stands down** — the journey bar carries the save light and the contextual search (§2 Search), and a house icon beside the search is the way back out to where the chrome is (TJ, 2026-08-19).

*Several modes of reading are still expected inside 01 in future (TJ); the margin rail and the canvas are the first of that family.*

## 4. Faculty and admin view — the staff surfaces, within a selected Course

Capabilities are additive: faculty and admins hold the whole student view over their own work, plus —

1. **Roster** (`/admin` — faculty and admin) — all Sections in the Course: Section → student → **read-only view of their work**, drawn with the same cards the student sees; **invitations** (invite → link → authorized; bulk paste, one email per line, optional Section pre-assignment); Section placement, promotion to faculty, removal (forward-only — a removed member's work persists). Feedback stays human and outside the tool in v1.
2. **Cohort Graph** (`/admin/aggregate` — faculty and admin) — the Overlays at Section/Cohort granularity, with the section picker (§2 Overlays).
3. **Readings** (`/admin/library` — **admin only**) — add/upload PDFs (ingestion + the extraction-score gate); page repair, where damaged pages get model transcriptions admissible only as proposals an instructor reads and accepts before a repaired revision is written; archive (forward-only); label type and metadata (model-drafted metadata likewise proposal-only).
4. **Courses** (`/admin/courses` — **admin only**) — create Courses, their Sections and the Faculty Section; **assign and schedule** Readings (Assigned Date drives the student sort); staging (visible per course). *Known gap, recorded 2026-08-09: faculty cannot see a staged Reading in their own course — Readings and Courses stay admin's.*

Also for staff, in the journey bar's staff group: **Workflows** (`/workflows` — the student, faculty and admin flow diagrams, drawn from `src/lib/workflows.ts`; a student has no link since 2026-08-17, and one who types the URL reads the student flow only) and **Access** (`/access` — the capability matrix and its recorded notes).

---

## 5. Golden path

Invited → authorized → log in. (Try the moves first in the guide — the practice loom keeps nothing.) Library, by week. Open a Reading from its card — the card is the door, and it opens your Cloth for that Reading; browsing without capturing happens inside it. Highlight Passages and capture on the rail — every capture appends to the Capture Log, named or not; Save never requires a Concept; the Passage's note is written where the words are. Identify Concepts (0..n per Passage; reuse across Readings by typing — the tool reports a join, never asserts one; Label optional at capture). Throw Threads on 02, or from a pair picked on the cloth at 03 — naming not required first; Description before Label; the Links accrue in the Link List and their glosses in Vocabulary. Each Thread should read aloud as a sentence. In Knowledge Graph, arrange the Cloth via Projections — tier per-Projection; title the takes and give each its One-line. Download the work where you made it: the Cloth on 01, the Threads on 02, a Projection, its kit and the Capture Log on 03, the Vocabulary on 04. Search from the journey bar — your loom at the Library, this Reading inside it. Start over from My Loom (everything) or from the Cloth's card (one Reading; Concepts, Links and Threads survive).

---

## 6. Red lines (governance — inherited, binding)

1. No model performs the student's interpretive judgment; no model touches search or naming.
2. The tool never decides what a student meant — ambiguity is resolved by asking.
3. Recurrence and counts are **counted, never judged**: no scoring, no completion states, no advice.
4. Empty states are visible, not blocked: "no evidence" Concepts, Unlabeled Passages, unranked Tiers.
5. The student's work is never inaccessible or partial: whole-artifact export always available ("whole-artifact" is read **by object** — each object exports whole where it lives; TJ, 2026-08-10); nothing lost on refresh.
6. No generative content enters the artifact. **Two ratified exceptions**: (a) library ingest (OCR/extraction scoring), (b) model-drafted Reading metadata and page-repair transcriptions, admissible only as instructor-reviewed proposals.
7. Render and count, never decide: derived layout is computed for display and discarded; only student gestures persist geometry; the development history is provenance to explore, never a surface that grades.
