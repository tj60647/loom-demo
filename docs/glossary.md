# Glossary — for the Loom Dev and Support Team

The reader's version of this lives in [the README](../README.md#the-words-loom-uses)
and carries no code names. This one adds the bridge: **what a thing is called in
the model, what it is called in the code, and why those differ.**

They differ because the schema was not renamed when the model was. Migrations
0021, 0023 and 0024 moved some names through the database and deliberately left
others alone, so `edges` is a Thread, `maps` is a Projection, and `sources` is a
Reading. That is not drift to be tidied up — renaming a live table under real
student work is a risk taken only when there is a reason. **The rule that keeps
it survivable: code speaks the old names, every UI string speaks the model.**

> **Authority.** For the code ↔ model mapping, the authoritative table is
> `loom-refactor-spec.md` **§F**, corrected in place as the build moves and
> mirrored into `AGENTS.md`. For what an object *is*, it is
> `loom-model-build.md` **§2**. Where this file disagrees with either, they win
> — and the disagreement is a bug in this file.

## The bridge

| Model term | In the code | Defined in | Notes for support |
| --- | --- | --- | --- |
| **Reading** | `sources` / `source` | model-build §2 *Reading* | `isOwn` = student-contributed; `storageKey` null = reference-only (a card with no PDF) |
| **Library** | `Shelf.tsx`, station key `readings` | model-build §2, §3 | Station **00**. Searches everything; a hit opens the Reading its work lives in |
| **Cloth** | `cloth` (migration 0021) | model-build §2 *Cloth* | One per `(user, reading)`. Absorbed the old `read` table |
| **Passage** | `passage` (was `byte`, renamed by 0023) | model-build §2 *Passage* | Concepts are `passage_concept`, 0..n. **`byte` in this repo now only ever means file octets** |
| **Unlabeled Passage** | `passage` with no `passage_concept` rows | model-build §2 *Passage* | A legal state, not an error. Appears on 01, never in a Projection |
| **Concept** | `concepts` | model-build §2 *Concept* | `def` = the gloss. Identity is **by object, not label string** — homonyms are warned, never forbidden |
| **Thread** | `edges` / `edge` | model-build §2 *Thread* | `edge.sentence` = Thread Description. The edge row *is* the Thread since 0024 |
| **Link** | `link` (0024), pointed at by `edge.linkId` | model-build §2 *Link* | User-level: Label + its own gloss. `edge.handle` is a legacy dual-written copy of the Label — do not read it as the source of truth |
| **Projection** | `maps` / `map` | model-build §2 *Projection* | `maps.name` = Title, `maps.essence` = One-line, `maps.read` = Description, `maps.tiers` = Concept Tiers. **"map" never appears in the UI** |
| **Concept Tier** | `maps.tiers` (`p`/`s`/`t`/`x`/`''`) | model-build §2 *Projection* | Per-Projection. The `concept.tier` mirror column was **dropped by 0021** |
| **Passage Tier** | `passage.tier` | model-build §2 *Passage* | A different thing from Concept Tier, and still live. Defined but no surface writes it yet |
| **Vocabulary** | station key `read` | model-build §2 *Concept List*, *Link List* | Station **04**. The key is legacy — `read` is Vocabulary |
| **Knowledge Graph** | station key `map`, `MapTab.tsx` | model-build §3 | Station **03**. The key is legacy — `map` is Knowledge Graph |
| **Linking** | station key `throw`, `ThrowTab.tsx` | model-build §3 | Station **02** |
| **Capture Log** | `graph_event` | model-build §2 *Capture Log* | Append-only; survives reset. Surfaces on 03, scoped to the open Reading |
| **Projection geometry** | `views` | model-build §2 | View state, never the artifact. Only student gestures persist here |

**Removed, and why you will still meet the words:** *tongues* (instructor
register menus) are gone from `src/` entirely — not flagged off. The *whole
weave* (`scopeKey ''`) and its `/weave` route were retired 2026-08-11; legacy
rows persist unrendered. The *Keep* station was dissolved the same day —
download happens at each object now, and **there is no import**. If a document
describes any of these as current, that document is stale.

## Where the words come from, and how well that is sourced

Support gets asked "why is it called that", and the honest answer differs by
term. Marked below by how firmly each is recorded, because this section is the
kind that attracts confident invention.

| Family | Source | How well sourced |
| --- | --- | --- |
| **Loom · Cloth · Thread · Quilt · Join** | John Cain's weaving metaphor, for *fabricating* a knowledge graph rather than storing one — a single image the graph's terms can hang together on | **Attested, not documented.** Attributed to Cain by TJ, 2026-09-02. The repo records the metaphor set — `loom-model-build.md` §3: "the weaving metaphor — Cloth, Thread, Quilt, Join — lives in object names only" — but names no author. If Cain's authorship matters for a citation, ask before printing it |
| **Passage · Concept · Link · Tier** | Concept mapping: Novak & Gowin, *Learning How to Learn* (a course reading), and Dubberly | **Novak & Gowin: documented.** `contracts.md:208` — "Novak & Gowin is the book the board's method comes from"; `:517` — "Novak and Gowin used cards on a table", which is the board and its tiers directly. **Dubberly: attested only** (TJ, 2026-09-02); no reference in the repo |
| **Gloss · Note · Description · Label** | The attributes rather than the elements, taken from publishing and knowledge-organisation traditions where each already means something exact | **Attested** (TJ, 2026-09-02). No specific discipline is named, and none should be invented |

Two consequences worth holding on to:

**The metaphor lives in object names only.** Navigation is plain — Library,
Reading, Linking, Knowledge Graph, Vocabulary — while the things a student makes
are cloths and threads. That split is deliberate (`loom-model-build.md` §3), so
"rename the tab to Weaving" is a change to the design, not a copy tweak.

**Quilt is named but not built.** `loom-model-build.md:13` puts it in v1 scope —
"connecting 2+ Cloths from different Readings via shared Concepts. The v1
substrate ships: cross-Reading Concept recurrence" — while the object itself is
deferred alongside Join, and [proposals/quilt.md](proposals/quilt.md) is
explicitly held for a group discussion. Under `AGENTS.md` a proposal ranks below
the model and nothing is implemented from one whose questions are unanswered.
Expect students and faculty to use the word for the course's group work in weeks
12–14 (`course-deployment-notes.md`) and not find a Quilt in the app.

## Stations

Numbers come from array position in `JourneyNav.tsx`, never hand-written, so
they renumber themselves if the order changes:

**00 Library · 01 Reading · 02 Linking · 03 Knowledge Graph · 04 Vocabulary**

## This file needs maintaining, and will rot silently

A glossary is the kind of document that goes wrong without any test failing.
Nothing here is executable; `npm run check` cannot tell you a definition has
become a lie. The README rewrite of 2026-09-02 found **eighteen** false
statements that had accumulated exactly this way — including a feature that had
been deleted from the code, and two links to a file that had moved.

**When to correct it**

- A migration renames a table or drops a column → the *In the code* column.
- A station is renamed, reordered, added or removed → the Stations line and any
  row naming a station.
- An object gains or loses a field that support would be asked about.
- A ruling in `loom-model-build.md` §2 changes what an object *is* → the
  definition here **and** the reader's version in the README, in the same
  commit. Two copies of a definition is the cost of having one for readers and
  one for the team; letting them disagree is the failure.

**How to check it rather than trust it**

Every claim in the bridge table is verifiable in seconds, and should be verified
rather than believed:

```bash
grep -n 'pgTable(' src/db/schema.ts          # what tables really exist
sed -n '30,50p' src/components/ui/JourneyNav.tsx   # station keys and labels
grep -rin tongue src/                        # should return nothing
```

If you find a row that is wrong, the fix is one line and a commit message
saying what you checked. Please do not leave it — a wrong entry in a glossary is
worse than a missing one, because it gets believed and built on.
