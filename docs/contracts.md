# Loom — Contracts

> DESCRIBES THE CODE AS BUILT, not the target. Where this file conflicts with
> docs/loom-model-build.md, the model wins. **P0 landed (migration 0021)**:
> `byte_concept` join (Unlabeled Passages legal; concept delete never deletes bytes),
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
> Reading tab and the Concepts/Links comparison on 03 · Vocabulary, at Section
> and Cohort only, gated per reading on having coded it yourself.
> **P3 is complete.** Update the invariant, then this file, as each phase lands.
> **Shelf bounce fixed** (2026-08-07 late): client components no longer invoke
> Server Functions for reads — every client read GETs a thin `/api` route via
> `src/lib/reads.ts` (§3), taking reads off the App Router action queue whose
> navigation race (vercel/next.js#90467) bounced students to the library.

The complete inventory of every surface a caller can rely on: database schema, server
actions, API routes, export/import file formats, and the invariants the code enforces.
Companion to the *why* — now [loom-model-build.md](loom-model-build.md) (authority) with
[loom-refactor-spec.md](loom-refactor-spec.md) (work order); historically
[archive/loom-spec-v1.md](archive/loom-spec-v1.md). This is the *what, exactly*.

**As of:** `dev`, 2026-08-07 — P3.12 auth-side, P3.13 (the cloth on the card), P3.14 (Overlays), the shelf-bounce fix (client reads via `/api`).
Re-stamp when it reaches master. Line numbers cite that branch and will drift; names
and shapes are the contract, line numbers are a courtesy.

Conventions used below:

- All ids are `text` primary keys defaulting to `crypto.randomUUID()` unless noted.
- `Tier` = `'' | 'p' | 's' | 't' | 'x'` (unsorted · primary · secondary · tertiary · set
  aside), per-map only. `PassageTier` = `'' | 'p' | 's' | 't'`, on the byte itself.
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
`byte`'s, after deleting the orphans the missing constraint had been accumulating.

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
` after each `hasEOL` item — except on a page whose own items already contain a newline, which keeps the old separator-free join because the newline could not then be taken back out. `contentHash` is therefore **not** a hash of this column: every writer stores `hashText(textLayerProjection(textContent))`, the browser's text-layer string, which is what `byte.pageContentHash` is compared against. 0016 gives the CASCADE its actual constraint and indexes (sourceId, pageNumber). No unique on (sourceId, pageNumber). GIN index `source_page_search_idx` on `to_tsvector('english', textContent)`; `source` carries the weighted `source_search_idx` twin (title A · author B · reference/description C) — the search queries must repeat these expressions verbatim |
| `source_score` | sourceId PK/CASCADE · status `'heuristic'\|'judged'\|'unscorable'` · coverage/legibility/anchorability/structure int nullable · overall real · pass bool nullable · notes · judgeNotes · judgeModel · metrics jsonb · scoredAt | 1:1 with source. Unscored dimension = NULL (abstention, never a default). `pass` requires every scored dimension ≥ 3 — not compensatory — **and** non-null `coverage` and `legibility`, since "can a student quote this?" has no answer without them. `legibility` abstains when there is too little text to confirm the characters read as language; it used to be granted a 5, which is how 693 characters of OCR noise scored 5/5/5 and passed. `pass NULL` is a third verdict, rendered **Unverified**. `metrics` carries the structural probe only when the scorer held the PDF bytes |

### 1d. The graph (the artifact — archived spec §6 `graph`)

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `concept` | id · courseId SET NULL · userId CASCADE · label · def `''` · note `''` · createdAt | No tier (0021 dropped the mirror column — tiers live on `map.tiers`). One-label-one-concept is enforced in code (`updateConcept` clash check), **not** by a DB unique — ruled for replacement by warn-don't-forbid (P1.7) |
| `byte` | id · courseId SET NULL · userId CASCADE · source `''` (free-text citation) · **sourceId SET NULL** (the reading it belongs to) · location `''` · content · pageNumber/startOffset/endOffset/pageContentHash nullable (anchor) · **note `''` · question `''` · isPullQuote false · tier `PassageTier` `''`** · createdAt | A byte belongs to a reading; a concept does not. Concepts attach via `byte_concept` (0..n) — zero rows = an Unlabeled Passage, a legal state. Export field is `text`, column is `content` |
| `byte_concept` | byteId CASCADE · conceptId CASCADE · createdAt | PK (byteId, conceptId); index on conceptId. The passage↔concept pointers of ruling 37 — refile adds a row, never copies a byte; deleting either end removes pointers only |
| `edge` | id · courseId SET NULL · userId CASCADE · fromId CASCADE · toId CASCADE · handle `''` · sentence `''` NOT NULL default `''` · createdAt | Directed. Sentence optional at throw (P0.3 golden path); handle is the coined term |
| `cloth` | id · courseId SET NULL · userId CASCADE · scopeKey `''` · title `''` · description `''` · createdAt · updatedAt | UNIQUE NULLS NOT DISTINCT (userId, courseId, scopeKey). The per-scope workspace identity (P0.4); absorbed the `read` table in 0021 (whole-weave row's text → whole-weave cloth's description) |
| `map` | id · courseId SET NULL · userId CASCADE · **scopeKey `''`** · name · read `''` · essence `''` · **tiers jsonb `Record<conceptId, 'p'\|'s'\|'t'\|'x'>`** default `{}` · createdAt · updatedAt | scopeKey `''` = whole weave, else sorted comma-joined sourceIds. Absent tier key = unsorted. Non-unique index (userId, courseId, scopeKey) — plural siblings are the point |

### 1e. Projections & history (archived spec §6 `views` + development history)

| Table | Columns | Keys / notes |
| --- | --- | --- |
| `view` | id · courseId SET NULL · userId CASCADE · key (`'cardTable'` \| `'map:<mapId>'`) · **data jsonb** `{positions:{conceptId:{x,y}}, bends:{edgeId:{dx,dy}}, order?:string[], pins?:string[]}` · updatedAt | UNIQUE NULLS NOT DISTINCT (userId, courseId, key). Only student gestures write here (red line #7). `x` is proportional 0..1 (>1.5 read as legacy pixels) |
| `graph_event` | id · courseId SET NULL · userId CASCADE · kind · entityType `'concept'\|'byte'\|'edge'\|'graph'\|'map'\|'cloth'` · entityId nullable · payload jsonb · at | Append-only. Survives reset and import. Kinds: `concept.create/rename/update/merge/delete`, `byte.capture/refile/unfile/attribute/delete`, `edge.throw/coin/update/delete`, `cloth.update`, `map.create/retier/rename/update/delete/import`, `graph.reset/import/example`. Historical kinds still in the record: `byte.create`, `concept.retier`, `read.update` |

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
| `getUserLoomData()` | — | `{concepts, bytes, edges, maps, cloths, views}` — rows ordered `createdAt, id` (capture order is meaning); each byte carries `conceptIds` folded from `byte_concept` in filing order | read-only; drops orphaned `map:<id>` view rows from the response |
| `createConcept` | `{label, def?, note?}` | inserted `Concept` | `concept.create` |
| `updateConcept` | `id, Partial<{label,def,note}>` | void | no clash check (ruling 36 — homonyms legal; the client warns at coin-time); `concept.rename/update` |
| `mergeConcepts` | `sourceId, targetId` | fresh `getUserLoomData()` | one batch: pointers repoint (collisions dropped), edges repoint, target inherits missing def/note, source deleted; prunes views/tiers; `concept.merge` {fromId, fromLabel, intoLabel, pointersMoved} |
| `deleteConcept` | `id` | void | refuses while an edge endpoint; **bytes survive** — join rows cascade, passages become Unlabeled; prunes views + map tiers; `concept.delete` |
| `createByte` | `{conceptIds?, source, sourceId?, location, content, anchor fields?, note?, question?, isPullQuote?, tier?}` | inserted `Byte` (+`conceptIds`) | zero conceptIds = Unlabeled Passage; byte + pointers land in one `db.batch`; verifies concept ownership; reconciles offsets against `source_page` when hashes agree; `byte.capture` (fires for every capture, named or not — `byte.create` is a historical kind) |
| `refileByte` | `byteId, conceptId` | the same `Byte` with the pointer added | inserts one `byte_concept` row (ruling 37 — never copies); throws if already filed; `byte.refile` |
| `unfileByte` | `byteId, conceptId` | void | removes one pointer — refileByte's inverse; the byte survives (possibly as an Unlabeled Passage); OpenTab shows this instead of "remove byte" when a passage has >1 filing; `byte.unfile` |
| `attributeBytes` | `byteIds[], sourceId` | count updated | fills `sourceId` **only where NULL**, only by student act, and only to a reading the student may see — `authorizeSourceAccess`. Until 0016-era it checked merely that the id existed, which admitted another student's private upload; `byte.attribute` |
| `deleteByte` | `id` | void | `byte.delete` |
| `createEdge` | `{fromId, toId, sentence?}` | inserted `Edge` | sentence defaults `''` (P0.3 — connect first, describe when ready); `edge.throw` |
| `updateEdge` | `id, Partial<{handle, sentence}>` | void | `edge.coin` when handle present, else `edge.update` |
| `deleteEdge` | `id` | void | prunes bends; `edge.delete` |
| `saveCloth` | `{scopeKey, title?, description?}` | upserted `Cloth` | one row per (user, course, scopeKey); title trimmed to 200; replaces the removed `saveRead`; `cloth.update` |
| `createMap` | `{scopeKey, name}` | `LoomMap` | max 60 maps → throws; name trimmed to 80; `map.create` |
| `updateMap` | `id, Partial<{name, read, essence, tiers}>` | void | single map update — no mirror (0021); tiers sanitized to known concepts, diffed for the `map.retier` payload; `map.retier/rename/update` |
| `deleteMap` | `id` | void | batch: map + its `map:<id>` view; `map.delete` |
| `saveView` | `key, CardTableView` | void | key must be `cardTable` or an owned `map:<id>` else throws; **no event** (projections) |
| `getGraphEvents()` | — | events oldest-first, with synthesized `synth-*` creates for pre-history rows | read-only |
| `resetGraph()` | — | void | `graph.reset` event first (with counts), then batch-delete edges/bytes/concepts/maps/cloths/views (byte_concept cascades). **History survives** |
| `importGraph` | `ParsedImport` (client-parsed) | fresh `getUserLoomData()` | limits `{concepts:400, bytes:2000, edges:2000, maps:40, cloths:40}`; whole-graph replace in one batch; see §4e |
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
| `getUserLoomDataAsAdmin` | `targetUserId, courseId?` | `{concepts, bytes, edges}` (no maps/read/views) |
| `getAggregateLoomData` | `courseId?, sectionId?` | cohort `{concepts, bytes, edges, bytesUnavailable}` — bytes fail soft |

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
| `getPassagesOverlay` | `sourceId, band = "section"` | `PassagesOverlay` — `{band, blocked, peers, contributors, passages, pages[], unanchored, droppedSpans}`. Each `pages[]` entry is `{pageNumber, count, contentHash, spans[]}`; a span is `{start, end, count}`, disjoint runs with overlap depth from a sweep line (`heatSpans`). Peer bytes count toward `passages`/`count` always, but only contribute a span when their `pageContentHash` equals the reading's canonical `source_page.contentHash`; the rest are `unanchored`. `MAX_SPANS` = 4000, overflow reported as `droppedSpans` |
| `getVocabularyOverlay` | `sourceId \| null, band = "section"` | `VocabularyOverlay` — `{band, blocked, peers, contributors, readings, concepts[], moreConcepts, links[], moreLinks, unlabeledLinks}`. A term is `{label, count, descriptions[], moreDescriptions}`; `count` is **distinct people**. Concepts are scoped through their passages (`byte.sourceId ∈ scope`), exactly as `scopedGraph` does; links need both ends in scope. Caps: 40 terms, 3 descriptions of ≤240 chars each, all overflow reported |

`blocked` is one of `signed-out · not-enrolled · not-coded · no-section ·
no-peers`, or null. Every one is a sentence the UI prints
(`overlayBlockMessage`): an empty comparison that does not say why reads as a
bug, and "code this reading yourself first" is the point of the gate.

Client: **PdfViewer** shades in the same `Mark` pass as byte highlights —
overlay first so a student's own yellow nests inside and paints over it, then
bytes, then search terms (one `unmark`; competing passes would strip each
other). Marks are `aria-hidden`, carry `data-heat` 1–5, and shade in five steps
with a slate rule above the words so the section's mark survives under your own
yellow. The client re-checks the hash against the live text layer and refuses to
shade a drifted page — there is no fuzzy fallback, because it never receives the
other student's text. **ReadTab** mounts `VocabularyOverlay` below the read.
Both are off until asked for and re-ask when the viewer's own capture count
changes, so the capture that opens the gate opens the overlay without a reload.

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
| `GET /api/auth/test-login?as=testa` | Mints a 30-day DB session + cookies; default identity is the admin, `?as=testa` = `test-user-a@loom.local` (LEARNER, enrolled into the oldest course). Returns `{success, userId, sessionToken}` | **403 in production** (first statement); no other guard — dev/CI only |
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
    "bytes":    [{ "id", "conceptIds": [],                     // [] = an Unlabeled Passage
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
    "bytes":    [ /* every byte of every in-scope concept, plus the scope's own
                     unlabeled passages — the file stands alone */ ],
    "edges":    [ /* scoped edges only */ ]
  },
  "view?": { "positions": {}, "bends": {}, "order?": [], "pins?": [] }
}
```

Scope membership: whole weave = everything; otherwise a concept is in scope when one
of its bytes has `sourceId ∈ scope` **or it has no bytes at all**
([src/lib/scope.ts](../src/lib/scope.ts)).

### 4c. Markdown outlines (readable, never re-importable)

Whole cloth: `# Loom — <student>` → My read (whole-weave cloth description) → My
readings (per-reading cloth titles/descriptions) → Maps (per map: name — scope,
essence, paragraph, tier lines) → Concepts (flat, with bytes as quotes) → Unfiled
passages (unlabeled bytes — red line #4 keeps them visible) → Propositions
(`A —[handle]→ B` + sentence when present). Per map: same shape scoped to the map,
plus its unfiled passages. Map kit (clipboard): name/essence/tier groups/
propositions/armature/loose; with no map, everything is unsorted (degree order).

### 4d. Import routing

`parseAnyImport`: JSON with `format: "loom-map"` → map import; anything else →
whole-cloth import. `parseImport` explicitly rejects a `loom-map` file — **a single
map can never reach the replace path.**

### 4e. Whole-cloth import (replace)

Client parse: flattens `{graph, views}`; validates tiers; drops blank-label concepts
and text-less bytes — but a byte whose concepts don't resolve now SURVIVES as an
Unlabeled Passage (red line #5), where it used to be dropped as an orphan; accepts
`conceptIds` (new) or `conceptId` (legacy), `text` or `content`; folds legacy v2/v3
shapes (legacy byte notes onto the concept — a new-shape byte's `note` stays on the
passage; `triples` → edges); a legacy `read` string becomes the whole-weave cloth's
description; a pre-maps file **synthesizes "Map 1"** from the legacy concept
`tier`/`read`/`cardTable` (the 0012 backfill rule).
Server (`importGraph`): size limits → resolve known sources → **remint every id** →
remap view keys → **re-scope** each map and cloth (scopeKey filtered to known
sources; resolves to nothing → whole weave, never dropped — red line #5; for
cloths, exact scopes claim their slots FIRST and a scope-degraded cloth is
dropped on collision, never the genuine one) → **remint tier keys**
(`byte_concept` createdAt staggered per row — filing order is meaning) →
`graph.import` event with snapshot → one atomic batch: delete everything (incl.
cloths), insert everything (incl. `byte_concept` pointers). Replace, never merge.

### 4f. Per-map import (additive)

Requires `map.name`. Tiers/geometry matched **by id against cards already on the
table**; misses counted and returned as `skipped`, never re-woven. Inserts exactly one
new map row (a parallel sibling) + its view row when geometry survived. Can never
delete or replace anything.

---

## 5. Invariants the code enforces

1. **Passages survive their labels** (0021). Deleting a concept removes
   `byte_concept` pointers, never bytes; a byte with zero pointers is an Unlabeled
   Passage, legal everywhere. `createByte` writes the byte and its pointers in one
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
6. **A byte belongs to a reading; a concept does not.** Membership is derived from
   `byte.sourceId` + its `byte_concept` pointers per render and discarded.
   `attributeBytes` fills NULL only, by student act. A byte-less concept appears in
   every scope (red line #4 visibility).
7. **Identity by object, not label** (ruling 36, landed with P1). Homonyms are
   legal everywhere; the client warns at coin-time (create, rename) and offers
   merge; `mergeConcepts` is the repair for true duplicates. No clash check
   remains anywhere.
8. **A concept in use cannot be deleted** while it is an edge endpoint.
9. **History survives everything** — `graph_event` outlives reset and import;
   event writes are best-effort (neon-http has no cross-call transactions), graph
   tables stay the source of truth.
10. **Atomicity via `db.batch`** for: whole-graph replace, reset, byte + its
    concept pointers, worked example, map delete.
11. **Anchor canonicality.** `createByte` prefers server page offsets when content
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
- The new `bytes` margin fields (note/question/isPullQuote/tier) are contract-level
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
- Unlabeled Passages are representable and survive import/delete, but no UI creates
  or displays them yet — the graph-view unattached group is P1.9.
