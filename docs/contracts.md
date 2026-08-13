# Loom — Contracts

> DESCRIBES THE CODE AS BUILT, not the target. Where this file conflicts with
> docs/loom-model-build.md, the model wins. **P0 landed (migration 0021)**:
> `passage_concept` join (Unlabeled Passages legal; concept delete never deletes passages),
> passage note/question/isPullQuote/tier, `edge.sentence` optional, the `cloth` table
> (absorbing `read`), and the mirror drop (`concept.tier` gone; tiers per-map only).
> **P1 landed**: the label clash-check is gone (ruling 36 — homonyms are warned
> client-side, never forbidden; `mergeConcepts` repairs true duplicates), unified
> search covers the student's own concepts/links/passages (migration 0022 GIN
> indexes + `searchLoom`), and the map view shows Unlabeled Passages as a nameable
> unattached group. **P2 landed**: every student-read string speaks the ruled
> vocabulary (projection · passage · label · description · one-line · Knowledge
> Graph · Capture Log); tongues removed. **P3.12 landed** (action gate, then the
> auth side): `checkCourseFaculty` on the four read actions, `setMemberRole`,
> the admin shell admitting course faculty to its read-side, and Faculty-Section
> invitations enrolling as FACULTY. **P3.13 landed**: reading cards carry the
> cloth badge + Create/Open Cloth; Cloth Title/Description edit on 02 · Linking.
> **P3.14 landed** (ruling 28): student Overlays — the Passages heatmap in the
> Reading tab and the Concepts/Links comparison on 04 · Vocabulary, at Section
> and Cohort only, gated per reading on having coded it yourself.
> **P3 is complete.** Update the invariant, then this file, as each phase lands.
> **Shelf bounce fixed** (2026-08-07 late): client components no longer invoke
> Server Functions for reads — every client read GETs a thin `/api` route via
> `src/lib/reads.ts` (§3), taking reads off the App Router action queue whose
> navigation race (vercel/next.js#90467) bounced students to the library.
> **Faculty walked through a browser** (2026-08-08): `tests/faculty.spec.ts` signs
> in as a FACULTY membership for the first time; `/admin/library` gained the
> `checkAdmin()` redirect it had been missing (§2c).
> **The Vocabulary station reconciled to the model** (2026-08-08, TJ): it is now
> the User's holdings (`VocabularyTab` — concepts, link labels, merge); the cloth
> prompts and the duplicate read editor moved to the Knowledge Graph
> (`ClothReflection`). See §2b-ii. *(This landed as "03 Vocabulary / 04 Knowledge
> Graph" and the two were **swapped later the same day** — see the 03/04 entry
> below. Named rather than numbered here, because that is the pair of numbers
> that moved.)*
> **Workflows tab** (2026-08-08): `/admin/workflows` draws the student, faculty
> and admin flows from `src/lib/workflows.ts`. **Refactor a workflow, update that
> file** — §2c-ii, enforced by `npm run check`.
> **A cloth starts in Reading, and the card has one door** (2026-08-08, TJ):
> the card body opens the reading at **01 · Reading** and the cloth's row beneath
> is **metadata, not a control** — Title (or "Base cloth") + when last edited.
> There is no Create Cloth button: one cloth per reading per user, so there is no
> decision to make. "Just read" is a procedure inside a cloth, not a path around
> it — there is no way into a reading that skips the cloth, which is what
> resolves the reading/cloth overlap. `ClothFold` moved to 01 · Reading
> too, staying on Linking only at the whole weave.
> **Consequence for specs:** `.shelfmain` is a link only when a cloth exists, so
> tests enter through `enterReadingFromCard` in `tests/helpers.ts`, which takes
> whichever door is there — and *creates a cloth* the first time it meets an
> unclothed reading.
> **Overlays are faculty/admin only** (2026-08-08, TJ): students see no Overlay
> control at all. `overlayViewer()` returns `not-staff` for a learner, and the
> two surfaces (the PDF toolbar and Vocabulary's "What others named") render only
> when `getActiveCourse().isStaff` — a *drawing* decision; the actions re-check
> server-side. The per-reading capture gate is retired with them.
> **A section picker, not two buttons:** both surfaces offer *off · All sections
> · each section by name*, and `getPassagesOverlay` / `getVocabularyOverlay` take
> an optional `sectionId` (absent = the viewer's own, the pre-picker meaning).
> That closes the gap where a faculty viewer's band was structurally empty —
> they sit in the Faculty Section, which `peersOf` excludes. Wording followed:
> "that section" / "the cohort", never "your".
> **Workflows moved to `/workflows`** and out of `/admin` entirely: reached from
> the **header, beside About**, on every page. A **student sees the student flow
> only**; faculty and admins see all three. `WorkflowsBoard` takes `showAll`.
> **`FirstRunWalkthrough` is mounted once in the root layout**, so the header's
> "?" has a listener on every page — it was mounted only on the shelf, Keep and
> the workbench, which left that button dead on every `/admin` page. It decides
> for itself where the unprompted pop-up is welcome (not `/admin`, not `/auth`).
> **Stations 03 and 04 swapped** (2026-08-08, TJ): **03 Knowledge Graph, 04
> Vocabulary**. Keys stay legacy — `map` is the graph, `read` is Vocabulary —
> so `?tab=` is unchanged. The workbench footer and student copy follow the bar,
> which numbers itself.
> **Cloth cardinality ratified, not built** (2026-08-08, TJ): **one cloth per
> reading per user, but a cloth may have several users.** The `onePerScope`
> unique already matches the first half; the unbuilt half is **several users** —
> `cloth_member`, membership-based authorization across the 84 ownership checks,
> and an export contract that can name more than one author. A student never
> chooses between "new cloth" and "new projection": a second cloth on a reading
> arises only through co-creation, because a projection already carries more
> interpretive apparatus than a cloth does. Because `(user, reading)` still
> identifies the cloth, **`passage` needs no `clothId`**. See
> [cloth-cardinality.md](cloth-cardinality.md) and the model doc §2.
> **The tab list is settled** (2026-08-08, TJ): 00 Reading and 01 Open merged
> into one **Reading** station (text + capture rail); **05 Weave is hidden**
> pending a decision, its route intact and linked from Keep; **Keep stays** as a
> ratified deviation (D4). Six visible stations, numbered 00–05. See §2b-ii.
> **The rocketcrane branches incorporated as display work** (2026-08-09, TJ:
> "all integrations from rocketcrane need to honor the existing data structures
> and workflows"). Two ideas from the reverted spread canvas (41d5b50) landed
> inside the existing modes — no schema change, no new write path, no new
> capture path. **Margin cards**: page mode's "Cards" toggle draws every
> passage **whose highlight is drawn** on the open spread as a read-only card
> beside its page — the rail reads the mark.js layer and never re-resolves
> offsets, so a passage whose anchor is lost (fuzzy-match failure, cross-page
> capture) has no mark and correctly gets no card; leader-lined to the span,
> clicking through to Your work (closing Find on the way, the
> shared-right-edge rule); geometry is derived per render and discarded (red
> line #7; `src/lib/railLayout.ts`, asserted by `check:rail`). **Matrix zoom re-renders
> nothing**: text layers render once at a zoom-independent base width
> (`renderMode="none"` with our own `PageRaster` canvas beneath), the slider
> is pure CSS transform, and visible pages re-raster sharper 200ms after the
> gesture settles. The spread canvas itself stays retired — "two answers to
> one question" was the objection, so its ideas joined the existing answer.
> The weekly-concept-map branch's spatial view is **pipeline, not built**:
> open-work.md 5.5.
> **The matrix IS the spread canvas now** (2026-08-10, TJ: "rebuild Matrix as
> the canvas"): every 2-page spread on one near-square plane
> (`src/lib/spreadLayout.ts`, asserted by `check:spread`) under ONE transform
> (`SpreadCanvasView`, d3-zoom back in package.json) — the wheel zooms at the
> cursor and drag pans (the map idiom; TJ 2026-08-10, replacing first the
> branch's scroll-pans scheme and then the slider), pinch zooms, and
> **− / + / Fit** buttons drive the same transform (Fit = everything in view,
> recentred; a settled gesture syncs the multiplier back).
> Pages are the raster/text-layer split from the stamp above, retargeted
> analytically off the layout. **Cards follow the toggle into the matrix**:
> rails flank every spread, and `--invk` counter-scales card text against the
> two-page fit while cards grow inward over their own pages — at full
> zoom-out you are reading concepts, not the shrunken text. **Strip is
> hidden** (TJ, 2026-08-10: "the new view supercedes it") — no button sets
> it; the render branch stays for cheap restoration; page mode holds the
> phone. Same ground rules: one capture path, display-only, nothing
> persisted. Reviewed adversarially before landing; the fixes that came out
> of it: matrix boxes are `overflow: clip` (a hidden box is still
> programmatically scrollable, and a Tab-focus or the old scrollIntoView
> effect would shift pixels the transform never learns about — that effect
> is strip-gated now, and `focusPage` centers a page by transform instead);
> touch pans everywhere (the drag-selects-text exclusion is mouse-only —
> touch selection is long-press); the gesture range equals the slider range
> exactly (a wider extent let a deep pinch rest where the settle sync would
> yank it back); and the floating capture button re-seats on every transform
> write, as it always did on scroll.
> **The canvas polish pass** (2026-08-10, TJ): rails are ALWAYS reserved —
> hiding Cards draws into standing margins instead of re-laying the grid
> under the reader's eye; and the raster path's text layer now rides an
> absolutely positioned `.pdf-slot-text` wrapper, because react-pdf pins
> `position:relative` INLINE on its Page div, which beat the stylesheet and
> painted every matrix text layer — highlights, heat, real mouse selection —
> one page-height too low and clipped to invisibility. Found by TJ asking
> where the highlights went; every DOM-level test had passed over it.
> **Search is a field, not a button, where there is room** (2026-08-10, TJ):
> the scopebar/shelf search input is persistent on wide screens (`.searchhost`
> / `.searchtoggle`, globals.css — the button form survives below 900px),
> never autofocuses, and Escape clears it. The in-reading toolbar search
> keeps its compact button and its text-only wording — it searches the
> reading's pages, not the loom.
> **The field searches the loom, and says so** (2026-08-10, TJ: "it is really
> about searching the 'loom' scoped by role" — the placeholder is "search
> your loom…", not an enumeration). Reach as built: reading cards
> (title A > author B > citation/description C) and every page of text;
> your concepts (label > description > note); your link labels (label >
> sentence); your passages (content > note > question); **your cloths**
> (title > description); and **your projections** (Title > One-line > read
> Description) — cloths and projections single-reading only, because the
> whole weave has no reachable surface and a hit must never be a door to a
> room that does not exist. Both queries deliberately unindexed: a handful
> of rows per user, and an index would be a migration. A cloth hit lands on
> 01 · Reading; a projection hit on 03 · Knowledge Graph.
> **The Capture Log moves to 03, scoped to the reading** (2026-08-10, TJ:
> *"we are keeping the capture log, i think this goes in the knowledge graph.
> and is specific to that reading, not all readings"* — and it downloads).
> It rendered on the Knowledge Graph before, but only at the **whole weave**,
> a surface nothing links to; inverting the scope is what makes it reachable.
> The hard part is `src/lib/logScope.ts`: a Passage belongs to a reading but a
> **Concept belongs to the User and a Thread to two Concepts**, so "what I did
> in this reading" cannot be read off the rows. Three rules, in order — the
> act said so (every event now carries the reading it happened in: passages
> from their row, concepts and threads from the route, so **naming a concept
> before any evidence still appears**, TJ's case); its scope said so (cloth
> and projection events carry `scopeKey`); or **the evidence says so** (TJ's
> ruling for pre-stamp acts — a concept places where it has a passage, a
> thread where both ends do, the same rule contextual search uses). Honest
> cost, recorded rather than hidden: an OLD entry can surface in a reading
> later, when evidence arrives — nothing is ever rewritten, but what a reading
> shows of the record can grow; new acts never drift, since the stamp settles
> them as they happen. The Log now downloads too — it was the one object in no
> file at all. **Not rendered in the practice loom**: it reads the real record
> over its own route. Guarded by `check:logscope` (21 assertions) and
> `tests/object-download.spec.ts`. Keep still shows the whole record until it
> dissolves.
> **Download at the object — the three that had none** (2026-08-10, TJ):
> `src/lib/objectExport.ts` adds the **cloth** (on its own card at the head of
> Your work, 01), the **threads** (02 · Linking, where they are thrown) and
> the **vocabulary** (04, unscoped like the tab). A Projection already had its
> file. Each is WHOLE, never a slice: the cloth file carries its passages —
> unlabeled ones included — the concepts they evidence, the threads between
> those, **and its own projections**; a threads file NAMES both ends, since an
> id says nothing away from Loom; the vocabulary carries every concept and
> label with its counted recurrence. Every file now has a **provenance
> header** — student · course · when — where the old whole-cloth export had
> one field, `student`. **Section is deliberately absent**: it is a fact about
> a membership rather than about any act, `course.sections` is empty for a
> learner by design, and a guessed section is worse than none — stamping it
> needs a server read (keep-at-the-object.md). None is re-importable: import
> goes away with Keep, so these are outbound artifacts. Guarded by
> `check:objexport` (29 assertions, incl. that unlabeled passages travel and
> that no advice reaches the file — red line 3) and `tests/object-download.spec.ts`,
> which downloads all three and reads what is inside them. **This is the
> prerequisite for hiding Keep**: a reading with captures but no projection
> now has a file.
> **The practice loom** (`/sandbox`, 2026-08-10, TJ: *"in many games the
> actual interface is used for the tutorial, not screenshots, is that
> possible?"*): the REAL workbench on a REAL reading — it prefers *Learning
> How to Learn* (TJ's pick; Novak & Gowin is the book the board's method comes
> from) and falls back to the first reading with a file. A student really
> drag-selects, really names a concept, really threads, really drags a card —
> and **nothing is written**. `SandboxLoomProvider` supplies the same context
> `LoomProvider` does, so React resolves `useContext` to it and **no tab
> changes at all**; it never imports `@/actions/*`, so a write is impossible
> by construction rather than by discipline. Two things differ, both about
> honesty: a standing `.practiceband` (never a toast — `flash` self-clears in
> 1500ms and a missed notice is indistinguishable from data loss), and no
> search field, because that control reads the student's real rows over its
> own route. Guarded twice: `check:sandbox` fails the build if the provider
> ever gains an action import, a `fetch`, or if the seam stops being exported;
> `tests/sandbox.spec.ts` captures a passage for real and asserts **zero POSTs
> leave the browser** and the student's own loom is byte-identical after.
> Deliberately absent: import and the worked example, which would bring in
> content a student might want to keep. Reset stays — clearing your own
> practice costs nothing.
> **Projections have kinds — ratified, not built** (2026-08-10, TJ): the
> Cloth is the data; a Projection is one way of projecting it, and each
> Projection IS a kind — a **list** (an ordering) or a **board** (a layout;
> cards in tier bands, threads drawn) — separately titled, with One-line and
> Description. Two orderings and three layouts are five Projections. The
> model doc §Projection now says this and retires "Views: List ·
> Hierarchical · Cards", which twice misled builds toward view-switchers. AS
> BUILT the map row still bundles one ordering + tiers + one layout, and 03
> always shows the list and the board together — the unbundling is future
> work (open-work Phase 5), planned-first when scheduled. Language aligned
> the same day: "the board", never "the table" (spreadsheet reading), with
> Novak & Gowin citations added to the model doc and the tab copy — the
> board digitizes their cards-and-arranging practice, and the tiers are
> their rank-ordering.
> **Search is contextual** (2026-08-10, TJ: "the search in the library
> should have a different scope than search in a reading"): the Library's
> field is the whole loom; a reading's field is THAT READING — its card and
> pages, its cloth and projections, and the concepts, links and passages
> evidenced here (concepts here = evidenced by a passage of this reading;
> links here = both ends evidenced here, ThrowTab's rule). `searchLoom` /
> `searchReadings` take an optional sourceId that narrows the caller's OWN
> rows — a forged sourceId narrows, never widens. In reading scope, concept
> and link hits land in this workbench (04 / 02), not on the /weave doors.
> Placeholder follows: "search this reading…". At the whole weave (source
> null) the field stays loom-wide.
> **A Link is an object the student owns** (5.1, built 2026-08-11 over three
> commits; TJ: "links are user-level"). Migration 0024 is **expand-only** —
> the `link` table (label + its own gloss), `edge.linkId`, a backfill from
> the distinct handles, `link_search_idx`. `edge.handle` is DUAL-WRITTEN and
> stays until Step 4 lands (open-work 5.1d); every reader may still fall back
> to it, and `labelOf` / `findLink` / `usesOf`
> ([linkResolve.ts](../src/lib/linkResolve.ts)) are the single shared
> resolution the server and BOTH providers use — the practice loom cannot
> call the server, so a second implementation is how they would drift.
> Three consequences are contract, not decoration. **A Link can exist with no
> Thread using it** (TJ, 2026-08-10) — coined in Vocabulary with a gloss,
> counted at zero, findable in search, offered as a chip. **Coin-time chips
> ATTACH** (`attachLink`), never copy the word; typing a label resolves
> case-insensitively to the Link already owned, and `updateEdge` returns that
> Link so the client's list is right without a reload. **Renaming a Link
> reaches every Thread that references it** (and, while `handle` lives, their
> copies too). Deleting and merging Links are NOT built (open-work 5.1e).
> Search grows a `linkLabels` group beside `links`: the objects, scoped to a
> reading's own threads inside a reading, and unfiltered at the Library where
> a word coined ahead of use is found.
> **The whole weave is out of the app** (2026-08-11, TJ: *"we are removing
> whole weave as it exists in the app because it is poorly defined and not
> supported in the course. it should not be in the app as an idea until the
> faculty and the authors of the app agree on what it means to have a 'full
> weave'"*). Route, station and every branch that drew it: `/weave` deleted,
> `weave` gone from `Station`, `Workbench` takes a reading rather than
> `WorkbenchSource | null`, and the `wholeWeave` conditionals came out of
> ThrowTab, MapTab, ClothFold and ClothReflection. `WHOLE_WEAVE` survives only
> as the internal scope of a surface that is not a reading — the Library —
> and no student surface writes at `scopeKey ''`. Rows already written there
> stay where they are and are not rendered; TJ: *"i am not at all worried
> about losing whole weave."*
>
> What that ruling protects is named in the same message: *"i am worried about
> losing meaningful activities related to reading, passage capture, concept
> labeling, link labeling, building threads, organizing concepts and threads,
> and building projections from a readings cloth."* Hence **4a, the same day:
> every act records the reading it happened in.** Editing, merging and
> deleting a concept, coining and rewording and removing a thread's label,
> coining a Link and giving it its gloss — all seven placed only by EVIDENCE
> or (the two link kinds) nowhere at all, so the work vanished from the log
> whenever the concepts involved had no passage in the reading. Rule 1 of
> `eventBelongsToReading` was always meant to win and now has something to win
> with. Coining a Link by TYPING a label on a thread also recorded nothing at
> all before this — `resolveLink` minted the row silently — and now emits
> `link.coin` like every other coinage.
>
> **The Library's search is unchanged in scope and changed in destination.**
> It still searches the whole loom — readings, cloths, projections, concepts,
> link labels, threads, passages — because the Library is the entry point to
> the whole contents (TJ). What moved is where a hit LEADS: the three
> user-level kinds pointed at `/weave` for want of anywhere else, and now open
> the reading their work lives in, resolved server-side as **where the first
> evidence is** (`sourceId` on each hit). A hit with no reading — a concept
> named ahead of its evidence, a Link nothing uses yet, an untethered passage
> — is still shown, as a dashed row that says why it is not a door.
>
> **Keep is deleted, and with it import, reset and the worked example**
> (2026-08-11, closing keep-at-the-object §6 step 6). Gone: `/keep`,
> `KeepPage`, `KeepTab`, `src/lib/example.ts`, the four server actions
> (`importGraph`, `importMapArrangement`, `resetGraph`, `loadWorkedExample` —
> 428 lines), the four provider methods and their context members in BOTH
> providers, `scripts/check-import-compat.ts` and its slot in the check chain,
> and the whole-graph half of `graphExport.ts` (`buildExport`,
> `buildMarkdown`, `exportFilename`, `parseImport`, `parseAnyImport`,
> `ParsedImport`, `ParsedMapImport`) — that file is now the per-Projection
> export and `scopeLabelOf`, 211 lines from 815.
>
> **What deliberately stays.** `HistoryPanel`'s cases for the four dead event
> kinds: nothing emits them again, but the Capture Log is append-only and a
> student who imported or reset still has those rows. `buildMapExport` and its
> two siblings — the projection download the ruling names explicitly. And the
> capability row, rewritten rather than deleted: `keep-export` ("Export,
> import, reset your own cloth", gated on `resetGraph`) became
> `object-download`, gated on `getUserLoomData`, because every download is
> built in the browser from that read and there is no export endpoint to gate.
>
> **The worked example's replacement.** Its only exit was the reset that went
> with Keep, so it could not survive; the practice loom (`/sandbox`) answers
> the need, and the Library's "New to this?" card now opens it. That card is
> also the FIRST door to `/sandbox` in the app — the student flow has drawn a
> `library → practice` edge since the practice loom was built, and nothing
> took it until now. Still open, and TJ's: the practice loom starts EMPTY, so
> it teaches the gestures but shows no finished cloth (open-work).
>
> **The practice loom becomes the guide** (2026-08-11, TJ: *"the guide should
> always be available, like the tutorials in any game. if the sandbox is the
> guide, then it should be clearly accessible. it is the instructions,
> right?"*). Two changes. A **permanent door in the header**, beside the
> walkthrough, on every page — `/sandbox` had been reachable only by typing
> the URL. And a **worked cloth** it opens with, on *Oh, the Places You'll
> Go!* (TJ's pick): four passages, three concepts, two threads, a Link with a
> gloss, a cloth and a projection with tiers.
>
> The passages are REAL substrings of that reading's text layer, located at
> their true offsets by `buildPracticeCloth`
> ([practiceCloth.ts](../src/lib/practiceCloth.ts)), so they highlight in the
> actual PDF — the practice loom's whole argument is that the capture path is
> the genuine one. It is built on the SERVER in `/sandbox/page.tsx` and handed
> down as a prop: `SandboxLoomProvider` must never read a database, and
> `check-sandbox.ts` asserts both that seam and the header door. A quotation
> that stops matching is dropped and the example thins; under two passages the
> loom opens empty, as it did before. Nothing is persisted, so a reload
> restores the example — which is the "start over" this place would otherwise
> need a button for.
>
> **And the guide itself** (2026-08-11, TJ: *"the guide should walk through
> opening a reading, highlighting text, labeling a concept, building a thread,
> sorting the knowledge graph, making a projection, and saving materials for a
> concept map"* · *"by saving i meant the kit"*). Seven beats
> ([practiceGuide.ts](../src/lib/practiceGuide.ts)), rendered as a band under
> the practice band — a row of its own rather than a floating card, because
> fixed chrome in this app has form for covering the control it is pointing
> at. The band moves the workbench to each beat's station as it goes.
>
> **Beats tick when the student ACTS, not on Next.** Every beat carries a
> predicate over the loom's own state, measured against a baseline frozen when
> the guide opens — the practice loom already holds four passages, so the
> question is never "are there any" but "is there one more than when you
> began". An absolute test would tick the whole guide green on load, which is
> the specific bug `scripts/check-practice-guide.ts` exists to catch.
> Two beats cannot be seen in the state and are raised by the interface:
> `loom:capture-open` from `CaptureModal` (the dialog only opens from a
> selection, so its appearance IS the highlight) and `loom:mapkit-copied` from
> `MapTab`.
>
> **Highlighting and labeling stay two beats** — they are two decisions, which
> words to take and what to call what they evidence — but the second happens in
> the dialog the first opened, and the guide says so rather than implying two
> separate screens. The dialog no longer *requires* the second (below), so the
> beat asks for it and says it can wait.
>
> **Rebuilt to the standard pattern** (2026-08-12, TJ: *"this is not a great
> guide… is this not a standard/best practice for these kinds of thing or am i
> inventing something?"* — he is not). A guided tour has a settled anatomy and
> the first version had one part of four. Now: a **masked backdrop** (four
> inert panes with a genuinely empty hole — not a box-shadow, whose spread is
> not hit-tested and would block the cutout while leaking everything else, and
> not an SVG, which re-rasterises a viewport-sized path every frame), a
> **popover anchored to the target with a beak** that keeps pointing after the
> card is clamped on screen, and **one primary action** that fills and pulses
> the moment the beat's own predicate says the gesture landed.
>
> **Where the pattern bends, deliberately.** Beat 2 teaches drag-selecting
> text, so the cutout stays fully interactive and the panes vanish for the
> duration of a drag that began inside it — they block by geometry and carry
> no handlers, because cancelling events kills selection outright. Beat 3's
> target is inside the app's own scrim, which already IS the constraint, so
> that beat declares `overlay: "none"` rather than dimming twice. The rungs
> are 6100–6102: above `.pdf-shell.fullscreen` (6000), or `f` would delete the
> whole guide, and below `.info-scrim` (10000) and the capture button (9000).
>
> **Four sync bugs went with it**, each found by tracing a student's actual
> path. `sort` counted tiered concepts — the worked cloth tiers them all, so
> following the instruction changed nothing and pressing a lit chip *un*-tiered
> one, which DID change the count: the beat went green for undoing the example.
> It compares tier-per-concept now, over the keys both sides share, so deleting
> a concept is not mistaken for sorting. `name` demanded a NEW concept, so
> reusing one — which the dialog's own datalist invites — could never finish
> it; a passage landing is the test. `capture` latched on the dialog opening,
> so cancelling left it green; the signal tracks the dialog's life and
> `CaptureModal` says when it closes. And the 900ms auto-advance is gone: it
> re-armed on any state change and threw you forward again whenever you pressed
> Back.
>
> **A beat is a CHAIN of targets**, because several are more than one gesture —
> the thread is three (tap the warp, say how they hang together, throw it) and
> read as one, which is what "out of sync with the activities they describe"
> was pointing at.
>
> **And on the thread beat the RING WALKS those three** (2026-08-12, TJ: *"the
> glow should move with this"*). The hole stays the union — all three gestures
> belong to one move, and closing the dim in behind the student would strand
> anyone who picked the wrong pair — but the ring and the card's copy advance
> with the work: warp → the link description → Throw it. A `GuideMove` carries
> its own selector, its own line, and a `done` read straight off the page: the
> bench's `.sleeper.asleep` already says whether a pair is loaded, and the
> textarea's value already says whether it has been described, so nothing new
> is threaded through the app to tell the guide what it can see. The last move
> declares no `done` — the beat's own predicate is what finishes the beat — and
> `scripts/check-practice-guide.ts` asserts exactly that, plus that every
> move's selector exists in `src/`.
>
> **Capturing does not turn the page** (2026-08-12, TJ: *"stage 3 of guide does
> not stay on page where passage was captured"*). The effect that turns to a
> page with words on it — the practice reading opens on two covers, where "drag
> across a line" points at a picture — depended on `state.passages`, so the
> instant a capture landed it re-fired and focused the FIRST passage carrying a
> page number, which is one of the worked cloth's, elsewhere in the book. The
> student was thrown off the page they had just taken words from, mid-beat. It
> fires on beat arrival only, and only when there is no text on screen to work
> with. The journey reads `data-page-number` before the drag and after the save
> and fails if they differ.
>
> **The band says where you are, and offers the way out.** Both halves are
> TJ's, the same day. The promise it used to make went — *"of course everything
> should work. i dont expect tutorial to keep my work"* — leaving one sentence.
> And it gained an **exit guide** (*"add an 'exit guide' button"*): until then
> the only exits were the browser's Back button and the header, and nothing on
> the page said the guide was a place you could leave. The band takes no
> pointer events and the exit is the single exception, which the guard asserts,
> because a button inside `pointer-events:none` chrome is a picture of a
> button. The yield now fades the **prose** rather than the whole band, for the
> same reason: an escape hatch at sixteen per cent is worse than the occlusion
> the yield exists to prevent.
>
> `scripts/check-practice-guide.ts` asserts every selector in every chain
> actually exists in `src/` (a dead target used to render no ring, and would
> now dim the screen with no hole), that the rungs stay ordered against
> fullscreen and the scrim, that the panes block and the ring does not, and
> that a dialog-targeted beat suppresses the mask. `tests/sandbox.spec.ts`
> drags with a **real mouse** across the cutout and out past its edge: the old
> spec synthesised selection with `createRange`, which bypasses hit-testing and
> would have passed a mask that blocked every drag a student makes.
>
> **Corrections the same day, all TJ's:** the header door says **guide**, not
> "practice" — it names what the student is looking for rather than the
> sandbox it runs in. The guide **floats** rather than displacing the layout
> ("like floaters with a small glow"): a card in the corner furthest from its
> target, plus a glow ringing what the beat is talking about, so the copy
> points ("the glowing field") instead of gesturing ("on the left"), which is
> wrong on a narrow screen anyway. **The card takes no pointer events** — only
> its own buttons do. A floater in a corner will sooner or later sit over a
> control, and at 1280×720 it lands squarely on the PDF's Next Page arrow;
> choosing a corner cannot fix that in general, so the card is made incapable
> of eating anything instead, and `tests/sandbox.spec.ts` clicks that arrow
> through it. Beats also scroll their target into view — the kit button lives
> under the whole board, and the glow was landing three thousand pixels below
> the fold.
>
> **The concept-map kit is a download**, not a clipboard copy (TJ) — it is the
> material you draw the real map from, so it belongs in the same folder as the
> projection rather than in a buffer one Ctrl-C destroys.
> `<student>-<projection>.concept-map-kit.md`. "Copy your read" is untouched.
>
> **About was rewritten and made solid.** It was the only overlay in the app
> using `.card` (background `rgba(255,255,255,.5)`), so the scrim showed
> through it — every other one uses `.info-dialog`, which is paper. Its copy
> described an app that had moved on: "Bite-Sized Capture" (a pun on the
> old spelling of Passage), "Throw" and "Read" as station names, a
> whole-graph export.
> It now names the five stations, says plainly what Loom will not do, and
> keeps the theory — Bucciarelli, Wenger, Star, with Novak & Gowin added for
> the board.
>
> **A passage does not require a concept** (TJ, 2026-08-12). The model has
> always said so — an Unlabeled Passage is a legal, first-class state — and
> `CaptureModal` was the one surface in the app that refused it, holding Save
> disabled until a name was typed. Save is now always live and reads **"Save
> unlabeled"** when the field is blank; the concept's own description is not
> asked for when there is no concept; and the passage carries **its own note**
> (`#capturePassageNote` → `passage.note`), so what you have to say about the
> words is not forced through a concept you may not have yet. The toast says
> what landed rather than what it lacks. `tests/practice-guide.spec.ts` keeps a
> passage with no concept at all.
>
> **The beats are eight, and each is one move.** Three rulings the same day.
> *Making* a projection was folded in with *sorting* it, so the guide asked for
> a press and then measured a tier — the split gives `project` its own beat at
> a glowing **+ New projection**, which arrives empty so every chip after it is
> a real press. `board` was added because arranging the cards **is** the
> thinking (Novak and Gowin used cards on a table) and nothing else in the
> guide asked for it; its predicate is a card's position changing, the one
> student gesture the graph does not otherwise record. And the cloth beat —
> "say what you make of it" — is **gone**: TJ, *"it is a nice to have in a
> cloth not a must have."* Arrive · capture · name · thread · project · sort ·
> board · kit.
>
> **Four things a walk through the deployed build found**, all TJ's, none of
> them caught by a test that watched only predicates. **The guide had no
> ending**: the last beat said "Done. Press next." over a button `disabled`
> because there was nowhere to advance to (*"the instructions are to press
> next, but the next is not active"*). It closes the guide now, and says what
> the student is left holding. **Pip 1 went nowhere**: every other pip
> navigates to where its beat happens, and that one silently did not, showing a
> beat about a glowing card from inside the workbench — the same conflict that
> got the old first beat rewritten. It returns to the Library, and nothing is
> lost, because the loom's state lives in `SandboxLoomProvider`, above the
> stage. **The mask swallowed the wheel**: a pane is `position:fixed` and so is
> not in the scroll chain of what the page actually scrolls (a `<main>`, not
> the document), so scrolling worked over the cutout and did nothing over the
> dim. The mask constrains what you can press, not whether the page moves.
> **And the glow can still be scrolled away from** — the practice reading is
> the last of twenty-four cards, so the Library opens at its foot and scrolling
> up loses it, leaving "press the glowing card" with nothing glowing. The beat
> re-finds its target now (it waits for it, rather than looking once 260ms in
> and giving up, which is why a rebuilt shelf came back dark), and when the
> target is on the page but off the screen the card grows a **show me** button
> — TJ's own suggestion, and better than dragging the page back under a student
> who just chose to look elsewhere. The notice also yields when the cutout
> reaches it: it must ride above the mask (13% alpha, so underneath it a cutout
> boundary drew a seam down the sentence) and above the mask it was covering
> the kit button it was ringing.

The complete inventory of every surface a caller can rely on: database schema, server
actions, API routes, export/import file formats, and the invariants the code enforces.
Companion to the *why* — now [loom-model-build.md](loom-model-build.md) (authority) with
[loom-refactor-spec.md](loom-refactor-spec.md) (work order); historically
[archive/loom-spec-v1.md](archive/loom-spec-v1.md). This is the *what, exactly*.

**As of:** `dev`, 2026-08-08 (end of session) — P3.12 auth-side, P3.13, P3.14, the shelf-bounce fix, the faculty browser pass, and a day of TJ's rulings: station 03 → Vocabulary, Reading and Open merged, Weave hidden, Linking scoped to its reading, concepts before evidence, the cloth on the card, Overlays to faculty with a section picker, 03/04 swapped, and `/workflows`. See NEXT_SESSION.md's 08-08 addendum for the ordered list.
Re-stamp when it reaches master. Line numbers cite that branch and will drift; names
and shapes are the contract, line numbers are a courtesy.

Conventions used below:

- All ids are `text` primary keys defaulting to `crypto.randomUUID()` unless noted.
- `Tier` = `'' | 'p' | 's' | 't' | 'x'` (unsorted · primary · secondary · tertiary · set
  aside), per-map only. `PassageTier` = `'' | 'p' | 's' | 't'`, on the passage itself.
- The "Mirror" (expand-phase dual-write of `concept.tier` + the `read` row from the
  oldest whole-weave map) was RETIRED by migration 0021 — `concept.tier` and the `read`
  table no longer exist; the whole-weave paragraph lives on the whole-weave `cloth` row.
- Server actions are HTTP-POSTable endpoints. "Auth" below is what the action itself
  enforces; nothing else stands in front of it (there is **no middleware.ts**).
- **Client components never invoke a read action directly.** Every read a client
  component makes goes through [src/lib/reads.ts](../src/lib/reads.ts) — a GET
  against a thin `/api` route (§3) that calls the same action function server-side,
  so the auth column below holds for both transports. Reads dispatched as Server
  Functions ride the App Router's action queue, and a queued read racing a `<Link>`
  navigation corrupts the queue's canonical URL (the shelf bounce;
  vercel/next.js#90467). Mutations stay direct action calls.

---

## 1. Database schema — [src/db/schema.ts](../src/db/schema.ts)

Migrations `drizzle/0000`–`0016`, applied via `drizzle-kit migrate`.
`drizzle.__drizzle_migrations` records which migrations *ran*, which is not the same
as what the database is *shaped* like: `scripts/apply-db-compat.ts` bootstraps tables
directly, and the `source_page` it creates has never carried the foreign key
`schema.ts` declared from 0000. That is what 0016 is for — it adds that key and
`passage`'s, after deleting the orphans the missing constraint had been accumulating.

### 1a. Auth (NextAuth v4, database sessions)

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `user` | id · name · email NOT NULL · emailVerified · image · role default `'USER'` | PK id. **No unique on email.** `role` (`USER`/`LEARNER`/`INSTRUCTOR`/`ADMIN`) is the authorization source of truth |
| `allowed_email` | email PK · createdAt | Legacy site-wide allowlist. Read by the sign-in gate; **no admin UI manages it** |
| `account` | NextAuth adapter columns | PK (provider, providerAccountId) |
| `session` | sessionToken PK · userId CASCADE · expires | Database session strategy (adapter present, no `session.strategy` override) |
| `verificationToken` | identifier · token · expires | PK (identifier, token) |

### 1b. Course / roster

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `course` | id · slug UNIQUE · name · term `''` · description `''` · isArchived false · createdAt | |
| `section` | id · courseId CASCADE · slug · name · lead `''` · createdAt | UNIQUE (courseId, slug) |
| `course_membership` | courseId CASCADE · userId CASCADE · sectionId SET NULL · role default `'LEARNER'` · createdAt · **removedAt nullable** | PK (courseId, userId). `removedAt` = soft removal (0013); every membership read filters `IS NULL`. `role = 'FACULTY'` (set via `setMemberRole`, P3.12) grants the course's read-side admin actions; every course carries a `faculty` Section (ruling 18, ensured lazily) |
| `course_allowed_email` | courseId CASCADE · email · sectionId SET NULL · createdAt | PK (courseId, email). An invitation. Grants app access to that email in **any** course context until deleted |

### 1c. Reading library

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `source` | id · title · author `''` · sourceReference `''` · description `''` · isDescriptionVisible true · metadataProvenance `''` · isArchived false · **storageKey nullable** · **isOwn false** · createdByUserId SET NULL · createdAt | `storageKey NULL` = reference-only card (no PDF). `isOwn` = student-minted, visible on that student's shelf only |
| `course_source` | courseId CASCADE · sourceId CASCADE · isVisible true · week nullable · isCore true · position 0 · createdAt | PK (courseId, sourceId). Week/visibility/core are per-course facts on the join, never on the reading |
| `source_page` | id · sourceId CASCADE · pageNumber · textContent · contentHash · createdAt | Extracted text per page; anchor reconciliation and search read it. `textContent` carries pdf.js's line boundaries — a `
` after each `hasEOL` item — except on a page whose own items already contain a newline, which keeps the old separator-free join because the newline could not then be taken back out. `contentHash` is therefore **not** a hash of this column: every writer stores `hashText(textLayerProjection(textContent))`, the browser's text-layer string, which is what `passage.pageContentHash` is compared against. 0016 gives the CASCADE its actual constraint and indexes (sourceId, pageNumber). No unique on (sourceId, pageNumber). GIN index `source_page_search_idx` on `to_tsvector('english', textContent)`; `source` carries the weighted `source_search_idx` twin (title A · author B · reference/description C) — the search queries must repeat these expressions verbatim |
| `source_score` | sourceId PK/CASCADE · status `'heuristic'\|'judged'\|'unscorable'` · coverage/legibility/anchorability/structure int nullable · overall real · pass bool nullable · notes · judgeNotes · judgeModel · metrics jsonb · scoredAt | 1:1 with source. Unscored dimension = NULL (abstention, never a default). `pass` requires every scored dimension ≥ 3 — not compensatory — **and** non-null `coverage` and `legibility`, since "can a student quote this?" has no answer without them. `legibility` abstains when there is too little text to confirm the characters read as language; it used to be granted a 5, which is how 693 characters of OCR noise scored 5/5/5 and passed. `pass NULL` is a third verdict, rendered **Unverified**. `metrics` carries the structural probe only when the scorer held the PDF bytes |

### 1d. The graph (the artifact — archived spec §6 `graph`)

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `concept` | id · courseId SET NULL · userId CASCADE · label · def `''` · note `''` · createdAt | No tier (0021 dropped the mirror column — tiers live on `map.tiers`). One-label-one-concept is enforced in code (`updateConcept` clash check), **not** by a DB unique — ruled for replacement by warn-don't-forbid (P1.7) |
| `passage` | id · courseId SET NULL · userId CASCADE · source `''` (free-text citation) · **sourceId SET NULL** (the reading it belongs to) · location `''` · content · pageNumber/startOffset/endOffset/pageContentHash nullable (anchor) · **note `''` · question `''` · isPullQuote false · tier `PassageTier` `''`** · createdAt | A passage belongs to a reading; a concept does not. Concepts attach via `passage_concept` (0..n) — zero rows = an Unlabeled Passage, a legal state. Export field is `text`, column is `content` |
| `passage_concept` | passageId CASCADE · conceptId CASCADE · createdAt | PK (passageId, conceptId); index on conceptId. The passage↔concept pointers of ruling 37 — refile adds a row, never copies a passage; deleting either end removes pointers only |
| `edge` | id · courseId SET NULL · userId CASCADE · fromId CASCADE · toId CASCADE · handle `''` · sentence `''` NOT NULL default `''` · createdAt | Directed. Sentence optional at throw (P0.3 golden path); handle is the coined term |
| `cloth` | id · courseId SET NULL · userId CASCADE · scopeKey `''` · title `''` · description `''` · createdAt · updatedAt | UNIQUE NULLS NOT DISTINCT (userId, courseId, scopeKey). The per-scope workspace identity (P0.4); absorbed the `read` table in 0021 (whole-weave row's text → whole-weave cloth's description) |
| `map` | id · courseId SET NULL · userId CASCADE · **scopeKey `''`** · name · read `''` · essence `''` · **tiers jsonb `Record<conceptId, 'p'\|'s'\|'t'\|'x'>`** default `{}` · createdAt · updatedAt | scopeKey `''` = whole weave, else sorted comma-joined sourceIds. Absent tier key = unsorted. Non-unique index (userId, courseId, scopeKey) — plural siblings are the point |

### 1e. Projections & history (archived spec §6 `views` + development history)

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `view` | id · courseId SET NULL · userId CASCADE · key (`'cardTable'` \| `'map:<mapId>'`) · **data jsonb** `{positions:{conceptId:{x,y}}, bends:{edgeId:{dx,dy}}, order?:string[], pins?:string[]}` · updatedAt | UNIQUE NULLS NOT DISTINCT (userId, courseId, key). Only student gestures write here (red line #7). `x` is proportional 0..1 (>1.5 read as legacy pixels) |
| `graph_event` | id · courseId SET NULL · userId CASCADE · kind · entityType `'concept'\|'passage'\|'edge'\|'graph'\|'map'\|'cloth'` · entityId nullable · payload jsonb · at | Append-only. Survives reset and import. Kinds: `concept.create/rename/update/merge/delete`, `passage.capture/refile/unfile/attribute/delete`, `edge.throw/coin/update/delete`, `cloth.update`, `map.create/retier/rename/update/delete/import`, `graph.reset/import/example`. Historical kinds still in the record: `passage.create`, `concept.retier`, `read.update`. Migration **0023** renamed the `byte.*` kinds already written, so no row spells it the old way |

---

## 2. Server actions

Five `"use server"` modules: `src/actions/{loom,sources,admin,courses,overlays}.ts`.
Three different guard styles exist (see §5 Invariants and the audit):
`checkAdmin()` **redirects** to `/` on failure; the two `requireAdmin()`s **throw**.

### 2a. Learner graph — [src/actions/loom.ts](../src/actions/loom.ts)

Auth: every action starts with `getUserId()` → `getServerSession`. **Dev backdoor:** with
no session and `NODE_ENV !== 'production'`, it impersonates the `tjm@tjmcleish.com`
user row (line ~19). Course context: `resolveActiveCourseId()` at the top of every
action — also performs orphan adoption (see invariant 5). **No `revalidatePath`
anywhere in this file** — freshness is client state + `getUserLoomData()` re-fetch.

| Action | Params | Returns | Writes / events |
| --- | --- | --- | --- |
| `getUserLoomData()` | — | `{concepts, passages, edges, maps, cloths, views}` — rows ordered `createdAt, id` (capture order is meaning); each passage carries `conceptIds` folded from `passage_concept` in filing order | read-only; drops orphaned `map:<id>` view rows from the response |
| `createConcept` | `{label, def?, note?}` | inserted `Concept` | `concept.create` |
| `updateConcept` | `id, Partial<{label,def,note}>` | void | no clash check (ruling 36 — homonyms legal; the client warns at coin-time); `concept.rename/update` |
| `mergeConcepts` | `sourceId, targetId` | fresh `getUserLoomData()` | one batch: pointers repoint (collisions dropped), edges repoint, target inherits missing def/note, source deleted; prunes views/tiers; `concept.merge` {fromId, fromLabel, intoLabel, pointersMoved} |
| `deleteConcept` | `id` | void | refuses while an edge endpoint; **passages survive** — join rows cascade, they become Unlabeled; prunes views + map tiers; `concept.delete` |
| `createPassage` | `{conceptIds?, source, sourceId?, location, content, anchor fields?, note?, question?, isPullQuote?, tier?}` | inserted `Passage` (+`conceptIds`) | zero conceptIds = Unlabeled Passage; passage + pointers land in one `db.batch`; verifies concept ownership; reconciles offsets against `source_page` when hashes agree; `passage.capture` (fires for every capture, named or not — `passage.create` is a historical kind) |
| `refilePassage` | `passageId, conceptId` | the same `Passage` with the pointer added | inserts one `passage_concept` row (ruling 37 — never copies); throws if already filed; `passage.refile` |
| `unfilePassage` | `passageId, conceptId` | void | removes one pointer — refilePassage's inverse; the passage survives (possibly as an Unlabeled Passage); OpenTab shows this instead of "remove passage" when a passage has >1 filing; `passage.unfile` |
| `attributePassages` | `passageIds[], sourceId` | count updated | fills `sourceId` **only where NULL**, only by student act, and only to a reading the student may see — `authorizeSourceAccess`. Until 0016-era it checked merely that the id existed, which admitted another student's private upload; `passage.attribute` |
| `deletePassage` | `id` | void | `passage.delete` |
| `createEdge` | `{fromId, toId, sentence?}` | inserted `Edge` | sentence defaults `''` (P0.3 — connect first, describe when ready); `edge.throw` |
| `updateEdge` | `id, Partial<{handle, sentence}>` | void | `edge.coin` when handle present, else `edge.update` |
| `deleteEdge` | `id` | void | prunes bends; `edge.delete` |
| `saveCloth` | `{scopeKey, title?, description?}` | upserted `Cloth` | one row per (user, course, scopeKey); title trimmed to 200; replaces the removed `saveRead`; `cloth.update` |
| `createMap` | `{scopeKey, name}` | `LoomMap` | max 60 maps → throws; name trimmed to 80; `map.create` |
| `updateMap` | `id, Partial<{name, read, essence, tiers}>` | void | single map update — no mirror (0021); tiers sanitized to known concepts, diffed for the `map.retier` payload; `map.retier/rename/update` |
| `deleteMap` | `id` | void | batch: map + its `map:<id>` view; `map.delete` |
| `saveView` | `key, CardTableView` | void | key must be `cardTable` or an owned `map:<id>` else throws; **no event** (projections) |
| `getGraphEvents()` | — | events oldest-first, with synthesized `synth-*` creates for pre-history rows | read-only |
| `resetGraph()` | — | void | `graph.reset` event first (with counts), then batch-delete edges/passages/concepts/maps/cloths/views (passage_concept cascades). **History survives** |
| `importGraph` | `ParsedImport` (client-parsed) | fresh `getUserLoomData()` | limits `{concepts:400, passages:2000, edges:2000, maps:40, cloths:40}`; whole-graph replace in one batch; see §4e |
| `importMapArrangement` | `ParsedMapImport` | `{data, mapId, scopeKey, skipped}` | additive sibling only; see §4f |
| `loadWorkedExample()` | — | fresh `getUserLoomData()` | refuses unless the loom is empty; mirror-consistent by construction; `graph.example` |

### 2b. Library — [src/actions/sources.ts](../src/actions/sources.ts)

`requireAdmin()` = session `isAdminUser` else DB role re-read; throws `Unauthorized`.
`revalidateLibrary()` → `/admin/library`, `/admin/courses`, `/`.

| Action | Params | Returns | Auth |
| --- | --- | --- | --- |
| `getLibrarySources` | `{includeArchived=false}` | `Source[]` | admin |
| `getLibraryOverview` | `{includeArchived=true}` | readings + score + course links, all courses | admin |
| `getReadingsByCourse()` | — | `Map<courseId, (Source & {link})[]>` week→position→title | admin |
| `getCourseSources` | `courseId?` | `(Source & {link})[]` | admin |
| `getSources` | `courseId?` | shelf rows: learners see `isVisible` only + their own `isOwn` readings; admins see hidden too | session-optional |
| `createOwnReading` | `{title, author?, sourceReference?}` | `{id, title}` | **session only — deliberately not admin-gated** (reference-only card, no PDF; called from the shelf's "a reading of your own" form) |
| `registerOwnUploadedReading` | `{storageKey, filename, title?, author?, sourceReference?}` | `{id, title}` | **session only** — the PDF-backed own reading: same prefix/size/magic-byte checks and ingest as the admin path, but always `isOwn`, never added to a course; heuristic score only (no judge pass on private uploads) |
| `createSource` | metadata + `File` | `Source` | admin, **checked before the blob write** (audit S-5 ordering fixed). No callers; effectively dead but POSTable |
| `registerUploadedReading` | `{storageKey, filename, title?, courseId?}` | `{id, title}` | admin; re-checks prefix + real blob size, deletes oversize orphans |
| `rescoreSourceAction` | FormData `sourceId` | void | admin. Full **re-ingest** — re-extracts page text, rebuilds the cover and rescores from the current PDF, then queues the judge. A rubric replay over stored text could never show the effect of a repaired file. **Throws** when the reading has highlights, naming `scripts/reingest-readings.ts --force` as the deliberate route; a reference-only card (no `storageKey`) falls back to the replay |
| `draftMetadataForSource` | `sourceId` | `MetadataDraft` | admin; **writes nothing** (red line #6 exception (b) — proposal only) |
| `draftMetadataForOwnSource` | `sourceId` | `MetadataDraft` | **session, owner of an `isOwn` reading only**; writes nothing — same #6 exception, the student is the reviewer |
| `updateSourceMetadata` | FormData | void | admin |
| `updateOwnReadingMetadata` | `{sourceId, title, author?, sourceReference?, metadataProvenance?}` | `{id, title}` | session, owner + `isOwn` only; title/author/reference — an own card has no visible description |
| `addSourceToCourse` / `removeSourceFromCourse` | FormData | void | admin |
| `setCourseSourceVisibility` / `updateCourseSourceSchedule` | FormData | void | admin |
| `setSourceArchived` / `deleteSource` | FormData | void | admin; delete removes blob + cover + course links |
| `getSourceFile` / `getSourceFileStream` | `sourceId` | `{source, buffer\|stream}` | `authorizeSourceFile`: admin → anything; **no session outside production → allowed** (dev skip); own reading → allowed; else active membership in a course where the reading `isVisible` |
| `getSourceForCover` | `sourceId` | `{source}` — authorization + row, **no bytes** | same `authorizeSourceFile`; exists so the cover route's cache hit never downloads the PDF |
| `authorizeSourceAccess` | `sourceId` | `Source` | **exported, therefore POSTable.** The membership/ownership rule on its own, with no file requirement — admin sees anything; a student sees their own reading, or one published visibly into a course they are currently in. Throws `Not found` rather than `Forbidden` throughout: whether a reading exists is not itself public. `authorizeSourceFile` is this plus a `storageKey` check |

Upload constants ([src/lib/readingUpload.ts](../src/lib/readingUpload.ts)):
`MAX_READING_BYTES` = 20 MB, prefix `readings/`, PDFs only — enforced browser-side,
token-side, and at registration (three places that don't trust each other).

Search — [src/actions/search.ts](../src/actions/search.ts): plain Postgres FTS
(`websearch_to_tsquery` / `ts_rank` / `ts_headline`, GIN expression indexes from
migration 0014 — deliberately no model anywhere near it). Both actions scope
through `getSources()`, so search can never surface a reading its caller could
not already open from the shelf — and `searchReadings` narrows further to
published (`isVisible`) readings: the reading list, not an admin's staged
copies. Snippets mark matches with `⟦⟧`
([src/lib/searchText.ts](../src/lib/searchText.ts)) and are rendered by
splitting, never as HTML. Queries are trimmed to 200 chars; under 2 chars
nothing runs.

| Action | Params | Returns | Auth |
| --- | --- | --- | --- |
| `searchReadings` | `query` | ≤30 `ReadingSearchHit` — card + page matches, ranked (card ≫ best page > breadth), each with ≤2 page excerpts | session required, else `[]` |
| `searchReading` | `sourceId, query` | `{hits: ≤50 page-ordered snippets, truncated}` | session required **and** `sourceId` on the caller's shelf, else empty |
| `searchLoom` | `query` | `{concepts, links, passages}` — ≤12 per kind, ranked; GIN indexes from 0022 (label≫def≫note · handle≫sentence · content≫margin) | session required, else empty; only the caller's own rows (userId + active-or-null course) |

### 2c. Roster & cohort — [src/actions/admin.ts](../src/actions/admin.ts)

`checkAdmin()` **redirects** `/` on failure (silent-success shape to a scripted caller).
The four READ actions (`getClassData`, `getRoster`, `getUserLoomDataAsAdmin`,
`getAggregateLoomData`) instead gate through `checkCourseFaculty(courseId)`
(P3.12, rulings 17/18): site ADMIN → any course; an active membership with
`role = 'FACULTY'` → that course only. Capabilities are additive — faculty keep
their own student workspace. Write actions stay admin-only, including
`setMemberRole(courseId, userId, LEARNER|FACULTY)`, which on promotion homes
the member in the ensured Faculty Section and on demotion returns them to
unassigned.

The auth side (P3.12, this pass): the `/admin` layout admits admins and course
faculty (via `listFacultyCourseIds`), faculty seeing only Roster + Cohort Graph
tabs and only their courses; pages resolve their course through
`getStaffViewer(courseIdRaw)` → `{courseId, isAdmin}`, which scopes a faculty
viewer to their own courses so `/admin` entered bare lands on THEIR course. The
roster page renders its write controls (invite, place, role, remove) only for
admins. Enrolment-time: an invitation whose pre-assigned section is the
course's `faculty`-slug Section enrols the member with `role = 'FACULTY'`
(fresh enrolment only — reinstatement never re-roles; asserted in
`scripts/check-auth.ts --db`).

**The write surfaces gate themselves, by redirect.** Because the layout now
admits faculty, `/admin/library` and `/admin/courses` each call `checkAdmin()`
as their first statement. Library previously had no page-level gate and leaned
on `getLibraryOverview`'s `Unauthorized` **throw**, which faculty who typed the
URL met as a 500 error page rather than a closed door (fixed 2026-08-08). A new
page under `/admin` must gate itself the same way — the layout's own check is
shaped for the shell, not for authorization.

Walked through a browser by `tests/faculty.spec.ts` (storage state
`playwright/.auth/faculty.json`, minted by `/api/auth/test-login?as=faculty`):
the read side opens, the write surfaces redirect, the roster's write controls
are absent, and their own learner workspace still works.

| Action | Params | Returns |
| --- | --- | --- |
| `getClassData` | `courseId?, sectionId?` | per-member `{id,name,email,section,role,conceptsCount,edgesCount}` (active members only) |
| `getRoster` | `courseId?, sectionId?` | `RosterRow[]` — enrolled + pending invites merged, pending first; rows carry `role` (`LEARNER` while pending) |
| `getStaffViewer` | `courseIdRaw?` | `{courseId, isAdmin}` — admin: any course, site-first fallback; faculty: their courses only; others redirected `/` |
| `getAllowedEmails` | `courseId?` | invites `{email, sectionId}[]` |
| `addAllowedEmail` | FormData `{courseId, email, sectionId}` | void — upsert invitation |
| `inviteLearners` | `(prev, FormData{courseId, emails, sectionId})` | `InviteResult {added, already, invalid, unknownSections}` — one address per line, optional `email, Section name`; section matched by name or slug, case-insensitive; no size cap |
| `removeAllowedEmail` | FormData | void — hard-deletes the invitation |
| `removeFromRoster` | FormData `{courseId, userId}` | void — sets `removedAt`, deletes invite, revokes sessions **only** when no app access remains |
| `getUserLoomDataAsAdmin` | `targetUserId, courseId?` | `{concepts, passages, edges}` (no maps/read/views) |
| `getAggregateLoomData` | `courseId?, sectionId?` | cohort `{concepts, passages, edges, passagesUnavailable}` — passages fail soft |

### 2c-bis. Student Overlays — [src/actions/overlays.ts](../src/actions/overlays.ts)

The student side of ruling 28 (P3.14); `/admin/aggregate` remains the faculty
side and is unchanged. Shapes and the pure arithmetic live in
[src/lib/overlay.ts](../src/lib/overlay.ts) — a `"use server"` module may only
export async functions, so the client imports the types from there and the two
functions from here.

Four decisions (TJ, 2026-08-07) are enforced in this module and nowhere else:

1. **The gate, per reading.** The archived spec's red line #8 ("the crowd must
   not pre-code the text") carries into v1: an overlay opens on a reading only
   once the viewer has captured a passage in it. With no `sourceId` (the whole
   weave) the comparison covers exactly the readings they have coded.
2. **Section and Cohort only.** `OverlayBand = "section" | "cohort"`. No
   per-person band, so nothing returned is a name, an id, or resolves to one;
   counts are of **people**, never of rows carrying an author.
3. **Shared objects only.** Spans, Concept Labels + Descriptions, Link Labels +
   Descriptions. The passage query selects no `content`: an overlay says where
   people marked, not what they kept. Notes, questions, pull-quote flags,
   passage tiers, cloth and projection text never leave their owner.
4. **Faculty are not peers** — excluded from both bands (`role <> 'FACULTY'`),
   since an exemplar cloth read as "your cohort" is the instructor pre-coding
   the text.

Auth: a real session every time, then an active membership in the resolved
course. **No dev backdoor** (unlike `loom.ts`) — these read other people's work.
An admin walking the learner surfaces without a membership gets `not-enrolled`.

| Action | Params | Returns |
| --- | --- | --- |
| `getPassagesOverlay` | `sourceId, band = "section"` | `PassagesOverlay` — `{band, blocked, peers, contributors, passages, pages[], unanchored, droppedSpans}`. Each `pages[]` entry is `{pageNumber, count, contentHash, spans[]}`; a span is `{start, end, count}`, disjoint runs with overlap depth from a sweep line (`heatSpans`). Peer passages count toward `passages`/`count` always, but only contribute a span when their `pageContentHash` equals the reading's canonical `source_page.contentHash`; the rest are `unanchored`. `MAX_SPANS` = 4000, overflow reported as `droppedSpans` |
| `getVocabularyOverlay` | `sourceId \| null, band = "section"` | `VocabularyOverlay` — `{band, blocked, peers, contributors, readings, concepts[], moreConcepts, links[], moreLinks, unlabeledLinks}`. A term is `{label, count, descriptions[], moreDescriptions}`; `count` is **distinct people**. Concepts are scoped through their passages (`passage.sourceId ∈ scope`), exactly as `scopedGraph` does; links need both ends in scope. Caps: 40 terms, 3 descriptions of ≤240 chars each, all overflow reported |

`blocked` is one of `signed-out · not-enrolled · not-coded · no-section ·
no-peers`, or null. Every one is a sentence the UI prints
(`overlayBlockMessage`): an empty comparison that does not say why reads as a
bug, and "code this reading yourself first" is the point of the gate.

Client: **PdfViewer** shades in the same `Mark` pass as passage highlights —
overlay first so a student's own yellow nests inside and paints over it, then
passages, then search terms (one `unmark`; competing passes would strip each
other). Marks are `aria-hidden`, carry `data-heat` 1–5, and shade in five steps
with a slate rule above the words so the section's mark survives under your own
yellow. The client re-checks the hash against the live text layer and refuses to
shade a drifted page — there is no fuzzy fallback, because it never receives the
other student's text. **VocabularyTab** mounts `VocabularyOverlay` below the
holdings. Both are off until asked for and re-ask when the viewer's own capture
count changes, so the capture that opens the gate opens the overlay without a
reload.

### 2b-ii. The workbench tabs (2026-08-08 — station 03 reconciled)

Model §3's five tabs against the seven-station journey. Only 03 changed:

| Station | Component | Holds |
| --- | --- | --- |
| 00 Library | — (`/`) | the course's readings; always a link, never a workbench tab |
| — | `JourneyNav` | **01/02/03/04 render greyed and inert outside a reading** (TJ, 2026-08-09): there is nowhere else for them to be. Keyed off "is this a tab you can work at here", not off a route list, so a surface that gains one of these tabs gets a live station for free. Their `DEFAULT_HREF` pointed at `/weave` until 2026-08-11 and now points at the Library; the entries are never read, because the stations render as spans. `04 Vocabulary` is UNSCOPED in the model and is the one that would be legitimate outside a text — greyed anyway until it gets a library-level surface of its own (keep-at-the-object §7) |
| — | **`/access`** · `MetaPage` | **Access — the role matrix, its own tab** (TJ, 2026-08-09), staff only: each row cites the file and line that enforces it. `MetaPage` is the shared frame for a reference page — `/workflows` and `/access` change what is *below* the journey instead of replacing the frame, with no station active. **It is Courses' and Readings' shape: journey bar, then the page** (TJ, 2026-08-09: "workflows and access tabs should not spawn a header above their row, they should behave more like courses and readings, but without a specific course"). The heading lives in `<main>` with the content it names, exactly as `/admin/courses` puts its own `<h1>` there. An earlier pass gave these a `.scopebar` — a titled strip *above* the journey that no other staff surface has, so arriving pushed the row you had just clicked in down the page; that, its "‹ library" back link (a second door to what 00 · Library already opens) and its footer are all gone. **No `AdminNav`** — that is the "without a specific course" half: a course/section picker on a page holding no course data would be a control for a scope nothing here reads. The `/access` gate ignores the student lens, as `/admin` does: the lens hides the tab, it is not a lock |
| — | **`src/lib/capabilities.ts`** | **the role/capability matrix** (TJ, 2026-08-09), rendered on `/workflows` under the flows. The file IS the matrix: every row names the **server gate that refuses**, and `check-workflows.ts` asserts the file exists and the symbol is still in it — a rename fails the build rather than leaving a confident, wrong table. `gate.line` deliberately unasserted. Deriving it found and fixed two holes: `peersOf` excluded `FACULTY` but not `INSTRUCTOR` (an admin's captures counted as a peer), and `createPassage` never authorized its `sourceId` while `attributePassages` did |
| — | **`src/lib/viewAs.ts`** · `viewAsServer.ts` | **View as student** (TJ, 2026-08-09) — a lens beside the header pill. A **cookie**, because three differences are decided server-side and a client flag could not reach them: `/workflows` (three flows vs one), the Library query (an admin's shelf carries `isVisible=false` rows), and `getActiveCourse` itself. Masked **once**, in `getActiveCourse`, so every `isStaff`/`isAdmin` consumer goes quiet together; `staffTruly` rides along **unmasked for one purpose only** — drawing the control that takes the lens off. **Withholds, never grants**: every use hides a control or NARROWS a query, and no authorization path consults it (`authorizeSourceAccess` deliberately untouched). Not a security boundary |
| — | `JourneyNav` · `.staffgroup` | **the staff group, right of the journey, in sage** (TJ, 2026-08-09) — Roster · Cohort Graph for FACULTY, plus Readings · Courses for site ADMIN, on **every** surface including `/admin`. Unnumbered: they are not steps on the student's arc. Replaces `AdminNav`'s tab row, which now holds only the course/section pickers. Drawn from `course.isStaff` / `course.isAdmin`; decides what is drawn, never what may be read |
| **01 Reading** | `Workbench` + `PdfViewer` + `OpenTab` + `ClothFold` | **the merged station** — the text, in-reading search, Passages Overlay, capture; the reading-scoped **Capture Log** as **Your work** (`#yourwork`), a sheet that slides over the text — closed by default, toggled from the viewer toolbar, and mounted *inside* `.pdf-shell` so it survives fullscreen; the **Cloth Title/Description** at the head of that sheet; **the margin cards** (2026-08-09, from the reverted spread canvas) — page mode's "Cards" toggle, `ConceptRails`: read-only cards beside each page, leader-lined to their highlights, a door to Your work and never an editor, rails and cards `user-select:none` so a stray drag cannot file text to the wrong page; and **a matrix that zooms as pure transform** (`PageRaster` under a once-rendered text layer), visible pages re-rastering after the gesture settles |
| 02 Linking | `ThrowTab` | links, Description-then-Label. **This reading's concepts only.** Threads download here. **Three columns since 2026-08-12** (`.three`) — the warp, the bench, and the threads, which used to be a strip under the bench that you scrolled the whole bench to reach; at ≤1240px the third folds full-width beneath the other two, which is exactly the old shape. **A thrown thread's description is editable in the list** (TJ, 2026-08-12) — it was writable only at throw-time and on 04, filed under whichever label the thread carries, so an unlabelled thread's sentence could be read, quoted in its delete dialog and exported, and changed nowhere. The ENDS stay fixed: re-pointing a thread is a different claim, and throwing a new one says so. Not on the ⌘Z stack, which is label history. It used to carry `ClothFold` at the whole weave, which had no Reading station; that branch went with the whole weave on 2026-08-11, and the Cloth's only editor is 01 · Reading |
| 03 Knowledge Graph | `MapTab` + **`ClothReflection`** | **TWO SECTIONS** (TJ, 2026-08-12): **The cloth** — the weave and its prompts, side by side — then **Projections**, headed by the switcher (which projection you are in decides what every column shows) and laid out as three columns: **sort · the board · your read**. The page title says both acts: *"Examine your cloth — lay out your projection."* **No unlabeled-passages group here** — TJ: *"there should not be an unlabeled passages section in the knowledge graph."* That group stood for model ruling 38 (a projection shows its unattached passages); the passages now appear in 01's **Your work** under `Unlabeled`, which is nearer the words and is where the capture toast points, and they still travel in the cloth and projection exports. The model doc still asks for the group here — **a divergence, logged not papered over**, and TJ's to reconcile. The cloth and the board both lay out to their container down to **480px** and their wrappers scroll below that; each SVG carries a matching `min-width`, without which `width:100%` silently cropped the layout instead of scrolling it. Also: projections, tiers, **the list and the board**: they are one gesture — a prompt on the right lights the cloth on the left — and stacked they could not both be seen while tracing; they are also the material the rest of the station sorts, which is a reason to meet them first. The read stays at the foot, beside the arrangement it describes. `ClothMap` lays out to its container down to **480px** (was a 720 floor that clipped rather than shrank) and `#mapWrap` scrolls below that; its right margin is 96px so the last rotated label lands inside the frame. Also: projections, tiers, **the list and the board** (the sorted rows and the tiered card-and-thread surface — "board", never "table", which reads as a spreadsheet on a screen; TJ 2026-08-10); the cloth and its counted prompts; **the** read (`#mapEssence` / `#yourRead2`); **the Capture Log for this reading** (`HistoryPanel` — the only surface the UI still calls **"Capture Log"**; on 01 the same object reads **Your work**), downloadable |
| **04 Vocabulary** | **`VocabularyTab`** | **the User's holdings, UNSCOPED** — every Concept and Link Label across all readings; filter; edit Descriptions; recurrence (distinct readings evidencing a concept, links per label); ~~merge Concepts — its only home~~ **merge is HIDDEN, 2026-08-12** (`MERGE_VISIBLE`, below); Concepts/Links Overlays |
| ~~05 Weave~~ | — | **GONE, route and station, 2026-08-11.** Hiding it had not been enough: `/weave` carried no gate of any kind, and the Library's search results linked into it in four places. **TJ:** *"we are removing whole weave as it exists in the app because it is poorly defined and not supported in the course. it should not be in the app as an idea until the faculty and the authors of the app agree on what it means to have a 'full weave'."* `Workbench` now requires a reading; `WHOLE_WEAVE` survives only as the internal scope of surfaces that are not a reading (the Library), and no student surface writes at `scopeKey ''`. Rows already written there are left where they are — TJ: *"i am not at all worried about losing whole weave"* — and are simply not rendered |
| ~~05 Keep~~ | — | **GONE, 2026-08-11.** Download happens at each object instead — the cloth at 01, threads at 02, a projection and the Capture Log at 03, vocabulary at 04 — which is what the model said all along (*"Export — both levels: a Cloth … and a Projection"*). Import, "clear the table" and "take it all out" went with it (TJ, 2026-08-10), and so did the worked example, whose only exit was that reset; the practice loom at `/sandbox` replaced it, and the Library's "New to this?" card is now its first door. The bar is the model's five, 00–04 |

**A Concept with no Passages is in scope everywhere.** `scoped()` in
[scope.ts](../src/lib/scope.ts) reads
`isIn = evidenced.has(id) || !hasByte.has(id)` — the second clause is not an
oversight. A Concept may precede its evidence (model §Concept, ratified
2026-08-08): you name what you expect to find, gloss it, and read for support,
so it must stand in **every** Reading's warp while you hunt. It belongs to no
Reading, because a Passage does. Consequences worth knowing before touching
that line: it also decides which Links are *bridges*, and an un-evidenced
Concept is linkable like any other (warned, never forbidden). Created at the
foot of Your work — label **and** optional gloss — and flagged "no
evidence" there, in the Linking warp, and in the cloth prompts.

Scoping is the load-bearing distinction: **01 Reading's Your work is this
reading's captures; 04 Vocabulary is everything you own.** A concept does not
belong to a reading — a passage does — so the holdings render identically
inside a reading and at the whole weave. The Overlay alone stays reading-gated.

**What Your work lists** (TJ, 2026-08-12): concepts evidenced here (`In this
reading`), concepts with no evidence anywhere (`No evidence`), and **this
reading's Unlabeled Passages** (`Unlabeled` — quote, note, citation, and an
input that names one when the word arrives). Kinds, never stages. The
unlabeled group is the model's own requirement — *"Unlabeled Passages appear in
the Reading (highlights), the Capture Log (rows), and in Projections"* — and it
was the one of the three that had never been built: the head bar counted the
passage in `N passages` and no row beneath it held the words, so the capture
toast's *"name it in Your work whenever the word arrives"* pointed at a surface
with nowhere for it to be. `MapTab`'s unattached group (03) is the same
passages, projected.

A fourth group, **`In your other readings`**, is gone with the same pass — a
roll-call of every concept the student owned from every other text, in the
panel that is meant to be this reading's own work, and growing with the term.
It could not be linked or filed from there in any case (02 works on this
reading's concepts only); what reaches those concepts is typing one's name at
capture, where the datalist has always offered all of them, and 04 Vocabulary,
which the ghostnote in its place still opens.

Before this pass 03 held the cloth prompts and a *second* read editor
(`#readEssence`/`#yourRead`) writing the same map fields as 04's; those ids no
longer exist.

**Merge is behind a curtain** (TJ, 2026-08-12: *"hide the merge capability in
the concepts list in vocabulary. we need to resolve what this really means and
its consequences."*). `MERGE_VISIBLE` in
[VocabularyTab.tsx](../src/components/tabs/VocabularyTab.tsx) is `false`; the
`mergeConcepts` action, its provider method, the sandbox's copy and the
`concept.merge` event are all untouched, so a merge already performed still
reads in the Capture Log and one flag restores the control. **This is a build
state, not a model change** — [loom-model-build.md](loom-model-build.md) still
gives Vocabulary the merge and stays the authority; the question TJ has put on
it is logged in [open-work.md](open-work.md).

The consequences, because they are copy in five places rather than one control:

- **The duplicate repair is now two acts, by hand** — file the passages under
  the concept you are keeping, then remove the other; its passages survive,
  unlabeled (migration 0021), and land in Your work's `Unlabeled` group. Both
  homonym dialogs in [OpenTab.tsx](../src/components/tabs/OpenTab.tsx) (rename
  clash, name-ahead clash) and the Concepts hint on 04 now say that instead of
  "merge them". Ruling 36 is untouched: homonyms stay legal and stay warned,
  never forbidden.
- **`ReuseOffer`'s way out is now cheap in one direction only.** Separating a
  reused concept is one button; rejoining is the manual repair above. The
  reasoning in that file's header assumed merge — it says so now.
- **The student flow says so** — `vocab` reads "Sharpen descriptions, see what
  recurs"; a generated diagram would otherwise draw a step nobody can take.
- **`journey-learner.spec.ts` asserts the button is ABSENT**, so the flag
  flipping by accident turns the suite red rather than passing quietly.
- **Both delete-concept dialogs stopped citing Keep**, which was deleted
  2026-08-11 — they now name where the passages go and which download holds
  the concept. That copy only started mattering when delete became the
  sanctioned repair.

**Station numbers are derived, never written.** `JourneyNav` numbers the
*visible* stations in order and exports `stationNumber()`, which the workbench
footer uses — so hiding or restoring a station renumbers the bar and the footer
together instead of leaving a gap that reads as a bug. That is also why student
copy should name a station ("Keep") rather than number it. `?tab=read`,
`?tab=open` and the `"read"` / `"open"` station keys are unchanged — URL params
are deliberately legacy (refactor spec §F), and `?tab=open` folds onto the
merged reading station.

### 2c-ii. Workflows — [src/lib/workflows.ts](../src/lib/workflows.ts)

`/admin/workflows` renders three flow diagrams — **Student · Faculty · Admin** —
and they are **generated from data, never drawn**. `src/lib/workflows.ts` holds
`FLOWS: Flow[]` (nodes + edges); [flowLayout.ts](../src/lib/flowLayout.ts) turns
one into geometry; `FlowDiagram` draws it. Adding a step is adding a node and an
edge — no coordinate is ever written by hand.

**This is a maintenance obligation, not a decoration.** A refactor that changes
how someone moves through Loom is not finished until the matching flow says so.
Each flow carries a `sources` list naming the code behind it, shown on the page,
so a reader can check the picture against the thing.

`npm run check` runs [check-workflows.ts](../scripts/check-workflows.ts), which
fails the build on the ways a *generated* diagram rots quietly — all of which
still render, just wrongly:

| Guard | The failure it catches |
| --- | --- |
| dangling edge ids | a connector silently dropped |
| orphan nodes | a step added and never wired |
| a `back` edge that does not go back | no lane to route in; falls back to a curve that can cross a box |
| a forward edge skipping a row without routing | drawn under the box between its ends, so invisible — label and all |
| overlapping boxes | row arithmetic drifted |
| `wrapText` determinism | server and client must agree, or hydration breaks |

Layout notes worth not re-deriving: returns run in lanes on the **right** and
bypasses in lanes on the **left**, one lane each (two sharing a line read as one
connector); every horizontal leg runs in a **row gap**, which holds no boxes by
construction. The SVG carries **no per-node `<title>`** — React 19 hoists
`<title>` into `<head>` and desynchronises hydration — so the `<details>` list
under each diagram is its text alternative.

Access: gated by `getStaffViewer` — admins **and faculty**, since the page holds
no course data at all and the student flow is what an instructor most needs to
read. Learners are returned to `/`.

### 2c-iii. Screen widths — the standard (TJ, 2026-08-12)

**Loom is a desktop tool.** Not a responsive site that happens to run on a
laptop: it is used at a desk, on a course's readings, next to a PDF. What
follows is the whole rule, and it is executed in
[globals.css](../src/app/globals.css) rather than left as advice.

**The numbers, and why they are not 1920.** A 1920×1080 panel does not hand the
layout 1920 CSS pixels. Windows ships 14–15" 1080p laptops at **125% or 150%**
scaling, so the browser reports **1536** or **1280**; Apple hardware never
reports 1920 at all (14" MacBook Pro = **1512** logical points, 16" = **1728**,
Studio Display = **2560**). This is visible in public traffic stats, where the
second most common "resolution" is 1536×864 — a panel nobody manufactures, and
1920×1080 at 125%. So:

| | width | what it is |
|---|---|---|
| **Floor** | **1280** | must not break, may look plain. 1080p at 150%, a half-screened window on a 2560 display, older institutional laptops. |
| **Target** | **~1600** | where it should look composed. The 1512–1728 band is where most 2026 hardware lands. |
| **Ceiling** | **2560** | must use the room, not stripe it with empty paper. |
| below 1280 | — | degrades gracefully, is not designed for. No phone layouts. |

**Three rules that follow.**

1. **Cap the measure, not the app.** Prose gets 60–75ch (`.tasksub` is `70ch`,
   `.matrix .hint` is `64ch`). Work surfaces — warp, bench, thread list, board,
   card lists — take the room they are given. `main` carries `--measure`,
   default **1100px** for reading-shaped pages; `.station-work` raises it to
   **1680px** for the workbench. One global measure over both was the defect
   this standard exists to fix: it froze 02's three columns at 348px on every
   screen from a 13" laptop to a 27" monitor.
2. **Fold on the content's own minimum, never on a device width.** Multi-column
   grids are `repeat(auto-fit, minmax(<column floor>, 1fr))` — `.two` at 360px,
   `.three` at 340px. `auto-fit` collapses the empty tracks, so N children make
   at most N columns and the layout folds to 2-up and 1-up by itself. This
   matters more here than in most apps because **the content box is not the
   viewport**: Your work slides *over* the text, so a viewport media query is
   asking the wrong element how much room there is. Device breakpoints for
   these grids are deleted, not tuned.
3. **Vertical is the scarcer axis.** At the floor there is ~600px of usable
   height under the header, journey bar and footer. `.scrollbox` is
   `clamp(320px, 52vh, 620px)`: it shrinks on a short window and grows on a
   tall one instead of sitting at a fixed 380px that is wrong at both ends.
   (`.yourwork-body .scrollbox` still opts out — inside the sheet the panel
   does the scrolling.)

**Check a layout at 1280 · 1536 · 1728 · 1920**, and never by assuming a 1920
panel gives 1920 CSS pixels. Not at phone widths.

**Two controls, and they are not the same one** (TJ, 2026-08-12). The header's
**full screen** (beside *guide*, every page) is the browser's Fullscreen API on
`documentElement` — it buys back the ~90–120px of tab strip and URL bar, which
is the cheapest vertical there is. `useSyncExternalStore` over
`fullscreenchange` reads the state off the DOCUMENT, so Esc and F11 — which
never tell the app anything — keep the label honest. Hidden where
`document.fullscreenEnabled` is false rather than offered dead. The reading
toolbar's control was *also* called "full screen" and never touched that API:
it is the in-app mode `.pdf-shell.fullscreen`, covering Loom's own chrome so
the text fills the window, and it is now labelled **"just the text"**.

**Not yet done under this standard:** the Library (`/`) and the admin pages
still sit at the 1100 measure. The shelf is arguably a work surface and would
take a wider one; that is a look-at-it call, not a mechanical one.

### 2d. Courses & sections — [src/actions/courses.ts](../src/actions/courses.ts)

`requireAdmin()` throws. `revalidateAdmin()` → all admin pages + `/`.

`getActiveCourse()` (session-only, learner-safe) · `createCourse` · `updateCourse` ·
`setCourseArchived` · `deleteCourse` (requires typed `confirm: "delete"`; student
work survives via `courseId → NULL`) · `createSection` · `updateSection` ·
`deleteSection` (members fall to unassigned) · `assignMemberSection` (validates the
section belongs to the course).

---

## 3. API routes

| Route | Behavior | Auth |
| --- | --- | --- |
| `GET/POST /api/auth/[...nextauth]` | NextAuth (GitHub OAuth, scope **`user:email`** only). Identity: the provider's `userinfo` override reads `GET /user/emails` on **every** sign-in and keeps only `verified === true` addresses, minus `@users.noreply.github.com`; of those it signs the student in as the first one `emailHasAppAccess` accepts, else the primary. Sign-in still admitted by `emailHasAppAccess` alone: admin fallback email ∨ any course invitation ∨ any active membership ∨ legacy allowlist. Refusals return a path, not `false` — `/auth/error?error=NoVerifiedEmail` or `?error=NotOnRoster&email=…`. Enrolment happens in `events.signIn` → `enrolInvitedCourses()` (first-OAuth `user.id` is GitHub's in the callback), idempotent upsert clearing `removedAt`. **Second provider, `email`** (guest door): registered *only* where `RESEND_API_KEY` **and** `EMAIL_FROM` are both set — absent in dev and CI, so GitHub is the sole provider there. Mailed single-use link, 24 h, token minted and hashed into `verificationToken` by NextAuth; delivery is a `fetch` to Resend (nodemailer is never required — the provider object is built inline). Both providers run the same `decideSignIn` gate, and for `email` it runs **twice**: once at the send step (`email.verificationRequest`), so an address no course invited is never mailed, and again when the link is clicked | — |
| `GET /api/auth/test-login?as=…` | Mints a 30-day DB session + cookies. Three identities: default = the admin; `?as=testa` = `test-user-a@loom.local` (LEARNER); `?as=faculty` = `test-faculty@loom.local` (site role USER, **membership** role FACULTY, homed in the ensured Faculty Section). All enrolled into the oldest course; the membership role is re-set on conflict so a promotion never leaks between runs, but a **learner's section is left alone** (writing one would unplace seed-demo's Test User A from Section 1 and empty the Overlays' section band). Returns `{success, userId, sessionToken}` | **403 in production** (first statement); no other guard — dev/CI only |
| `GET /api/readings/[sourceId]?download=1` | Streams the PDF (never buffered — 4.5 MB serverless cap), RFC 6266 filename, `Cache-Control: private`. Errors: 401 / 404 / 500 JSON | Session required **in production only**; then `authorizeSourceFile` |
| `GET /api/readings/[sourceId]/cover` | PNG cover (cached at `covers/<id>.png`; re-rendered from the PDF only on a cache miss) or SVG fallback (`no-store`) | No check of its own — inherits `authorizeSourceFile` via `getSourceForCover` (bytes-free) |
| `POST /api/readings/upload` | Vercel Blob client-upload token exchange. Token scoped: private, PDFs only, ≤ 20 MB, path under `readings/`, random suffix. `onUploadCompleted` deliberately omitted — the client calls `registerUploadedReading` / `registerOwnUploadedReading` itself | Any signed-in session (sign-in is allowlist-gated), checked twice; what the blob may be registered *as* is decided by the register actions |
| `GET /api/repairs/[repairId]/crop` | Streams the damage-region crop PNG for the repair review screen; `Cache-Control: private` hard cache (a crop never changes once written). Errors: 401 / 404 | Session + ADMIN (`isAdminUser` or DB role); non-admins get 404, not 403 |

**Read routes** (the transport for [src/lib/reads.ts](../src/lib/reads.ts); each is a
thin GET that calls the named §2 action, so auth, shapes and caps are that action's
row verbatim — `respondWithRead` in [src/lib/readRoute.ts](../src/lib/readRoute.ts)
maps thrown `Unauthorized`/`Not found` to 401/404 and anything else to a logged,
generic 500, except where marked *verbatim errors*):

| Route | §2 action |
| --- | --- |
| `GET /api/loom` | `getUserLoomData()` — including its orphan adoption (invariant 5's "every loom action" includes this GET) |
| `GET /api/loom/events` | `getGraphEvents()` |
| `GET /api/sources` | `getSources()` |
| `GET /api/course` | `getActiveCourse()` |
| `GET /api/search/readings?q=` | `searchReadings(q)` |
| `GET /api/search/loom?q=` | `searchLoom(q)` |
| `GET /api/search/reading?sourceId=&q=` | `searchReading(sourceId, q)`; 400 without `sourceId` |
| `GET /api/overlays/passages?sourceId=&band=` | `getPassagesOverlay(sourceId, band)`; 400 without `sourceId`; any band value but `cohort` reads as `section` |
| `GET /api/overlays/vocabulary?sourceId=&band=` | `getVocabularyOverlay(sourceId \| null, band)` — no `sourceId` means the whole weave |
| `GET /api/repairs/settings` | `getRepairSettings()` |
| `GET /api/draft-metadata?sourceId=` | `draftMetadataForSource(sourceId)`; *verbatim errors* — the message is the instructor's interface |
| `GET /api/draft-metadata/own?sourceId=` | `draftMetadataForOwnSource(sourceId)`; *verbatim errors* |

---

## 4. Export / import formats — [src/lib/graphExport.ts](../src/lib/graphExport.ts)

### 4a. Whole-cloth export (`<student>-loom.json`)

The archived spec's §6 contract, exactly:

```jsonc
{
  "graph": {
    "student": "Display Name",
    "concepts": [{ "id", "label", "def", "note" }],            // no tier — tiers are per-map (0021)
    // `passages` since 2026-08-09; every file exported before that says
    // `bytes`, and `parseImport` reads BOTH (red line #5 — nothing a student
    // already downloaded stops opening). Guarded by scripts/check-import-compat.ts.
    "passages": [{ "id", "conceptIds": [],                     // [] = an Unlabeled Passage
                   "source", "location", "text",
                   "note?", "question?", "isPullQuote?", "tier?",  // the margin, emitted when set
                   "anchor?": { "sourceId", "pageNumber", "startOffset", "endOffset", "pageContentHash" } }],
    "edges":    [{ "id", "fromId", "toId", "sentence", "handle" }],
    "cloths?":  [{ "id", "scopeKey", "title", "description" }], // replaces top-level "read"
    "maps?":    [{ "id", "scopeKey", "name", "essence", "read",
                   "tiers": { "<conceptId>": "p" } }]          // absent key = unsorted
  },
  "views": {
    "cardTable": { "positions": {}, "bends": {}, "order?": [], "pins?": [] },
    "maps?":     { "<mapId>": { "positions": {}, "bends": {}, "order?": [], "pins?": [] } }
  }
}
```

`order`/`pins` are emitted only when non-empty. This is the only re-importable
whole-artifact form and the complete backup behind every map.

### 4b. Per-map export (`<student>-<map>.map.json`)

```jsonc
{
  "format": "loom-map",              // the routing discriminant
  "student": "...",
  "map":   { "id", "scopeKey", "scopeLabel", "name", "essence", "read", "tiers": {} },
  "graph": {
    "concepts": [{ ..., "tier": mapTier }],   // THIS map's tier — the file is sorted on its own
    "passages": [ /* every passage of every in-scope concept, plus the scope's own
                     unlabeled passages — the file stands alone */ ],
    "edges":    [ /* scoped edges only */ ]
  },
  "view?": { "positions": {}, "bends": {}, "order?": [], "pins?": [] }
}
```

Scope membership: whole weave = everything; otherwise a concept is in scope when one
of its passages has `sourceId ∈ scope` **or it has no passages at all**
([src/lib/scope.ts](../src/lib/scope.ts)).

### 4c. Markdown outlines (readable, never re-importable)

Whole cloth: `# Loom — <student>` → My read (whole-weave cloth description) → My
readings (per-reading cloth titles/descriptions) → Maps (per map: name — scope,
essence, paragraph, tier lines) → Concepts (flat, with passages as quotes) → Unfiled
passages (unlabeled ones — red line #4 keeps them visible) → Propositions
(`A —[handle]→ B` + sentence when present). Per map: same shape scoped to the map,
plus its unfiled passages. Map kit (clipboard): name/essence/tier groups/
propositions/armature/loose; with no map, everything is unsorted (degree order).

### 4d. Import routing

`parseAnyImport`: JSON with `format: "loom-map"` → map import; anything else →
whole-cloth import. `parseImport` explicitly rejects a `loom-map` file — **a single
map can never reach the replace path.**

### 4e. Whole-cloth import (replace)

Client parse: flattens `{graph, views}`; validates tiers; drops blank-label concepts
and text-less passages — **and reports what it dropped**, since 2026-08-09, in
`ParsedImport.dropped {concepts, passages, edges}`. That exists because every array
`parseImport` returns is a count of what LANDS, and the replace confirm was quoting
them as *"It holds N concepts …"* — the file described by what survived reading it,
on the one branch that destroys work. The dialog now says *"… will arrive"* and then
names the losses, only when there are any. Edges are counted before the legacy
`triples` are appended, so the number is the file's loss and not a diff against a
list that grew back. Guarded by `scripts/check-import-compat.ts`, which a round-trip
test cannot replace: the current code never *emits* a blank-label concept, so the
shape that triggers the drop cannot arise from an export.
A passage whose concepts don't resolve SURVIVES as an
Unlabeled Passage (red line #5), where it used to be dropped as an orphan; accepts
`conceptIds` (new) or `conceptId` (legacy), `text` or `content`; folds legacy v2/v3
shapes (legacy passage notes onto the concept — a new-shape passage's `note` stays on the
passage; `triples` → edges); a legacy `read` string becomes the whole-weave cloth's
description; a pre-maps file **synthesizes "Map 1"** from the legacy concept
`tier`/`read`/`cardTable` (the 0012 backfill rule).
Server (`importGraph`): size limits → resolve known sources → **remint every id** →
remap view keys → **re-scope** each map and cloth (scopeKey filtered to known
sources; resolves to nothing → whole weave, never dropped — red line #5; for
cloths, exact scopes claim their slots FIRST and a scope-degraded cloth is
dropped on collision, never the genuine one) → **remint tier keys**
(`passage_concept` createdAt staggered per row — filing order is meaning) →
`graph.import` event with snapshot → one atomic batch: delete everything (incl.
cloths), insert everything (incl. `passage_concept` pointers). Replace, never merge.

### 4f. Per-map import (additive)

Requires `map.name`. Tiers/geometry matched **by id against cards already on the
table**; misses counted and returned as `skipped`, never re-woven. Inserts exactly one
new map row (a parallel sibling) + its view row when geometry survived. Can never
delete or replace anything.

---

## 5. Invariants the code enforces

1. **Passages survive their labels** (0021). Deleting a concept removes
   `passage_concept` pointers, never passages; a passage with zero pointers is an Unlabeled
   Passage, legal everywhere. `createPassage` writes the passage and its pointers in one
   `db.batch`. (The old invariant here — the mirror dual-write — was retired by
   0021; `map.tiers` is the only tier store and the cloth carries the paragraph.)
2. **`ensureActiveMap`** (client-only, LoomProvider): first sorting gesture in a fresh
   scope mints "Map N", with a pending-create de-dupe and an id-alias so in-flight
   gestures land on the right map.
3. **Graph vs projections.** `view` writes record no history event; `pruneViews`
   strips deleted ids without touching `map.updatedAt`; derived layout is computed
   for display and discarded (red line #7).
4. **Soft removal.** `removedAt` on membership; every read filters it; sessions
   revoked only when no access remains; re-invitation reinstates.
5. **Orphan adoption.** Every loom action adopts `courseId IS NULL` rows into the
   active course; for `cloth`/`view` (unique-constrained) it deletes the null-course
   leftover first so the unique can't wedge the student.
6. **A passage belongs to a reading; a concept does not.** Membership is derived from
   `passage.sourceId` + its `passage_concept` pointers per render and discarded.
   `attributePassages` fills NULL only, by student act. A passage-less concept appears in
   every scope (red line #4 visibility).
7. **Identity by object, not label** (ruling 36, landed with P1). Homonyms are
   legal everywhere; the client warns at coin-time (create, rename) and offers
   merge; `mergeConcepts` is the repair for true duplicates. No clash check
   remains anywhere.
8. **A concept in use cannot be deleted** while it is an edge endpoint.
9. **History survives everything** — `graph_event` outlives reset and import;
   event writes are best-effort (neon-http has no cross-call transactions), graph
   tables stay the source of truth.
10. **Atomicity via `db.batch`** for: whole-graph replace, reset, passage + its
    concept pointers, worked example, map delete.
11. **Anchor canonicality.** `createPassage` prefers server page offsets when content
    hashes agree; otherwise preserves the client's offsets and hash.
12. **Replace-race protection.** The client cancels debounced view (500 ms) and
    map-text (700 ms) saves before import/reset; `flushMapText` also fires on
    `visibilitychange`/`pagehide`.

13. **An overlay never resolves to a person, and never opens early.** Both
    overlay actions gate on the viewer's own capture in the reading, exclude
    the viewer and faculty from the peer set, and return counts of people —
    never a name, an id, or a row that carries one (ruling 28; TJ's four
    decisions, §2c-bis).

### Known contract debts (tracked, deliberate)

- `importGraph`/`importMapArrangement` trust client-side parsing for shape; the
  server re-validates sizes, source existence, and ownership only.
- `createSource` is exported but has no callers — dead-but-live (see audit).
  (`saveRead` was removed with the mirror in 0021.)
- The new `passages` margin fields (note/question/isPullQuote/tier) are contract-level
  only — no capture UI writes them yet (arrives with the P2/P3 Reading tab work).
- ~~A Server Function called from a reading entered by clicking its shelf card
  POSTs to `/` about half the time~~ — **fixed 2026-08-07** by taking client
  reads off the action queue (the §2/§3 client-reads rule);
  `scripts/repro-action-bounce.mjs` now measures the fix (expects 0/N, exits 1
  on a bounce). The queue's own race (vercel/next.js#90467) is still in Next
  16.2.x: a MUTATION in flight at navigation time can in principle still
  corrupt the queue's canonical URL. All mutations here are gesture-driven and
  the debounced ones flush on `pagehide`, so no known user path hits it — but
  it is Next's bug to fix, not ours to paper over further.
- ~~Unlabeled Passages are representable and survive import/delete, but no UI creates
  or displays them yet~~ — **closed 2026-08-12**: `CaptureModal` saves with the
  concept field blank ("Save unlabeled"), and the map view shows Unlabeled
  Passages as a nameable group. The graph-view unattached group is still P1.9.
