<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Loom docs — precedence

1. **`docs/loom-model-build.md` is the authority** — what things *are* (objects, tabs, red lines). Where docs disagree, it wins.
2. **`docs/loom-refactor-spec.md` is the work order** — how the code gets there, executed in phase sequence (P0 → P1 → P2 → P3).
3. **`docs/archive/` is superseded** — historical only. Never implement from anything in it.

**Vocabulary** (full map: refactor spec §F): `maps` = **Projections**,
`maps.essence` = **Projection One-line**, `maps.read` = **Projection
Description**, `edges` = **Links**, `edges.handle` = **Link Labels**,
`edges.sentence` = **Link Description**, `sources` = **Readings**, the shelf =
**Library**; tongues are deprecated for v1.

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
