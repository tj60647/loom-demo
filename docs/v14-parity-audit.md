# v14 parity audit — the example vs. the app

**Date:** 2026-07-29 · **Inputs:** `loom-v14-example.html` (= `loom-v14.html` + worked-example seed), [spec v1](loom-spec-v1.md), the Next.js app at `src/`.
**Status:** DRAFT — pending workflow verification pass.

## 0. Framing

Three principles govern this audit and everything built from it:

1. **The graph is the artifact; everything else is a projection.** Spec §6 already ratifies this: `graph` (concepts, bytes, edges, read) is the export contract; `views` (card-table positions, edge bends) are per-view student geometry that round-trips but that no consumer must read. The arc map, the card table, the report, the history scrubber — all projections. Adding a view adds a key under `views`, never a field on a concept or edge. The one deliberate exception is `tier`: placement's *meaning*, extracted into the graph; the residual x/y stays in the view.
2. **The graph's development is part of the student's work.** The single-file tool keeps only the current state; the app should keep an append-only history of the student's own graph acts (create/rename/re-tier/throw/coin/delete/import/reset), so the development of understanding is itself explorable. History records gestures; it never grades them.
3. **Organizational tools are exploratory instruments, not documentation.** The card table, the tiers, the report, the history view exist to be *rearranged* — cheap to change, provisional, framed as questions. Nothing in them freezes into a deliverable; the deliverable is the export (and the hand-drawn map made *outside* the tool). Counted, never judged (red line #7).

## 1. What the example is

`loom-v14-example.html` differs from `loom-v14.html` by 47 diff lines: title, storage key, `AUTO_GUIDE=false`, and a worked-example seed (Star & Griesemer 1989 — 8 concepts with tiers and defs, 7 bytes, 6 edges, a model first-year "read"). So "parity with the example" means **parity with the v14 tool**, plus **having a worked example** as an onboarding artifact.

Note on the storage shape: v14 persists `{student, read, concepts, bytes, edges, positions, bends}` — geometry *flat* on the state. Spec §6 (rev July 29d) supersedes that with the `graph`/`views` split. The app implements the **spec's** shape, not the example's.

## 2. Gap matrix

Verified first-hand against the code; ✦ marks entries double-checked by the audit workflow.

### Missing (not in the app at all)

| Gap | v14 evidence | Notes |
| --- | --- | --- |
| **04 · Map tab** — triage (P/S/T/– chips), three-band card table, drag-to-arrange, drop-to-re-tier, bendable edges, def-captions toggle, counted mirror ("a list / tiers / tiers + cross-links") | `loom-v14-example.html:1022-1135` | The whole tab. Largest single gap. |
| **`tier` on concepts** | spec §2, §6 | No column, no action support, no UI. |
| **Views storage** (positions, bends) | spec §6 | No table; nothing persists geometry. |
| **Read persistence** — "your read" | `setRead` in `LoomProvider.tsx:145-147` is client-state only | Lost on refresh. Brushes red line #5 (work never inaccessible). |
| **Map kit** (copy: concepts by tier / busiest-first, propositions, armature, loose concepts) | `:1193-1220` | The hand-off to the hand-drawn map. |
| **Export .json / import / reset** | `:1321-1324`, spec §3 Global | No export of any kind in the app. Red line #5. |
| **Markdown export** | spec §5 production | For Obsidian / notes / agents. |
| **Re-file a passage under a second concept** | `:1268-1275` | v1 copies the byte; production per spec §2 = byte→concept many-to-many. |
| **Working definition at capture time** | `bDef` field, `:1239-1247` | App captures label only; def editable later in the log. The 7/29 "swap" (label = noun phrase, def = own-words gloss) isn't in the capture flow. |
| **"No evidence" failure state** in Throw palette + Read ghost note | `:736-739`, `:897` | Red line #4 wants it visible. |
| **"Your words" prompt** (recurring handle → emerging vocabulary) | `:884-890` | Report exists but lacks prompt 4 + loose-threads ghost note. |
| **Coaching rails** (per-tab step indicators) | `#throwRail`, `#readRail`, `#mapRail` | Absent throughout. |
| **Walkthrough steps ④ map and ⑤ after-loom** | `:1138-1157` | App has 4 of 6 steps, older copy. |
| **Worked example** (Star & Griesemer seed) | `:611-644` | Nothing equivalent in the app. |
| **Graph history** | — (in no version of the tool; ratified by TJ 2026-07-29) | Append-only event log + exploratory replay view. |

### Partial

| Gap | Where it stands |
| --- | --- |
| Counted report | Prompts 1–3 (spine, centre, gap) ported (`ReadTab.tsx:88-132`); missing prompt 4 ("your words" — recurring handles), loose-count and no-evidence ghost notes, and the `drop` material a traced prompt lays out. Prompts render via `dangerouslySetInnerHTML` over user labels — XSS-shaped; rebuild as JSX. |
| Arc map | Geometry/styling/selection ported, but concept-click highlights only immediate edges, not the connected component (TODO at `ClothMap.tsx:43-45`) — **"trace the spine" lights a star, not the spine**, and disagrees with the reading pane, which walks the full component. Empty-cloth glyph missing. |
| Shuttle draw | Bare random pick (`ThrowTab.tsx:88-92`); v14 filters to uncrossed pairs, flips direction at p=.5, flashes "every pair crossed — drawing any", alerts under 2 concepts, and coaches the drawn pair ("'no crossing I can see' is a judgment too"). |
| Threads list | Present with remove; v14 orders unnamed-first and shows term/sentence pills + dashed loose styling. |
| Concept delete | v14 blocks deletion while the concept is used in a thread ("Remove the thread first"); the app cascades edges and bytes on one confirm — red-line-#5-adjacent destructive divergence. |
| Coding log row | Def editable, concept deletable; missing byte remove, concept rename, re-file. Count badge shows concepts only, not "(N bytes · M concepts)". |
| Open-tab coaching | Copy still teaches the v8 model (concept = own-words sentence, e.g. the placeholder at `OpenTab.tsx:232`); v14 teaches noun-phrase label + author's term + working definition. |
| Byte tidy-on-paste | v14 dehyphenates/joins pasted passages (`:1236`); app pastes raw. |
| Read-tab copy actions | Exist; v14 also prefixes student name + "my read of the cloth", includes the triple line per thread, guards the empty read, and confirms with a trace-feedback line. |
| Walkthrough / global copy | 4 of 6 cards; "Three tabs" with four present; footer stuck on "v8—Next" instead of per-tab captions; About dialog says students connect two *bytes* (the UI connects concepts); help `?` opens About, not the walkthrough. |
| Save feedback | v14 flashes save/copy status (`saveDot`); app mutations are optimistic and silent, and edit/delete failures don't roll back — a save can fail invisibly. |

### Present (parity already)

Concept capture with dedup-by-label (datalist reuse); passage-word chips (v14's earlier `contentWords` scaffold — the app kept a richer version than v14 retains); sentence-first throw with sleeper bench, swap, shuttle-draw; tongues (`REGISTERS`) + `OPENERS` matching v14's sets; coin-a-term flow with "more tongues"; arc-map cloth with pull-thread (concept/edge/hub tracing), halo labels, dashed sentence-only arcs; prompts 1–3; reading pane with byte quotes; first-run walkthrough (4 steps); per-student persistence.

### Ahead (the app exceeds the example)

| Capability | Notes |
| --- | --- |
| Auth + roles + allowlists | GitHub OAuth, admin/user roles, per-course email allowlists. |
| Courses / sections / memberships | Course-scoped graphs; section tags (enables December quilting). |
| Shared reading library | Course-agnostic PDFs, per-course join facts, multi-upload, covers. |
| Extraction scoring | Deterministic + judge passes, red-line-#6-ratified (spec §5). |
| In-tool PDF reading + highlight capture | Server-anchored offsets, content hashes, fuzzy fallback — v14 has *paste only*. |
| Admin views | Aggregate + per-user (read-only cloth), library management. |
| Optimistic UI | Provider-level optimistic mutations with rollback. |
| Test suite | Playwright coverage of PDF flows. |
| Undo/redo scaffolding | Edge undo stack in provider (unused by v14). |

## 3. Assessment

The app is a faithful port of tabs 01–03 of roughly v13 sitting on production-grade
infrastructure the example can't touch. What's missing is concentrated, not diffuse:

1. **The whole Map plane** (tier → arrange → mirror → kit) — the "sort and arrange"
   half of the pedagogy, and the spec's clearest embodiment of graph-vs-projection.
2. **The artifact contract** — export/import/reset and read persistence. Until these
   exist, red line #5 is not honestly met by the hosted build.
3. **The capture-time definition** — the 7/29 swap that separates *label* (noun
   phrase) from *definition* (own-words gloss).
4. **Failure states and coaching** — no-evidence visibility (red line #4), rails,
   v14 walkthrough copy.
5. **History** — nowhere in any version; ratified here as production scope.

Nothing in the missing set conflicts with what's ahead; the ahead set (library,
PDF capture, courses) is orthogonal and untouched by this work.

## 4. Plan

Ordered; each step leaves the app consistent.

1. **Schema** (`0001` migration): `concept.tier` (`''|p|s|t|x`, default `''`);
   `read` table (one row per user × course, the graph's `read` field); `view` table
   (user × course × key → jsonb `{positions, bends}`, `cardTable` first); `graph_event`
   append-only (user, course, kind, entityType, entityId, payload, at). neon-http has
   no transactions: events are written best-effort after their mutation; the graph
   tables remain the source of truth, events are additive provenance.
2. **Actions**: `tier` in updateConcept; `saveRead`/`getRead`; `getView`/`saveView`
   (student gestures only — red line #7); event recording inside every graph
   mutation; `exportGraph` (spec §6 JSON), `importGraph` (replace, confirmed),
   `resetGraph` (confirmed; history survives).
3. **Provider/types**: tier on Concept; read loaded + debounce-saved; views state;
   export/import/reset plumbing.
4. **Map tab** (`04 · Map`): triage list, three-band SVG card table (drag, drop-to-
   re-tier, bend edges, def captions), counted mirror, synced your-read, map kit.
5. **Read tab parity**: prompt 4 + ghost notes + drop material; map kit button;
   copy-with-name; rails.
6. **Open/Throw parity**: capture-time def field + v14 coaching copy; re-file under
   a second concept; byte remove; concept rename; no-evidence tags; tidy-on-paste.
7. **Global**: header export/import/reset; walkthrough steps ⑤⑥ + v14 copy;
   markdown export.
8. **History view**: "the cloth, over time" — an exploratory scrubber inside Read
   (replay the graph as it stood; counts only, no judgment), fed by `graph_event`.
9. **Worked example**: `src/lib/example.ts` dataset + "load the worked example"
   affordance on an empty loom (clearly labeled, removable via reset).
10. **Spec changelog**: record history-tracking ratification + views/read storage in
    §6; note the byte-copy (not yet M2M) implementation decision.
11. **Verify**: `npm run check`, build, Playwright suite, red-line review workflow.

### Red-line check on the new surface

- Map tab: renders what the student authored; tiers/positions/bends are all student
  gestures; the mirror counts and never advises (#7 ✓).
- History: replays the student's own acts; no evaluation, no comparison to others
  (#7 ✓, #8 untouched).
- Export: student's artifact, always available (#5 ✓).
- Worked example: static authored content, loaded only by explicit student act;
  nothing auto-generated (#1/#2 ✓).
- No model call anywhere in this work (#6 ✓ — the ingest exception stays bounded).

## 5. Decisions taken

- **Spec's storage shape over v14's** (`views` split, not flat positions).
- **`tier` lives on the concept** (graph), x/y in views — per spec §6's own reasoning.
- **Auto-layout stays ephemeral.** v14's card table *writes* its derived first-
  placement grid into `state.positions`; under red line #7 ("derived geometry may
  be computed for display and discarded; only student gestures write to `views`")
  a faithful port would violate the spec the example predates. The app computes
  default placement per render and persists a position only on the student's
  first drag of that card.
- **History is append-only and survives reset/import** — the point is the
  development record; reset clears the cloth, not the loom's memory of weaving.
  For rows that predate event recording, creation events are synthesized from
  `createdAt` so the timeline starts honestly rather than empty.
- **Byte re-file copies the byte** (v1 semantics) rather than jumping to M2M now;
  the M2M migration is deferred until quilting forces it (spec already anticipates).
- **Import replaces** (v14 semantics) with an explicit confirm, and logs one
  `graph.import` event. Import accepts both the §6 shape and v14's flat shape
  (running v14's `migrate()` semantics: triples→edges, byte-note folding).
- **Export writes the §6 contract exactly**: byte text exports as `text` (the app's
  column is `content`); `graph.student` comes from the session user's name. PDF
  capture anchors (`sourceId`, `pageNumber`, offsets, hash) ride along as an
  optional `anchor` object per byte — capture *provenance* is part of the
  student's own record, but it extends the contract, so the spec changelog
  records it and consumers may ignore it.
- **Concept delete adopts v14's guard**: blocked while thrown threads use the
  concept; confirm when bytes would go with it.
- **The passage-word chips stay** (mechanical extraction = permitted capture
  automation under red line #2, and they build labels from the author's own
  words), but the surrounding coaching moves to the 7/29 swap: label = short
  noun phrase, working definition = own-words gloss, captured together.
- **Out of scope here** (pre-existing, tracked in `NEXT_SESSION.md` / risks):
  dev-auth fallback + relaxed non-prod read access, hardcoded admin fallback
  emails, pdf.js worker from CDN, `scripts/apply-db-compat.ts` retirement.

## 5b. Adversarial review round (2026-07-29)

A 36-agent review workflow (four lenses — red lines, data flow, React
interaction, v14 fidelity — deduped, then refute-by-default verification)
confirmed 29 findings; all were fixed the same day. The load-bearing ones:

- **Import safety** — `parseImport` now rejects JSON that is not a loom export
  (previously `{}` or a stray package.json parsed as a valid *empty* export and
  wiped the graph); the Header parses *before* confirming and shows the counts
  being imported; `importGraph` runs as one atomic `db.batch` (delete + insert
  in a single transaction — a mid-import failure leaves the old graph intact);
  the provider refetches server truth if an import fails.
- **Uniqueness + adoption** — `read` and `view` gained `NULLS NOT DISTINCT`
  uniques (migration `0010`, with dedup); `saveRead`/`saveView` are upserts;
  the course-adoption step merges instead of blindly re-scoping (a collision
  there ran at the top of *every* action and could wedge a student out).
- **History replay of import/example eras** — `graph.import`/`graph.example`
  events carry a row snapshot; the fold seeds from it, so those eras still
  replay after a later reset (synthesis-from-surviving-rows alone lost them).
- **Ordering** — graph selects gained `ORDER BY createdAt, id`; "warp in
  reading order" and the export are now deterministic.
- **Proportional card positions** (spec §5) — stored x is a width fraction;
  legacy/v14 pixel values convert on read; the next drag persists the fraction.
- Gesture hygiene (pointercancel/pointerId on the card table; pending debounced
  saves cancelled around reset/import/example), rename-collision guard (§2 one
  label = one concept, client + server), no-op update events suppressed,
  refile double-click/error guards, clipboard fallback, deferred Blob
  revocation, and the remaining v14 copy divergences.

## 6. Verification results (2026-07-29)

- `tsc --noEmit`: clean. `eslint src/`: clean. `next build`: succeeds. All three
  re-verified after the §5b review fixes landed.
- Playwright: 7/8 pass. The failure (`library-verify.spec.ts` admin case) is
  **pre-existing, not a regression**: `/api/auth/test-login` mints a DB session
  row, but `getServerSession` never resolves the cookie (`/api/auth/session`
  returns `{}` for a fresh token, reproduced with curl against untouched auth
  code; `NEXTAUTH_URL` in `.env.local` is malformed — no protocol). Every
  passing spec authenticates via client-side session mocks; the server-session
  backdoor appears never to have worked in this environment. Fix belongs with
  the auth/ops residue already tracked in `NEXT_SESSION.md`.

## 6b. Follow-on work (2026-07-30)

Three requested changes, then a full UI/language reconciliation against v14.

**05 — Keep.** Export / import / reset moved off the header chrome onto their own
tab, each explained rather than merely offered: `.json` is the exact record and
the only re-importable form, `.md` a readable outline, import *replaces* rather
than merges, and reset spares the development history. Spec §3 Global records
the move.

**Sort list re-ordering.** The Map tab's sort list takes a drag handle (mouse and
keyboard). The order is stored as `views.cardTable.order` — a projection, so it
re-sequences that list alone and never the graph's capture order, which the arc
map reads as reading order. Spec §6 records the new key.

**"Make all primary."** A bulk tier assignment with a confirm naming how many
tiers it overwrites. v14 has no bulk tier operation; this is a deliberate
addition, framed as a starting point to demote from, and it stays a student
gesture (red line #7).

**UI / language reconciliation.** A four-lens read-only audit (Open+Throw,
Read+Map, chrome, and a whole-app voice pass) produced
[v14-ui-language-diff.md](v14-ui-language-diff.md): 123 differences sorted into
divergences from v14 (66), deliberate app changes (40), and production-only
surfaces (15). All 66 divergences are now closed, worked in batches of three.
The ones that were more than wording:

- The help "?" dispatched an event whose only listener lived in the signed-in
  branch — a visible control that did nothing. The walkthrough now mounts in
  every state and only auto-opens when signed in.
- v14's `[data-tip]` tooltip system had never been ported, while two `data-tip`
  attributes sat in `MapTab` pretending otherwise.
- The About dialog promised an auto-generated "axial read" seven lines after
  "Nothing is auto-generated", and claimed a lens-switching capability the tool
  does not have.
- Validation had gone silent on Open and Throw. Restoring the reason inline
  required trimming too, or a whitespace-only passage still passed the guard.
- **Tabs unmounted on switch**, destroying a half-typed throw sentence, the
  active trace, and the definitions toggle. Tabs 01–04 now stay mounted and hide
  with CSS, as v14 did. This required moving the cloth to `ResizeObserver`
  first: a panel mounted while hidden measures zero width, and a resize listener
  never fires on a `display` change.
- The two capture doorways had drifted apart — the PDF capture modal still
  taught the pre-7/29 model and offered no working-definition field, so a
  library capture silently skipped the gloss manual capture asks for.
- The save dot confirmed only the read; every graph mutation succeeded silently.

Two ports were adapted rather than copied, and say so in place: `.scrim`'s
`z-index` (v14's 40 was top-of-stack there; this app has overlays up to 10000)
and the reset tooltip (v14 says "this browser's cloth"; here reset is
server-side and course-scoped).

Keep-alive legitimately broke three Playwright selectors, which were matching
hidden panels once more than one tab lived in the DOM; they are now scoped to
`.panel.active`. That is a test change following an intentional app change, not
a test bent to fit a bug — checked first for the more serious hazard, duplicate
element ids across co-mounted tabs, and found none.

## 7. Workflow verification note

The gap matrix above was verified by a five-agent audit workflow (independent
inventories of the example, the app's graph surface, the app's beyond-example
surface, and the Next.js fork docs, plus an adversarial synthesis pass). Its
additional findings — the spine-trace inconsistency, the delete cascade, the
red-line #4/#5 acceptance failures, the #7 auto-lay trap, the anchors decision —
are incorporated. Full agent output: session scratchpad `audit-*.json`.
