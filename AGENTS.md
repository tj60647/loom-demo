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

**`bytes` are gone — they are `passages`, in the code as well as the UI**
(2026-08-09). The old rule here said "code speaks the July names"; it no longer
does for this object. If you meet the word **byte** in the codebase it is one of
exactly two things, never a Passage:

1. **A database name kept for compatibility** — the `byte` and `byte_concept`
   tables, the `byteId` column, `byte_search_idx`, the raw SQL in
   `src/actions/search.ts`, and the `graph_event.kind` values `"byte.capture"`,
   `"byte.refile"` and friends. Those strings are already written to rows;
   renaming them would need a migration and would blank every student's Capture
   Log, which replays by matching `kind`. DB renames stay optional per §F. The
   long version is on the `passages` table in `src/db/schema.ts`.
2. **Genuine file data** — `formatBytes`, `byteLength`, `maximumSizeInBytes`,
   `textLayerRepair`'s `bytes: Buffer`, `src/lib/storage.ts`. These are octets,
   not Passages, and must not be renamed.

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
