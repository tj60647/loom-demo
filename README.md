# Loom

**Weaving Knowledge Through Shared Practice**

[![production heartbeat](https://github.com/tj60647/loom-demo/actions/workflows/heartbeat.yml/badge.svg)](https://github.com/tj60647/loom-demo/actions/workflows/heartbeat.yml)

Green means production can reach its database. **Red means students cannot sign
in** — and the site will still load, which is why this light exists at all. What
to do is in [build-and-test-workflow.md](docs/build-and-test-workflow.md); the
check itself is [heartbeat.yml](.github/workflows/heartbeat.yml).

Loom is a tool for emergent sense-making and collaborative synthesis. It provides a space where reading, capturing, and connecting ideas form a living knowledge graph—built entirely by you and your community, without auto-generation.

## What is Loom?

Loom was born from the intersection of ethnographic research, theory, and practice. It is designed to help individuals and cross-disciplinary teams build shared understanding not by enforcing uniformity, but by negotiating differences.

The work runs one reading at a time, through five stations — **00 Library · 01 Reading · 02 Linking · 03 Knowledge Graph · 04 Vocabulary**:

1. **Open a Reading.** The Library holds the course's Readings, grouped by week. The card *is* the door: the whole card opens that text and whatever you have already built behind it. You can also add a reading of your own — something the course doesn't include, carded by hand so its passages still have a door.
2. **Capture Passages.** Highlight in the text and capture on the rail beside the words: the author's sentence, verbatim, with its citation. Name a Concept the passage evidences if you have one — a short noun phrase, often the author's own term — and describe it in your own words. If the word hasn't arrived yet, save without one; an Unlabeled Passage is a whole capture, not half of one, and you can name it later.
3. **Throw a Thread.** Pick two Concepts and write how they hang together, as a sentence you would defend out loud. Long and awkward is fine: the sentence *is* the Thread. Afterwards, if you want, give it a short Link Label so one of your own words can recur across readings.
4. **Arrange a Projection.** Sort your Concepts into tiers and lay them out as cards on a board — general above, specific below. Each arrangement is a Projection, with its own title, one-line and description; keep several, and each can say something different about the same Cloth. The concept-map kit hands the whole thing off to paper for the map you draw by hand.
5. **Read your Vocabulary back.** Every Concept you have named and every Link Label you have given, across all your readings — because a Concept does not belong to a text; a Passage does. Meeting the same idea in a second text joins its evidence and says so.

Nothing is auto-generated. No model reads your work, ranks it, scores it, or suggests what to write; the tool holds what you made and counts it, and an empty state is a fact about where you have got to rather than a fault to fix. The structure emerges organically from your own coding: from open codes first, to axial reads across texts.

## Features

- **Passages, kept whole:** Keep the passages that matter as discrete units — the author's words, verbatim, with their citation — each carrying as many Concepts as you choose to file it under, or none. Capture happens on the rail beside the words, so you never leave the text to record what you just read.
- **Threads you name yourself:** The power of Loom lies in the Threads. You decide exactly how two Concepts relate, and you write it as a sentence; the machine never names the relation. Labelling that Thread's Link is a separate, later, optional act — a short word so one of yours can recur. Two rows of suggestions sit under the label field and neither commits anything: your own Link Labels used before, and a few everyday verbs to tap or ignore.
- **The Cloth, and Projections of it:** Your captures, concepts and threads for one reading make a Cloth. On **03 · Knowledge Graph** the Cloth is drawn as arcs — pick a pair there and throw a Thread in place — and each arrangement you build from it is a Projection with its own title, one-line and paragraph. Keep several; they can say quite different things about the same cloth.
- **Tiers and the board:** Sort your Concepts into tiers — primary, secondary, tertiary, plus *set aside* and unsorted, which are different states and stay different. Then arrange them as cards on the board, general above, specific below; dropping a card into another band re-tiers it. Tiers belong to the Projection, not the Concept, so the same idea can be primary in one arrangement and tertiary in another. The tool draws the threads you already threw and counts what it sees — "Counted, not judged." The concept-map kit hands the whole thing off to paper for the real, hand-drawn concept map.
- **Your work leaves as files:** Download happens at the object, never as one bundle — the Cloth at 01, its Threads at 02, a Projection and the Capture Log at 03, your Vocabulary at 04. Each comes out as JSON and as Markdown, carrying a provenance header. There is no import: these are outbound artifacts — a portfolio, a hand-in, your own copy — and nothing is locked in.
- **The Cloth, Over Time:** Loom keeps an append-only history of your own acts — capture, throw, coin, re-tier — and replays how your weave grew. It counts; it never grades. Starting over clears the cloth, not the history.

## The words Loom uses

Loom names a small number of things precisely, and the words carry the design.
Definitions here are short; the authority for all of them is
[docs/loom-model-build.md](./docs/loom-model-build.md) §2, which gives each one
in full along with the ruling behind it.

- **Reading** — a text in the course: title, authors, date, the PDF. *It is not
  yours.* A reading may also be one you add yourself — a paper or a book the
  course doesn't hold, carded by hand so the passages you take from it still
  have a door.
- **Library** — station 00, the shelf of Readings grouped by week. Every card is
  a door, and it opens the work you already have behind that text.
- **Cloth** — what you kept from one Reading, and what you take that to be. One
  Cloth per Reading per person. It is deliberately *not* raw evidence:
  choosing a passage is already your judgment, so a Cloth carries a title and a
  description of your own.
- **Passage** — the author's words, kept verbatim with their citation, anchored
  to the page they came from. A Passage may carry any number of Concepts, or
  none.
- **Unlabeled Passage** — a Passage you kept without naming a Concept. A whole
  capture, not half of one; it may stay that way forever.
- **Concept** — an idea you name, with a description in your own words. It
  belongs to you rather than to a text, so meeting it again in a second Reading
  joins the evidence. A Concept may be named *before* anything supports it, and
  a Concept with no evidence is a visible state, never a fault.
- **Thread** — how two Concepts hang together, written as a sentence you would
  defend out loud. The sentence is the Thread. Threads are directed and join
  exactly two Concepts.
- **Link** — an optional short label for a Thread's verb, plus a gloss of what
  you mean by it. Like a Concept it is yours and spans readings, so renaming it
  reaches every Thread that uses it — that is how a vocabulary of your own
  accumulates.
- **Projection** — one way of projecting a Cloth so it can be read: an ordering,
  or a board of cards in tier bands with the threads drawn. Each has its own
  title, one-line and description, and its own tiers. Keep several over one
  Cloth; they can say quite different things.
- **Tier** — where you rank a Concept in a Projection: primary, secondary,
  tertiary, *set aside*, or unranked. Tiers belong to the Projection, so the
  same idea can be primary in one and tertiary in another.
- **Vocabulary** — station 04: every Concept you have named and every Link you
  have given, across all your readings.
- **Capture Log** — the append-only record of your own acts, in the order you
  made them. It counts; it never grades. It survives starting over.

### Where these words come from

The vocabulary is borrowed on purpose, from three directions, and knowing which
is which explains why the words behave differently.

- **The weaving metaphor — Loom, Cloth, Thread, Quilt, Join —** is John Cain's,
  developed as a way to think about *fabricating* a knowledge graph rather than
  merely storing one, and to tie the graph's terms together into something that
  hangs on a single image. That is why it lives in object names only: the
  navigation says Library, Reading, Linking, Knowledge Graph, Vocabulary, while
  the things you make are cloths and threads. (Attributed to John Cain by TJ,
  2026-09-02; the metaphor set is recorded at
  [loom-model-build.md](./docs/loom-model-build.md) §3.)
- **Passage, Concept, Link and Tier** come from concept mapping — Novak &
  Gowin's *Learning How to Learn*, a course reading, and from Dubberly. Novak
  and Gowin sorted cards on a table, which is where the board and its tiers
  come from directly.
- **Gloss, note, description, label** are the attributes rather than the
  elements, and they are drawn from the publishing and knowledge-organisation
  traditions where each already means something exact.

**Quilt is the one that is not finished.** Connecting two or more Cloths from
different Readings through shared Concepts is named in the model and its
substrate ships — cross-Reading Concept recurrence is what makes it possible —
but the Quilt itself is a proposal, held open for a group discussion rather than
built. See [docs/proposals/quilt.md](./docs/proposals/quilt.md); under
`AGENTS.md` a proposal is intent, not authority, so do not expect it in the app.

## The Theory Behind the Tool

Loom is built on foundational ideas from design theory, sociology, and
ethnographic coding (see the [concept deck](./docs/presentations/coupled_spaces_deck_v12.pdf)
for a deeper dive):

- **Object Worlds** — Bucciarelli, L. L. (1994). *Designing Engineers.* MIT
  Press. Each discipline inhabits its own world with its own instruments and
  language. A mechanical engineer might name a connection "is the bottleneck
  for," while a humanist might say it "betrays" the text. Loom makes these
  differing worldviews visible and actionable.

- **Communities of Practice** — Wenger, E. (1998). *Communities of Practice:
  Learning, Meaning, and Identity.* Cambridge University Press. Shared
  vocabularies are learned by participating in a community, not just by being
  told. Loom enables a class or team to grow its own shared vocabulary of
  Concepts and Link Labels over time by doing the work together.

- **Boundary Objects** — Star, S. L. (2010). This is Not a Boundary Object:
  Reflections on the Origin of a Concept. *Science, Technology, & Human
  Values*, 35(5), 601–617. How do people from distinct fields coordinate
  around one shared object without agreeing on exactly what it means? Loom
  serves as a cross-disciplinary boundary object — flexible enough to be locally
  useful, but robust enough to hold a common identity across groups.

Course readings are provided to enrolled students within the application and
are not distributed here.

---

## Developer Guide

This is a [Next.js](https://nextjs.org) project bootstrapped with `create-next-app`.

Start here:

- [CONTRIBUTING.md](./CONTRIBUTING.md) — branches, the PR gate (green CI + owner review), tests, local setup.
- [docs/glossary.md](./docs/glossary.md) — the same terms as above plus their code names, because the schema still speaks the July vocabulary: `edges` is a Thread, `maps` is a Projection, `sources` is a Reading.
- [docs/contracts.md](./docs/contracts.md) — every contract surface: schema, server actions, API routes, export/import formats, invariants.
- [docs/deployments.md](./docs/deployments.md) — local / dev / production environments, CI secrets, smoke tests.
- [docs/reading-quality.md](./docs/reading-quality.md) — extraction scoring, defect diagnosis, and which repairs are safe to run.
- [docs/audit-2026-08-02.md](./docs/audit-2026-08-02.md) — the full journey audit and alpha assessment.
- [docs/incident-2026-09-01.md](./docs/incident-2026-09-01.md) — the sign-in outage: why every automated check stayed green while no student could log in, and what now watches for it.
- Tests: `npm run check`, then `npx playwright test` (see CONTRIBUTING for the Windows/3100 variant and the seeded demo accounts the suite relies on).

### Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. You can start editing the page by modifying `app/page.tsx` (or `src/app/page.tsx`). The page auto-updates as you edit the file.

### Environment

`.env.local` (not committed). Run `vercel env pull` to populate the hosted values.

Three things that will bite. `vercel env pull` writes **`.env.production.local`** unless
told otherwise, and no *script* loads that file — scripts read `.env.local`, so
a run you believe is inspecting production will quietly report on development instead,
with output similar enough to be believed. Set `LOOM_ENV_FILE=<path>` to
point them elsewhere; every script that touches library data prints the database it
actually reached before it says anything about the contents. And Vercel will **not**
export values for variables marked sensitive — it writes the literal string
`[SENSITIVE]`, which for `DATABASE_URL` means the file is not usable as-is and the
connection string has to come from the Neon console.

Third: **`next build` does load `.env.production.local`**, which is the one thing that
reads it and the reason it cannot simply be left lying there — the `[SENSITIVE]`
placeholder for `NEXTAUTH_URL` fails the prerender of `/_not-found` with
`ERR_INVALID_URL`, breaking every local production build. Keep the pulled file under a
name Next ignores; this repo uses **`.env.production.pulled`**, which `LOOM_ENV_FILE`
reaches just as well.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon Postgres connection string. |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | yes | NextAuth session signing and callback base. |
| `GITHUB_ID`, `GITHUB_SECRET` | yes | GitHub OAuth app credentials. |
| `BLOB_READ_WRITE_TOKEN` | local dev | Vercel Blob access. On Vercel this is resolved from the OIDC token + `BLOB_STORE_ID` instead. |
| `PREVIEW_LOGIN_SECRET` | Vercel Preview | The key `/api/auth/test-login` wants on a branch preview, where OAuth cannot complete. **Unset means the door needs no key at all** — on a public preview URL that is an open session, so set it wherever previews are built. |
| `OPENROUTER_API_KEY` | no | Enables the reading-quality judge. Absent, readings are still scored deterministically. |
| `LOOM_JUDGE_MODEL` | no | Judge model override. Defaults to `anthropic/claude-opus-5` — see the note below before changing it. |

### Database migrations

Schema lives in `src/db/schema.ts`; migrations are generated, committed, and applied — never pushed straight from the schema.

```bash
npx drizzle-kit generate --name=what_changed   # write the SQL + snapshot
npx drizzle-kit migrate                        # apply anything pending
```

Check what the database already has before applying, especially in a shared environment — `drizzle.__drizzle_migrations` is the record of truth, and the journal alone can disagree with it.

#### Graph storage (spec §6)

The knowledge graph is kept strictly apart from its projections:

| Table | Holds | §6 role |
| --- | --- | --- |
| `concept`, `passage`, `edge` | The student's graph. Placement's *meaning* is **not** here: Concept Tiers are per-Projection (`maps.tiers`). The `passage.tier` column is a different thing — the Passage Tier, riding the passage. | `graph` — the artifact |
| `cloth` | One Cloth per student × scope: its title and description. | `graph.cloths[]` |
| `map` | A Projection — its name, one-line (`essence`), paragraph (`read`), and its own `tiers`. Several may sit over one Cloth. | `graph.maps[]` |
| `link` | A Link: the User-level Label and gloss a Thread points at (`edge.linkId`). Travels in the Vocabulary download, not in `graph`. | — |
| `view` | Student-authored geometry per view key (`cardTable`: positions, bends). A new view adds a row, never a column on a concept or edge. Only student gestures write here — derived layout is computed for display and discarded. | `views` — projections |
| `graph_event` | Append-only history of the student's own acts. Survives reset and import; rendered only as exploratory counts/replay ("the cloth, over time"), never judgment. | development history |

### Reading-first

**The reading is the entry point.** The course's chain of transformations — text → notes → concepts → weave → map → chalk talk — runs per text, twice a week, twenty-six times, so `/` is a shelf of readings grouped by course week and each one opens its own workbench at `/reading/[sourceId]`: the text, the coding log, Linking, Knowledge Graph and Vocabulary, scoped to that reading. A reading is the only scope there is: `/weave`, the whole-weave workbench, was retired on 2026-08-11 (TJ — “poorly defined and not supported in the course… it should not be in the app as an idea until the faculty and authors of the app agree on what it means to have a ‘full weave’”). The Library still searches everything — it is the entry point to the whole contents — and a hit opens the reading its work lives in.

**A concept does not belong to a reading — a passage does.** A concept emerges from a reading and may then be evidenced in several; identity is by object, not label string ([model build](./docs/loom-model-build.md) §2), so a concept is reused across readings and weeks, and that reuse is the island-bridging the course is for. So scope is read off the route, and which readings a concept is *evidenced in* is **derived** from its passages (`src/lib/scope.ts`), computed per render and discarded. Nothing owns a concept and nothing re-homes it: a reading is a door into one graph, never one of twenty-six graphs, and meeting the same idea in a second text joins its evidence and says so.

Threads that run out of a reading are the payoff, not the leftovers: an edge belongs to every scope containing either endpoint, so a bridge belongs to both readings and is counted in the workbench footer as "N threads out". Concepts from other readings stay reachable on Linking behind a disclosure — never removed, because threading this week's text to an earlier one is what weeks 6–13 are for.

**03 Knowledge Graph** is honest per reading now that placement is per-map: each map carries its own tiers (`maps.tiers`), so a reading's map sorts only against that reading's concepts. The linear passes proposal that preceded parallel sibling maps is superseded — historical argument in [the archived strategy doc](./docs/archive/reading-scope-and-map-passes.md).

### The reading library

PDFs are uploaded once into a shared, course-agnostic library, then included in any number of courses. Per-course facts (week, visibility, core vs. supplemental) live on the `course_source` join, not on the reading — so the same PDF is never uploaded twice, and hiding it in one course leaves the others alone.

A reading may also be **reference-only**: a card with a title and author and no PDF, added by a student for something they are coding that the library does not hold (`source.isOwn`, `storageKey` null). It sits on their shelf and nobody else's. This exists because reading-first needs every passage to have a door — otherwise a self-found paper's passages fall out of every lens.

- **Readings tab** (`/admin/library`) — the whole library. Upload one or many PDFs at a time, edit shared metadata, and add a reading to a course. Badges show which courses currently include it.
- **Courses tab** (`/admin/courses`) — each course's full reading list, with the per-course placement, visibility, and removal controls.

Uploads are processed independently: one corrupt PDF in a batch fails on its own and is reported by filename, and the rest still land.

#### How an upload travels

PDFs go **browser → Blob storage directly**, never through a Server Action. A serverless request body is hard-capped at 4.5MB on Vercel — a limit no config raises — and course readings are scanned chapters that routinely exceed it, so pushing bytes through an action rejected most of the library before any Loom code ran.

The browser asks `/api/readings/upload` for a short-lived token, uploads the file itself, then calls `registerUploadedReading` with only the resulting pathname. That route is the security surface of the upload path, so it requires an admin session, scopes each token to one pathname under `readings/`, PDFs only, and `MAX_READING_BYTES` — caps applied server-side, never taken from the client's request. Blobs are written `private`, so readings remain unreachable by public URL and are still served only through the authenticated `/api/readings/[sourceId]` route.

The ceiling is **20MB per reading** (`src/lib/readingUpload.ts`), enforced in three places that don't trust each other: the browser (to fail fast with a useful message), the token route (so a crafted client can't exceed it), and the registration action (which re-checks the stored blob's real size and deletes it if it's over). Files upload one at a time, so each succeeds, fails and retries on its own, with per-file progress.

Cover images are rendered from the first page that isn't blank, looking up to four pages in — scanned books routinely open on an empty recto, and treating that as a failure left real readings with no thumbnail. If every one of those pages is blank the reading still uploads; it just records `coverRendered: false`.

Covers render to a fixed **width** (320px), not a fixed scale. Page sizes across one course's readings run from 396×612pt digests to 612×792pt Letter, so a fixed scale produced thumbnails between 144px and 234px wide — all of them narrower than the 140px frame at 2× pixel density, so all of them upscaled and soft. Their aspect ratios still differ (0.65–0.81), so the frame fits the whole page inside itself rather than cropping to fill: a document's cover page loses its margins, and sometimes its title, to a crop.

Because the renderer's output has changed, **rescore re-processes the whole reading** — page text, cover and score together, from the PDF as it stands. Replaying the rubric over stored text could never show the effect of a repaired file, and the old rescore carried the previous cover verdict forward, so a rebuilt cover never moved the score. It refuses on a reading that has highlights: replacing page text moves the substrate their offsets were measured against. See [docs/reading-quality.md](./docs/reading-quality.md).

#### Extraction scoring

Many course PDFs are scans with no usable text layer, which looks identical to a clean PDF on a library card and fails only when a student tries to quote from it. Every reading is therefore scored 1–5 on four dimensions (`src/lib/readingScore.ts`):

| Dimension | Measures | Source |
| --- | --- | --- |
| `coverage` | Share of pages with extractable text. | deterministic |
| `legibility` | Whether the characters read as language, and whether the words are still separated. | deterministic, capped; judge may lower it |
| `anchorability` | Enough text per page for highlight offsets to hold. | deterministic |
| `structure` | Whether extraction preserved reading order. | judge only |

The deterministic pass runs at upload from the pages already in memory — no extra queries, no network. The judge runs afterwards via `after()`, so a twenty-file upload doesn't wait on twenty round trips.

**How `legibility` is checked.** Counting junk bytes (U+FFFD, control codes, private-use glyphs) only catches a font map that resolved to *no* character. The more common break resolves to the *wrong* character — ordinary ASCII, zero junk bytes, and unreadable. So the text is also tested for whether it reads as language, on two signals: cosine similarity of its a–z profile against English, and the density of common English words matched as substrings. That budget is now spread evenly across the document; it used to be taken from the front, which on a 235-page book meant the first ten pages and nothing else.

The two are weighted differently because they fail differently. A broken letter distribution is strong evidence of mis-mapped characters in any Latin-script language, so it caps hard. Missing English function words alone is weak evidence — French prose, a maths paper, and a bibliography all look like that — so it only caps to "borderline, look at it". A largely non-Latin document caps at 3 with a note saying the check couldn't apply, rather than passing silently. Real readings in this library score ~0.99 similarity and ~50 words/1k, well clear of the 0.85 / 8 thresholds.

Two more things cap `legibility`, and neither is visible to a byte count. A median under 200 characters per page caps at 3 — a page carrying a running header's worth of text extracts cleanly and is useless. And **run-together words** cap it hard: text can be real English in real proportions with the spaces gone, at which point a quoted sentence reads `designismore thanastyle`. That threshold is calibrated against this library — sixteen readings sit at or below 0.4%, the damaged ones run 3% to 30%, and nothing lands in between. The judge cannot overrule it: it sees a few sampled pages, this is a whole-document count, so the same ceiling is re-applied over the judge's answer.

Three invariants worth preserving if you touch this:

- **An unscored dimension abstains.** No key, a judge error, unparseable output, or too little text all leave the dimension `null` — never a substituted default, which would make "we didn't check" indistinguishable from "we checked and it failed." `legibility` used to be granted a 5 when the language check couldn't run, which is how 693 characters of OCR noise off a diagram scored 5/5/5 and passed.
- **The dimensions are not compensatory.** `pass` requires *every* scored dimension to clear 3, not the mean, **and** requires `coverage` and `legibility` to have values at all — so `pass` is three-valued, and the card renders the third as "Unverified" rather than as a quiet pass. A PDF whose fonts carry no ToUnicode map scores 5 on coverage and anchorability while being pure mojibake; averaging would call it usable.
- **A clean byte count is not legibility.** Any future tightening should be tested against text that is *valid characters in the wrong order or the wrong mapping*, not just against mojibake — that's the case a byte-level check cannot see.

The score is advisory. A reading below the bar is flagged "Needs review", never auto-hidden — see red line #7 in the [model build](./docs/loom-model-build.md) §6.

What happens *next* — what the defect actually is, which repair it needs, and which repairs are safe to run against a reading students have worked in — is [docs/reading-quality.md](./docs/reading-quality.md).

#### Drafting a reading's metadata

Behind **Edit** on the Readings tab, *Draft from PDF* asks a model to read the reading's own opening pages and propose its title, author, source reference, and description.

The description is deliberately **one sentence, and deliberately not a summary**. It orients a student toward the text — what territory it is in, what it is doing there — without handing over what it concludes. Arriving at the argument is the student's work; a description that states the thesis has already done it for them. "Examines how X and Y coordinate without agreement", not "argues that X enables Y because Z".

It proposes; it never stores. The draft lands in the form fields, the instructor corrects it against the PDF and saves, and `metadataProvenance` records which fields were drafted rather than typed. That review step is load-bearing rather than polite: unlike the extraction judge, this produces text students read (title and author on every card, description when published), so red line #6 admits it **only** as a proposal an instructor has accepted — see exception (b) in the [model build](./docs/loom-model-build.md) §6. Auto-filling on upload, a bulk "draft all", or anything writing straight to the row would take it back outside the line.

Like the judge it is optional: with no `OPENROUTER_API_KEY` the button says so and the metadata is typed by hand.

**Before extending the judge, read red line #6.** "No AI runs inside the tool" is absolute, with one ratified exception: scoring an instructor-uploaded PDF for scan quality. It reads the source document, never a student's work, and its output never reaches a student. Pointing a model at anything a student authored, or at anything a student sees, is outside that exception and needs its own ratification.
