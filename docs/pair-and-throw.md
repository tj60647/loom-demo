# Pair and throw, from the cloth

**Status: work order, written 2026-08-18 for a session that has not started.**
Not authority. `docs/loom-model-build.md` says what things *are*; this says what
to build and what was already checked. Every fact below was verified in the repo
on the day it was written — where something is a guess it says so.

## What TJ asked for

> "on the cloth, i want to remove the 'what you are tracing' function and
> legend. i want to add a select 2 nodes and throw them which would put you in
> linking with the 2 concept nodes populating the 'throw a thread'. so i think
> it is something like select a node, shift select another node, and then a
> popup"

The popup he drew reads:

> **Link these two on 02 · Linking →**
> opens with the pair loaded · say how they hang together first

And on the two questions that were put to him:

> "the throw navigate to 02 immediately on clicking the popup, there is a
> 'cancel' x in the popup"

> "maybe just hide the tracing then, we arent really using it yet"

## Already done

Tracing is **hidden, not removed** — `SHOW_TRACE` in
`src/components/tabs/ClothReflection.tsx`, directly under the `SHOW_PROMPTS` it
copies (commit `75e005c`). Off, the student's map gets a null selection and a
no-op setter, so the cloth's click does nothing and the red swatch leaves the
legend. **That click is now free, which is what this feature needs.**

Scoped to the student's cloth only. `CohortClothPanel` keeps its own `readSel`;
whether faculty and admin lose tracing too was never asked or answered, and is
the one open question below.

## The three pieces

### 1. Selection — `src/components/svg/ClothMap.tsx`

There is **no multi-select today**. `readSel` is a single selection and it is
what tracing used; with `SHOW_TRACE` off it is inert on the student's cloth, so
a new pair state can take the click without fighting it.

Click one node, shift-click a second. Worth deciding early: what a plain click
on a third node does — replace the pair, or start over.

### 2. The popup

Anchor it to the second node. **The code for a top-layer popover anchored to a
cloth element exists at `fd76930`** — `ThrowTab`'s `.cpop`, removed in `14e42ce`
when the warp row became a concept card. It used the native `popover="auto"`
API, which brings light-dismiss and Escape without a scrim or a key handler, and
its comment records why the first attempt (an absolutely-positioned div inside
the scrollbox) was invisible: `overflow:auto` clipped it and the scrollbox's
stacking context painted over it. Read that before rewriting it.

The popup needs a cancel `×` (TJ, above) as well as light-dismiss.

### 3. The handoff — the part with no path today

`pairA` and `pairB` are **local state inside `ThrowTab`**
(`src/components/tabs/ThrowTab.tsx`), and `Workbench` renders `<ThrowTab
onGotoPassage={…} />` and passes nothing else. So "opens with the pair loaded"
has to be built.

Two options, and the first is recommended:

- **A URL param** — `?pair=<idA>,<idB>`, read into `focus` in
  `src/app/reading/[sourceId]/page.tsx` beside `concept`, `label`, `passage`,
  `projection` and `cloth`, then threaded to `ThrowTab` the way
  `initialConceptFilter` reaches `VocabularyTab`. This is how every other
  cross-station hop in the app already works; the same route carried the
  cross-reading citation hop on 2026-08-18 (`34e789c`). Linkable and
  bookmarkable, which the file's own comment argues for: "the route is the scope
  here … this is the same idea one level in".
- **Lifted state in `Workbench`**, like `openTargetPassageId`. Simpler, invisible
  in the URL, and inconsistent with the rest.

`ThrowTab` must consume the pair once and clear it, or a back-navigation
re-loads the bench. `handleFocusHandled` is the existing precedent for that.

Navigation is **immediate** on pressing the popup's action (TJ). Note the cost
the old popover named and that still holds: stations unmount, so leaving 03
drops anything unsaved there.

## Open question

**Does tracing come out of the faculty and admin cloths too?** `readSel` is 36
references across four files — `ClothMap`, `ReadOnlyClothMap`,
`ClothReflection`, `CohortClothPanel`. Only the student's is switched off. This
does not block the feature.

## Constraints that bind this work

From `AGENTS.md`, all of them checkable:

- **The flow diagram.** `src/lib/workflows.ts` draws the student flow from this
  file, and a new route from 03 into 02 with a pair loaded is a step and an edge.
  The `link` step is at `:110`; the `file` step above it already names two doors
  after a similar change. Update it **in the same commit**.
- **Desktop widths.** Check 1280 · 1536 · 1728 · 1920. The popup is anchored, so
  the floor is where it will overflow first.
- **One decision per commit**, with a `Removes:` line for anything that stops
  existing.
- **Reasons in comments are claims.** Grep the identifier before naming it. The
  reference to `fd76930` above was wrong in conversation twice before it was
  checked with `git log -S`.

## Spec hooks not to break

`tests/link-object.spec.ts`, `tests/journey-learner.spec.ts` (02) and
`tests/practice-guide.spec.ts` drive the bench. Since 2026-08-18 they load it by
pressing **Select** on a warp row — `getByRole("button", { name: /select/i })` —
not by clicking the row, which now opens the concept card. A pair arriving from
03 must leave that path working.

`tests/maps.spec.ts` and `tests/journey-admin.spec.ts` touch the cloth.

## Suggested order

1. Pair selection on the cloth, with nothing downstream — provable on its own.
2. The popup, anchored, with its cancel.
3. The `?pair=` param and `ThrowTab` consuming it.
4. `workflows.ts`, in whichever commit changes the route.
