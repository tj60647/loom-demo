# Loom

**Weaving Knowledge Through Shared Practice**

[![production heartbeat](https://github.com/tj60647/loom-demo/actions/workflows/heartbeat.yml/badge.svg)](https://github.com/tj60647/loom-demo/actions/workflows/heartbeat.yml)

Green means production can reach its database. **Red means students cannot sign
in** — and the site will still load, which is why this light exists at all. What
to do is in [build-and-test-workflow.md](docs/build-and-test-workflow.md); the
check itself is [heartbeat.yml](.github/workflows/heartbeat.yml).

Every 15 minutes the check asks `/api/health` on `loom.aroughidea.com`, the
hostname students actually use. The route answers `200 {"ok":true}` when a
`select 1` reaches the database and `503 {"ok":false}` when it does not, and
says nothing more. Why it exists: [the sign-in outage of
1–2 September 2026](docs/incident-2026-09-01.md).

Loom is a tool for emergent sense-making and collaborative synthesis. It provides a space where reading, capturing, and connecting ideas form a living knowledge graph—built entirely by you and your community, without auto-generation.

## What is Loom?

Loom was born from the intersection of ethnographic research, theory, and practice. It is designed to help individuals and cross-disciplinary teams build shared understanding not by enforcing uniformity, but by negotiating differences.

The core workflow is simple:
1. **Read & Capture:** Keep the passages worth keeping — the author's words, verbatim, with citation. Name the concept each passage evidences (a short noun phrase, often the author's own term), and gloss it in your own words in the working definition. A passage may also wait for its name: saving never requires a concept.
2. **Throw a Thread:** Pick two concepts from the reading and connect them.
3. **Name the Relation:** Say how the two hang together in a sentence of your own — that sentence *is* the thread — and, if you like, give it a short label, a **Link**, in your own words. Your Links come back to you as chips to reuse; the machine never names the relation.

Nothing is auto-generated. The tool only counts your own throws. The structure emerges organically from your coding: from open codes first, to axial reads across texts.

The work happens reading by reading, at five stations: **00 Library · 01 Reading · 02 Linking · 03 Knowledge Graph · 04 Vocabulary**. Loom is the middle step, not the deliverable: it gets you to a concept map you draw by hand, and to the talk you build from that.

This version is the individual core: each student weaves their own cloth from each reading. Cloths made together, and cloths joined or quilted across readings, are defined and deferred ([model](./docs/loom-model-build.md) §1).

## Features

- **Capture at the Text (01 Reading):** Highlight a passage and capture it on the rail beside the words — the author's words, verbatim, with their citation — filed under a concept you name, under several, or under none yet. Read a page at a time or on the canvas, every spread on one zoomable plane. Title your cloth here: your own reading of the text as a whole.
- **Intentional Connections (02 Linking):** The power of Loom lies in the threads. You decide exactly how two concepts relate, in a sentence that should read aloud; a thread with a sentence and no label yet is the normal place to start.
- **Your Own Verbs ("Links"):** The verbs we reach for to name a relation (e.g., *constrains*, *refutes*, *betrays*) aren't neutral; each belongs to a specific way of seeing the world. A Link is yours: a short label and, when you want one, a gloss of what you mean by it. Coin one before any thread uses it, rename it and every thread that uses it follows. Loom offers your own Links back as chips and never one of its own. (The instructor "tongue" registers that once offered verbs from several fields are not in this version, and are gone from the code.)
- **The Knowledge Graph (03):** The cloth draws this reading's concepts and threads; pick a pair on it (click, then shift-click) to throw a thread in place. Then project it: each **projection** sorts your concepts into tiers (primary / secondary / tertiary, or set aside) and arranges them as cards on a **board** — general above, specific below — with a title, a one-line take and a paragraph of your own. Keep several; each can say something different about the same cloth. The tool draws the threads you already threw and counts what it sees; the sorting and arranging are yours. The **concept-map kit** hands the whole thing off for the real, hand-drawn concept map.
- **Vocabulary (04):** Every concept you have named and every Link you have coined, across all your readings, with how many readings evidence each concept — counted, never ranked.
- **Search:** One box in the journey bar. At the Library it searches your whole loom — readings and every page of their text, your cloths, projections, concepts, Links and passages; inside a reading it searches that reading's work. A hit opens the reading on the page it quoted. Plain full-text search, no model in the loop.
- **Download at the Object:** Your work leaves as files where you made it — the cloth at 01, its threads at 02, a projection, its concept-map kit and the Capture Log at 03, your vocabulary at 04 — each one whole, as JSON and as Markdown, headed with whose it is, from which course, and when. The cloth drawing and the board also download as SVG. There is no import: the files are yours to keep, not a way back in.
- **The Cloth, Over Time:** Loom keeps an append-only Capture Log of your own acts — capture, throw, coin, re-tier — shown on 03 for the open reading, and replays how your weave grew. It counts; it never grades. Starting over clears the work, not the history.
- **The Practice Loom:** The guide in the header opens the real workbench on a real reading with a worked cloth (`/sandbox`), walked in eight beats — arrive · capture · name · thread · project · sort · board · kit — each ticked by your own act. Nothing there is saved; a reload restores the example.

## For Faculty and Admins

Access is by invitation: invited → link → authorized. Faculty and admins hold the five stations over their own work too — capabilities add up, they do not replace each other — plus a staff group in the journey bar:

- **Roster** (`/admin`) — sections, students and invitations, and **Open Loom**: one student's whole loom, read-only, drawn with the same cards the student sees.
- **Cohort Graph** (`/admin/aggregate`) and **Heatmaps** (`/admin/heatmaps`) — read-only comparisons across a section or the whole cohort, and on Heatmaps one student. Counted, never judged; students never see them.
- **Readings** (`/admin/library`) and **Courses** (`/admin/courses`) — admin only; see [The reading library](#the-reading-library) below.
- **Workflows** (`/workflows`) — the student, faculty and admin flows, drawn from `src/lib/workflows.ts` — and **Access** (`/access`), the capability matrix.

Feedback stays human, and outside the tool, in this version.

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
  told. In Loom a class grows its own Link labels over a term, by doing the
  work together.

- **Boundary Objects** — Star, S. L. (2010). This is Not a Boundary Object:
  Reflections on the Origin of a Concept. *Science, Technology, & Human
  Values*, 35(5), 601–617. How do people from distinct fields coordinate
  around one shared object without agreeing on exactly what it means? A cloth
  is meant to be exactly that — flexible enough to be locally useful, but
  robust enough to hold a common identity across groups.

- **Open and Axial Coding** — grounded theory (Glaser & Strauss, 1967).
  Surface candidate codes from primary material (open coding), then relate
  the codes and name the relations (axial coding) — work long done by hand,
  with cards, margins and walls of paper. Loom carries that technique from
  field ethnography into scholarly reading; its lineage is recorded in
  [course-deployment-notes.md](./docs/course-deployment-notes.md) §1.

- **Concept Maps** — Novak & Gowin (1984). *Learning How to Learn.* Cambridge
  University Press; and Novak & Cañas (2008). *The Theory Underlying Concept
  Maps and How to Construct and Use Them.* IHMC. Rank concepts from general
  to specific, arrange movable cards — general above, specific below — and
  link them with labelled lines so each connection reads as a proposition.
  The board digitises that sorting; the map you draw afterwards is where it
  lands.

Course readings are provided to enrolled students within the application and
are not distributed here.

---

## Developer Guide

A [Next.js](https://nextjs.org) 16 app on React 19: Postgres at Neon through Drizzle, reading PDFs and their images in Vercel Blob, sign-in through NextAuth, deployed on Vercel. Production is `loom.aroughidea.com`. This Next.js has breaking changes from the one most guides describe — read [AGENTS.md](./AGENTS.md) before writing code.

Start here:

- [docs/loom-model-build.md](./docs/loom-model-build.md) — **the authority** on what things are: the objects, the five stations, the red lines. Where docs disagree, it wins.
- [AGENTS.md](./AGENTS.md) — how the docs rank (`docs/archive/` is superseded, `docs/proposals/` is intent), the code-to-UI vocabulary map, and how commits are written here: one decision each, removals declared.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — branches, the PR gate (green CI + owner review), tests, local setup.
- [docs/contracts.md](./docs/contracts.md) — every contract surface: schema, server actions, API routes, download formats, invariants.
- [docs/data-environments.md](./docs/data-environments.md) — where data lives in every environment, and who may destroy it.
- [docs/deployments.md](./docs/deployments.md) — standing an environment up, OAuth apps, the sign-in smoke test.
- [docs/build-and-test-workflow.md](./docs/build-and-test-workflow.md) — how work moves from a branch to production, who holds CI's keys, and what to do when the heartbeat goes red.
- [docs/reading-quality.md](./docs/reading-quality.md) — extraction scoring, defect diagnosis, and which repairs are safe to run.
- [docs/incident-2026-09-01.md](./docs/incident-2026-09-01.md) — the sign-in outage record.
- [docs/audit-2026-08-02.md](./docs/audit-2026-08-02.md) — the full journey audit and alpha assessment.
- Tests: `npm run check` (eslint, tsc, and 24 `scripts/check-*.ts` assertions), then `npx playwright test` (see CONTRIBUTING for the Windows/3100 variant and the seeded demo accounts the suite relies on).

### Getting Started

Node 22.7 or later. Copy `.env.example` to `.env.local` and fill it in — and point `DATABASE_URL` at the Neon `dev` branch, never `main`: `npm run seed:demo` wipes the demo course on whatever database it names.

```bash
npm ci
npx drizzle-kit migrate      # apply pending migrations
npm run seed:sources         # the readings + page text; needs the PDFs (see below)
npm run seed:demo            # test-user-a/b@loom.local demo accounts
npm run dev                  # http://localhost:3000
```

`seed:sources` reads three PDFs from `storage/readings/` that are **not in the repo** — they are published, copyrighted course readings. Supply your own copies, or skip it and work against the dev database.

Real GitHub OAuth never runs locally. Sign in through the test door instead: `/api/auth/test-login` as the admin, `?as=testa` as the demo learner; production refuses it whatever the request carries. If port 3000 sits in a Windows excluded range, run `npm run dev -- -p 3100` and use `playwright.3100.config.ts`.

Loom is a desktop tool: there are no phone layouts, and none should be added. Check a layout at 1280 · 1536 · 1728 · 1920 CSS px.

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
| `PREVIEW_LOGIN_SECRET` | Vercel Preview | The key `/api/auth/test-login` wants on a branch preview, where OAuth cannot complete. **Unset means the door needs no key at all** — on a public preview URL that is an open session. It is unset today, deliberately: a preview database holds the course readings and fixture accounts, nobody's work ([data-environments.md](./docs/data-environments.md)). Set it to lock previews again. Production and the tester site (the `dev` alias) refuse the door whatever it holds. |
| `RESEND_API_KEY`, `EMAIL_FROM` | no | The guest door. Set both and the sign-in page grows a folded-away "no GitHub account?" form that mails a sign-in link; the roster still decides, so an address no course invited never receives one. `EMAIL_FROM` must be at a domain verified in Resend. Set neither and GitHub is the only provider. |
| `OPENROUTER_API_KEY` | no | Enables the reading-quality judge, *Draft from PDF*, and the model readers in page repair. Absent, readings are still scored deterministically and metadata is typed by hand. |
| `LOOM_JUDGE_MODEL` | no | Judge model override. Defaults to `anthropic/claude-opus-5`; ruled 2026-07-29 not to be downgraded to Haiku, for the reason given in `src/lib/openrouter.ts`. |
| `LOOM_ENV_FILE` | no | The env file scripts read instead of `.env.local` (above). |
| `PROD_DATABASE_URL` | CI, by hand | Production's connection string, for the two scripts that touch production's migration table: `npm run check:prodmigrations`, which CI runs on the way into `master` with a read-only role, and `npm run db:migrate:prod`. Falls back to `.env.production.pulled`. |

### Database migrations

Schema lives in `src/db/schema.ts`; migrations are generated, committed, and applied — never pushed straight from the schema.

```bash
npx drizzle-kit generate --name=what_changed   # write the SQL + snapshot
npx drizzle-kit migrate                        # apply anything pending
```

Check what the database already has before applying, especially in a shared environment — `drizzle.__drizzle_migrations` is the record of truth, and the journal alone can disagree with it.

Nothing migrates production on its own: CI migrates the CI database, each pull request's preview gets its own migrated branch, and Vercel runs no migration on deploy. Production is migrated deliberately, by hand, when a change goes to `master`:

```bash
npm run db:migrate:prod             # prints the host and what WOULD run; touches nothing
npm run db:migrate:prod -- --apply  # runs it
```

On a pull request into `master`, CI runs `npm run check:prodmigrations`, which fails while production's database is behind the code about to ship to it — written after migration 0028 sat unapplied on production for two days and every `/admin` page threw.

#### Graph storage

The knowledge graph is kept strictly apart from the ways it is arranged:

| Table | Holds | Role |
| --- | --- | --- |
| `concept`, `passage` (+ `passage_concept`), `edge`, `link` | The student's graph. A concept is one User-level object that passages across readings point at; `concept.mintedInSourceId` is the reading it was named in, consulted only while it has no passages (migration 0030). An `edge` is a Thread, and its label is a `link` (`edge.linkId`) — the student's own Label and gloss (migration 0024). | the graph — the artifact |
| `cloth` | One per student × course × reading (`scopeKey`): the cloth's title and description. Absorbed the old `read` table in migration 0021. | the cloth's own words |
| `map` | Projections, several per reading, each with its name, one-line (`essence`), paragraph (`read`) and its own tiers (`tiers`). `concept.tier` was dropped in 0021. | a projection's meaning |
| `view` | Student-authored geometry per view key — a projection's board under `map:<id>` (positions, bends). A new view adds a row, never a column on a concept or edge. Only student gestures write here — derived layout is computed for display and discarded. | a projection's arrangement |
| `graph_event` | Append-only history of the student's own acts. Survives reset; rendered only as exploratory counts/replay ("the cloth, over time"), never judgment. Import was removed on 2026-08-11, and its event kinds live on only as historical rows. | development history |

Code speaks the July names and the UI speaks the model's: a `map` is a Projection, an `edge` a Thread, a `source` a Reading (the full map is in [AGENTS.md](./AGENTS.md)). `bytes` are gone — they are `passages` everywhere, the database included, since migration 0023.

### Reading-first

**The reading is the entry point.** The course's chain of transformations — text → notes → concepts → weave → map → chalk talk — runs per text, twice a week, twenty-six times, so `/` is the Library — a shelf of readings grouped by course week — and each card opens its own workbench at `/reading/[sourceId]`: 01 Reading, 02 Linking and 03 Knowledge Graph, scoped to that reading, with 04 Vocabulary across them all. A reading is the only scope there is: `/weave`, the whole-weave workbench, was retired on 2026-08-11 (TJ — “poorly defined and not supported in the course… it should not be in the app as an idea until the faculty and authors of the app agree on what it means to have a ‘full weave’”). Search from the Library still covers everything — it is the entry point to the whole contents — and a hit opens the reading its work lives in.

**A concept does not belong to a reading — a passage does.** A concept emerges from a reading and may then be evidenced in several; the [model](./docs/loom-model-build.md) (§2 Concept) makes a concept one User-level object, reused across readings and weeks — identity by object, not by label — and that reuse is the island-bridging the course is for. So scope is read off the route, and which readings a concept is *evidenced in* is **derived** from its passages (`src/lib/scope.ts`), computed per render and discarded. Nothing owns a concept and nothing re-homes it: a reading is a door into one graph, never one of twenty-six graphs, and meeting the same idea in a second text joins its evidence and says so.

One stamp is stored, for the case with no evidence to derive from. A concept named ahead of its evidence stands in the reading it was named in (`concept.mintedInSourceId`, migration 0030) until a passage evidences it somewhere; from then on membership is the evidence trail, as for any other concept. Before the stamp, an un-evidenced concept appeared in every reading's warp — the concepts a reading's workbench works with — which is how one reading's graph leaked into the next. The stamp is not "the concept's reading" — there isn't one.

Linking works on the open reading's concepts only (TJ, 2026-08-08). A concept met in another reading joins this one the honest way: you find a passage here that embodies it and file it under that same concept, which capture offers by name. Threads that run out of a reading still exist, and the workbench footer counts them as "threads out", but nothing lists them in Linking (TJ, 2026-08-09), and the cloth on 03 draws only threads with both ends in the reading.

03 Knowledge Graph is honest per reading because placement is per projection: each projection carries its own tiers (`map.tiers`), so a reading's projection sorts only against that reading's concepts, and a fresh projection opens unsorted — the tool never seeds tiers from another one. The linear passes proposal that preceded parallel sibling projections is superseded — historical argument in [the archived strategy doc](./docs/archive/reading-scope-and-map-passes.md).

### The reading library

PDFs are uploaded once into a shared, course-agnostic library, then included in any number of courses. Per-course facts (week, visibility, core vs. supplemental) live on the `course_source` join, not on the reading — so the same PDF is never uploaded twice, and hiding it in one course leaves the others alone.

A student may also add a reading of their own, for something they are coding that the library does not hold (`source.isOwn`). It sits on their shelf and nobody else's, and is never added to a course. PDF first: uploaded the same way as a course reading, extracted and scored (heuristics only — no judge pass on a private upload), after which the student can draft its details from the PDF and correct them. Without a PDF — a book, a lecture — it is a **reference-only** card with a title and author (`storageKey` null). This exists because reading-first needs every passage to have a door — otherwise a self-found paper's passages fall out of every lens.

- **Readings tab** (`/admin/library`) — the whole library. Upload one or many PDFs at a time, edit shared metadata, and add a reading to a course. Badges show which courses currently include it.
- **Courses tab** (`/admin/courses`) — each course's full reading list, with the per-course placement, visibility (Reveal / Hide), and removal controls.

Uploads are processed independently: one corrupt PDF in a batch fails on its own and is reported by filename, and the rest still land.

#### How an upload travels

PDFs go **browser → Blob storage directly**, never through a Server Action. A serverless request body is hard-capped at 4.5MB on Vercel — a limit no config raises — and course readings are scanned chapters that routinely exceed it, so pushing bytes through an action rejected most of the library before any Loom code ran.

The browser asks `/api/readings/upload` for a short-lived token, uploads the file itself, then calls `registerUploadedReading` (or, for a student's own reading, `registerOwnUploadedReading`) with only the resulting pathname. That route is the security surface of the upload path, so it requires a signed-in session (sign-in is invitation-gated, so that means enrolled or admin), scopes each token to one pathname under `readings/`, PDFs only, and `MAX_READING_BYTES` — caps applied server-side, never taken from the client's request. What an upload may be recorded *as* — library reading or one student's own — is decided at registration, not by the token. Blobs are written `private`, so readings remain unreachable by public URL and are still served only through the authenticated `/api/readings/[sourceId]` route.

The ceiling is **20MB per reading** (`src/lib/readingUpload.ts`), enforced in three places that don't trust each other: the browser (to fail fast with a useful message), the token route (so a crafted client can't exceed it), and the registration action (which re-checks the stored blob's real size and deletes it if it's over). Files upload one at a time, so each succeeds, fails and retries on its own, with per-file progress.

Cover images are rendered from the first page that isn't blank, looking up to four pages in — scanned books routinely open on an empty recto, and treating that as a failure left real readings with no thumbnail. If every one of those pages is blank the reading still uploads, recording `coverRendered: false` — and that holds its `pass` down (`gatePassOnRender`): the four dimensions below all measure extracted text, and a reading whose pages do not render is not usable whatever its text scores.

Covers render to a fixed **width** (320px), not a fixed scale. Page sizes across one course's readings run from 396×612pt digests to 612×792pt Letter, so a fixed scale produced thumbnails between 144px and 234px wide — all of them narrower than the 140px frame at 2× pixel density, so all of them upscaled and soft. Their aspect ratios still differ (0.65–0.81), so the frame fits the whole page inside itself rather than cropping to fill: a document's cover page loses its margins, and sometimes its title, to a crop.

Every page is also stored as an image, at 320px and 1280px wide, which the viewer paints in page mode and on the canvas, plus a whole-document sheet of the small ones. They render after the upload has answered — a long scan takes a minute or two — and until they exist the viewer renders from the PDF itself: slower, never wrong. Three rules hold the stored images honest, each from one day (2026-09-06) when they were not:

- **The server renders with fonts we ship.** A PDF that embeds no font asks the host for one by name; a laptop answers, a Vercel function with no font files does not, and pdf.js then draws nothing — no error, correct page size, a white page. That put 19 blank page images into storage for one reading. Both renderers, covers and pages, now take pdf.js's own `standard_fonts` and never the host's (`src/lib/pdfjs.ts`).
- **A page that has text and drew none of it is a failed render**, not a stored image (`src/lib/canvasInk.ts`). A page that is blank because the paper is — the empty versos of a scanned book — is still stored.
- **A re-render must reach the browser.** Re-rendering replaces images under the same storage key, so the cache validator also carries `PAGE_RENDER_VERSION` (`src/lib/pageAssets.ts`). Bump it whenever a change alters the pixels, or browsers that cached the old images go on being told `304 Not Modified`.

`check:pdffonts`, `check:canvasink` and `check:pageetag` guard the three.

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

The score decides one thing: how a reading arrives in a course. A reading that passed arrives visible; one that failed is flagged "Needs review", one with no verdict "Unverified", and either arrives hidden until an admin presses **Reveal** on the Courses tab — the explicit approval that attaching used to skip (2026-08-13). It never hides a reading students can already see; rescoring leaves visibility alone.

What happens *next* — what the defect actually is, which repair it needs, and which repairs are safe to run against a reading students have worked in — is [docs/reading-quality.md](./docs/reading-quality.md).

#### Drafting a reading's metadata

Behind **Edit** on the Readings tab, *Draft from PDF* asks a model to read the reading's own opening pages and propose its title, author, source reference, and description.

The description is deliberately **one sentence, and deliberately not a summary**. It orients a student toward the text — what territory it is in, what it is doing there — without handing over what it concludes. Arriving at the argument is the student's work; a description that states the thesis has already done it for them. "Examines how X and Y coordinate without agreement", not "argues that X enables Y because Z".

It proposes; it never stores. The draft lands in the form fields, the instructor corrects it against the PDF and saves, and `metadataProvenance` records which fields were drafted rather than typed. That review step is load-bearing rather than polite: unlike the extraction judge, this produces text students read (title and author on every card, description when published), so red line #6 admits it **only** as a proposal an instructor has accepted — see exception (b) in the [spec](./docs/loom-spec-v1.md) §4/§5. Auto-filling on upload, a bulk "draft all", or anything writing straight to the row would take it back outside the line.

Like the judge it is optional: with no `OPENROUTER_API_KEY` the button says so and the metadata is typed by hand.

**Before extending the judge, read red line #6.** "No AI runs inside the tool" is absolute, with one ratified exception: scoring an instructor-uploaded PDF for scan quality. It reads the source document, never a student's work, and its output never reaches a student. Pointing a model at anything a student authored, or at anything a student sees, is outside that exception and needs its own ratification.
