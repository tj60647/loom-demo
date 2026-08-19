# UI cleanup, pass 1

Everything PR #10 (`reading-canvas-intent`, Lingxiu) changes, broken into
pieces that can be taken, changed or refused one at a time.

Written 2026-08-17. Lingxiu is not available and will not be consulted on these;
TJ decides all of them. So every item below carries a **recommendation** and the
evidence behind it, rather than a question to route to someone else. Where the
recommendation rests on a judgment rather than a fact, it says so.

**Source.** Branch `reading-canvas-intent`, 5 commits from merge base `20c1de4`
(PR #13). 16 files, +757 / −621, and 24 commits behind `dev`.

**Updated 2026-08-17, after the first working session.** Two things this
document originally assumed are no longer true, and one route it did not
contain turned out to be the answer:

- **PRs #20 and #21 were closed unmerged** (TJ, deliberately). Their heads
  survive as `refs/pull/20/head` and `refs/pull/21/head` if anything is ever
  wanted back from them, but nothing from either reached `dev`.
- **Item 4, reading focus, is dropped**, and items 5 and 6 fell with it — both
  existed only because 4 hid the header. See those sections.
- **Items 1, 2, 3 and 10 were rebuilt fresh on `dev`** and are done, on
  `feat/reading-toolbar-cleanup` (`b42603f`). Items 5 and 6 are settled there
  too, by a third route this document did not consider: the two fullscreens
  **merged** rather than one being deleted.

**Why it reads as one lump.** `b8258bd` alone carries six unrelated decisions
across 8 files, and the reasoning for each lives in code comments rather than
commit messages. That is a packaging problem, not a quality problem — most of
what is here is good.

---

## Decisions

| # | Feature | Decision | Where |
|---|---|---|---|
| 1 | Toolbar height restored | **Done** — 63px → 35px | `feat/reading-toolbar-cleanup` |
| 2 | Matrix → Canvas | **Done** | `feat/reading-toolbar-cleanup` |
| 3 | One layout control, three states | **Done** | `feat/reading-toolbar-cleanup` |
| 10 | Rails stand permanently | **Done** — taken without 8 | `feat/reading-toolbar-cleanup` |
| 5 | In-app fullscreen removed | **Superseded** — merged, not removed | `feat/reading-toolbar-cleanup` |
| 6 | Full screen into the toolbar | **Superseded** — merged, not moved | `feat/reading-toolbar-cleanup` |
| 4 | Reading focus | **Dropped** | PR #20, closed unmerged |
| 13 | `isDeletePost` accepts slug ids | **Refuse** — the bug is not real | nothing to do |
| 7 | Highlights become paint | **Refuse** — and the real defect is fixed | `feat/reading-toolbar-cleanup` |
| 8 | Cards edit in place | **Deferred** — "a can of worms" | not started |
| 9 | The card's subject is the passage | **Deferred with 8** — does not separate | not started |
| 11 | Zoom floor and ceiling | **Refused** — the current ones are fine | nothing to do |
| 12 | Trackpad: scroll pans, pinch zooms | **Taken, retuned** (TJ, 2026-08-19) | `SpreadCanvasView.tsx` |

Eight settled, one dropped, two deferred, two refused, one taken with
changes. **Every item in this table has now been decided.** What is open is no
longer PR #10's — it is the work that came out of looking at the app, listed
under "The second session" below.

**Read items 7–12 with item 13 in mind.** Every recommendation above that is
still open was formed the same way this document formed item 13: from the
branch's own commit messages and code comments. One of those turned out to
describe a system that does not exist, and it took four checks to see it.
Verify the premise before implementing the fix.

---

## 1. Toolbar height restored · Done

The reading toolbar was 63px because `.btn.mini` carries `min-height: 36px`, not
because of padding — even at 7px padding a mini button measures ~29px, so the
floor was doing the work.

**What the original write-up got wrong, found by measuring.** Two things:

- **The tallest thing in the row was never a button.** `.pdf-modes` wraps its
  buttons in `padding: 2px` plus a 1px border, so a *group* measured 42px where
  a bare button measured 36. A fix aimed only at buttons leaves 6px behind.
  Baseline measured on the running app: row 63px, tallest child 42px.
- **The row cannot reach 31px from the button alone.** A 23px button under the
  bar's own `padding: 10px 20px` is 43px. Getting the row down also means
  taking that padding to 4px — a second change, which "not because of padding"
  actively hid.

Also found: `.btn.compact` (`globals.css`) already released this same floor,
with a comment describing this same problem, and lands on the same 23px. And
the `@media (max-width: 900px)` block in `PdfViewer.tsx` styles these buttons
at a width Loom's 1280 floor means can never fire.

**Landed:** floor released inside `.pdf-toolbar`, `.pdf-modes` padding to 1px,
bar padding 10px → 4px. Row **63px → 35px**, 28px back, measured at 1280 ·
1536 · 1920: one row, nothing clipped. Chrome above the text, 215px → 187px.

*Files:* `PdfViewer.tsx` (styled-jsx only).

## 2. Matrix → Canvas · Done

UI string only. State, CSS, render branch and `matrix-zoom.spec.ts` keep the
July name, per AGENTS.md: code speaks July, UI strings speak the model. "Matrix"
named the grid the view draws; "Canvas" names what you do on it, which is what a
student is choosing between.

*Files:* `PdfViewer.tsx` + three test selectors that located the button by name.

## 3. One layout control, three states · Done

`1 page` / `2 pages` / `Canvas` in one group, replacing a `Page`/`Canvas` pair
*plus* a separate `2-Page Spread` checkbox — two controls the reader had to
combine in their head. Same `isTwoPage` state underneath.

*Files:* `PdfViewer.tsx`, `concept-rail.spec.ts`, `matrix-zoom.spec.ts`.

## 13. `isDeletePost` accepts slug reading ids · Refuse — the bug is not real

Originally listed here as a free bugfix, on the strength of the code comment
`c502f7e` shipped with it: *"locally-seeded fixtures carry slug ids
('e2e-object-worlds'), and the UUID pattern silently never matched there,
which timed out every cleanup on that one reading."*

**No such reading exists.** Four checks, any one of which is enough:

- **A reading's id is always a UUID.** `sources.id` is
  `text().primaryKey().$defaultFn(() => crypto.randomUUID())`
  (`src/db/schema.ts`). `atSourceId` is a foreign key to it.
- **The seed's slug is a different column, deliberately.** `sources.seedKey`
  holds `object-worlds`, `communities-of-practice`, `boundary-objects`,
  `practice-loom-reading` (`scripts/seed-sources.ts`). Its schema comment
  explains at length why seed identity had to stop being the title and become
  its own column — it was never the id.
- **`e2e-object-worlds` does not exist.** Not in seeds, tests or fixtures. The
  only occurrences in the repository are that comment and, until this
  revision, this document repeating it.
- **The specs pass without the change.** `concept-rail` and `pdf-viewer` both
  wait on `isDeletePost`, and both pass against unmodified `dev` (run
  2026-08-17). A matcher that never matched would time out those waits.

The change itself is inert rather than harmful — every update action posts an
**object** in the second slot (`updateConcept`, `updateEdge`, `updateLink`,
`updateMap` are all `(id, data, …)`), so a widened string pattern catches
nothing new. It is refused for the reason it exists, not for what it does: it
widens a matcher on a stated fact that is false, and leaves a comment that
will mislead the next reader.

**Worth knowing about the helper either way.** It already matches several
non-deletes — `refilePassage`, `unfilePassage`, `attachLink` and two-argument
`mergeConcepts` all post two UUIDs. It works because the specs only wait on it
while a delete is the only thing in flight. It is a shape heuristic, not a
proof, and neither the current pattern nor the proposed one changes that.

*Files:* none. `tests/helpers.ts` stays as it is on `dev`.

---

## 4. Reading focus · Dropped

**Decision (TJ, 2026-08-17): dropped.** PR #20 was closed unmerged on purpose.
Nothing below is being built; it is kept because items 5 and 6 were written as
consequences of it, and because the cost it names is real and will come back if
reading focus is ever reconsidered.

Note what dropping it leaves in place: at 1280 the reading station still stacks
a header, a scope bar, a journey bar and the toolbar — 187px of chrome before
any text, even after item 1 took 28px out of it. That is the pressure reading
focus was answering. It has not gone away; it is just not being answered this
way.

<details>
<summary>The original write-up, kept for the record</summary>

### The proposal

With a reading **that has a PDF** open on 01, the app header, the scope bar and
the footer stand down. The journey bar and the viewer's toolbar are what remain.
Implemented as `data-reading-focus` on `<body>` — one CSS rule hides the header,
which belongs to the root layout — plus two withheld blocks in Workbench. The
trigger reuses an expression the file already had:
`activeTab === "reading" && source.hasFile`.

**Cost.** The reading station loses the visible title and author, the concept
tallies, and the Download PDF link. They remain on the other four stations.

### 4a. Does the practice loom strip its chrome too? · **Yes — and fix the test**

`sandbox.spec.ts` proves the guide writes nothing by capturing the scope bar's
tally and re-asserting it later. Reading focus withholds that scope bar, so the
spec hangs. PR #10 never touched this file, so the branch has the same failure.

**Recommendation: keep reading focus on in the sandbox.** The guide's whole
claim is "walk every move on a real reading" — a guide that shows chrome the
real station does not have is teaching a screen the student will never see.
Exempting the sandbox is the one-line fix (`&& !practice`) and it is the wrong
one.

Fix the test instead: read the tally from a station that still shows the scope
bar. 02 · Linking is already in that spec's path, and the tally there is the
same number, so the test keeps its exact meaning — that nothing was written.

### 4b. What happens to the save indicator? · **Put it in the journey bar**

`saveDot` is hidden with the rest of the header, so reading focus currently has
no save feedback at all — and 01 is where capture happens, which is the one
station where a student most needs to know a write landed.

**Recommendation: draw it in the journey bar, beside the `☰` — not inside it.**
A save light in a closed menu tells you nothing. It is a status, not a
destination, so it should not be behind a click.

*Files:* `Workbench.tsx`, `globals.css`, `pdf-viewer.spec.ts`, `sandbox.spec.ts`.

</details>

## 5 + 6. The two fullscreens · Superseded — merged, not deleted or moved

Both items existed only because reading focus hid the header. With 4 dropped,
both premises died: item 5's argument was *"reading focus already hides the
chrome, so a button to hide chrome has nothing left to do"* — but with no
reading focus, that button is the **only** thing that hides the chrome. And
item 6 had nothing displaced to rehome.

Neither was refused. A third route settled both, which this document did not
consider: **the two controls merged.**

**What was actually there.** Two fullscreens, easy to conflate and in fact
conflated by item 6:

- **the header's** — `document.documentElement.requestFullscreen()`, the
  browser's own, on every station. Drops the tab strip and URL bar; Loom's
  chrome stays.
- **the toolbar's "Just the text"** — `.pdf-shell.fullscreen`, an in-app mode
  at z-index 6000. Drops Loom's chrome; the browser's stays.

Either alone leaves a bar of something else around the text. Getting the text
onto the actual screen took both buttons, in two places — and the name "Just
the text" (TJ, 2026-08-12) existed to apologise for a distinction the reader
should never have had to hold.

**Landed.** The toolbar's control now does **both halves** and is named
`full screen text` for it. The header keeps `full screen` for the whole app, on
every station. TJ, 2026-08-17: *"one is to make the app full screen, the other
to make the pdf full screen — this is ok but needs clearer labels."*

Three things that fell out of building it, each worth keeping:

- **The Fullscreen API request goes to `documentElement`, never to
  `.pdf-shell`.** Fullscreening the shell stops rendering everything outside
  it — including the practice guide's mask and rungs, which sit at z-index
  6100–6103 *deliberately above this mode* and which `check-practice-guide.ts`
  guards. So item 5's plan to invert that check was aimed at the right rule
  for the wrong reason: the rule is load-bearing, and rooting the request is
  what keeps it standing.
- **`fullscreenchange` has to be listened for.** Esc and F11 leave the
  browser's fullscreen without telling the app; without the listener the shell
  stays `position: fixed; inset: 0` over a window that is no longer full, and
  the only way out is a button the chrome is covering.
- **The `f` shortcut survives**, which item 5 would have removed silently.

**The header's label is 11 characters on purpose.** At the 1280 floor
`full screen app` is 15 and wraps the header to two rows — **52px**, nearly
double what item 1 won back. Measured: the budget is 11. The qualifier
therefore sits on the toolbar's label, where there is room, and the comment in
`Header.tsx` records the budget so the next attempt does not silently pay it.

*Files:* `PdfViewer.tsx`, `Header.tsx`.

## 7. Highlights become paint, not controls · Refuse — and the real defect fixed

**Three of this item's claims did not survive checking**, and the fourth was
smaller than what was actually wrong.

- **The anchor is not gained.** `data-loom-passage-id` already exists on `dev`
  (`bindHighlightNode`), read in three places. The branch only moves where it
  is set, because it is deleting the binder that set it. So item 8 needs
  nothing from item 7.
- **What goes is not "a click binding" — it is the whole highlight tooltip.**
  `highlightTooltip`: 9 references on `dev`, 0 on the branch. A MOUSE user
  loses the hover panel, not only a keyboard user.
- **So the recommendation reduced to "change nothing":** add an anchor that is
  there, keep a `tabindex` that is there, keep a binding that is there.

**And the real defect was underneath it, measured rather than read.** Chromium's
accessibility tree says the marks are live (`role=mark`, `ignored=false`,
`focusable=true`, named from the aria-label) and Tab reaches one in a single
press. But mark.js wraps a `<mark>` per text-layer span, and every one carried
`tabindex="0"` and the SAME label: surveyed across 10 passages, **106 marks and
106 tab stops**, 23 of them for one passage. Fixed on
`feat/reading-toolbar-cleanup` — one tab stop per passage, hover preserved on
every fragment — with a regression test that also asserts fragmentation still
happens, so it cannot pass for the wrong reason.

The doc's aside that the offsets are noise in the aria-label was right, and is
also not the point: they are printed in the visible tooltip too.

**But it drops keyboard reachability of highlights**, and the change is not
mentioned in the commit message. A mouse user gains the margin card; a keyboard
user loses their only way to reach a passage from the text.

**Recommendation: take the anchor, keep the affordance.** Add
`data-loom-passage-id` (8 needs it), and retain `tabindex="0"` and the click
binding. The card being the primary door does not require the mark to stop being
a door. Dropping the character offsets from the `aria-label` is fine — offsets
are noise read aloud.

## 8. Cards edit in place · Take

One shared `RailCard` in both page mode and the canvas. The name commits on
blur/Enter, the definition saves on a 700ms pause — the original card's save
discipline — and the corner `›` opens Your work.

This **reverses the 2026-08-09 read-only ruling** that cards are doors, not
editors.

**Recommendation: take it, and record the reversal explicitly.** Two grounds.
TJ's own comment on #9 — quoted in `1f1f8cb` — already moved this way: "each
card is paired with its highlight and the highlight IS the passage." And the red
line the read-only ruling was defending does not say what the code comment
implies: red line #5 is *"the student's work is never inaccessible or partial"*,
which editing in place serves rather than threatens. The `›` still opens Your
work, so nothing becomes less reachable.

The 2026-08-09 ruling should be marked superseded where it is written down, not
silently contradicted by a diff.

*Files:* `ConceptRail.tsx` (+166), `PdfViewer.tsx`, `SpreadCanvasView.tsx`,
`concept-rail.spec.ts`.

## 9. The card's subject is the passage · Deferred with 8 — it does not separate

**It cannot ship without item 8.** Every one of its four behaviours is an edit:
the note becomes editable, the name field coins a concept, name and gloss edit
in place, chips do not. There is no editable field on a `dev` card for any of
that to apply to — the card is `role="button"` with an `onClick` that opens
Your work, per the 2026-08-09 ruling. The commit order says the same:
`c502f7e` (item 8) then `1f1f8cb` (item 9), and 9's own message reads "name and
gloss edit in place, **as before**". This document's claim that "9 could go
first if it separates cleanly" is wrong. TJ passed on 8 on 2026-08-17 ("that is
a can of worms"), so 9 is deferred with it.

**And it is not a red-line fix.** Red line #4 is verbatim as quoted
(`loom-model-build.md`), but the Unlabeled Passage **is** visible on the card
today: it is named "Unlabeled passage", shows an excerpt of its own text
instead of a concept definition, and is still a door to Your work. The empty
state is neither hidden nor blocked. Item 9 improves this surface; governance
does not compel it.

**What is true, and separable, is that the note cannot be revised at all** —
see Future work below. That is the part worth taking, and it needs neither
item 8 nor a reversal.

The original write-up follows.

### The original proposal

Both card fields keyed off `concepts[0]`, which left a passage with no concept
unworkable and rendered its notes as truncated read-only text. Since the
highlight *is* the passage, the card's subject becomes the passage:

- the **note** is always editable, on the same 700ms contract as every other
  prose field in Loom;
- with **no** concept, the name field coins one and files the passage under it in
  one gesture, so labelling never means leaving the reading;
- with **exactly one**, name and gloss edit it in place;
- with **several**, they are chips and nothing here edits them — writing to
  `concepts[0]` would be guessing which of the passage's equals you meant.

**Recommendation: take it — this is the strongest-grounded item in the branch.**
Red line #4 names the case directly: *"Empty states are visible, not blocked:
'no evidence' Concepts, **Unlabeled Passages**, unranked Tiers."* An Unlabeled
Passage is a legal end state by governance, and today's card makes it
unworkable. This is a red-line fix, not a preference.

**The one thing to watch.** It is the only item here with a persistence
consequence rather than a display one: a new `updatePassage` action and a
`passage.note` graph event, replayed in the Capture Log's fold. No migration —
`kind` is free text — but `check-vocabulary` exists precisely to catch an emitted
kind the history cannot read, so it must be green before this merges.
`workflows.ts` gains the second route to filing in the same commit, per the
repo's own rule.

*Files:* `actions/loom.ts`, `ConceptRail.tsx`, `PdfViewer.tsx`, `LoomProvider.tsx`,
`SandboxLoomProvider.tsx`, `HistoryPanel.tsx`, `logPhrase.ts`, `workflows.ts`,
`concept-rail.spec.ts`.

## 10. Rails stand permanently · Done — taken without 8

The `Cards` toggle goes; both rails always show in page mode ("fixed sides").

This document said it *"should not land before 8 — on its own it just removes a
control."* **TJ overruled that (2026-08-17): "cards goes even if read only,
that is fine."** So it landed alone. The argument still holds in the other
direction — a toggle that hides the margin is a toggle that hides where the
work is — and it holds whether or not the card is an editor yet.

`railsOn` is now a documented constant rather than state, so item 8 has one
place to read the decision when it arrives.

*Files:* `PdfViewer.tsx`, `concept-rail.spec.ts`, `matrix-zoom.spec.ts`. The
spec named *"the rail toggle never moves the stage"* became *"the rails never
move the stage"* and changes the rail count by changing the layout instead —
same claim, a control that still exists.

## 11. Zoom floor and ceiling · Refused

**TJ, 2026-08-17: "i think the current zoom floor and ceiling are fine."**
Nothing to do. The original write-up follows.

Floor moves from `fitAllK × 0.5` to `fitAllK` exactly, so you can no longer pull
back past the whole reading — "there is nothing out there past it to zoom to,"
which is true. Ceiling doubles, 8× to 16×, so an eighth of a spread can fill the
stage. Small, and independent of 12 despite living in the same file.

## 12. Trackpad: two-finger scroll pans, pinch zooms · Taken, retuned

d3-zoom's wheel handler is unbound and replaced. Plain wheel/two-finger scroll
**pans**; ctrl/cmd+wheel or a pinch **zooms** at the cursor. Today on `dev` a
plain wheel zooms at the cursor through a smoothed rAF chase loop.

There are two separate objections and they should not be argued together.

**The defect, which is not a matter of taste.** The zoom factor is
`2^(-deltaY × scale × 0.01)`, tuned for a pinch, where deltaY arrives in small
increments:

| device | deltaY per notch | resulting zoom step |
|---|---|---|
| trackpad pinch | 2–10 | 1.01×–1.07× — smooth |
| mouse wheel, Chrome/Edge | **±100** | **2× in, 0.5× out per single click** |
| mouse wheel, Firefox | ±3 (×16) | ~1.4× per click |

The handler it replaces used `0.002` for a bare wheel and ×10 only for
ctrl/pinch — about 13% per notch on a mouse. So on a mouse the change both moves
zoom onto a modifier *and* makes that modifier overshoot wildly. This is why it
reads as "my wheel is broken" rather than "my wheel changed."

**The preference, which is a real call.** Scroll-pans/pinch-zooms is the modern
canvas idiom and trackpad users expect it; wheel-zooms is the map idiom and is
what is there now.

**Recommendation: keep the current wheel-zoom.** The change carries no evidence
that the existing behaviour was failing, and the burden sits with the change.
The comment attributions make the same point from the other side — the code
being replaced is marked *"the map-canvas idiom (TJ, 2026-08-10)"* and the
replacement *"(Lingxiu, 2026-08-15)"*.

If you decide you want the Figma idiom after using it, it is takeable — but only
with `deltaMode`-aware tuning like the handler it replaced had. Do not take it
as written.

**TJ, 2026-08-19: "take the figma idiom properly in canvas mode, and make sure
the zoom is smooth not abrupt."** Taken on that condition, not as written — the
preference was decided in its favour, the defect was not accepted with it.

What landed, and how it differs from PR #10's version:

- **Normalise `deltaMode` before reading any delta.** `LINE_PX = 100/3`, so the
  notch Chrome reports as pixel-mode 100 and Firefox reports as line-mode 3 pans
  the canvas the same distance. PR #10 used 16, which made Firefox pan at ~half
  Chrome's rate.
- **Clamp the zoom STEP, not the coefficient** — `ZOOM_STEP_CLAMP = 10` on the
  normalised delta. This is the whole fix for the table above: a pinch's
  per-frame delta is already under the clamp and keeps the feel it had, while a
  mouse notch is capped however large its delta claims to be. Measured in
  `matrix-zoom.spec.ts`: **1.149× per notch clamped, 4.000× unclamped** — the
  test was run both ways, and the unclamped run is what the spec now guards.
- **The zoom keeps the rAF chase loop.** PR #10 deleted it along with the idiom
  that motivated it, which is what would have made a notch snap. Each event
  moves a target and the loop eases toward it — a notch lands over ~10 frames
  (0.65^10 of the gap left) instead of one.
- **The pan does NOT get the chase loop**, deliberately. A two-finger drag is
  direct manipulation and has to sit under the fingers; easing it buys the
  floaty feel instead of a smooth one. A mouse notch pans ~100px at once, which
  is what every scroll container does.

Both paths still route through the d3 behaviour (`translateBy` / the constrained
`writeTransform`), so the translate extent, the settle sync and the will-change
raster hint are unchanged. One consequence worth knowing: **at fit-all a
two-finger scroll does nothing**, because the extent correctly pins a plane that
is entirely in view. Panning starts once a pinch has zoomed in.

*Files:* `SpreadCanvasView.tsx`, `matrix-zoom.spec.ts`, and the Canvas button's
tip in `PdfViewer.tsx` (the sentence that taught the old gesture).

---

## Kept unchanged

Worth stating, because a 621-line deletion invites the assumption that things
went missing:

- **The minimap** rides along untouched — identical on both branches.
- **Strip mode** stays hidden, not deleted (TJ, 2026-08-10). Render branch and
  CSS remain, so restoring a button restores the mode.
- **Page mode's ctrl+wheel zoom** is unchanged; 12 only affects the canvas.

## Order of work

**PR #10 is fully decided.** Nothing in its thirteen items is waiting on a
reading of the branch; what is left is either refused, deferred behind a
ruling, or already on `feat/reading-toolbar-cleanup`.

1. ~~Items 1, 2, 3, 10, and 5 + 6~~ — **done**, on
   `feat/reading-toolbar-cleanup`.
2. ~~Item 7~~ — **refused**, and the real defect underneath it fixed on the
   same branch.
3. ~~Items 13 and 11~~ — **refused**: one was not a bug, the other TJ is happy
   with as it stands.
4. **Items 8 + 9** — deferred together. Much of what they wanted has arrived by
   another route (see the second session below): the card is no longer keyed to
   `concepts[0]`, an unlabeled passage is workable, and a note can be revised —
   in the panel rather than in the margin card, which is the smaller can of
   worms and the one write path.
5. **Item 12** — refuse, or re-tune with `deltaMode` awareness and revisit.

## Status, in one line

Every item of PR #10 is decided and most of the takeable ones are committed;
the branch has since grown a second body of work that came from using the app
rather than reading the branch, and what is open now is listed under "Still
open after the second session" — two rulings, three small decided-but-unbuilt
changes, and a test account that wants reseeding. All three app bugs are fixed
under "The third session": the canvas recenter, the cards at full zoom-out and
the missing highlights. Of the three diagnoses this document carried into that
session, one survived contact — and the highlights were fixed by a route it
did not contain, found in TJ's own description of when the thing breaks.

## The second session — what came out of looking at the app

Everything above is PR #10's. Everything here came from TJ working through the
running app on 2026-08-17, and none of it was on anyone's list. It is recorded
because the branch is 33 commits, and a reader who only had this document would
think the work stopped at item 10.

### The chrome, measured

The reading station carried 223px of chrome above and below a 900px window —
header, scope bar, journey bar, toolbar, footer — a quarter of the screen.

    reading station chrome          223px -> 83px
    header                           55px -> 50px
    journey bar                      51px -> 43px
    reading toolbar                  63px -> 40px
    text's share of a 900px window    79% -> ~91%

**The scope bar is gone from every station.** Its contents survive: title,
author and tallies moved to the footer; Download PDF moved into the reader's
toolbar, beside the text it downloads.

**The footer says something now.** It read "01 — READING" and "THE TEXT AND
YOUR CAPTURES" — the station number the bar above already showed, and a gloss
on it. It carries identity on the left (name, Admin/Faculty badge, Sign out)
and the subject on the right: the reading and its tallies in the workbench;
core / supplemental / your own counts plus the loom's totals on the Library;
"nothing here is kept" in the practice loom.

**The header stands down on the reading station.** The save light moved to the
journey bar to survive that: 01 is where capture happens, and the highlight
paints optimistically, so "saved" is the only word that says the mark is real.

**A menu icon** — a 4x4 grid, warp and weft — holds My loom and About.
Workflows is no longer offered to students at all ("it needs more development
anyway"), unlinked rather than gated.

**Every mini button lost its 36px floor.** Three places had already opted out
of it and none had opted in. Released at the source: 25px everywhere.

### Your work, rebuilt

**Two views, Passages and Concepts**, in the reading toolbar's own segmented
control, opening on Passages — the panel opens over a text you are reading, and
what you just did was capture a passage.

That dissolved a structural oddity: the "Unlabeled passages" group existed only
because a list OF CONCEPTS had nowhere to put a passage with none. In the
passage view it is a row like any other whose chips are absent.

**Each view offers only the acts its own subject owns.** Deleting a concept
left the reading entirely for 04 · Vocabulary, which already had it. The concept
view offers "remove passage from concept" and nothing else; the passage view
carries the × on badges, "remove passage", and the concept field.

**A passage's note can be revised.** There was no passage-update action of any
kind — a note was written once in the capture modal, at the moment you have read
the passage least, and was fixed for good. `updatePassageNote` closes it, and
records a `passage.note` event carrying the note's LENGTH, not the note.

**The panel opens from the left**, 460px wide, with padding cut on two layers —
its own and the `.card` blocks inside it, which was the larger half.

### The margin card

**One `RailCardBody`, two hosts.** Page mode's rail and the canvas held two
copies of the markup, and the canvas one was still drawing a concept label and a
gloss hours after page mode's had stopped.

The card is its concepts and its note — no passage text, because the leader line
to the highlight IS the passage. Badges open Your work at that concept, the ×
unfiles, + and the note open the passage view. Nothing is edited in the card:
cards are CSS-scaled when a side crowds, so a field would loop — typing grows the
card, height changes the scale, and the scale moves every card on that side
including the one under the cursor.

**On the canvas, editing stops when more than a page is in view** — the reader's
own experience rather than a number. Zoomed out there is no ×, no +, no "add a
passage note", and a card with neither concepts nor a note is not drawn at all.

### Two bugs older than any of this

**Autocomplete had never worked in the sheet.** The `<datalist>` was declared
inside `captureForm`, which renders ONLY on a reference-only reading, so every
`list=` in the panel pointed at an element that was not on the page.

**The UI offered itself as a passage.** The selection handler listens on
`document` and took any selection anywhere, so dragging across the panel's own
teaching copy raised "Capture as Passage" — and would have stored it, with no
page to anchor to and nothing on the page to match.

### A student can take a reading off their shelf

There was no way to remove a carded reading: `deleteSource` opens with
`requireAdmin` and nothing else touched the row. It showed up as a number —
**80 own readings on the test account, 23 of them titled "A book carded by the
journey suite"**, from a spec whose own docstring promises it removes everything
it makes. It could not.

Archive, not delete, and the schema is the argument: `passages.sourceId` is
`onDelete:"set null"`, so a real delete would untether every passage captured
from that reading. `sources.isArchived` already existed, and the learner shelf
query already honoured it.

### What this cost the guards

`recordEvent` moved to `lib/graphEvent.ts` so `actions/sources.ts` could record
too — and `check-vocabulary` read `loom.ts` ALONE, so it went green without ever
seeing the new kind. The emitter list is derived from what imports the recorder
now. That is the same silent pass its own comment describes surviving for six
days in July, arriving through a different door.

---

## Still open after the second session

**In the app, found and not built:** nothing — but one remainder. Highlights
at full zoom-out are fixed for any page the reader has been in close to (see
"The third session"); a page never promoted this session still has no mark,
because nothing has measured it yet. Closing that needs the `getTextContent()`
route recorded there.

**Needs a ruling, and the model doc amended first:**

- **Expected concepts** — a concept in a reading BEFORE evidence. Needs an
  association (a `cloth_concept` join), a widened `isIn`, and a THIRD grouping.
  Today "no evidence here" and "no evidence anywhere" are the same set, because
  `isIn` guarantees it — the code says so in as many words. The moment a concept
  can be in a reading by intention that invariant breaks and the heading starts
  lying. `loom-model-build.md` §Concept says a Concept with no Passages "belongs
  to no Reading"; that sentence changes first.
- **Optional concept name.** The model already allows it ("Label … may be null at
  capture"). Needs the "one or the other or both" constraint TJ added — which the
  model does not state — a validation, and a display decision across 67 label
  sites.

**Decided, not built:** rename `refilePassage` to `addPassageConcept` (it ADDS a
filing; the name says it moves one, and it carries a Capture Log consequence via
the `passage.refile` kind); filter the coin-a-concept list to concepts not
already in the reading; auto-populate the description when an existing concept is
picked.

**Housekeeping:** `journey-learner 03` fails on fixture drift (wants 8 seeded
concepts, the account has 16 — `seed:demo` fixes it and clears the leftover
carded readings); two dead CSS bits, the `@media (max-width: 900px)` block in
`PdfViewer.tsx` and `.btn.compact`.

---

## The third session — 2026-08-18

Two items off the list above, one of which this document had diagnosed wrongly.

### The canvas recenter · Done — and the suspect was innocent

This document named `applyMultiplier(m, recenter)` and the multiplier-versus-
transform reconciliation on settle. Neither was involved. The settle sync
rounds to one decimal and its 0.05 tolerance covers exactly that rounding, so
it never fires a correction it did not mean; `recenter` is only ever true when
the multiplier is exactly 1, which is Fit doing what Fit says.

What was actually wrong is one line lower down and applies to **every**
programmatic move: **`zb.transform()` does not run the behaviour's
`constrain`.** In d3-zoom 3.0.0 (`src/zoom.js`) every `constrain(` call site
is inside `wheeled`, `mousemoved`, `touchmoved` or the `scaleBy`/`scaleTo`/
`translateBy` helpers. `zoom.transform` reaches `gesture.zoom`, whose body is
`this.that.__zoom = transform` and an emit. So Fit, − / +, "go to this page"
and the wheel's own chase loop could all park the plane outside the translate
extent — a position no drag can produce, and one the next drag corrects in a
single frame.

Reproduced before anything was changed, at 1536x900 on Object Worlds (canvas
plane 2970x953, stage 1536x816). Zoomed out to 0.51x fit the plane is 777x249,
smaller than the stage on both axes, so the extent allows exactly one
position: x=379.5 y=283.3. **Clicking a passage row in Your work** — the goto
door, which sets the reading's page, which the canvas answers by centring that
page — left it at x=688.6 y=347.6, and the next drag snapped it back 300px. At
fit-all the same door left it 606px and 126px outside, and it stayed there
through an entire wheel gesture.

So "clicking" was a passage door, not a bare click on the canvas: a plain
click, a double-click, a click on a rail card and a click on a page image were
all measured and none of them writes a transform at all.

Fixed by routing all four writes through one `writeTransform`, which applies
the behaviour's own constrain with the extent d3 computes for the element.
Zoomed out, the goto now writes nothing — the honest answer to "go to this
passage" when the whole reading is already on screen.

`tests/matrix-zoom.spec.ts` gains a case that takes the door at zoom-out and
then drags; it fails on the parent commit and passes on the fix.

*Costs:* the canvas can no longer be wheeled past the edge of the extent. The
chase loop was the one gesture that bypassed the constraint, so at the
boundary the point under the cursor may now drift rather than the plane
continuing to travel.

*Still open, and untouched:* highlights invisible at full zoom-out, above.

### The Passages/Concepts switch scrolled away · Done

TJ, 2026-08-18: it "should remain visible". `.yourwork-body` is the sheet's
one scroller and the card inside it is as tall as the list — 3829px of scroll
on the test account's 11 passages at 1536x900 — so the switch left the top of
the panel on the first wheel notch, and changing which end of the join you
read from meant scrolling back up to reach the control that does it.

Sticky, not moved into `.yourwork-head`: the head bar is the sheet's name and
its way out; the switch belongs to the rows.

Two things worth keeping, both found by measuring rather than reading:

- `.segmented` is an **inline-flex pill**, so stuck at the top it lets rows
  slide past on either side of it. Hence a full-bleed `.viewswitch` band,
  painted in the colour the card actually paints.
- **A sticky child bottoms out at the scroller's CONTENT box**, not its
  padding box. With `padding: 14px 8px 40px` on the body the band parked at
  y=158.5 while the body's own top edge was y=144.5, and rows scrolled visibly
  through the 14px strip above it. That 14px now sits on `.onecol` inside the
  scrollport, and the band sticks at the real top.

Measured and screenshotted at 1280 · 1536 · 1920: band 440px wide, 42px tall,
identical at all three — the panel is `min(460px, 100vw - 32px)`, so its width
is not a function of the viewport.

### The cards overlapped at full zoom-out · Done — they didn't

TJ, 2026-08-18, working the canvas: "the cards overlap badly." They were not
overlapping. Their **labels** were leaving them, and landing on the neighbour.

`.pdf-railcard-chip` is a `<span>`, but it is a flex item of
`.pdf-railcard-badges`, so it is blockified and its `max-width: 100%` does
bind — measured at the zoom floor on Object Worlds at 1920x1080, chip box 588
canvas units inside a 607-unit card. What was never bound is the **button**
inside it. A button is inline-block, so `.pdf-chip-open` shrink-to-fits its
own label and nothing capped it, which means the `overflow: hidden` and
`text-overflow: ellipsis` already sitting on it could never fire. That button
measured 1283 units: 2.1x the card it lives in. Four of seven cards overflowed
at the floor, two of seven at Fit.

Cards tile with `0.02 * pageW` between the two halves of a spread — about 2px
down there — so anything that leaves a card is immediately on its neighbour.

The card's width is capped at `railW + gap + pageW` while the type it holds is
counter-scaled by `--invk` with no cap, so the two diverge past `invk = 4.09`;
that is why it showed at the floor (5.98) and barely at Fit (3.05). The fix is
containment rather than clamping `--invk`, because a label leaving its card is
wrong at every zoom, not only past a threshold.

**Two lines before the ellipsis** (TJ: "why not wrap a bit?"). One line was
the rule for a reason that this change removes: the chip was an inline box, so
label and × flowed on one line and a wrap pushed the × onto a second row,
under the word it removes. In a flex row the × is an item beside the label.
Measured on "Mythology Construction" at the floor: at 1280 one line showed 9
characters and two show 19; at 1920, 16 and then all 22.

### Highlights at full zoom-out · one attempt withdrawn first

**The first attempt was withdrawn**, shown to TJ and taken back out. What it
learned is worth more than the attempt was, and the fix that landed is in the
section after this one.

The diagnosis in the bullet above is right as far as it goes: mark.js marks
*text*, and the impostor tier has none — at fit-all every page is a
pre-rendered image, which is what lets a long reading open as a contact sheet.
Measured on Communities of Practice at 1920x1080: 16 page images, 0 text
layers, 0 highlights. The canvas draws cards and leader lines pointing at
nothing.

**Where it went wrong is the sentence "the geometry exists."** It does not.
What exists is `analyticAnchors`, which maps a passage to a height by

    frac = startOffset / textLength      (fraction through the page's TEXT)
    y    = pageTop + frac * pageHeight   (fraction down the PAPER)

and that equation is only true if the page's text is a single column running
the full height of the sheet. Object Worlds and Communities of Practice are
both **two-column**: the offset runs down column 1 and then down column 2, but
this spreads it over the page height once, so a passage 60% through the text
is drawn 60% down the page when it truly sits about 20% down the second
column. Margins compound it — offset 0 maps to the top edge of the paper
rather than to the first line of body text.

**The cards have always had this error too.** The leader lines at zoom-out
have been pointing at the wrong height since the analytic anchors were added;
drawing a visible mark from the same formula is simply what made it legible.
The comment on that code calls it "wrong by a line or two", which holds for
one column and not at all for two.

**Second fault, found by TJ in his own data and not in the test account's:** at
Fit a card is about one page wide and sits over its own page, so a
full-page-width band is almost entirely hidden behind the card that points at
it, leaving a yellow sliver beside the card that reads as a rendering glitch.
The test account's seven passages are spread over different pages and heights,
so the collision did not show; his cluster, and it did. Screenshots at three
widths were taken and proved nothing, because the case that breaks it was not
in them.

### Highlights at full zoom-out · Done, by keeping what was measured

TJ, 2026-08-18: it works "at almost 'fit', but zoom out just a touch more and
it breaks". That sentence is the whole diagnosis, and it pointed at a better
fix than either the withdrawn arithmetic or the pdf.js route above.

**It is a cliff, not a drift.** `retargetView` promotes nothing at all once
`t.k * basePageWidth` falls under `TEXT_TIER_MIN_W` (240) — everything that
mounts a text layer is inside that one `if` — so a single notch takes **every
page in the document** to the impostor tier at once. Measured on Object Worlds
at 1920x1080: `basePageWidth` 453, so the threshold sits at k = 0.530 against
a Fit of k = 0.506. **The cliff is at 1.05x Fit, and Fit is already under it**
— which is exactly why "almost fit" works and Fit does not. It moves with page
count and stage size, since both terms do.

**The geometry was already there and was being thrown away.** `measure()`
reads the real mark.js rectangles out of the DOM and converts them to canvas
units — transform-independent, as the `Anchor` type has always said. A rect
measured at reading zoom is still true at fit-all, because the page it sits on
is a thumbnail of the same plane. But the sweep *replaced* the anchor set
every time it ran, so the frame after the text layers unmounted it found
nothing and wrote nothing over everything.

Now it merges rather than replaces, keeps every rectangle of every fragment
(not just the anchor's first one), and redraws them where no text layer is up.
So the mark at zoom-out is **the mark**, in the true column, with its real
multi-line shape — not an approximation of one. The cards' leader lines stop
degrading to `analyticAnchors` on the way out for the same reason, which
matters: a kept mark and an arithmetic anchor would visibly disagree.

Measured on Object Worlds at 1920x1080: zoomed in, 9 text layers / 69 mark.js
rects across 7 passages / 0 redrawn; back at Fit, 0 layers / 0 mark.js / **69
redrawn**; at the floor, still 69, at byte-identical canvas coordinates.

**What it does not do.** A page never promoted this session has nothing kept,
so a cold open straight to Canvas at Fit still shows no marks until you have
been in close once. That is the honest state — nothing has measured it yet —
and it is where the `getTextContent()` route below would fill in. The kept
geometry is also cleared on `geomKey`, since a resize re-derives
`basePageWidth` and every stored coordinate with it.

**The route not taken, kept for the cold case.** There is no stored geometry
to compute from: `sourcePages` keeps `textContent`, `width`, `height` and a
hash — nothing per line or per item — and `pdfStructure.ts` computes no column
geometry. But pdf.js is already loaded client-side, and `SpreadCanvasView`
already holds the `pdf` document. `getTextContent()` on the few pages that
carry passages gives every item's string and transform, and accumulating those
strings reproduces exactly the DOM string `startOffset` indexes into — the
equivalence `textLayerProjection` exists to guarantee. Still open, and now
only needed for pages the reader has never zoomed into.

---

## Future work, found while checking these items

None of these are in this pass. They are recorded because each was found by
measuring rather than reading, and would otherwise have to be found again.

**Rename `refilePassage` → `addPassageConcept`** (TJ, 2026-08-17). The name
says the opposite of what it does: it does not move a passage from one concept
to another, it **adds** a filing — inserts a `passage_concept` row and returns
`[...existing, conceptId]`, throwing only if that pair already exists. The UI
around it already speaks correctly (*"also file this passage under another
concept…"*, and "unfile from this concept" rather than "remove passage" when a
passage has more than one); only the action's name lies. Touches
`src/actions/loom.ts`, both providers, `OpenTab.tsx`, and the `passage.refile`
event kind — which means `check-vocabulary` and the Capture Log's fold, so it
is a rename with a history consequence rather than a pure rename.

**`updatePassageNotes` — BUILT the same day**, on this branch. Kept here because the finding stands: it was true for the whole life of the app until 2026-08-17.
The passage-mutating actions are `createPassage`, `refilePassage`,
`unfilePassage`, `attributePassages`, `deletePassage`. There is **no update**,
and `LoomProvider` exposes exactly that set. So a note is written in the
capture modal, at the moment you have read the passage least, and after that
there is nowhere in Loom to change it. Same for the passage's question, tier
and pull-quote flag. Model §Passage says the passage owns its Notes; the app
lets you write them once. This is the separable half of item 9 — it needs no
ruling reversed and does not require cards to become editors, since Your work
and the Capture Log are already editing surfaces.

**The card makes a passage's concepts unequal.** Not filed as work, but the
finding behind item 9's fourth bullet. Verified by filing a passage under a
second concept through the student's own flow and photographing the card:
`concepts[0]` renders as a bold serif heading with its definition beneath,
while every other concept is a small mono pill with no definition, and the
card's `aria-label` names only the first — so a screen reader never learns the
other filings exist. The model has them as equals (0..n per Passage). At the
time of checking, **no passage in the dev database had more than one concept**
— 90 passages, 84 with one, 6 unlabeled — so this branch of the card had never
rendered for anyone.

## What the first session changed about this document

Worth recording, because the pattern will repeat on items 7–12:

- **Every number in item 1 was wrong in the same direction** — right diagnosis,
  incomplete model. The floor was real; the group wrapper above it and the
  bar's own padding were not in the account, so the predicted 31px was neither
  reachable nor the whole win.
- **Two items were consequences of a third**, and dropping 4 silently turned 5
  from "take" into "would remove the only control that does this."
- **The best answer to 5 and 6 was in neither column.** Both were framed as
  take-or-refuse on Lingxiu's change; merging was not on the table until the
  two fullscreens were read side by side in the code.
- **Item 13 was not a bug at all**, and this document recommended it on the
  strength of a code comment that named a fixture which does not exist. The
  mechanism was checked — the pattern really does reject slug ids — and the
  premise was not. Only the premise mattered.

The common thread: this document trusted the branch's own account of itself.
Where a claim was checked against the repository it held up; where it was
taken from a comment it was wrong three times out of three. See "Reasons in
comments are claims" in `AGENTS.md`.
