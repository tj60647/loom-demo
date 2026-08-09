# The screen snip — a scoped proposal

**Status: NOT BUILT. Proposed 2026-08-09. TJ's call.**

Raised by TJ alongside capture-by-hand: the concept maps in *Learning How to
Learn* carry no text layer, so selection cannot reach them, and typing out a
hand-drawn diagram is not a faithful capture of it. The wanted gesture is
**drag a box on the page and keep what is inside it**.

This note exists because the handoff scoped it as "a bigger feature: `byte` has
no image column and the blob store would need a path for it". That framing is
half right, and the half that is wrong makes the feature much smaller than it
looks. What follows is what it would actually cost. The question that used to
decide it — what a snip does on export — TJ settled on 2026-08-09 (§3).

---

## 1. The snip does not need to be an image

The handoff's cost estimate assumes a snip is a picture that must be produced,
stored and served. For a reading in the Library it is none of those things.

A snip of a library PDF is **fully described by the reading it came from, the
page, and a rectangle**. The PDF is already in the blob store, already shared by
every reader of the course, already served through an authenticated route. The
snip is a *view* of bytes we hold, not new bytes.

So: **store four numbers, render on demand.** No image is written anywhere.

This is not speculative — the repair subsystem already does exactly it:

- `sourceRepairs.region` ([schema.ts](../src/db/schema.ts)) stores
  `{ x, y, width, height, scale }` as JSON against a `sourceId` + `pageNumber`.
- [repairPipeline.ts](../src/lib/repairPipeline.ts) renders that rectangle
  server-side with `@napi-rs/canvas` over pdf.js — the rasteriser is installed,
  working, and measured.
- [`/api/repairs/[repairId]/crop`](../src/app/api/repairs/[repairId]/crop/route.ts)
  serves the result as a PNG behind a session check, with the copyright
  reasoning already written into its header: *"a crop is a piece of a
  copyrighted course reading, and the blob store is private precisely so that
  nothing about a reading is reachable without a session."*

That last point matters. The snip inherits a rule the repair panel already
argues for; it does not need a new one.

### Why this is worth insisting on

[storage.ts](../src/lib/storage.ts) states the invariant plainly:

> These files are the same for every reader (100 users share one PDF) … **All
> per-user data (highlights, concepts, loom state) lives in Postgres, not
> here.**

A per-student snip blob is the first per-user object in a store documented as
shared and immutable. It brings a lifecycle nothing there has: orphan cleanup
when a passage is deleted, quota per student, and a second copy of copyrighted
material per reader rather than one per course. **Storing a rectangle avoids
all of it** and keeps the invariant true.

---

## 2. What would actually be built

Modest, and mostly UI:

| Piece | Work |
|---|---|
| **The gesture** | A "snip" mode in the PDF toolbar; drag a rect over the page. The viewer already tracks stage geometry and page scale for the capture button, so the page↔PDF coordinate transform exists. |
| **The columns** | `byte.snipPage` + `byte.snipRect` (one `jsonb`, mirroring `sourceRepairs.region`). Nullable — a snip is a Passage whose evidence is a region rather than a character range. One migration, additive, no backfill. |
| **The route** | `/api/readings/[sourceId]/snip?page=&rect=` — the crop route with a *member* gate rather than an admin one. Same rasteriser, same private-store reasoning, same hard cache (a rect never changes). |
| **The surfaces** | An `<img>` in the Capture Log row, the projection card, and Keep. Everywhere a passage's `content` renders today. |

**What a snip is, in the model:** a Passage. Not a new object. It takes
Concepts, a Gloss, Notes, a Tier and a Pull-quote flag like any other, and it
appears in Your work, the Lists and the Projections exactly where a typed one
does. `content` becomes the student's own caption — what they take the diagram
to say — which is *more* honest than a typed transcription pretending to be the
author's words verbatim.

That is the strongest argument for the feature: **a typed capture of a diagram
is a lie about what kind of evidence it is.** A snip is not.

---

## 3. Export — settled: the image travels

**TJ, 2026-08-09: "the snips will be small, i'm not worried about the copyright."**

That settles what was the only hard question here. A snip **embeds** in the
export as a base64 data URI, so a Cloth or a Projection still stands alone when
it leaves Loom — which is Keep's whole promise, and the reason a URL was never
really an option (the link dies with the session, and permanently when the
course ends).

Two consequences worth writing down now, because they are cheap to honour at
build time and expensive to retrofit:

- **Size is a budget, not an afterthought.** "Small" has to be enforced
  somewhere or a student with forty snips has an export nobody can open. Render
  the crop at a **capped long edge** and PNG-quantise or use JPEG for
  photographic regions. `repairPipeline.ts` already caps its crops at 2,560px on
  the long edge for exactly this reason (it was sending 3.7MB of base64 to five
  readers for pixels nobody saw). A snip wants a far smaller cap — a diagram
  read at ~1,000px on the long edge is legible and lands around 100–200KB.
- **Render at export time, from the rect.** Nothing changes about §1: the rect
  stays the stored truth, and the image is produced when the export is built.
  This keeps one representation, so a re-render at a different size is a
  parameter rather than a migration.

---

## 4. What is genuinely deferred

**A snip of something not in the Library** — a photograph of a paper book, a
whiteboard, a slide from a lecture. That one really does need what the handoff
described: per-user blob storage, an upload path, a quota, and an orphan
lifecycle. It is a different feature that happens to produce a similar-looking
row, and it should not ride in on the back of this one.

The Library case covers *Learning How to Learn* p56, which is the case TJ
raised.

---

## 5. Recommendation

Build it, in this order, and not before the capture-by-hand copy has been in
front of a reader:

1. Migration + the snip route (small, and the route is a near-copy of an
   existing one).
2. The drag gesture and the Capture Log row.
3. Export with the image embedded, to the size budget in §3.

**Do not** start with blob storage for snips. If the first commit writes a PNG
per student per snip, the invariant in `storage.ts` is gone and the argument
for getting it back gets harder every week.

---

## 6. Open

- **The size cap** — a number, not a principle: what long edge keeps a hand-drawn
  concept map legible? Worth measuring against *Learning How to Learn* p56
  rather than guessing.
- Whether a snip may carry a *transcription* alongside the caption (it could:
  the vision readers in `repairPipeline.ts` already transcribe crops). This
  would put a model in the capture loop, which red line #6 is about — worth
  raising deliberately rather than arriving at by accident.
