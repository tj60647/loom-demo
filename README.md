# Loom

**Weaving Knowledge Through Shared Practice**

Loom is a tool for emergent sense-making and collaborative synthesis. It provides a space where reading, capturing, and connecting ideas form a living knowledge graph—built entirely by you and your community, without auto-generation.

## What is Loom?

Loom was born from the intersection of ethnographic research, theory, and practice. It is designed to help individuals and cross-disciplinary teams build shared understanding not by enforcing uniformity, but by negotiating differences.

The core workflow is simple:
1. **Read & Capture:** Keep the passages worth keeping — the author's words, verbatim, with citation. Name the concept each passage evidences (a short noun phrase, often the author's own term), and gloss it in your own words in the working definition.
2. **Throw:** Pick two concepts and connect them.
3. **Name the Relation:** Define the "edge" between these ideas yourself, using your own phrasing or pulling a verb from one of the "tongues" (disciplinary thought styles).

Nothing is auto-generated. The tool only counts your own throws. The structure emerges organically from your coding: from open codes first, to axial reads across texts.

## Features

- **Bite-Sized Capture:** Keep the passages that matter as discrete units — the author's words, verbatim, with their citation — each filed under a concept you name.
- **Intentional Connections ("Throws"):** The power of Loom lies in the edges. You decide exactly how two concepts relate. 
- **Disciplinary "Tongues":** The verbs we reach for to name a relation (e.g., *constrains*, *refutes*, *betrays*) aren't neutral; each belongs to a specific way of seeing the world. When you coin a term, Loom offers registers from several fields—"Cause & system", "Stance & value"—as suggestions to tap or ignore. You pick the word, or write your own; the machine never names the relation.
- **The Woven Graph:** View your interconnected graph ("Read"), then write your own "axial read" across texts. Loom lays your threads out as material and counts what it sees; you write the reading, and copy it out as a draft.
- **The Card Table ("Map"):** Sort your concepts into tiers (primary / secondary / tertiary), then arrange them as cards on a three-band table—general above, specific below. The tool draws the links you already threw and counts what it sees; the sorting and arranging are yours. The "map kit" hands the whole thing off to paper for the real, hand-drawn concept map.
- **Your Artifact:** Export your graph as JSON (the spec §6 contract: the `graph` is the artifact, `views` are your arrangements riding along) or as markdown for Obsidian and notes. Import and reset round it out—your work is never locked in.
- **The Cloth, Over Time:** Loom keeps an append-only history of your own acts—capture, throw, coin, re-tier—and replays how your weave grew. It counts; it never grades. Reset clears the cloth, not the history.

## The Theory Behind the Tool

Loom is built on foundational ideas from design theory, sociology, and ethnographic coding (see the [concept deck](./docs/presentations/coupled_spaces_deck_v12.pdf) for a deeper dive). These three are also the seeded library — the PDFs themselves are not in the repo, since they are published and copyrighted and this repo is public (see [storage/readings/.gitkeep](./storage/readings/.gitkeep)):

- **Object Worlds (Bucciarelli):** Each discipline inhabits its own world with its own instruments and language. A mechanical engineer might name a connection "is the bottleneck for," while a humanist might say it "betrays" the text. Loom makes these differing worldviews visible and actionable.
- **Communities of Practice (Wenger):** Shared vocabularies are learned by participating in a community, not just by being told. Loom enables a class or team to grow its own shared edge-vocabulary over time by doing the work together.
- **Boundary Objects (Star):** How do people from distinct fields coordinate around one shared object without agreeing on exactly what it means? Loom serves as a cross-tongue boundary object—flexible enough to be locally useful, but robust enough to hold a common identity across groups.

---

## Developer Guide

This is a [Next.js](https://nextjs.org) project bootstrapped with `create-next-app`.

Start here:

- [CONTRIBUTING.md](./CONTRIBUTING.md) — branches, the PR gate (green CI + owner review), tests, local setup.
- [docs/contracts.md](./docs/contracts.md) — every contract surface: schema, server actions, API routes, export/import formats, invariants.
- [docs/deployments.md](./docs/deployments.md) — local / dev / production environments, CI secrets, smoke tests.
- [docs/reading-quality.md](./docs/reading-quality.md) — extraction scoring, defect diagnosis, and which repairs are safe to run.
- [docs/audit-2026-08-02.md](./docs/audit-2026-08-02.md) — the full journey audit and alpha assessment.
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
| `concept`, `passage`, `edge` | The student's graph, including `concept.tier` (placement's *meaning*). | `graph` — the artifact |
| `read` | "Your read", one row per student × course. | `graph.read` |
| `view` | Student-authored geometry per view key (`cardTable`: positions, bends). A new view adds a row, never a column on a concept or edge. Only student gestures write here — derived layout is computed for display and discarded. | `views` — projections |
| `graph_event` | Append-only history of the student's own acts. Survives reset and import; rendered only as exploratory counts/replay ("the cloth, over time"), never judgment. | development history |

### Reading-first

**The reading is the entry point.** The course's chain of transformations — text → notes → concepts → weave → map → chalk talk — runs per text, twice a week, twenty-six times, so `/` is a shelf of readings grouped by course week and each one opens its own workbench at `/reading/[sourceId]`: the text, the coding log, Throw and Read, scoped to that reading. A reading is the only scope there is: `/weave`, the whole-weave workbench, was retired on 2026-08-11 (TJ — “poorly defined and not supported in the course… it should not be in the app as an idea until the faculty and authors of the app agree on what it means to have a ‘full weave’”). The Library still searches everything — it is the entry point to the whole contents — and a hit opens the reading its work lives in.

**A concept does not belong to a reading — a passage does.** A concept emerges from a reading and may then be evidenced in several; spec §2 makes one label one concept, reused across readings and weeks, and that reuse is the island-bridging the course is for. So scope is read off the route, and which readings a concept is *evidenced in* is **derived** from its passages (`src/lib/scope.ts`), computed per render and discarded. Nothing owns a concept and nothing re-homes it: a reading is a door into one graph, never one of twenty-six graphs, and meeting the same idea in a second text joins its evidence and says so.

Threads that run out of a reading are the payoff, not the leftovers: an edge belongs to every scope containing either endpoint, so a bridge appears in both readings and in the whole weave, with its own counted band. Concepts from other readings stay reachable in Throw behind a disclosure — never removed, because threading this week's text to an earlier one is what weeks 6–13 are for.

`04 Map` is honest per reading now that placement is per-map: each map carries its own tiers (`maps.tiers`), so a reading's map sorts only against that reading's concepts. The linear passes proposal that preceded parallel sibling maps is superseded — historical argument in [the archived strategy doc](./docs/archive/reading-scope-and-map-passes.md).

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

The score is advisory. A reading below the bar is flagged "Needs review", never auto-hidden — see red line #7 in the [spec](./docs/loom-spec-v1.md).

What happens *next* — what the defect actually is, which repair it needs, and which repairs are safe to run against a reading students have worked in — is [docs/reading-quality.md](./docs/reading-quality.md).

#### Drafting a reading's metadata

Behind **Edit** on the Readings tab, *Draft from PDF* asks a model to read the reading's own opening pages and propose its title, author, source reference, and description.

The description is deliberately **one sentence, and deliberately not a summary**. It orients a student toward the text — what territory it is in, what it is doing there — without handing over what it concludes. Arriving at the argument is the student's work; a description that states the thesis has already done it for them. "Examines how X and Y coordinate without agreement", not "argues that X enables Y because Z".

It proposes; it never stores. The draft lands in the form fields, the instructor corrects it against the PDF and saves, and `metadataProvenance` records which fields were drafted rather than typed. That review step is load-bearing rather than polite: unlike the extraction judge, this produces text students read (title and author on every card, description when published), so red line #6 admits it **only** as a proposal an instructor has accepted — see exception (b) in the [spec](./docs/loom-spec-v1.md) §4/§5. Auto-filling on upload, a bulk "draft all", or anything writing straight to the row would take it back outside the line.

Like the judge it is optional: with no `OPENROUTER_API_KEY` the button says so and the metadata is typed by hand.

**Before extending the judge, read red line #6.** "No AI runs inside the tool" is absolute, with one ratified exception: scoring an instructor-uploaded PDF for scan quality. It reads the source document, never a student's work, and its output never reaches a student. Pointing a model at anything a student authored, or at anything a student sees, is outside that exception and needs its own ratification.
