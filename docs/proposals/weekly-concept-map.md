# Weekly concept map — proposal

**Status: proposal.** The first use of `docs/structured-intake.md`, written
against the dormant `origin/weekly-concept-map` branch (rocketcrane, July
6–31, ~7 weeks stale) so a ruling exists on what that branch *is* — including
the ruling "archive it." This proposal describes what the branch contains; it
does not advocate for it.

## The problem

The branch's own statement (`weekly-concept-map/PROTOTYPE.md`): *"How might we
adapt Loom for weekly concept maps?"* — a professor wants students to produce
a concept map each week, and wants to see them side by side and together.

The branch answers with **two unrelated features fused**:

1. **A shared graph** (limion prototype, standalone HTML + capture frames):
   students' concepts drawn on one canvas, auto-placed by embedding
   similarity, with a "promote" flow for concepts several students already
   use and a "group connect" form that bridges two students' concepts into
   something new — i.e., cross-student objects.
2. **An Obsidian vault export** (`src/lib/conceptMarkdown.ts`,
   `src/app/api/export/vault/route.ts`, a Files tab): the current user's own
   concepts as a zip of markdown files with frontmatter and wikilinks,
   unzippable straight into an Obsidian vault.

## Where it sits in the model

- **The shared graph is weave territory.** The whole weave was **removed from
  the app 2026-08-11** ([loom-model-build.md](../loom-model-build.md) §1: it
  "should not be in the app as an idea until the faculty and the authors of
  the app agree on what it means to have a 'full weave'" — TJ). "Group
  connect" goes further than the weave ever did: it creates objects owned by
  no single student, which no object in the model supports. The cohort graph
  (`/admin/aggregate`) already draws every student's work on one canvas with
  attribution, without shared objects — it is the shipped answer to "see them
  together."
- **The vault export is display-layer** — a read-only projection of the
  user's own loom, no schema, no new objects. It fits the existing download
  discipline (object-download, svg-download: whose, what, stamped).
- **The branch's code speaks July.** It imports `Byte` and reads `bytes` —
  the Passages rename (migration 0023) postdates it, as do ~7 weeks of
  reading-station rework. Nothing merges; anything wanted gets rebuilt.

## Rulings that constrain it

- The weave removal above, verbatim in the model doc.
- Rocketcrane integrations are display-layer only — no schema or workflow
  changes (TJ, recorded 2026-08; this branch's export half complies, its
  shared-graph half does not).
- Never touch production student work; a rebuilt export writes nothing, so
  it clears this by construction.

## Non-goals

- This proposal does not revive the shared graph. If weekly concept maps are
  wanted, the in-model shapes are: per-student projections compared
  week-over-week, or the cohort graph filtered by week — neither needs a
  shared object.
- No merge of the branch under any answer below.

## Open questions

1. **The shared graph.** Does the 2026-08-11 weave ruling settle it — archive
   the prototype and close the question until faculty define a shared graph?
   (The limion share link and capture frames survive in the branch either
   way.)
2. **The vault export.** Is "my concepts as an Obsidian vault" wanted as its
   own small feature? It is display-layer, fits the download discipline, and
   would be a rebuild (~2 files + a spec) rather than a merge. Yes → it gets
   its own proposal-then-build; no → it archives with the rest.
3. **The branch.** Given nothing merges, delete `origin/weekly-concept-map`
   after harvesting this description — or keep it as the prototype's storage?
   (The same question will arise for `prototype/add-concept-to-passage`;
   answering the pattern once is fine.)

---

## Decisions

1. **The shared graph, as prototyped: refused; the idea, reframed.** "i think
   that proposal is quite old and out of touch with the current state of the
   app… the group connect is still an open question, although i think it is
   about bringing multiple cloths together in a knowledge graph and
   co-constructing a projection on a canvas that participants can access"
   (TJ, 2026-08-26). The reframe splits the idea along the model's grain:
   assembly of cloths is a READ (every concept and thread stays owned — the
   cohort graph's shape, widened to participants and a chosen set of cloths),
   and the shared artifact is a **Projection** — an object the model already
   has, needing one axis widened (group scope, several hands) rather than a
   new object kind. It is also a candidate answer to the 2026-08-11 weave
   ruling's precondition ("until the faculty and the authors of the app agree
   on what it means"). The reframed idea proceeds as its own proposal:
   `docs/proposals/co-constructed-projection.md` (pending TJ's go to draft
   it).
2. **The vault export: parked, not refused.** "im n[o]t sure where or how we
   should support obsidian" (TJ, 2026-08-26). No home named, so nothing is
   built; the question stays open here rather than moving to archive, and
   revives if a home is named.
3. **The branch: unanswered.** Not deleted; the question stands.
