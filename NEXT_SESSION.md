# Next Session Prompt

## Addendum, 2026-08-09 (Your work, the capture toast, the tips, and Linking's scope)

**Read this first.** `npm run check`, `next build` and the Playwright suite are
green. **No migration** — nothing here touched the database.

### 1. "Capture log" is now **Your work**, and it behaves like one

TJ: *"the current capture log button is a little weird… it seems like it should
be 'notes' at least, if not having the ux also changed."*

- **The word is "Your work"**, not "Notes" — TJ's call, because **Notes already
  names a field on the Passage** (`byte.note`). The **model doc's object name
  stays `Capture Log`**; only student-visible strings changed. Both authority
  docs already used "Capture Log" for `graphEvents`/`HistoryPanel`
  (`loom-refactor-spec.md:19`), so the reading rail was the impostor — this
  rename *resolved* a collision rather than making one.
- **The rail became a card over the text.** It was a flex sibling that squeezed
  the page above 820px and only overlaid below it — the same button doing two
  different things depending on window width. Now `#yourwork`: inset 12px,
  380px wide, rounded, shadowed, height-capped to clear the footer, sliding in
  from the right. **It is rendered inside `.pdf-shell`** (a new `.pdf-body`
  wrapper) because `.pdf-shell.fullscreen` is `position:fixed; z-index:6000`
  with its own stacking context and swallowed the old rail whole.
- **Always mounted, parked off-screen** (`visibility` + `transform`, with the
  asymmetric transition — read the comment, it is not a typo). Drafts survive
  the toggle, and a just-landed capture has a real layout box to scroll to.
- **The toolbar button no longer changes shape.** It read `Your work · 5`
  closed and `Hide your work` open — narrow ghost to wide filled — reflowing
  the toolbar under the reader's eye. One label, one width, ghost vs filled.

### 2. The capture toast — the thing that actually answered the complaint

TJ, on the first cut: *"still very disruptive… i thought we were making a slide
out panel from the side like toast thing."*

**A capture from the page used to land in complete silence.** `CaptureModal`
saved and vanished; the only acknowledgement was 1500ms of `· saved ·` in the
header, a screen away from where the reader was looking. *That* is why the
panel had to be opened at all — you opened it to check, not to browse.

`.captoast`: bottom-right, 6s, held on pointer-enter, `In your work ›` opens the
card on that row. Two captures inside the window become "2 passages captured"
rather than stacking. If the card is already open there is no toast — the row
is the acknowledgement, so it scrolls to it instead.

### 3. The hover tips were broken nearly everywhere — measured, not guessed

TJ: *"there appear to be mouseover bubbles for many things that are getting
blocked because they are 'behind' things."* Audited in Chromium across ~70
`[data-tip]` sites in 15 files:

| Surface | Before |
|---|---|
| Header tips, **including `?`**, on every page | ~90% clipped by `body{overflow:hidden}` |
| All six reading-toolbar tips | 80% clipped; 93% below 900px |
| Journey nav tip | 100% clipped below 900px |
| `.scrollbox` lower rows | 100% clipped at the bottom |

**Two mechanisms.** Most of it is overflow clipping, which **no z-index value
can fix**. On top of that `.pdf-toolbar` is a flex item with `z-index:10`, and a
flex item with a z-index makes a stacking context — so a bubble asking for 30
painted at an effective 10, under Your work at 25.

Fix: **`src/components/ui/TipLayer.tsx`** — one element at the document root
using the native `popover` attribute, so it lives in the **top layer**: above
every stacking context by construction, clipped by nothing, and carrying **no
z-index**, so the ladder in `globals.css` never needs renumbering for it again.
Listeners are delegated — **not one of the ~70 call sites changed**. `.tip-below`
and the `.scrollbox` flip are deleted. The contract is unchanged and deliberate:
aria-hidden, mouse-only, never touch, never keyboard, `pointer-events:none`.

### 4. Linking shows this reading's threads only

TJ: *"threads from other readings should not show up in the linking. links from
other readings may show up as link options."*

- **The main list was already correct** (`scoped.edges`). The offender was the
  second band, *"Threads that run out of this reading"* (`scoped.bridges`).
  Decisive detail: the 08-08 ruling removed the outside-concepts band and the
  across-readings shuttle, so **a student can no longer create a bridge from
  inside a reading** — every row in that band had been thrown somewhere else.
  Gone, with the now-unreachable "from *(reading)*" pill.
- **The permissive half did not exist at all.** Label suggestions were six
  hardcoded everyday verbs (`PLAIN_VERBS`) with no way to reuse one you coined.
  Linking now offers **"Labels you have coined before"** — the **Link List**
  (model §Student), derived from `state.edges`, deduped case-insensitively,
  most-used first, capped at 12 **and it says so** ("the 12 you reach for most,
  of 27"), with Vocabulary as the full home.

### 5. Capture by hand — prefilled, and honestly justified

- **Location now offers the page you are on** (TJ), the same way Source already
  offered the citation: placeholder plus empty-field fallback, so it is a
  default and never a lock. The field gained `id="bLocation"` — **the spec used
  to match the literal placeholder `ch. 3, p. 49`, which a dynamic placeholder
  breaks.** The suite caught exactly that.
- The fold's copy now leads with the real case: *some things on a page cannot be
  selected at all* — a concept map, a diagram's labels, a page photographed
  rather than typeset. (*Learning How to Learn* p56 is the known one.)

### 6. Vocabulary check TJ raised, and its answer

*"are we misusing link object and link label…? how do we get link label without
link?"* Answered from the model, not from memory:

- `Link = Beginning Concept + Ending Concept + Link Description + Link Label`.
  The two Concepts are **structural, not a tag**; the Label is a nullable
  parameter. So a Link Label is **not** an object — TJ was right about that.
- But the **Link List is first-class on the Student** (model §33), and §122
  calls the asymmetry deliberate: the Concept List holds full objects, the Link
  List holds only the vocabulary, *"because Links (edges) live in Cloths; what
  recurs is the relationship-verb vocabulary."*
- **You cannot get a Link Label without a Link.** There is no link-label table;
  the list is derived from `handle` on every Link. A label enters the vocabulary
  by being used once, and no other way.

**Open, and genuinely undecided:** that is an asymmetry with the 08-08 ruling
that *a Concept may precede its evidence*. There is no "a Link Label may precede
its Link" — you cannot coin a verb you expect to need and hunt for the pair.

TJ then took it further, and the further version is better: *"a Thread is
Concept–Link–Concept, and it **contains the references** — not the Link itself"*
and *"my hunch is that a Thread will have its own Description."* That is right,
and it resolves both asymmetries: **Link** becomes a User-level object (Label +
its own gloss, "what I mean by this verb"), **Thread** carries the references
and the per-pair sentence. Full analysis, the migration, and the one thing that
makes or breaks it — **there is no `mergeLinks` and it would become mandatory** —
in **[docs/link-as-object.md](docs/link-as-object.md)**. Recommended: do it, as
its own phase, not urgent.

### 6b. Where the tool decides what the student meant

TJ, on merge: *"these could be making decisions on the student's behalf and I
want to avoid that."* **Merge is the clean one** — student-typed target, refuses
to guess, confirms with "there is no unmerge", and nothing in the repo proposes
one. The check turned up three other things, all written up in
**[docs/naming-decisions.md](docs/naming-decisions.md)** and **none changed in
code** pending TJ's rulings:

- **A plain bug.** `handleAddConceptOnly` matches the label **untrimmed** and
  writes it **trimmed**, so `"boundary objects "` misses the homonym confirm
  entirely and silently mints a duplicate with a byte-identical label. One-line
  fix; recommended regardless of the rulings.
- **The three naming paths disagree.** Naming ahead of evidence asks; capture by
  hand joins silently then asserts ("it is one concept, not two"); **capture
  from the PDF — the busiest path — joins silently and says nothing.** Proposed:
  turn the note into an offer ("Not the same idea? Make it a separate concept")
  and give the PDF path one at all.
- **The Source field promises an override it does not have.** The label says
  "this reading, unless you say otherwise", but saying otherwise sets
  `byte.source` (a string) while `byte.sourceId` — what every lens reads — is
  stamped from the open reading, and `attributeBytes` is guarded by
  `isNull(sourceId)` so it can never be re-attributed.

Also in that note: a sweep finding I **corrected rather than passed on**
(`resolveActiveCourseId` is a narrow legacy migration, not "data destruction"),
and a list of leads I did not verify — of which `mapKit.ts`'s "busiest first —
the top few are your primary candidates" is the likeliest genuine red-line-3
problem.

### 6c. Keep is every reading; the whole weave is withdrawn from the bar

TJ, 2026-08-09: *"i want keep to be about all the readings, but links out of keep
cant go to 'your whole weave' because we arent supporting this yet. keep is
either per reading, or if all readings then 2/3/4 are greyed out."*

- **02 Linking · 03 Knowledge Graph · 04 Vocabulary render greyed and inert**
  wherever they are not a tab you can work at right here — the Library and Keep.
  A `<span aria-label="… — open a reading first">`, not a disabled `<button>`:
  it is not a control that is switched off, it is a place you are not standing
  near. Keyed off "is there a handler", not off a route list.
- **04 Vocabulary is the arguable one** — the model has it UNSCOPED, the User's
  holdings across every reading. It is greyed anyway because `/weave` is the
  only surface that renders it outside a text. `JourneyNav`'s `READING_ONLY` is
  where that decision lands when `/weave` is ruled on.
- Two bugs found on the way: `KeepPage` hardcoded `06 — KEEP` while the derived
  bar said `05 —Keep`; and the base nav rule was `nav a.station`, so a `<span>`
  station got no padding and the greyed ones ran together as
  `02 — Linking03 — Knowledge Graph`.

**The red-line-5 catch, and it is the reason not to ship this ruling naively.**
The **Capture Log renders in exactly one place** — `MapTab`, behind
`{wholeWeave && …}` — and **no export contains it**: `buildExport` and
`buildMarkdown` carry concepts, passages, threads, cloths, maps and views, and
`graphEvents` appear in none of them. Withdrawing `/weave` would have made it
unreachable *and* unkeepable, on the very page whose reset dialog promises "your
weaving history survives either way". **It now renders at the foot of Keep**, and
that copy is corrected. Keep is the right home regardless: the Log is
course-wide and Keep is now every reading at once.

**Still stranded, not fixed — product calls:** the **whole-weave Cloth** (title
and description; its only editor is `ThrowTab`, and Keep lists projections
only), and **whole-weave Projections** (Keep names and exports them; nothing
opens them). Plus **`ShelfSearch`'s three links into `/weave`** — one of which
is the last live route to an untethered passage.

### 6d. One bar: the staff group joins the journey

TJ, 2026-08-09: *"in faculty or admin mode, menu items should appear to the
right of this instead of an administration panel"* … *"admin role has even more
tabs."*

`JourneyNav` now carries a **`.staffgroup`** on its right, in sage, unnumbered
(they are not steps on the student's arc): **Roster · Cohort Graph** for
FACULTY, plus **Readings · Courses** for site ADMIN. It renders on **every**
surface, `/admin` included — which is the point: the model already says faculty
"reach [the overlays] through their *own* learner surfaces … **capabilities
being additive**", and two separate navigations said the opposite.

- `AdminNav` keeps **only** the course and section pickers, now left-aligned:
  that row is the page's scope, not a menu. `← My Loom` is gone — 00 Library is
  on the same bar.
- `getActiveCourse` gained **`isAdmin`** beside `isStaff`, which conflated the
  two. Decides what is **drawn**, never what may be read; every page re-gates.
- Staff links carry the course you are already looking at (the URL's `?course=`
  on an admin page, the on-screen course elsewhere), so moving between staff
  surfaces does not reset to "the first course".
- `src/lib/workflows.ts` moved in the same commit per AGENTS.md: the faculty
  flow's "Enter the admin shell" is now "Enter the teaching surfaces · the
  journey bar's staff group, from anywhere".

**Trap:** `useSearchParams()` forces a Suspense boundary or it takes the whole
route client-side — putting it inline in `JourneyNav` broke the build with
*"useSearchParams() should be wrapped in a suspense boundary at page /keep"*,
because `/keep` is statically prerendered. The staff group is its own component
under `<Suspense fallback={null}>`, and `/keep` is still `○` in the build output.

**A correction to §6b's fix.** The `your whole weave` link was repointed at
`?tab=read` — and that was **dead**. `Workbench` seeds `activeTab` once with
`useState(firstTab)` and `reading/page.tsx` keys it on `source.id`, so the URL
changed and the tab did not. Widening the key would remount the bench and
destroy the drafts `KEEP_ALIVE` exists to protect. It is now a callback the
Workbench owns (`onGotoVocabulary`), verified by clicking it.

### 6e. View as student — a lens, not a lock

TJ asked whether *"What others named — counted, not judged"* was for students.
**It is faculty/admin only** and always was (`VocabularyTab`'s `isStaff` gate,
re-checked by `overlayViewer()`) — the 08-08 ruling holds. It read as out of
place because it sits inside the faculty member's **own learner surface** with
nothing saying whose view it is. Hence the flag.

- **A cookie** (`src/lib/viewAs.ts` + `viewAsServer.ts`), not client state,
  because three differences are decided on the server: `/workflows` renders
  three flows for staff and one for a student; the Library query returns
  `isVisible=false` rows to an admin; and `getActiveCourse` is what tells every
  client surface it is staff at all. A URL param was rejected — `/keep` is
  prerendered, `useSearchParams` already forced a Suspense boundary once, and
  the header's plain `<a href>` navigations would drop it silently.
- **Masked once**, in `getActiveCourse`, so every consumer goes quiet together
  and none of them has to know the lens exists. `staffTruly` rides along
  **unmasked, for one purpose**: drawing the control that takes the lens off.
  Without it a staff member could put the lens on and have no way back.
- **Withholds, never grants.** Every use hides a control or NARROWS a query, so
  a student who sets the cookie by hand gets what they already had. It is not a
  security boundary and `authorizeSourceAccess` is deliberately untouched.
- Turning it on while standing on `/admin` returns you to the Library — a
  student cannot be there, and with the staff group masked nothing on the page
  would admit it. The `/admin` gate itself is unchanged: a lens, not a lock.
- **The header pill now reads from the COURSE, not the session.**
  `session.user.isAdmin` is the site role and the lens cannot touch it — which
  is exactly how a "viewing as student" header would have kept wearing an Admin
  pill. It shows **Admin** / **Faculty** (faculty had none before), and the
  duplicate **Administration** and **Cohort Map** buttons are gone: the staff
  group replaced them, finishing §6d.

**Limits of the illusion, honestly.** The shelf count did not change under test
because **all 23 seeded readings are visible** — the unpublished path is right
but unexercised by this data. And a faculty member sits in the Faculty Section,
which `peersOf` excludes, and their own loom is usually empty: the lens shows
what a student's Loom *looks like*, never what a given student's *contains*.
`/admin/user/[id]` stays the tool for that.

Covered by `tests/faculty.spec.ts` — "the student lens hides every staff
surface, and gives a way back", which asserts **absence**, because the failure
mode here is silent.

### 6f. Who can reach what — the matrix, and two holes it found

TJ, 2026-08-09: *"i think we need a matrix of what roles have access to. this
can go in the workflows."* and *"put the workflows next to courses, to the right
of it."*

**Workflows moved into the staff group**, right of Courses. It is still not an
admin surface — a student reads their own flow — so the header keeps the link
for anyone with **no staff group to carry it**. That falls out rather than being
special-cased: a staff member wearing the student lens has `isStaff` masked, so
the header link comes back exactly as a student sees it. `faculty.spec.ts`
asserts that handover.

**`src/lib/capabilities.ts` is the matrix**, on the same contract as
`workflows.ts` — the file IS the artefact. `/workflows` renders it under the
diagrams, for everyone: the flows show how each person *moves*, this shows what
they may *reach*, and a student learning that the overlays are not theirs (and
why) is the tool being honest rather than quiet.

Two rules are written into the file, because both were nearly broken while
writing it:

1. **Name the gate that REFUSES, not the UI that hides.** A hidden button is not
   access control — a Server Function is callable directly.
2. **Do not write a row you have not read.** A plausible row is worse than none,
   because this gets used to reason about who can see what.

`scripts/check-workflows.ts` gained 22 assertions: every `gate.file` exists,
every `gate.symbol` still appears in it, every `qualified` verdict carries a
note, every `ui-only` row states its hole. **It caught a wrong row on its first
run** — `roster-invite` named `requireAdmin` in `admin.ts`, which uses
`checkAdmin`. `gate.line` is deliberately NOT asserted: line numbers rot on
every edit, and a checker that cries wolf gets switched off.

**Two real holes came out of deriving it, both verified in the source and both
fixed:**

- **`peersOf` excluded `FACULTY` but not `INSTRUCTOR`.** `enrolInvitedCourses`
  writes `courseMemberships.role = "INSTRUCTOR"` for an admin who joins by
  invitation (`auth.ts`), and no gate reads that string — it passes everything
  by being an admin instead. But `peersOf` matched `ne(role, "FACULTY")`, so
  **an admin's own captures counted as a peer in both overlay bands** — which is
  decision 4 in that same file, eight lines above: *"an exemplar cloth read as
  'your cohort' would be the instructor pre-coding the text, which is the thing
  the gate exists to prevent."* Now matched positively: `eq(role, "LEARNER")`.
- **`createByte` never authorized its `sourceId`.** `attributeBytes` does, with
  a comment naming the risk exactly — *"that admitted any reading in the
  library, including another student's private upload"* — and the sibling
  function in the same file took `sourceId` straight from the client. The UI
  only offers shelf readings, so this was **UI-hidden and server-permissive**: a
  direct Server Function POST could file a passage against a staged reading or
  another student's private upload and pull its title into the graph and the
  export. Now `authorizeSourceAccess` runs first, only when a sourceId is
  claimed (a hand capture with none is a legal unattributed passage, P0.1).

**Recorded in `MATRIX_NOTES`, not fixed** — these are TJ's calls:

- **There is no stored "Student" role.** It is the absence of two flags: an
  active membership that is not FACULTY, held by someone who is not a site
  admin.
- **`INSTRUCTOR` is written and never read.** Either write `"FACULTY"` at
  `auth.ts`, or leave it — `peersOf` no longer depends on the answer.
- **Faculty are not admins for readings**: they cannot see or open a staged
  reading, even in their own course. The model doc's §4 describes Library as one
  "Admin/Faculty" view; the build gives it to admin alone. **§3 lines 158/160
  also still promise students the Passages and Concepts/Links Overlays, which
  the 08-08 ruling removed** — the model doc is out of date on both.

**Two more found and NOT fixed, deliberately** (from the same sweep, verified
by quotation but not by me): `authorizeSourceAccess` falls fully open to
unauthenticated callers when `NODE_ENV !== "production"` — deliberate and
commented, but it is the only gate whose *shape* changes by environment, so a
preview built as development would be open. And `getUserLoomDataAsAdmin` gates
the course but not the target's membership, so a **removed** member's work stays
readable to faculty.

### 6g. Access is its own tab, and the reference pages keep the frame

TJ, 2026-08-09: *"the workflows tab should behave like the others, change what
is below, not replacing the frame."* and *"make 'access' its own tab."*

- **`src/components/ui/MetaPage.tsx`** is the frame for a reference page.
  `/workflows` was a bare `<main>`, so reaching it from the journey bar made the
  bar itself vanish — the whole frame was replaced rather than the work inside
  it. Both pages now wear the same scopebar / journey / footer as the Library
  and Keep, with no station `active`: they are not steps on the student's arc.
- **`/access`** is the matrix, on its own. Under the diagrams was the wrong
  shape — the flows are a picture of *movement*, this is a table of
  *permission*, and a reader looking for one had to scroll past the other.
- **Staff only**, unlike Workflows — not because the contents are secret (they
  describe gates, not data) but because each row cites the **file and line**
  that enforces it, which is maintainer's material. A student asking "why can't
  I see the overlays?" should be answered in the surface, not in a table of
  source references. `tests/access.spec.ts` asserts a student is returned to the
  shelf and keeps their header Workflows link.
- The gate deliberately does **not** consult the student lens, for the same
  reason `/admin` does not: the lens hides the tab, and a lens is not a lock —
  turning it on should not eject a reader from a page they are mid-way through.

### 6h. The staff group's order, and 01 Reading greys out too

TJ, 2026-08-09: *"i think the admin/faculty tabs should be courses, readings,
roster, cohort graph, workflows, access"* and *"should 01-reading be greyed out?
we cant get there except through the library."*

- **Ordered the way the work happens**: make the course, put readings in it, see
  who is enrolled, read what they wove — then the two reference pages, which are
  read rather than worked. The admin-only pair leads, so a faculty member's
  group starts at Roster rather than opening with two gaps.
- **01 Reading greys out.** Yes, and for a sharper reason than 02/03/04: its
  href went to `/`, which is the station immediately to its LEFT — a second
  door to one room dressed as a door to another. It carries its own reason
  ("pick a text in the Library — opening one is how you get here") because the
  general one would have been circular on the Reading station itself.
  Verified nothing depended on the link: every spec targets `nav button`, the
  handler form that only exists inside a reading.

**A real flash this exposed.** `Workbench`'s loading branch rendered `JourneyNav`
with **no** `onStation`, which used to draw plain links and now draws four
GREYED stations — so a direct load into a reading flashed "these are
unavailable" and then corrected itself. Measured by polling the bar every 60ms
through a direct load: `ASSSSA +loading` before, `ABBBBA +loading` after. The
tabs are local state, so the handlers are valid before any data arrives; only
the content below is not ready.

**Sizing:** six staff items plus six stations wrapped the bar to two rows at
1440px — an ordinary laptop — costing 47px of height on the reading station,
where height is worth most. Staff items are 14.5px with tighter side padding;
one row now down to 1440, two rows at 1280 and below, which is fair for twelve
items.

### 7. Traps this session

- **`overflow: hidden` vs `overflow: clip` on `.pdf-body`.** Clip makes no
  scroll container, so the parked card cannot be scrolled into view by a stray
  `focus()`. But **`scrollWidth` still reports the overflow either way** — the
  scrolling *area* is not the same question as whether the box scrolls. That is
  why `tests/pdf-fit.spec.ts` now measures `.pdf-stage` by name instead of
  walking two `parentElement`s up from `.react-pdf__Document`.
- **Do not edit source while the Playwright suite is running** against the
  hot-reloading dev server. Cost one confusing mid-run failure.
- A `const` used in a `useEffect` dep array must be declared **above** that
  effect — the design spec sited `requestToggleWork` below it, which is a
  temporal-dead-zone crash on first render.
- The CSS in `PdfViewer` lives in a **JSX template literal**: a backtick inside
  a comment there closes the string and the whole reading fails to parse.

### 8. Still open

- **The screen snip** — [docs/screen-snip.md](docs/screen-snip.md), rewritten
  this session. It is **much smaller than the old handoff claimed**: a snip of a
  library PDF needs no image storage at all (rect + `sourceId` + page, rendered
  on demand, exactly as `sourceRepairs.region` and the crop route already do).
  TJ settled the export question — *"the snips will be small, i'm not worried
  about the copyright"* — so the image embeds. One number left open: the size
  cap, worth measuring against p56 rather than guessing.
- **Cloth co-authorship**, **05 Weave**, **the Faculty Section in the section
  picker**, **several modes of reading** — all carried over unchanged from
  08-08 §5.

---

## Addendum, 2026-08-08 (a long day of TJ's rulings — history, but still true)

**Nineteen commits on `dev`, `c3761a0`…`c50c5c4`, all pushed.** `npm run check`
(now including `check:workflows`), `next build` and the Playwright suite
(**43 passed / 1 skipped**) are green at the end of every one. **No migration
all day** — nothing this session changed the database.

This replaces five separate 08-08 addenda written as the day went; they each
said "read this first", which stopped being useful. Nothing below is lost from
them.

---

### 1. What TJ ruled, in the order it happened

Each of these is recorded in `docs/loom-model-build.md` (the authority) and
reflected in `docs/contracts.md` (as built).

- **Station 03 is Vocabulary** — the User's holdings: every Concept and Link
  Label across all readings, filter, edit Descriptions, **merge** (its only
  home). The cloth prompts and a *duplicate* read editor moved to the graph tab
  as `ClothReflection`.
- **00 Reading and 01 Open merged** into one **Reading** station: the text, with
  the capture log in a rail beside it.
- **05 Weave is hidden** (not deleted — `hidden: true` in `JourneyNav`'s
  `STATIONS`); **Keep stays** as a ratified deviation (D4 answered).
- **Linking works on this reading's concepts only.** The "from your other
  readings" band and the across-readings shuttle draw are gone. A concept met
  elsewhere joins the warp by capturing a passage here under it.
- **A Concept may precede its evidence** — name it, gloss it, then read for
  support. "No evidence" is a designation, never a warning.
- **A cloth starts in Reading**, is *named* there too (`ClothFold` moved), and
  the reading card is **the one door**: no Create Cloth button, the cloth row is
  metadata (title, "edited …").
- **Cloth cardinality**: *one cloth per reading per user, but a cloth may have
  several users.* Ratified; **not built**. See §5.
- **Overlays are faculty/admin only**, with a **section picker** (off · All
  sections · each by name).
- **03 and 04 swapped**: 03 Knowledge Graph, 04 Vocabulary.
- **Workflows moved to `/workflows`**, out of `/admin`, into the header beside
  About. Students see the student flow only.

### 2. The sentence the model now hangs on

> **The Cloth is the evidence; the Projection is the lens — and they work
> together, because the evidence is subject to interpretation by the reader.**

TJ's, and then TJ's own correction of it, which is the important half: choosing
which passage to keep is *already* judgment, so a Cloth is never raw evidence
and its Description is interpretive **by design**. The difference between a
Cloth and a Projection is **level, not kind** — the Cloth is the reading you
made while gathering, the Projection re-reads it by arranging.

That one line settles four things that arrived as separate questions: why a
second cloth is redundant *for interpretation*, why the read paragraph belongs
to the Projection, why the cloth is named where its evidence is gathered, and
why Cloth Description stays put. Model doc §2, "Reading · Cloth · Projection".

### 3. Bugs found by looking, not by type-checking

Each of these compiled and shipped fine:

- **`/admin/library` 500'd for faculty.** It had no page-level gate and leaned
  on `getLibraryOverview` *throwing* `Unauthorized`. Invisible until the shell
  learned to admit faculty. **House rule: a page under `/admin` gates itself.**
- **The header's "?" was dead on every `/admin` page.** It dispatches
  `loom:walkthrough`; `FirstRunWalkthrough` was mounted only on the shelf, Keep
  and the workbench. Now mounted once in the root layout.
- **React 19 hoists `<title>` into `<head>`**, so an SVG `<title>` per diagram
  node threw a hydration error.
- **JSX drops a literal space after an expression at a line end** — "7
  conceptsfrom your other readings". Fixed with an explicit `{" "}`.
- A **faculty viewer's Section band was structurally empty** (they sit in the
  Faculty Section, which `peersOf` excludes) — which is what the picker fixed.

### 4. Traps that cost time today

- **The suite's summary line never flushes** when a dev-server child holds the
  output open — this affects a redirect to a file, not just a pipe.
  **`grep -c "^  ok "` with no `^  x ` is the reliable signal.**
- **A failed run leaves capture residue** on Test User A (duplicate test
  concepts) which then fails the *next* run for an unrelated reason.
  **`npm run seed:demo` before believing a second failure.**
- `enterReadingFromCard` in `tests/helpers.ts` is now the single way a spec
  enters a reading — **six spec files** go through it rather than clicking
  `.shelfmain` themselves.
- Station numbers are **derived** from the visible stations
  (`JourneyNav.VISIBLE_STATIONS` / `stationNumber()`), and the workbench footer
  reads from the same place. **Student copy should name a station, not number
  it** — "Keep", not "06 · Keep".
- **`src/lib/workflows.ts` IS the diagram.** A workflow change is not finished
  until that file says so; `npm run check` fails on dangling edges and orphan
  nodes but cannot tell you the picture has fallen behind. `AGENTS.md` says so.

### 5. Open — TJ's calls

- **Cloth co-authorship** (the several-users half of the ratified cardinality).
  Not built. The blocking work is `cloth_member`, membership-based
  authorization across **84** row-ownership checks, and an export contract that
  can name more than one author. Full analysis, including why sharing beats
  partitioning: **`docs/cloth-cardinality.md`**.
- **05 Weave** — hidden pending a decision on what it becomes. `JourneyNav`'s
  old comment claimed TJ ratified it as its own station on 8/1; that is an
  agent's summary, not TJ's word, so treat it as unverified.
- **The section picker lists the Faculty Section**, which always reads empty
  (ruling 4 excludes faculty from peer counts). Drop it from the list?
- **Several modes of reading** are expected inside 01 · Reading (TJ). Nothing
  built; noted in the model doc's tab 2.

### 6. Next, and ready to start

Two items TJ raised and asked for, in size order:

1. **Capture log → "Notes", as a slide-out.** TJ: *"the current capture log
   button is a little weird. it seems like it should be 'notes' at least, if
   not having the ux also changed."* Today it is a rail toggled from the PDF
   toolbar (`.readinglog`, `openCaptureLog` in `tests/helpers.ts` drives it).
   The rename is small; the slide-out/toast behaviour is the real work.
2. **Manual capture for unselectable diagrams**, and possibly a **screen snip**.
   TJ: the concept maps in *Learning How to Learn* (p56 is the known-damaged
   sideways one) have no selectable text, so highlighting cannot reach them —
   which is a better justification for by-hand capture than the copy currently
   in the fold. **A snip is a bigger feature**: `byte` has no image column and
   the blob store would need a path for it, so scope it separately.

### 7. Carried over, still true

- **Next's queue bug** (vercel/next.js#90467) is routed around, not fixed;
  re-measure with `scripts/repro-action-bounce.mjs` after a Next upgrade.
- **CI's `e2e` gate has never run** — it needs `CI_DATABASE_URL` and
  `CI_BLOB_READ_WRITE_TOKEN` (deployments.md §CI). Until then only `checks`
  gates a PR, so the 43-test suite is *not* the gate.
- **The fresh-GitHub-account sign-in** has still never been run by a human.
- The pulled Vercel env file is now **`.env.production.pulled`** — `next build`
  runs clean with it in place, and `LOOM_ENV_FILE` still reaches production.
  It holds a **real** production `DATABASE_URL` and blob tokens; only
  `GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are
  `[SENSITIVE]` placeholders.

---

> **Everything below is history.** It is kept for the reasoning and the
> measurements, not as a description of the build. Where it disagrees with the
> 08-08 addendum above — and it does, on the station list, the reading card, the
> Overlays and station 03 — **the addendum above wins**, and
> `docs/loom-model-build.md` wins over both.

## Addendum, 2026-08-07 latest (the shelf bounce, fixed at the mechanism)

**Read this first. The navigation bounce — the highest-value open item the
previous addendum left — is fixed, and the fix is measured, not reasoned.**

One commit on `dev` after `5af0aa2`. `npm run check`, `next build` and the
Playwright suite are green; **no migration** — this is a transport change, not
a data one.

### What it actually was

Not a race between the shelf's own fetch and the `<Link>`, which is what the
previous session guessed. Instrumenting Next's client router (patched, traced,
restored) showed a **queue-corruption bug in Next itself**:

1. Three read Server Functions queue on load at `/` — `getSources`,
   `getActiveCourse` (both ReadingsProvider) and `getUserLoomData`
   (LoomProvider). The one in flight at click time is `getActiveCourse`.
2. The click dispatches a navigation. Next marks **only the currently pending**
   action discarded — the ones queued *behind* it are untouched.
3. The discarded action's late response still drives the queue: it advances
   `pending` past the still-running navigation and starts the next queued read
   **early, against the pre-navigation state** — so `getUserLoomData` POSTs to
   `/`.
4. That read returns no redirect, no revalidation and no flight data, so the
   reducer takes its bail-out path and hands back **its input state**, which
   `handleResult` commits — silently rolling the queue's `canonicalUrl` back to
   `/` *after* the navigation had committed `/reading/<id>`.
5. Nothing looks wrong yet: React applies the transition updates in dispatch
   order, so the rendered URL stays right while the queue quietly holds `/`.
   Seconds later the first workbench read POSTs to `/`, the server answers with
   the library, and the student is thrown out of the reading.

Upstream this is **vercel/next.js#90467** — a regression introduced in Next
16.0.0, still unfixed in 16.2.x (the only candidate patch, PR #91044, is
unmerged). The margins are milliseconds: in the one clean run of six, the
discarded response landed 11 ms *after* the nav commit instead of before.

### The fix: client components do not invoke Server Functions for reads

Next's own docs (vendored, `01-getting-started/07-mutating-data.md` and
`02-guides/backend-for-frontend.md`) already say not to: *"Server Functions are
designed for server-side mutations… Server Actions are queued. Using them for
data fetching introduces sequential execution."* Reads were only ever on the
queue because that is the path of least resistance.

- **[src/lib/reads.ts](src/lib/reads.ts)** — the client's read surface. Same
  names, same signatures, same shapes as the actions; each one GETs a thin
  route. Client components import reads from here, **never** from
  `@/actions/*`. JSON drops `Date`, so the loom and the capture log are revived
  on arrival.
- **Twelve route handlers** under `src/app/api/` (loom, loom/events, sources,
  course, three search, two overlays, repairs/settings, two draft-metadata),
  each calling the *same* action function server-side —
  [src/lib/readRoute.ts](src/lib/readRoute.ts) maps `Unauthorized`/`Not found`
  to 401/404 and everything else to a logged, generic 500. **Auth is unchanged
  and unduplicated**: it still lives in the action, so both transports enforce
  the same gate (including overlays' deliberate no-dev-backdoor rule).
- Route handlers "do not participate in layouts or client-side navigations"
  (`15-route-handlers.md`), so a read can no longer move the router. Mutations
  stay Server Functions — that is their sanctioned use.

Verified all twelve are **ƒ (Dynamic)** in the build output. Worth checking if
you add another: a statically prerendered `/api/course` would serve one
student's course to everyone.

### The one thing the transport change broke, and how it is handled

Through the queue, reads were serialized *behind* writes. They are not any
more, so a "reload the truth" response could set out before a student's gesture
and land after it — erasing a row they can see, and leaving an in-flight
`createConcept` with no temp row to swap its server id onto (the concept would
vanish until reload). LoomProvider now keeps a **write epoch**: every
optimistic write goes through `applyLocal` and bumps it, whole-truth
replacements (`applyTruth`: merge, the imports, reset, worked example, the
sign-out blank) bump it too, and `loadLoom` applies only if the epoch it set
out under still holds. All raw `setState` calls now live inside those three
appliers — grep it if you add one.

### Measured

`scripts/repro-action-bounce.mjs` is now a **check, not a reproduction**: it
expects 0 and exits 1 on any bounce. Against a production build (`next build &&
next start -p 3100`), Test User A, "Object Worlds":

| entry | action | before | after |
|---|---|---|---|
| shelf click | reading search | 2/4 bounced | **0/6** |
| shelf click | passages overlay | 2/4 bounced | **0/6** |
| direct load | passages overlay | 0/4 | **0/4** |

The per-run trace line now reads `GET /api/search/reading` where it used to
name an action POST — the read is off the queue, which is the fix, not a
mitigation of it. `tests/reading-search.spec.ts` (which enters by **clicking**
the card) gained end-of-test still-on-the-reading assertions, so the suite
would catch a regression; `tests/overlay.spec.ts` still enters by href, now for
tidiness rather than avoidance.

### What remains

- **Next's queue bug is still there**, and this fix routes around it rather
  than repairing it: a *mutation* in flight when a navigation commits can still
  corrupt the queue's canonical URL. Every mutation here is gesture-driven and
  the debounced ones flush on `pagehide`, so no known user path hits it —
  watch #90467/#91044 and re-measure after a Next upgrade.
- **Faculty path still untested through a browser** (carried over): the gates
  are asserted and the shell builds, but no spec signs in as FACULTY — the
  backdoor mints Test User A only. Worth a manual pass.
- **D4 and the Open/Reading merge** are still TJ's calls (08-07 morning
  addendum). Station 03 is labelled Vocabulary but still holds the
  read-the-cloth prompts.
- The [SENSITIVE] `.env.production.local` still breaks `next build`; this
  session moved it aside and restored it. Delete it or re-pull real values.

## Addendum, 2026-08-07 (P3.14 — the refactor spec is executed end to end)

**Read this first. P0–P3 are all landed; the work order has nothing left in it.**

One commit on `dev` after `6cffa02`. `npm run check` (now including
`check:overlay`), `next build` and the full Playwright suite (32 passed / 1
skipped) are green; dev DB unchanged — **no migration**, the overlays are pure
reads over rows that already existed.

### P3.14 — student Overlays (ruling 28), on TJ's four decisions

TJ ruled the open privacy/UX questions this session; they are enforced in
`src/actions/overlays.ts` and nowhere else, and written into that file's header
so the next reader doesn't have to reconstruct them:

1. **The gate stays, per reading.** The archived spec's red line #8 — "the crowd
   must not pre-code the text" — carries into v1. An overlay opens on a reading
   only once you have captured a passage in it yourself; at the whole weave the
   comparison covers exactly the readings you have coded.
2. **Section and Cohort only.** No "me + colleague" band in v1, so nothing the
   server returns is a name, an id, or resolves to one. Counts are of **people**
   (one student filing four passages under a label counts once).
3. **Shared objects only** — spans, Concept Labels + Descriptions, Link Labels +
   Descriptions. The passage query selects no `content`. Notes, questions,
   pull-quote flags, passage tiers, cloth and projection text never travel.
4. **Faculty are not peers** in either band: an exemplar cloth read as "your
   cohort" would be the instructor pre-coding the text.

What shipped: `getPassagesOverlay` / `getVocabularyOverlay` (a fifth
`"use server"` module — shapes and arithmetic in `src/lib/overlay.ts`, asserted
without a database by `scripts/check-overlay.ts`); an **Overlay · Section ·
Cohort** control in the PDF toolbar that shades peer spans in five slate steps
under a status line that states the denominator; and **What others named** below
the read on 03 · Vocabulary. Both are off until asked for, and re-ask when your
own capture count changes so the capture that opens the gate opens the overlay.

Two details worth not re-deriving:

- **Depth comes from a sweep line, not from row counts.** Overlapping captures
  become disjoint runs carrying their overlap depth (`heatSpans`), so eleven
  people on one sentence is one span at depth 11, not eleven spans.
- **Your own yellow nests inside the wash and paints over it.** Since "did
  anyone else mark what I marked?" is the most interesting thing the view
  answers, the overlay also draws a slate rule *above* the words — yellow
  underlines, slate overlines, neither hides the other.

`npm run seed:demo` now seeds **Test User C and D** into a new **Section 1**
alongside A (B stays unplaced and empty — it is still the fresh-account
fixture). They each capture the same passage A did on each reading plus one of
their own, and share two labels, so the overlay has a real depth-2 run and a
word held by two people. Without them every assertion in `tests/overlay.spec.ts`
would pass against an empty comparison.

### Found while verifying: a pre-existing navigation bug, not fixed

**Enter a reading by clicking its shelf card, then call any Server Function, and
about half the time the function POSTs to `/` instead of `/reading/<id>` — the
server answers with the library's tree and the App Router replaces the workbench
with the library.** The student is in a reading one moment and on the shelf the
next, mid-work. Measured against a **production build**, so it is not a dev
artifact:

| entry | action | bounced |
|---|---|---|
| shelf click | reading search (`searchReading`) | 2/4 |
| shelf click | passages overlay (`getPassagesOverlay`) | 2/4 |
| **direct load** | passages overlay | **0/4** |

So it is the client-side entry, not the action — the overlay only made it easy
to hit. Same family as audit finding U-3 (navigation racing in-flight action
POSTs); the likely culprit is the shelf's own `getUserLoomData` POST still in
flight when the `<Link>` navigation commits, leaving the router's canonical URL
behind on `/`. The tell in the trace is `history.replaceState -> /` from Next's
own router mount effect.

- Reproduce: `node scripts/repro-action-bounce.mjs 4 overlay` (and the control,
  `DIRECT=1 … `). It is a **reproduction, not a check** — it exits 0 either way
  and is expected to report bounces until this is fixed.
- `tests/overlay.spec.ts` enters by href for this reason and asserts it is still
  on the reading at the end of every test, so it can never pass through a
  bounce. **`tests/reading-search.spec.ts` still enters by click and is latently
  flaky for the same reason** — worth fixing with the bug.
- Left alone deliberately: the fix is in `LoomProvider`'s fetch lifecycle, which
  is its own piece of work with its own risk, and nothing in P3.14 depends on it.

### What remains

- **The navigation bounce above** — now the highest-value open item: it is
  user-visible, reproducible, and pre-existing.
- **Faculty path still untested through a browser** (carried over): the action
  gates are asserted and the shell type-checks and builds, but no spec signs in
  as FACULTY — the backdoor mints Test User A only. Worth a manual pass.
- **D4 and the Open/Reading merge** are still TJ's calls (see the 08-07 morning
  addendum). Station 03 is labelled Vocabulary but still holds the read-the-cloth
  prompts rather than the model's Concept/Link lists; the overlay was added there
  because that is where the ruled tab lives, and it will sit correctly when the
  tab's own content is reconciled.
- The [SENSITIVE] `.env.production.local` still breaks `next build`; this session
  moved it aside twice and restored it. Delete it or re-pull real values.

## Addendum, 2026-08-07 late (P3.13 and P3.12's auth side — P3.14 is all that remains)

**Read this first; the morning addendum below is now history except where noted.**

Two commits on `dev` after `78d3b19` (the auth workstream, which unblocked all
of this). Typecheck, build and the Playwright suite are green; dev DB unchanged
(no new migrations); `docs/contracts.md` re-stamped.

- **P3.13 — the cloth reaches the card.** A reading card is now a `<div>`
  whose reading link is `.shelfmain` (Playwright specs click that, not the
  card); below it the cloth row: badge (count, titles on hover), **Create
  Cloth** (explicit — creates the row via `saveCloth`, then walks in) and
  **Open Cloth** labeled by title. One cloth per scope still (schema unchanged)
  — the row renders a list so several-per-reading lands free. Cloth
  Title/Description are edited in a fold on **02 · Linking** (`ClothFold` in
  ThrowTab) — which also restores an editor for the whole-weave cloth's
  description, orphaned since 0021 absorbed `read`. `updateCloth` in
  LoomProvider now takes an optional explicit scopeKey and returns success.
  Shelf's July strings converted ("N passages", `00 — LIBRARY` footer).
  New spec: `tests/cloth.spec.ts` (idempotent — no cloth delete exists, so it
  takes whichever of Create/Open the card offers).
- **P3.12 auth side.** `/admin` now admits course FACULTY to the read-side:
  layout gate via `listFacultyCourseIds`, nav shows them Roster + Cohort Graph
  only, pages resolve their course through the new `getStaffViewer` (so
  faculty entering `/admin` bare land on *their* course), and the roster
  renders write controls admin-only. Roster rows carry `role`; a **Make
  faculty / Return to learner** toggle posts `setMemberRole`. Enrolment-time:
  an invitation pre-assigned to the course's `faculty`-slug Section enrols as
  FACULTY — fresh enrolment only, asserted in `scripts/check-auth.ts --db`
  (the invite hint on the roster explains this to instructors).

### What remains

- **P3.14 (student Overlays, ruling 28)** — untouched, deliberately: it needs
  TJ's privacy/UX decisions (below). Server side can largely reuse
  `getAggregateLoomData` behind a member-level gate.
- **Faculty path untested through a browser.** The action gates are asserted;
  the shell (nav filtering, getStaffViewer resolution) type-checks and builds
  but no Playwright spec signs in as a FACULTY member — the suite's backdoor
  mints Test User A only. Worth a manual pass: promote a second account on
  `/admin`, sign in as them, confirm Roster + Cohort Graph and nothing else.
- The [SENSITIVE] `.env.production.local` still breaks `next build`; this
  session moved it aside for the build and restored it. Delete it or re-pull
  real values — it costs a mv/mv every build until then.

## Addendum, 2026-08-07 (the refactor spec, executed: P0–P2 complete, P3 partial)

**The spec is no longer behind the build — the build now speaks the model.**
Five commits on `dev`: `068dcac` (docs reorg: `docs/loom-model-build.md` is the
authority, the work order is `docs/loom-refactor-spec.md`, superseded specs are
stamped in `docs/archive/`), `38a8298` (P0 — migration 0021: `byte_concept`
pointers, Unlabeled Passages legal, passage margin fields, `edges.sentence`
optional, `cloth` table absorbing `read`, mirror dropped, `byte.capture` +
`unfileByte`), `ca97b4a` (P1 — `mergeConcepts` + homonyms warned-never-forbidden,
unified search over own concepts/links/passages with migration 0022, the
unattached Unlabeled-Passages group in the projection view), `f647b82` (P2 —
the naming sweep: projection / passage / label / description / one-line /
Knowledge Graph / Capture Log everywhere a student reads, tongues removed),
`22247cf` (P3.12 core — Faculty Section per course, `setMemberRole`,
`checkCourseFaculty` on the four read-side admin actions). Typecheck, build and
the full Playwright suite (28 passed / 1 skipped) are green after every one;
`docs/contracts.md` is re-stamped at each step. Dev DB is migrated through 0022.

### What remains of P3, and why it waits

- **P3.13 (reading-card Create Cloth / Open Cloth buttons, count-with-hover,
  rulings 20–22/33)** — lives in `Shelf.tsx`, which carries the UNCOMMITTED
  auth workstream; land that first, then also convert Shelf's July strings the
  P2 sweep deliberately skipped ("N bytes" tally line, `00 — READINGS` footer).
- **P3.12 auth-side** — faculty entry in the UI and any enrolment-time role
  assignment live in `src/lib/auth.ts` (same uncommitted workstream). The
  action-layer gate is already in.
- **P3.14 (student Overlays, ruling 28)** — Passages heatmap in the Reading
  tab; Concepts/Links overlays in Vocabulary; me+colleague · Section · Cohort
  granularity. Untouched: it needs privacy/UX decisions (what a student sees of
  a colleague's work, how a colleague is picked) that deserve their own session.
  The server side can largely reuse `getAggregateLoomData`'s shape behind a
  member-level gate.

### Decisions still open (TJ)

- **D4**: Keep as a ratified sixth tab, or folded into Linking/Knowledge Graph.
- **Open/Reading merge**: the ruled five tabs assume one integrated Reading
  tab; stations 01 Open and 00 Reading are still separate (labels kept pending
  the structural merge).
- URL tab params (`?tab=map`) deliberately kept legacy (code-side per §F);
  rename only with a redirect plan.

### Toolchain notes from this pass

- Never hand-space a migration timestamp ahead of real time: drizzle's
  migrator skips any migration stamped earlier than the max applied
  `created_at` — 0021's future stamp silently swallowed 0022 until repaired.
- Hand-written migrations need a hand-derived `meta/*_snapshot.json` (0021's
  was derived from 0020's and verified by `drizzle-kit generate` reporting no
  drift) or the next `generate` re-emits the whole changeset.
- `.env.production.local` still holds literal `[SENSITIVE]` values and breaks
  any local production build; restore real values or delete it.

## Start here

`RepairPanel` is mounted and the loop **has been run end to end through the UI**
— detect → read → review → accept → apply, on *Design as Critique* page 9, with
the repaired revision written to blob and re-ingested. What that turned up is in
the evening addendum immediately below; it was none of the three things this
file predicted.

**The next open item is the one that has been at the top of the list for two
sessions: the spec is behind the build** (open item 2 under "Open items"). It
blocks the freeze, and nothing in the repair subsystem stands in its way.

## Addendum, 2026-08-04 evening (the repair loop, run for the first time)

**Read this before the morning addendum below; it corrects part of it.**

`npm run check` green. Uncommitted on `chore/alpha-foundation`.

### The panel is mounted

`/admin/library` — a **Repair Text** disclosure in each reading's action row,
next to Rescore, because rescore re-measures and this fixes. The summary says
where the reading is in the loop (`· 2 to review`, `· 1 to write`) so an admin
does not open eleven panels to find the one with a decision waiting. The page
fetches full proposal rows only for readings that have any, from one grouped
count (`getRepairSummary`), and passes each reading's `byte` count as
`hasHighlights`. `maxDuration = 300` is set on the page, which is what lets a
synchronous single-region read survive a serverless round trip.

**The panel had no Apply button** — `applyRepairs` existed and nothing called
it. Added, along with the result lines each act now reports.

### What the run cost and produced

Page 9, one region, **68s and $0.20**, 4 of 5 readers answering. Opus 5 took
66s and **$0.15 of the $0.20 — 77% of the spend** — and returned 2,097
characters against Grok's 7,561, because on the small type it wrote *commentary*
(`[two columns of body text, type too small to read reliably…]`) instead of
transcribing. That is the same shape as the reader the panel was built to
expose, now visible in the cost table rather than argued about.

`qwen/qwen3.8-max` did not answer. Measured directly afterwards: it returns
**HTTP 200 with an empty body after 184s**. Open item 2 is still TJ's call; the
timeout below stops it hanging a request either way.

### Four bugs, each found by running the thing

1. **The improvement guard passed a page deletion.** `applyRepairs` refuses a
   repair that "does not measure better" by comparing `garbledPageRate` — but a
   page with almost no text left is not *measurable*, so emptying a damaged page
   drops it out of both numerator and denominator and the rate falls. Measured:
   replacing page 2's 2,290 characters with the single word accepted for it
   moved the rate 0.750 → 0.727 and the guard **kept it**. Deleting a page read
   as repairing it. Now guarded per page, before the rate is consulted.

2. **The unit of repair was wrong.** `textLayerRepair` cannot edit a PDF's text
   operators in place, so it rasterises the page and lays a fresh text layer over
   it from the accepted transcription *and nothing else*. Sub-region crops
   therefore repair one paragraph by deleting the rest of the page — page 9 was
   proposed as **five** boxes, and applying them would have replaced 1,485
   characters with whatever those five held. The unit is now the page.
   `locateGarbleRegions` is deleted; `locatePageRepairRegion` replaces it.

3. **Detection measured the database; apply measured the file.** Detection read
   `source_page`, whose rows are a cache. On *Design as Critique* those rows were
   **stale**: nine pages of fused words (`oneofthe`,
   `mostinterestinguses`) where the same pages extracted from the blob read
   `For us, one of` at a 1–2% rate. Detection reported nine damaged pages on a
   reading that has one. Both halves now extract the file. *(This corrects the
   "lost spaces" reading of those pages — the file never had that defect; the
   rows did. The lost-space case is real and still reported as `unlocatable`,
   it just was not what was happening here.)*

4. **`REQUEST_TIMEOUT_MS` was `30`, not `30_000`** — 30 milliseconds, changed in
   83eab85. Every judge call aborted before a TLS handshake could finish, so
   **the judge had silently stopped running**: `structure` abstaining and
   `legibility` unrefined on every Rescore since. Verified by a live call failing
   at 35ms with `TimeoutError`, and verified fixed (3.5s, "OK").
   `VISION_TIMEOUT_MS` was `120_000_000` — 33 hours — where the comment says 120
   seconds; now 240s, above the slowest observed reading and under the page's
   `maxDuration`.

Also: expected refusals are now **return values, not throws** (Next redacts
thrown Server Function messages in production, and every refusal here is a
sentence someone has to read); crops are capped at 2,560px on the long edge,
because the readers downscale past ~2,576 and a 300dpi page was 3.7MB of base64
sent five times for pixels nobody saw; and region boxes are whole pixels, since
they become a canvas.

### Verified, not assumed

- *Design as Critique*: 1 damaged page before, **0 after**; page 9 replaced,
  every other page byte-identical in extraction (same chars, words, item
  counts) — the pdf-lib round trip changed nothing it was not asked to.
- *Learning How to Learn*: detection finds **p56** (75%, the sideways concept
  map — `peuosiad`, `paionnsuoo`), plus p57 and p58; its one highlight
  correctly renders the refusal notice.
- The crop route's auth was **fine** — no 4xx across any run.

### Worth knowing before touching this again

- **26% of page 9's sentences carried a majority.** 92 disagreements, 105 of 124
  distinct sentences backed by one reader alone. That is a photographed
  newspaper in dense columns and it may be the honest ceiling for such a page —
  but it means the *agreed* text alone (325 characters) can never pass the
  page-coverage guard, and a reviewer must compose from the readers. That is
  what the panel is for, but nobody had seen how much composing it takes.
- **`acceptedTextMatchesReadings` cannot catch a reader's own commentary** — it
  checks the text came off the page, and Opus's bracketed notes *are* a reader's
  words. Documented as a limit; now observed. The accepted text was checked and
  carries none.

## Addendum, 2026-08-04 morning (extraction, anchoring and repair session)

**Read this first; it supersedes parts of what follows.**

Branch `chore/alpha-foundation`, uncommitted. `npm run check` is green and now
runs lint, tsc, and two assertion scripts (`check:remap`, `check:scoring`).
`npm run check:textlayer` needs real PDFs and is run by hand.

### Landed in production (both databases migrated)

- **Migration 0016** — the `source_page` and `byte` foreign keys that
  `schema.ts` had declared since 0000 and that existed in **no** database.
  `deleteSource` had been relying on a cascade that was not there; 15 orphaned
  page rows were cleared from each environment. Plus indexes on `byte.sourceId`
  and `source_page(sourceId, pageNumber)`.
- **Migrations 0017 / 0018 / 0019** — `source_repair` and
  `source_repair_reading`, with per-reading token, cost and duration accounting,
  and the vote record for each region.
- **All 23 readings re-extracted.** The canonical text join changed (below), so
  every `source_page` row was rewritten. **23/23 highlight anchors survived** —
  verified, not assumed.

### The join fix, and why it mattered

`extractPdfPageText` joined pdf.js text items with `""`, discarding every line
boundary pdf.js had already computed. Consequence, measured against real
Postgres: `CraftBuilding` tokenises to `craftbuild`, matching neither `craft`
nor `building`, and **58–77% of line ends in this library fused two words**.
Reading search was silently missing them.

Stored text now records the boundaries; `textLayerProjection()` strips them back
out to recover **the browser's** text-layer string, which is where every
`startOffset`/`endOffset` actually lives — not the stored column. Anything
reconciling a client capture against stored page text must go through it.
`scripts/check-text-layer-projection.ts` asserts the round trip (42/42 pages
exact). Result: **+321 page-hits across ten common terms**, and the search index
shed ~26,600 junk tokens (42,940 → 16,333).

The warning that used to head `pdfText.ts` — "changing any of it silently moves
every existing anchor" — was **wrong**, and is corrected in place.

### Scoring, substantially reworked

Every change came from a measurement that contradicted the previous rule:

- `coverage` counted **all** pages, so a thesis of diagrams was penalised for
  being illustrated. It now counts pages that were supposed to carry text —
  `pdfStructure.ts` classifies each as `text` / `scanned` / `picture` / `blank`
  from a row-band profile (text bands at 5.0–8.9 per 100 rows, pictures at
  0.0–0.8; a six-fold gap with nothing between).
- `anchorability` was "at least 300 characters per page" — a proxy for whether a
  highlight holds that **never tested whether a highlight holds**. It now
  simulates captures (`highlightProbe.ts`) at 30/80/200 characters, sizes drawn
  from the real capture distribution where the shortest byte is 27 characters.
  Both readings that were failing on it anchor **100%** of simulated highlights.
- All character floors are gone. `PAGE_TEXT_FLOOR` stood in for "is this content
  or a running header", answered with length; repetition answers it properly,
  and catches the SAGE-watermark case the 120-character floor *admitted* (the
  stamp runs to ~159 characters).
- `legibility` used to be granted a **5** when there was too little text to run
  the language check — 693 characters of OCR noise scored 5/5/5 and passed. It
  now abstains, `pass` is three-valued, and the card shows "Unverified".
- The judge prompt was **telling the model to forgive** run-together words, the
  defect that matters most for quoting. Fixed. The judge can also no longer
  raise legibility past the measured ceiling, and a bug where the raw verdict
  was stored while the capped value drove `pass` is fixed.

### Gibberish detection and repair (new subsystem)

`garble.ts` finds scan-induced nonsense every aggregate misses — the characters
are valid, the letter distribution is perfect, and the page reads
`ihe feacier refigian haa`. Two restrictions make it honest: only **lowercase**
tokens count (proper nouns are capitalised, so bibliographies stop
false-alarming), and a page needs enough body words for the rate to mean
anything. Clean pages measure 1–2%; broken ones 30–81%.

`garbleRegion.ts` locates damage to a pixel box from the text layer, so crops
are exact rather than guessed. `repairPipeline.ts` sends the crop to five
independent frontier models. `repairConsensus.ts` computes agreement
**mechanically** — an adjudicator agent once returned a paragraph *describing*
the agreement, which was written into a PDF and improved every automatic measure
while being unrelated to the page. Agreement is by **majority**, not unanimity,
and the vote is recorded per reader: with-majority, outvoted, and *solo* counts.
Solo is the invention detector — `"from Saddam"` where three readers wrote
`"from Sadda"` shows as solo=1. Deciding a vote is exact (so `religions` and
`televisions` never merge); grouping the losers for display is fuzzy (so a
reviewer sees both variants of a disputed passage together).

`textLayerRepair.ts` writes an accepted transcription back as a replaced page. `src/actions/repairs.ts` and
`components/library/RepairPanel.tsx` are the admin surface.

### Open decisions — TJ's, not the next session's

1. ~~**Mount `RepairPanel`**~~ — done, and the loop has been run. See the
   evening addendum.
2. **`qwen/qwen3.8-max`** took 210 seconds when this was written, and on the
   run of 8/4 evening returned **HTTP 200 with an empty body after 184s** — so
   it is currently costing a reader slot and contributing nothing. Either it
   goes, or transcription moves fully behind `after()`. A 240s per-reader
   timeout now stops it hanging a request, which makes this a question about
   panel quality rather than about uptime.
3. **The panel is five readers** — Opus 5, Qwen3.8 Max, Gemini 3.6 Flash,
   Grok 4.5, Inkling Small. Odd on purpose: a majority cannot tie.
4. **Majority voting is in, with per-reader stats** (item 2 is what to spend
   them on). Nothing to decide unless the stats show a reader worth replacing —
   watch the `solo` column, which is where invention shows up. **First real
   numbers, page 9:** agreement 29% / 33% / 12% / 9% (Opus 5, Gemini, Grok,
   Inkling), solo counts 10 / 11 / 41 / 43. Read them as a property of the page
   before a property of the readers — a dense newspaper photograph is the
   hardest thing in this library — but Opus 5 spent 77% of the region's money
   for the shortest transcription of the four, which is the pattern this column
   exists to make visible.
5. **Upload gate** — spec line 139 says scoring is "advisory, not blocking".
   TJ's stated goal makes a gate unnecessary: a bad score means *source a better
   copy*, not *block*. Treat as decided against unless TJ reopens it.
6. **Git history** still holds the copyrighted seed PDFs. They are out of HEAD
   and gitignored. A purge needs `git filter-repo`, a force-push across six
   branches, and a GitHub Support request — the rewrite alone does **not**
   remove them. TJ chose to skip; not urgent, not closed.
7. **`tesseract.js` is installed and unused.** Measured as unnecessary here:
   every "scanned" page in this library is a cover, a blank leaf or a figure.
   Drop it unless a future upload needs it.

### Facts worth not re-deriving

- **`.env.local` is what every script reads.** `vercel env pull` writes
  `.env.production.local`, which nothing loads by default, and Vercel returns
  the literal string `[SENSITIVE]` for `DATABASE_URL` and five other variables —
  a pulled production file is **not usable as-is**. Use `LOOM_ENV_FILE`, and
  read the `database:` line every script now prints. PowerShell has no inline
  env prefix: `$env:LOOM_ENV_FILE = '.env.production.local'`.
- **Red line #6 is about students not outsourcing their thinking**, not about
  faculty preparing source material (TJ, 2026-08-04). Faculty-facing repair is
  not gated by it.
- **What text matters in a reading is not the tool's call.** A figure's labels
  and a reproduced newspaper are content a student may code.
- **The registry MCP is the authority on models.** Three things are not
  inferable from a model name, and all three would have shipped broken: image
  *generators* (`->text+image`) masquerading as vision models; `temperature`
  rejected by reasoning models; and `max_tokens` vs `max_completion_tokens`.
  Sorting by price is not sorting by recency.
- **Costs come from OpenRouter's `usage` reporting**, never a price table in
  this repo. Measured panel cost is **$0.18 per region**; the first estimate was
  50× low.
- **The two known-damaged pages** for testing: *Design as Critique* p9 (a
  photographed spoof newspaper) and *Learning How to Learn* p56 (a hand-drawn
  concept map printed sideways). Non-LLM rungs — rotation-aware re-OCR at
  400dpi — were measured and **fail on both**.

---


You are continuing work on Loom after the journey build of 2026-08-01 (which
followed the multiple-maps build of 07-31 and the reading-first pass of 07-30/31).

## Addendum, 2026-08-02 (alpha-foundation session — PR #4)

Read this first; it supersedes parts of what follows.

- **Open item 3 is closed.** The order-dependent `maps.spec` failure was a
  test-synchronization bug: `#saveDot` was still showing the *previous* save's
  1500ms flash on a warm server, so the spec reloaded early and **aborted the
  essence POST in flight** (the `ECONNRESET` in the server logs). Fixed by
  waiting on each action POST matched by its body, plus a strand sweep. The
  suite is now **24 tests in 8 files, all green in ~2.2m** — including new
  learner (00→06, Throw and Read covered for the first time) and admin journey
  specs. The underlying *product* bug (navigation aborts debounced saves;
  rename-during-create invisible in UI) is audit finding U-3.
- **New authorities:** [docs/audit-2026-08-02.md](docs/audit-2026-08-02.md)
  (full audit + alpha verdict), [docs/contracts.md](docs/contracts.md) (every
  contract surface), [docs/deployments.md](docs/deployments.md) (open item 1's
  plan in durable, checklisted form — the fresh-GitHub-account smoke test
  still stands and still cannot be automated),
  [CONTRIBUTING.md](CONTRIBUTING.md) (branch/PR/test rules).
- **Demo accounts:** `npm run seed:demo` → `test-user-a@loom.local` (3 maps
  from 2 readings, anchored verbatim passages, mirror-consistent) and
  `test-user-b` (enrolled, empty). Idempotent; the journey specs assert
  against it.
- **The gate exists:** `.github/workflows/ci.yml` (`checks` + `e2e`),
  CODEOWNERS, PR template; master branch protection requires a PR, the
  `checks` status and a code-owner review (`e2e` joins once its three CI
  secrets are configured — deployments.md §CI). A long-lived `dev` branch now
  exists for the tester deployment.
- The unpkg/pdf.js item in §5 below is **fixed** (worker vendored, 0f9f01b).
- Machine note: if the app serves pages but every `/api/*` route 404s, you
  have a stale `next dev` — kill the PID and `rm -rf .next`. And C: was found
  at 100% full on 8/2 (npm cache was ~14GB; cleaned to 15GB free) — check
  `df -h /c` before long runs.

## Where things stand

The app implements the v14 tool in full, on top of the production surfaces v14
has no equivalent for (auth, courses, the shared reading collection with
extraction scoring, PDF capture with anchored offsets). It is **reading-first**
(the reading is the entry point), maps are **per-scope, parallel and plural**,
and as of 8/1 the whole arc is **one journey bar** visible on every learner
surface.

- **The journey (ratified TJ 8/1):** `00 Readings · 01 Open · 02 Throw ·
  03 Read · 04 Map · 05 Weave · 06 Keep`, rendered by
  [src/components/ui/JourneyNav.tsx](src/components/ui/JourneyNav.tsx) under the
  header everywhere. A station you can work at *here* is a button (a workbench
  tab); every other station is a link. Outside a reading, Open routes to
  Readings — opening IS picking a text. On `/weave` the underline stays on
  **Weave** while throw/read/map act as its tools, so the bar always answers
  "where am I on the journey", never "which panel is showing".
- **Routes:** `/` is Readings (the course's readings by week, with the
  student's own counts); `/reading/[sourceId]` is one reading's workbench;
  `/weave` is every reading at once (`?tab=throw|read|map` deep-links);
  `/keep` is the whole artifact. **05 Weave is a station, not an escape hatch**
  — weeks 11+ mine and quilt the whole graph (deployment notes §4).
- **Say "readings", not "library".** The home screen is Readings in all student
  copy; "shelf" survives only as component and CSS names, which nobody sees.
  "Library" now means only the *instructor's* collection on `/admin/library`.
- **Maps (ratified TJ 7/31, spec §3 Map / §6):** tier is per concept PER MAP —
  `concept.tier` and the `reads` table survive only as expand-phase MIRRORS of
  the oldest whole-weave map, dual-written by `updateMap`/`saveView`/`deleteMap`
  in [src/actions/loom.ts](src/actions/loom.ts), so code rollback stays safe.
  The first sorting gesture in a fresh scope auto-creates "Map 1"
  (`ensureActiveMap` in LoomProvider). Export adds `graph.maps[]` +
  `views.maps` additively; import remints tier keys and synthesizes "Map 1"
  from pre-maps files, and re-scopes a map to the whole weave when its
  `scopeKey` doesn't resolve.
- **A map is a keepable artifact (ratified TJ 7/31 — see open item 2).** Each
  map exports as its own `loom-map` .json from 04 Map or 06 Keep, carrying its
  tiers, essence, paragraph, in-scope cards with their whole evidence, threads
  and arrangement — it stands alone — plus a readable .md outline. Importing a
  map file ADDS a parallel sibling (matched by card id, misses counted and
  reported); it never re-weaves missing cards and can never reach the replace
  path. The whole-cloth export remains the complete backup behind every map.
- **Scope** is read off the route in `LoomProvider`, and membership is derived
  from `byte.sourceId` in [src/lib/scope.ts](src/lib/scope.ts). **A concept does
  not belong to a reading — a byte does.** A concept emerges from a reading and
  may then be evidenced in several; nothing owns or re-homes one. See
  [docs/archive/reading-scope-and-map-passes.md](docs/archive/reading-scope-and-map-passes.md).
- **Every byte belongs to a reading.** Capture inside one stamps it; a student
  can mint a reference-only reading (title/author, no PDF) for anything the
  collection does not hold; passages with no reading are placed by *asking*,
  never by matching their citation text against titles.
- **Invitation, enrolment and access are three things (8/1).** The sign-in gate
  admits an invite, an active membership, the legacy allowlist, or an admin.
  Removal ends the *membership* — soft, `removedAt` (`0013`), work survives,
  re-invitation reinstates — and revokes sessions only when no access remains.
  Enrolment happens in `events.signIn`, not the `signIn` callback, because a
  first-time OAuth user's `user.id` is GitHub's, not ours, and the old insert
  could never survive its FK. Course resolution no longer falls back to "first
  course on the site" for non-members; admins keep the site-wide view.
- **One word per move.** A reading is **scheduled** (week, order, on
  `/admin/courses`); a learner is **placed** (into a section, on `/admin`). The
  header names the course you are working in, from a learner-safe
  `getActiveCourse()` resolved through the same enrolment that scopes the work.
- **Roster** is on `/admin`: invite in bulk (one email per line, optionally
  `email, Section name`), invited and enrolled shown as one list, pending first.
- **Graph vs. projections** (spec §6) is enforced in the schema: `concept.tier`
  is graph; card-table positions, edge bends, sort order and pinned definitions
  live in `view` rows; `read` has its own table; `graph_event` is the
  append-only development history, replayed in Read as "the cloth, over time".
- **Parity is reconciled, the audit docs are not.**
  [docs/v14-parity-audit.md](docs/v14-parity-audit.md) and
  [docs/v14-ui-language-diff.md](docs/v14-ui-language-diff.md) (123 items:
  A closed, B a review list, C production-only) were both last touched 7/31 and
  predate the whole journey build.

Verified at hand-off (8/1): `npm run check` (eslint + tsc) clean, `next build`
clean, migrations applied through `0013` in Neon (14 rows), `master` level with
`origin/master`. The suite is **12 Playwright tests in 6 files** (one worker,
signed in as Test User A via `test-login?as=testa`) and it is **not green end to
end** — see open item 3.

## Open items, in the order they matter

1. **Monday's dev deployment (8/3).** Testers were warned. The setup, reasoned
   through in the session log: a **Neon branch** for `DATABASE_URL` (one
   long-lived branch, not Vercel's auto-branch-per-deployment, which would
   reset tester data on every push); a **second GitHub OAuth app** whose
   callback is the stable branch alias, since an OAuth App allows exactly one;
   `NEXTAUTH_URL` set per-environment **with the protocol**; and the **same**
   blob store, or every reading 404s against the branched `source` rows.

   **First smoke test: sign in with a genuinely fresh GitHub account and
   confirm it enrols and lands on Readings.** 8/1 moved enrolment from the
   `signIn` callback to `events.signIn` — the bug that locked invited newcomers
   out at the door. Playwright reaches the app through the `test-login`
   backdoor and therefore cannot cover this path at all; it has only ever been
   reasoned about, never run. If it is wrong on Monday, every tester is locked
   out and nothing else in the deployment matters.

   (The old "add a reading of your own is untrodden" note has expired — the
   database behind this repo's `.env.local` now holds one `isOwn` reading.)

2. **The spec is behind the build — this blocks the freeze.**
   [docs/loom-spec-v1.md](docs/loom-spec-v1.md) is still rev **30c**, and three
   things the build now does are recorded only in commit bodies and code
   comments. Per §7, changes go by PR reviewed against the §4 red lines; these
   never got that PR, so the wording that is *supposed* to be authoritative now
   contradicts the shipped app:
   - §3 says Keep "is always the whole artifact and never a slice of it (red
     line #5)". The build keeps a single map. The commit (dc6a7f9) says TJ
     ratified this on 7/31, superseding a code comment that had over-claimed
     the whole-artifact-only reading — but the supersession never reached the
     spec, so the file still argues the opposite.
   - The revision history lists map **passes** as "proposed, not yet ratified".
     Per-map tiers are built, shipped and load-bearing.
   - §3 numbers Keep as **05** and has no station 05 Weave.

   Write the spec PR (rev 31) and, for each item, confirm with TJ that the
   ratification is real rather than inherited from an agent's summary. The spec
   and TJ are the authority; a commit message is not.

3. **`maps.spec.ts` fails in a full-suite run and passes alone.** Measured 8/1,
   both ways, against a dev server on 3100:
   - Whole suite: **8 passed, 1 failed, 3 did not run.** The failure is
     `maps.spec.ts:42 "a new map holds its own tiers and essence"` — after the
     reload, `#mapEssence` is still `""` where the spec wrote "One line written
     by the Playwright suite.", so the `toPass` block times out at 45s.
   - `maps.spec.ts` on its own: **4/4 in 21.6s.** `pdf-viewer.spec.ts` on its
     own: **3/3 in 30.6s** (those were the three that "did not run").

   So it is order-dependent, not a broken feature — the essence save is fine
   when nothing ran before it. f55190a on 8/1 fixed a race in this same spec by
   waiting on `#saveDot` instead of network-idle; this looks like the same class
   of problem one layer down, in the map the spec lands on rather than the save
   it waits for. Worth pinning before Monday, because a suite that only passes
   file-by-file cannot be the gate on the deployment.

   *Note for whoever runs it:* pipe the suite to a file, not to `tail`. Playwright
   starts the dev server as a child that inherits stdout, so a pipe never sees
   EOF and the command appears to hang long after the run is done.

4. **The maps contract migration (the "contract" half of expand/contract).**
   `concept.tier` and the `reads` table are still dual-written as mirrors of the
   oldest whole-weave map. Once the build has soaked (post-Monday testers), a
   follow-up should: stop writing `concept.tier` from `updateMap`/`deleteMap`,
   stop the `reads` upsert and the `cardTable` geometry echo in `saveView`,
   retire the deprecated `saveRead` action ([src/actions/loom.ts:517](src/actions/loom.ts#L517)),
   then drop the columns/table in a migration. Until then two known quirks are
   accepted: a student who works only in reading-scoped maps leaves the mirror
   columns reflecting older whole-weave work, and a failed re-mirror after
   deleting the mirror map leaves them stale until that map is next edited —
   the `map` table is authoritative either way.

5. **Auth / ops residue — blocks a freeze.** All pre-existing:
   - Dev-mode auth fallback impersonates `tjm@tjmcleish.com`
     ([src/actions/loom.ts:19](src/actions/loom.ts#L19)); `/api/readings` and
     `getSourceFile` skip auth whenever `NODE_ENV !== 'production'`;
     [src/lib/auth.ts:9](src/lib/auth.ts#L9) carries hardcoded admin fallback
     emails.
   - pdf.js loads its worker from unpkg at runtime
     ([src/components/pdf/PdfViewer.tsx:12](src/components/pdf/PdfViewer.tsx#L12)).
   - `scripts/apply-db-compat.ts` is an ad-hoc schema patcher behind the real
     schema — decide whether it retires.

6. **Section B review, now with a round 2.** The UI/language diff has a fresh
   **[round 2](docs/v14-ui-language-diff.md#round-2--2026-08-01-the-surfaces-built-since)**
   (8/1) covering everything the reading-first, maps and journey builds changed:
   3 small copy regressions to fix, 7 deliberate departures to confirm, 3
   production-only. Section A's nine priority fixes were re-checked and all
   survived the rebuild. That sits on top of round 1's untouched 40-item
   section B. No code needed until you pick.

7. **Deferred by decision, not oversight:** byte→concept is still one-to-many
   (re-file copies the byte, per spec §2's v1 semantics); markdown export exists
   but has not been reconciled with Lingxiu's fork; cohort/heat-map views remain
   admin-only and would need red line #8's "has coded this reading themselves"
   gate before any student-facing use — that gate does not exist in the data
   model yet. Multi-reading scopes are keyed for but not exposed.

## Local environment notes

Port 3000 is inside a Windows excluded port range on this machine
(`netsh int ipv4 show excludedportrange protocol=tcp` → 2969-3068 reserved), so
`npm run dev` on the default port fails with `EACCES`. Reboot, or as admin
`net stop winnat && net start winnat`.

Meanwhile **run on 3100 and it all works**, including admin pages: cookies are
not port-scoped, so `NEXTAUTH_URL=http://localhost:3000` still yields the right
session-cookie name. It was the missing protocol that broke it, never the port.

The suite has its own committed config for this — it starts the dev server
itself, and keeps `globalSetup` + `storageState` (drop them and the
authenticated specs run signed-out, which reads as a product failure and is
not one):

```bash
npx playwright test --config=playwright.3100.config.ts
```

Two things that will waste your time if you don't know them:

- **Next 16 allows one `next dev` per project.** A second one exits with
  "Another next dev server is already running" and prints the PID to kill.
- `Get-NetTCPConnection` and `taskkill` have both hung in this shell. Kill the
  dev server with `Stop-Process -Id <pid> -Force`, taking the PID from the
  message above.

## Kickoff commands

```bash
git status -sb
npm run check          # eslint · tsc · remap · scoring · auth · overlay · workflows
npm run seed:demo      # wipes and rebuilds Test Users A–D; do this before believing a test failure
npm run dev -- -p 3100 # 3000 is inside a Windows excluded range on this machine
```

Then the suite, in its own terminal — **redirect to a file, never a pipe**, and
read the count rather than waiting for the summary line (see §4 above):

```bash
npx playwright test --config=playwright.3100.config.ts > run.txt 2>&1
grep -c "^  ok " run.txt      # 43 is green
grep    "^  x  " run.txt      # empty is green
```

`npx tsx scripts/check-migrations.ts` still reports what Neon actually has;
nothing this session needed it, because no migration was written.

## Definition of done for the next session

Pick one open item above and close it end to end — with the red lines in
[docs/loom-spec-v1.md](docs/loom-spec-v1.md) §4 checked before merge, per §7.
