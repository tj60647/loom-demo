<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Loom docs — precedence

1. **`docs/loom-model-build.md` is the authority** — what things *are* (objects, tabs, red lines). Where docs disagree, it wins.
2. **`docs/loom-refactor-spec.md` is the work order** — how the code gets there, executed in phase sequence (P0 → P1 → P2 → P3).
3. **`docs/archive/` is superseded** — historical only. Never implement from anything in it.
4. **`docs/proposals/` is intent, not authority** (adopted 2026-08-26; the
   process: `docs/structured-intake.md`). A proposal ranks below
   `loom-model-build.md` and `contracts.md` and must cite them rather than
   restate them; where a proposal and the model disagree, the model wins until
   the model itself is amended. Nothing is implemented from a proposal whose
   numbered questions are unanswered. On shipping, the file is rewritten as a
   record and moves to `docs/`; on refusal, it moves to `docs/archive/`.

**Vocabulary** (full map: refactor spec §F): `maps` = **Projections**,
`maps.essence` = **Projection One-line**, `maps.read` = **Projection
Description**, `edges` = **Threads** (since migration 0024 a `link` row is the
**Link** — a User-level Label + gloss), `edges.sentence` = **Thread
Description**, `edges.handle` = a legacy dual-written copy of the **Link
Label** (`edge.linkId` is the pointer), `sources` = **Readings**, the shelf =
**Library**; tongues are removed.

**`bytes` are gone.** They are `passages` — in the code, in the UI, and since
migration 0023 in the database too (table, join, columns, indexes, constraints,
and the `graph_event.kind` values that had already been written as
"byte.capture"). The old rule here said "code speaks the July names"; for this
object nothing does.

If you meet the word **byte** in this repo it is **file data** and never a
Passage: `formatBytes`, `byteLength`, `maximumSizeInBytes`, `textLayerRepair`'s
`bytes: Buffer`, `src/lib/storage.ts`. Those are octets. (`drizzle/*.sql` before
0023 is history and says `byte` throughout; that is what a migration log is
for.)

The other names in the map above still follow the old rule: code speaks July,
UI strings speak the model.

# Keep the workflow diagrams true

`/admin/workflows` draws the **student, faculty and admin** flows from
`src/lib/workflows.ts`. The diagrams are generated, not drawn — so they rot
silently, by rendering a graph that is merely wrong.

**If you change how any of those three people move through Loom — a step, a
gate, a route, an order — update the matching flow in that file in the same
commit.** Adding a step is adding a node and an edge; the layout re-flows
itself and no coordinate is ever edited. `npm run check` runs
`scripts/check-workflows.ts`, which fails on dangling edges, orphan nodes and
connectors that would render invisibly — but it cannot tell you the picture
has fallen behind the build. That part is on you.

# Loom is a desktop tool — check it at desktop widths

The standard is **contracts.md §2c-iii** (TJ, 2026-08-12): floor **1280**,
target **~1600**, ceiling **2560**. Prose keeps a measure of 60–75ch; work
surfaces take the room they are given (`main` carries `--measure`,
`.station-work` raises it). Multi-column grids fold on the **column's own
minimum** — `repeat(auto-fit, minmax(340px, 1fr))` — never at a device width,
because on the reading station the content box is not the viewport.

Check a layout at **1280 · 1536 · 1728 · 1920** CSS px. Never assume a 1920×1080
panel hands you 1920 CSS pixels: at Windows' default 125% scaling it hands you
1536, and Apple hardware reports 1512–1728. There are no phone layouts here and
none should be added.

# Reasons in comments are claims — check them before you write them

This repository comments heavily, and the comments carry reasons: why a floor
is 36px, why identity moved to its own column, who decided a name. That is
worth keeping. It also means a wrong reason is indistinguishable from a right
one at reading distance, and gets believed and built on.

It has already happened. `c502f7e` widened a test matcher and explained
itself: *"locally-seeded fixtures carry slug ids ('e2e-object-worlds')."* No
reading has ever had a slug id — `sources.id` defaults to `crypto.randomUUID()`
and the seed's slug lives in `sources.seedKey`, a separate column added for
exactly that reason. `e2e-object-worlds` appears nowhere in the repository. The
comment was believed, written into a planning document as a free bugfix, and
survived until someone asked when a slug id is ever produced.

**Before a comment states a fact about this system, verify it here, and make
the comment say how you know.**

- **Name a real thing or name none.** An identifier in a comment
  (`e2e-object-worlds`, a column, a flag) must exist. Grep for it. An invented
  example is the most convincing kind of wrong.
- **Measure, don't estimate.** "63px" beats "about 60px", and only one of them
  can be checked later. Say where: *"measured on the running app at 1536"*.
- **Check the premise, not only the mechanism.** That a matcher rejects slug
  ids is easy to confirm and was true. Whether a slug id is ever produced is
  the question that mattered, and nobody asked it.
- **Cite the decision, not your impression of it.** `(TJ, 2026-08-12)`, "red
  line #5", "ruling 28" are load-bearing and get quoted onward. Point at where
  it was said. If you cannot, write what you observed instead — *"this appears
  to be why"* is honest; a fabricated attribution is not.
- **If it resists checking, say so in the comment.** "Unverified" costs one
  word and saves the next reader the whole search.

The same applies to commit messages and to any document proposing work: a
recommendation inherits the reliability of whatever it was formed from, and a
branch's own account of itself is evidence, not proof.

# One decision per commit, and say what you removed

A branch here is read decision by decision — taken, refused or changed one at
a time. A commit carrying six unrelated decisions cannot be answered that way,
so the good 80% waits on the contested 20%. That has already cost a branch:
`b8258bd` moved six decisions across 8 files, and its strongest change sat
blocked behind its weakest for a fortnight.

- **One decision per commit.** If the message needs "and" between two unrelated
  changes, it is two commits. Splitting later is expensive; splitting as you go
  is free.
- **The reasoning goes in the commit message.** Comments explain the code to
  whoever edits it next; the message explains the *decision* to whoever has to
  approve it. A reason that exists only in a comment is a reason no reviewer
  reads before deciding.
- **Declare removals explicitly.** A `Removes:` line for anything that stops
  existing — a keyboard shortcut, a control, an affordance, a route. Three
  removals went unmentioned in one branch: the `f` shortcut, keyboard
  reachability of highlights, and five header items becoming unreachable. Each
  was defensible; none was declared, so none was decided.
- **State the evidence.** Which widths you checked, what you measured, which
  specs you ran. "Measured at 1280 · 1536 · 1920: row 35px, one row, nothing
  clipped" is verifiable by a reviewer in seconds. A predicted number is not.
