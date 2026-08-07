# Loom — Conceptual Model (build authority)

The object model, semantics, and UI structure for Loom v1. This is the authority on *what things are*; `loom-refactor-spec.md` is the work order for getting the code here. History and decision provenance live outside the repo.

---

## 1. v1 scope

**v1 is the individual core**: Reading → Passage → Concept → Link → Cloth → Projection → export, plus Vocabulary, search, and read-only comparison Overlays.

**Future work (defined, deferred — do not build, do not delete stubs):**
- **Join** — a new Cloth formed by overlaying two Cloths on the same Reading (same or different Users).
- **Quilt** — connecting 2+ Cloths from different Readings via shared Concepts. The v1 substrate ships: cross-Reading Concept recurrence.
- **Shared / co-created Cloths**; **in-tool comments/feedback**.
- **Tongue** — instructor register menus; not in v1.

---

## 2. Objects

**Loom** = Courses + Users.

**Course** = Discussion Sections + a Library. Exists only in the admin/faculty view. v1 instances: *Design Frameworks Fall 2026* and a *Test* course (keeps test data away from students).

**Section (Discussion Section)** = a set of Users; belongs to a Course. v1: 5 student Discussion Sections + **a Faculty Section** (faculty's data-model home; pedagogically they rotate among the Discussion Sections). Every account belongs to a Section. Has a **Roster**.

**Cohort** = the set of all Users of a Course. The widest Overlay comparison set.

**Account** = Email + Login + Role. Access is invite-based: invited → link → authorized. Admin-accessible list of emails/invitations; email is the account list only — no in-tool messaging.

**Role** = Student | Faculty | Admin. Capabilities are additive per account: Faculty always hold the faculty view and **may** additionally hold Student capabilities (their own workspace, e.g. exemplar Cloths).
- **Student** = Account + Discussion Section + Concept List + Link List + Cloths.
- **Faculty** = Account + Faculty Section + faculty view (admin Library · People · Roster).
- **Admin** = Account + tool management (Courses, People, ingestion).

**Reading** = Title + Authors + Publication Date + PDF Source + PDF Cleaned + Assigned Date + Cloths [0..n].
- Types: Assigned History · Assigned Theory · Supplemental · Student-Contributed.
- A **reference-only Reading** is legal: a card with title/author and no PDF, minted by a student so hand-captured passages still have a door; it sits on their shelf only.
- PDFs are behind login, marked for educational use only; ingestion runs the extraction-score gate (deterministic pass + optional LLM judge).
- **Removal is forward-only**: an archived Reading leaves the go-forward Library; existing Cloths and their references persist untouched.
- Renders in the Library as a **Reading card**: metadata + Cloth badge (a count; hover — tap on touch — reveals Cloth Titles) + a **Create Cloth** button (creation is always explicit, never a side effect of opening) + **Open Cloth** buttons (one per Cloth, labeled by Title). A Reading may be opened to read without a Cloth — browsing is not capture.

**Cloth** = Cloth Title + Cloth Description + one Reading + Passages + Concepts (referenced) + Links + Capture Log + Projections.
- Cloth Title ≠ Reading Title — a sentence or headline. Cloth Description = a short interpretation of the Reading.
- One Cloth = one Reading = one User. Multiple Cloths per Reading per User allowed.

**Passage** = Characters (Beginning → Ending Point) + Time Stamp + Concept pointers [0..n] + Notes + Questions + Pull-quote Flag + Passage Tier.
- Anchoring contract: offsets computed against canonical server-extracted page text, hashed (contentHash) so drift is detectable.
- **A Passage with no Concepts is a legal state — the Unlabeled Passage** (Unlabeled Passage 1…N in the Capture Log). It may never gain a Concept, which is fine. Unlabeled Passages appear in the Reading (highlights), the Capture Log (rows), **and in Projections** (an unattached group — nameable, linkable, or left as visible remainder). They have no presence in the Lists or Links.
- Passage Tier: ordinal, may be null; belongs to the Passage.

**Concept** = Label [< 8 words, may be null at capture] + Description/Gloss [< 100 words, may be null].
- **A Concept is a single User-level object.** Passages across Cloths and Readings *reference* it — they do not own copies. The Gloss is written in the Capture Log row but stored on the Concept.
- **Has pointers to its Passages** [0..n] — the evidence trail, crossing the Cloth boundary; the recurrence flag is derived (Passage pointers spanning >1 Reading). Zero Passages is legal (the Concept survives its evidence; show as "no evidence," a visible state, not a block).
- **Has pointers to its Links** [0..n].
- **Identity is by object, not label string.** De-duplication happens at capture time via reuse (existing Concepts tappable). Distinct Concepts *may* share a Label (homonyms) — warn at coin-time, don't forbid. A **merge** action handles discovered duplicates (repoints Passage and Link references; logged).
- A Label need not exist before linking; naming can follow.

**Link** = Beginning Concept + Ending Concept + Link Description [< 100 words, may be null] + Link Label [< 6 words, may be null].
- Links live in a Cloth; directed (from → to); exactly two Concepts — the two Concepts are structural, not a tag.
- Description (the sentence) before Label (the verb phrase) is the encouraged order, not a constraint.
- Links do not have Tiers.

**Thread** = Concept 1 + Link + Concept 2 — subject–predicate–object; should read aloud as a sentence. Backgrounded in the UI (a definition, not a surface).

**Capture Log** — the ledger of a Cloth.
- One row per capture, timestamped: Passage captures (Passage + Gloss + Concept Label, null until named — including Unlabeled Passages) **and Link creations**. Append-only; survives reset and import; best-effort writes with the graph tables as source of truth.
- A chronological link view is derived from the Log by filtering — not a separate object.
- Surfaces in both the Reading tab and the Linking tab.

**Concept List** — belongs to the User, spans Cloths. One row per Concept (the full object). No de-duplication at the List (it happened at capture). Shows the recurrence designation — descriptive, never evaluative. No ranking here: ranking happens only in Projections.

**Link List** — belongs to the User, spans Cloths: the reusable **Link Labels**, tappable at coin-time. Intentional asymmetry with the Concept List: Links (edges) live in Cloths; what recurs is the relationship-verb vocabulary.

**Projection** = Projection Title (a short name) + Projection One-line (the one-sentence take — subject + verb) + Projection Description (a paragraph) + Concept Tiers + a view.
- Views: List View · Hierarchical View · Cards View · other. Nothing in the UI is called a "Map" ("Concept Map" refers only to the external artifact made in Figma from an export).
- One Cloth may have many Projections — each a different take; title the takes.
- **Concept Tiers live here**, per-Projection: the same Concept may be Tier 1 in one Projection and Tier 3 in another.
- A Projection shows the graph **and the Cloth's Unlabeled Passages** (unattached group; a Concept can be coined from within the view; links can be created here — the Linking tab is their home, tabs are homes not walls).
- Display geometry (positions, bends, pins, order) is view state, never part of the graph artifact; derived layout is computed for display and discarded — only student gestures persist geometry.

**Tier** = an ordinal — 1 (Primary) · 2 (Secondary) · 3 (Tertiary) · **may be null** (unranked) · **x** ("Set aside" — deliberately left off).
- Ordinal, not a score: no arithmetic; aggregations are distributions.
- Null ≠ lowest: unranked items display as their own group, never sorted below Tier 3. "Set aside" (x) is distinct from unranked (null): a judgment of exclusion vs. absence of judgment.
- Two uses, one value type: Passage Tiers (on the Passage) · Concept Tiers (on a Projection).

**Export** — both levels: a Cloth (the full data — always the whole artifact, never a slice) and a Projection (a view; basis for a Concept Map in Figma etc.).

**Search** — one capability, four scopes: **this Reading** (in the Reading tab) · **all Readings** · **my Lists** · **everything** (Lists AND Readings, results grouped by kind: Reading text · Concepts · Links · own Passages/Notes/Glosses). Scopes 2–4 live in a **persistent search field** across tabs. Plain full-text search; no model in the loop — a match is a fact about the text.

**Overlays** — read-only comparisons at me + colleague · Discussion Section · Cohort:
- Passages Overlay (highlight heatmap) — Reading tab.
- Concepts Overlay (incl. Definitions where possible) and Links Overlay — Vocabulary tab.
- Also available in the faculty view at Section/Cohort granularity.

---

## 3. Student view — five tabs

**Library · Reading · Linking · Vocabulary · Knowledge Graph**
(Plain activity names in navigation; the weaving metaphor — Cloth, Thread, Quilt, Join — lives in object names only.)

1. **Library** — browse the Course's Readings (sorted by Assigned Date, switchable to Author/Title; searchable); Reading cards with badges and Create/Open Cloth buttons; upload Student-Contributed Readings.
2. **Reading** — the integrated Reading + capture view: highlight Passages (create/update/delete); Notes, Questions, Pull-quote flag, Passage Tiers; associate Passages with new or existing Concepts (including Concepts from other Readings); Labels and Glosses; in-Reading search; Passages Overlay; the Capture Log surfaces here; auto-save throughout.
3. **Linking** — create/update/delete Links; Description then Label; tappable Label reuse; edit Cloth Title/Description; Capture Log surfaces here; export the Cloth.
4. **Vocabulary** — the User's holdings: browse/filter Concepts (full objects) and Link Labels; recurrence designations; edit Descriptions; **merge** Concepts; Concepts and Links Overlays.
5. **Knowledge Graph** — select a Cloth; view/arrange via Projections (List · Hierarchical · Cards); per-Projection Tiers, Titles, One-lines, and Descriptions; Unlabeled Passages as unattached group; create Links in-view; export a Projection. *(Future: Quilts arrive in this same space.)*

## 4. Admin/Faculty view — three tabs, within a selected Course

1. **Library** (write-side of the student Library) — add/upload PDFs (ingestion + extraction-score gate); archive (forward-only); label type and metadata (model-drafted metadata admissible only as a proposal an instructor reads and accepts); **assign and schedule** (Assigned Date drives the student sort); staging (visible per course).
2. **People** — invitations (invite → link → authorized), account/email list, Section assignment (with optional pre-assignment at invite).
3. **Roster** — all Sections in the Course: Section → student → read-only view of their work, rendered as the student view; the Capture Log serves as the snapshot record; Overlays at Section/Cohort granularity. Feedback stays human and outside the tool in v1.

---

## 5. Golden path

Invited → authorized → log in. Library (sorted by Assigned Date; badges show existing Cloths). **Create Cloth** on a Reading card (or Open an existing one; or just read — browsing is not capture). Highlight Passages — every capture appends to the Capture Log, named or not. Optionally tier Passages, add Notes/Questions/Pull-quote. Identify Concepts (0..n per Passage; reuse across Readings; Label optional at capture). Connect Concepts — naming not required first; Description before Label; Labels accrue in the Link List. Each completed triple is a Thread and should read aloud as a sentence. In Knowledge Graph, arrange the Cloth via Projections — tier per-Projection; title the takes and give each its One-line; Unlabeled Passages stay visible as remainder. Export the Cloth or a Projection. Search anything, anywhere, in one field.

---

## 6. Red lines (governance — inherited, binding)

1. No model performs the student's interpretive judgment; no model touches search or naming.
2. The tool never decides what a student meant — ambiguity is resolved by asking.
3. Recurrence and counts are **counted, never judged**: no scoring, no completion states, no advice.
4. Empty states are visible, not blocked: "no evidence" Concepts, Unlabeled Passages, unranked Tiers.
5. The student's work is never inaccessible or partial: whole-artifact export always available; nothing lost on refresh.
6. No generative content enters the artifact. **Two ratified exceptions**: (a) library ingest (OCR/extraction scoring), (b) model-drafted Reading metadata, admissible only as an instructor-reviewed proposal.
7. Render and count, never decide: derived layout is computed for display and discarded; only student gestures persist geometry; the development history is provenance to explore, never a surface that grades.
