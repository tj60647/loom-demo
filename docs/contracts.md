# Loom — Contracts

The complete inventory of every surface a caller can rely on: database schema, server
actions, API routes, export/import file formats, and the invariants the code enforces.
Companion to [loom-spec-v1.md](loom-spec-v1.md) (the *why*); this is the *what, exactly*.

**As of:** master `9abbdd7`, 2026-08-02. Line numbers cite that commit and will drift;
names and shapes are the contract, line numbers are a courtesy.

Conventions used below:

- All ids are `text` primary keys defaulting to `crypto.randomUUID()` unless noted.
- `Tier` = `'' | 'p' | 's' | 't' | 'x'` (unsorted · primary · secondary · tertiary · left off).
- "Mirror" = the expand-phase dual-write of `concept.tier` + the `read` row from the
  **oldest whole-weave map** (spec §6; retirement is a planned contract migration —
  see NEXT_SESSION open item 4).
- Server actions are HTTP-POSTable endpoints. "Auth" below is what the action itself
  enforces; nothing else stands in front of it (there is **no middleware.ts**).

---

## 1. Database schema — [src/db/schema.ts](../src/db/schema.ts)

Migrations `drizzle/0000`–`0014`, applied via `drizzle-kit migrate`
(`drizzle.__drizzle_migrations` is the record of truth).

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
| `course_membership` | courseId CASCADE · userId CASCADE · sectionId SET NULL · role default `'LEARNER'` · createdAt · **removedAt nullable** | PK (courseId, userId). `removedAt` = soft removal (0013); every membership read filters `IS NULL`. `role` here is **never read for authz** |
| `course_allowed_email` | courseId CASCADE · email · sectionId SET NULL · createdAt | PK (courseId, email). An invitation. Grants app access to that email in **any** course context until deleted |

### 1c. Reading library

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `source` | id · title · author `''` · sourceReference `''` · description `''` · isDescriptionVisible true · metadataProvenance `''` · isArchived false · **storageKey nullable** · **isOwn false** · createdByUserId SET NULL · createdAt | `storageKey NULL` = reference-only card (no PDF). `isOwn` = student-minted, visible on that student's shelf only |
| `course_source` | courseId CASCADE · sourceId CASCADE · isVisible true · week nullable · isCore true · position 0 · createdAt | PK (courseId, sourceId). Week/visibility/core are per-course facts on the join, never on the reading |
| `source_page` | id · sourceId CASCADE · pageNumber · textContent · contentHash · createdAt | Extracted text per page; anchor reconciliation and search read it. No unique on (sourceId, pageNumber). GIN index `source_page_search_idx` on `to_tsvector('english', textContent)`; `source` carries the weighted `source_search_idx` twin (title A · author B · reference/description C) — the search queries must repeat these expressions verbatim |
| `source_score` | sourceId PK/CASCADE · status `'heuristic'\|'judged'\|'unscorable'` · coverage/legibility/anchorability/structure int nullable · overall real · pass bool nullable · notes · judgeNotes · judgeModel · metrics jsonb · scoredAt | 1:1 with source. Unscored dimension = NULL (abstention, never a default). `pass` requires every scored dimension ≥ 3 — not compensatory |

### 1d. The graph (the artifact — spec §6 `graph`)

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `concept` | id · courseId SET NULL · userId CASCADE · label · def `''` · note `''` · **tier `Tier` default `''`** · createdAt | `tier` is the MIRROR column. One-label-one-concept is enforced in code (`updateConcept` clash check), **not** by a DB unique |
| `byte` | id · courseId SET NULL · userId CASCADE · conceptId CASCADE · source `''` (free-text citation) · **sourceId SET NULL** (the reading it belongs to) · location `''` · content · pageNumber/startOffset/endOffset/pageContentHash nullable (anchor) · createdAt | A byte belongs to a reading; a concept does not. Export field is `text`, column is `content` |
| `edge` | id · courseId SET NULL · userId CASCADE · fromId CASCADE · toId CASCADE · handle `''` · sentence NOT NULL · createdAt | Directed. Sentence required; handle is the coined term |
| `read` | id · courseId SET NULL · userId CASCADE · text `''` · updatedAt | UNIQUE NULLS NOT DISTINCT (userId, courseId). MIRROR table |
| `map` | id · courseId SET NULL · userId CASCADE · **scopeKey `''`** · name · read `''` · essence `''` · **tiers jsonb `Record<conceptId, 'p'\|'s'\|'t'\|'x'>`** default `{}` · createdAt · updatedAt | scopeKey `''` = whole weave, else sorted comma-joined sourceIds. Absent tier key = unsorted. Non-unique index (userId, courseId, scopeKey) — plural siblings are the point |

### 1e. Projections & history (spec §6 `views` + development history)

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `view` | id · courseId SET NULL · userId CASCADE · key (`'cardTable'` \| `'map:<mapId>'`) · **data jsonb** `{positions:{conceptId:{x,y}}, bends:{edgeId:{dx,dy}}, order?:string[], pins?:string[]}` · updatedAt | UNIQUE NULLS NOT DISTINCT (userId, courseId, key). Only student gestures write here (red line #7). `x` is proportional 0..1 (>1.5 read as legacy pixels) |
| `graph_event` | id · courseId SET NULL · userId CASCADE · kind · entityType `'concept'\|'byte'\|'edge'\|'graph'\|'map'` · entityId nullable · payload jsonb · at | Append-only. Survives reset and import. Kinds: `concept.create/retier/rename/update/delete`, `byte.create/refile/attribute/delete`, `edge.throw/coin/update/delete`, `read.update`, `map.create/retier/rename/update/delete/import`, `graph.reset/import/example` |

---

## 2. Server actions

Four `"use server"` modules: `src/actions/{loom,sources,admin,courses}.ts`.
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
| `getUserLoomData()` | — | `{concepts, bytes, edges, maps, read, views}` — rows ordered `createdAt, id` (capture order is meaning) | read-only; drops orphaned `map:<id>` view rows from the response |
| `createConcept` | `{label, def?, note?}` | inserted `Concept` | `concept.create` |
| `updateConcept` | `id, Partial<{label,def,note,tier}>` | void | case-insensitive label-clash check within (user, course) → throws; `concept.retier/rename/update` |
| `deleteConcept` | `id` | void | refuses while an edge endpoint; cascades bytes; prunes views + map tiers; `concept.delete` |
| `createByte` | `{conceptId, source, sourceId?, location, content, anchor fields?}` | inserted `Byte` | reconciles offsets against `source_page` when hashes agree; `byte.create` |
| `refileByte` | `byteId, conceptId` | new `Byte` (row copy — v1 semantics) | dedupes by (userId, conceptId, content); `byte.refile` |
| `attributeBytes` | `byteIds[], sourceId` | count updated | fills `sourceId` **only where NULL**, only by student act; `byte.attribute` |
| `deleteByte` | `id` | void | `byte.delete` |
| `createEdge` | `{fromId, toId, sentence}` | inserted `Edge` | `edge.throw` |
| `updateEdge` | `id, Partial<{handle, sentence}>` | void | `edge.coin` when handle present, else `edge.update` |
| `deleteEdge` | `id` | void | prunes bends; `edge.delete` |
| `saveRead` **(deprecated)** | `text` | void | upserts the mirror `read` row **without** touching any map — the one writer that can desync the mirror. Uncalled by the client; still exported and POSTable |
| `createMap` | `{scopeKey, name}` | `LoomMap` | max 60 maps → throws; name trimmed to 80; `map.create` |
| `updateMap` | `id, Partial<{name, read, essence, tiers}>` | void | one `db.batch`: map update + mirror dual-write of `concept.tier` diffs + `read` upsert when it's the mirror map; `map.retier/rename/update` |
| `deleteMap` | `id` | void | batch: map + its `map:<id>` view; if it was the mirror, re-points the mirror to the next-oldest whole-weave map (best-effort); `map.delete` |
| `saveView` | `key, CardTableView` | void | key must be `cardTable` or an owned `map:<id>` else throws; mirror-map geometry echoes into `cardTable`; **no event** (projections) |
| `getGraphEvents()` | — | events oldest-first, with synthesized `synth-*` creates for pre-history rows | read-only |
| `resetGraph()` | — | void | `graph.reset` event first (with counts), then batch-delete edges/bytes/concepts/maps/reads/views. **History survives** |
| `importGraph` | `ParsedImport` (client-parsed) | fresh `getUserLoomData()` | limits `{concepts:400, bytes:2000, edges:2000, maps:40}`; whole-graph replace in one batch; see §4e |
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
| `createOwnReading` | `{title, author?, sourceReference?}` | `{id, title}` | **session only — deliberately not admin-gated** (reference-only card; called from the shelf's "a reading of your own" form) |
| `createSource` | metadata + `File` | `Source` | admin — but **the check runs after the blob write** (see audit F-5). No callers; effectively dead but POSTable |
| `registerUploadedReading` | `{storageKey, filename, title?, courseId?}` | `{id, title}` | admin; re-checks prefix + real blob size, deletes oversize orphans |
| `rescoreSourceAction` | FormData `sourceId` | void | admin; also rebuilds the cover |
| `draftMetadataForSource` | `sourceId` | `MetadataDraft` | admin; **writes nothing** (red line #6 exception (b) — proposal only) |
| `updateSourceMetadata` | FormData | void | admin |
| `addSourceToCourse` / `removeSourceFromCourse` | FormData | void | admin |
| `setCourseSourceVisibility` / `updateCourseSourceSchedule` | FormData | void | admin |
| `setSourceArchived` / `deleteSource` | FormData | void | admin; delete removes blob + cover + course links |
| `getSourceFile` / `getSourceFileStream` | `sourceId` | `{source, buffer\|stream}` | `authorizeSourceFile`: admin → anything; **no session outside production → allowed** (dev skip); own reading → allowed; else active membership in a course where the reading `isVisible` |
| `getSourceForCover` | `sourceId` | `{source}` — authorization + row, **no bytes** | same `authorizeSourceFile`; exists so the cover route's cache hit never downloads the PDF |

Upload constants ([src/lib/readingUpload.ts](../src/lib/readingUpload.ts)):
`MAX_READING_BYTES` = 20 MB, prefix `readings/`, PDFs only — enforced browser-side,
token-side, and at registration (three places that don't trust each other).

Search — [src/actions/search.ts](../src/actions/search.ts): plain Postgres FTS
(`websearch_to_tsquery` / `ts_rank` / `ts_headline`, GIN expression indexes from
migration 0014 — deliberately no model anywhere near it). Both actions scope
through `getSources()`, so search can never surface a reading its caller could
not already open from the shelf. Snippets mark matches with `⟦⟧`
([src/lib/searchText.ts](../src/lib/searchText.ts)) and are rendered by
splitting, never as HTML. Queries are trimmed to 200 chars; under 2 chars
nothing runs.

| Action | Params | Returns | Auth |
| --- | --- | --- | --- |
| `searchReadings` | `query` | ≤30 `ReadingSearchHit` — card + page matches, ranked (card ≫ best page > breadth), each with ≤2 page excerpts | session required, else `[]` |
| `searchReading` | `sourceId, query` | `{hits: ≤50 page-ordered snippets, truncated}` | session required **and** `sourceId` on the caller's shelf, else empty |

### 2c. Roster & cohort — [src/actions/admin.ts](../src/actions/admin.ts)

`checkAdmin()` **redirects** `/` on failure (silent-success shape to a scripted caller).

| Action | Params | Returns |
| --- | --- | --- |
| `getClassData` | `courseId?, sectionId?` | per-member `{id,name,email,section,conceptsCount,edgesCount}` (active members only) |
| `getRoster` | `courseId?, sectionId?` | `RosterRow[]` — enrolled + pending invites merged, pending first |
| `getAllowedEmails` | `courseId?` | invites `{email, sectionId}[]` |
| `addAllowedEmail` | FormData `{courseId, email, sectionId}` | void — upsert invitation |
| `inviteLearners` | `(prev, FormData{courseId, emails, sectionId})` | `InviteResult {added, already, invalid, unknownSections}` — one address per line, optional `email, Section name`; section matched by name or slug, case-insensitive; no size cap |
| `removeAllowedEmail` | FormData | void — hard-deletes the invitation |
| `removeFromRoster` | FormData `{courseId, userId}` | void — sets `removedAt`, deletes invite, revokes sessions **only** when no app access remains |
| `getUserLoomDataAsAdmin` | `targetUserId, courseId?` | `{concepts, bytes, edges}` (no maps/read/views) |
| `getAggregateLoomData` | `courseId?, sectionId?` | cohort `{concepts, bytes, edges, bytesUnavailable}` — bytes fail soft |

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
| `GET/POST /api/auth/[...nextauth]` | NextAuth (GitHub OAuth). Sign-in admitted by `emailHasAppAccess`: admin fallback email ∨ any course invitation ∨ any active membership ∨ legacy allowlist. Enrolment happens in `events.signIn` (first-OAuth `user.id` is GitHub's in the callback), idempotent upsert clearing `removedAt` | — |
| `GET /api/auth/test-login?as=testa` | Mints a 30-day DB session + cookies; default identity is the admin, `?as=testa` = `test-user-a@loom.local` (LEARNER, enrolled into the oldest course). Returns `{success, userId, sessionToken}` | **403 in production** (first statement); no other guard — dev/CI only |
| `GET /api/readings/[sourceId]?download=1` | Streams the PDF (never buffered — 4.5 MB serverless cap), RFC 6266 filename, `Cache-Control: private`. Errors: 401 / 404 / 500 JSON | Session required **in production only**; then `authorizeSourceFile` |
| `GET /api/readings/[sourceId]/cover` | PNG cover (cached at `covers/<id>.png`; re-rendered from the PDF only on a cache miss) or SVG fallback (`no-store`) | No check of its own — inherits `authorizeSourceFile` via `getSourceForCover` (bytes-free) |
| `POST /api/readings/upload` | Vercel Blob client-upload token exchange. Token scoped: private, PDFs only, ≤ 20 MB, path under `readings/`, random suffix. `onUploadCompleted` deliberately omitted — the client calls `registerUploadedReading` itself | Admin, checked twice |

---

## 4. Export / import formats — [src/lib/graphExport.ts](../src/lib/graphExport.ts)

### 4a. Whole-cloth export (`<student>-loom.json`)

The spec §6 contract, exactly:

```jsonc
{
  "graph": {
    "student": "Display Name",
    "concepts": [{ "id", "label", "def", "note", "tier" }],   // tier = mirror of oldest whole-weave map
    "bytes":    [{ "id", "conceptId", "source", "location", "text",
                   "anchor?": { "sourceId", "pageNumber", "startOffset", "endOffset", "pageContentHash" } }],
    "edges":    [{ "id", "fromId", "toId", "sentence", "handle" }],
    "read":     "mirror paragraph",
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
    "concepts": [{ ..., "tier": mapTier }],   // THIS map's tier, not the mirror
    "bytes":    [ /* every byte of every in-scope concept — the file stands alone */ ],
    "edges":    [ /* scoped edges only */ ]
  },
  "view?": { "positions": {}, "bends": {}, "order?": [], "pins?": [] }
}
```

Scope membership: whole weave = everything; otherwise a concept is in scope when one
of its bytes has `sourceId ∈ scope` **or it has no bytes at all**
([src/lib/scope.ts](../src/lib/scope.ts)).

### 4c. Markdown outlines (readable, never re-importable)

Whole cloth: `# Loom — <student>` → My read → Maps (per map: name — scope, essence,
paragraph, tier lines) → Concepts grouped by tier (with bytes as quotes) →
Propositions (`A —[handle]→ B` + sentence). Per map: same shape scoped to the map.
Map kit (clipboard): name/essence/tier groups/propositions/armature/loose.

### 4d. Import routing

`parseAnyImport`: JSON with `format: "loom-map"` → map import; anything else →
whole-cloth import. `parseImport` explicitly rejects a `loom-map` file — **a single
map can never reach the replace path.**

### 4e. Whole-cloth import (replace)

Client parse: flattens `{graph, views}`; validates tiers; drops blank labels and
orphan bytes; accepts `text` or `content`; folds legacy v2/v3 shapes (byte notes,
`triples` → edges); a pre-maps file **synthesizes "Map 1"** from
`tier`/`read`/`cardTable` (the 0012 backfill rule).
Server (`importGraph`): size limits → resolve known sources → **remint every id** →
remap view keys → **re-scope** each map (scopeKey filtered to known sources; resolves
to nothing → whole weave, never dropped — red line #5) → **remint tier keys** →
`graph.import` event with snapshot → one atomic batch: delete everything, insert
everything. Replace, never merge.

### 4f. Per-map import (additive)

Requires `map.name`. Tiers/geometry matched **by id against cards already on the
table**; misses counted and returned as `skipped`, never re-woven. Inserts exactly one
new map row (a parallel sibling) + its view row when geometry survived. Can never
delete or replace anything.

---

## 5. Invariants the code enforces

1. **Mirror dual-write.** `updateMap`, `saveView`, `deleteMap`, `loadWorkedExample`,
   `importGraph` keep `concept.tier` + `read` equal to the oldest whole-weave map.
   `saveRead` (deprecated) is the only writer that can break it. The `map` table is
   authoritative either way.
2. **`ensureActiveMap`** (client-only, LoomProvider): first sorting gesture in a fresh
   scope mints "Map N", with a pending-create de-dupe and an id-alias so in-flight
   gestures land on the right map.
3. **Graph vs projections.** `view` writes record no history event; `pruneViews`
   strips deleted ids without touching `map.updatedAt`; derived layout is computed
   for display and discarded (red line #7).
4. **Soft removal.** `removedAt` on membership; every read filters it; sessions
   revoked only when no access remains; re-invitation reinstates.
5. **Orphan adoption.** Every loom action adopts `courseId IS NULL` rows into the
   active course; for `read`/`view` (unique-constrained) it deletes the null-course
   leftover first so the unique can't wedge the student.
6. **A byte belongs to a reading; a concept does not.** Membership is derived from
   `byte.sourceId` per render and discarded. `attributeBytes` fills NULL only, by
   student act. A byte-less concept appears in every scope (red line #4 visibility).
7. **One label = one concept** — code-level clash check in `updateConcept` (not in
   `createConcept`, and no DB constraint).
8. **A concept in use cannot be deleted** while it is an edge endpoint.
9. **History survives everything** — `graph_event` outlives reset and import;
   event writes are best-effort (neon-http has no cross-call transactions), graph
   tables stay the source of truth.
10. **Atomicity via `db.batch`** for: whole-graph replace, reset, mirror dual-write,
    mirror re-point, worked example, map delete.
11. **Anchor canonicality.** `createByte` prefers server page offsets when content
    hashes agree; otherwise preserves the client's offsets and hash.
12. **Replace-race protection.** The client cancels debounced view (500 ms) and
    map-text (700 ms) saves before import/reset; `flushMapText` also fires on
    `visibilitychange`/`pagehide`.

### Known contract debts (tracked, deliberate)

- The mirror (`concept.tier`, `reads`, `cardTable` echo) awaits its contract
  migration; until then two quirks are accepted (see NEXT_SESSION item 4).
- `importGraph`/`importMapArrangement` trust client-side parsing for shape; the
  server re-validates sizes, source existence, and ownership only.
- `saveRead` and `createSource` are exported but have no callers — deprecated and
  dead-but-live respectively (see audit).
- Byte→concept is one-to-many by v1 decision; re-file copies the byte.
