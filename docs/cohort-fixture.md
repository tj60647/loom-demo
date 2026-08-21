# The cohort fixture — five students, one faculty, thirty readings

What a populated Loom looks like, as data. This document is the contract the
generated fixture must satisfy, and the thing to argue with **before** the
authoring pass runs — regenerating is expensive, reviewing a spec is not.

Ratified 2026-08-16: an agent authoring this content is fixture work, not
student work. No learner's judgment is involved and none of it reaches a
student, so red lines #1, #2 and #7 are not engaged. The fixture records its
own provenance so nobody later mistakes generated concepts for real thinking.

## Why it exists

Loom's cohort surfaces — the Overlays, the cohort map, the Vocabulary view —
all render *comparisons*. The current demo gives them one worked account and
three thin ones, so those screens can be shown to render but not judged. A
gradient makes them judgeable, and answers a product question the fixtures
cannot currently ask: **what does Loom show about a student who is struggling?**

## What it does not touch

The four existing demo accounts are a fixture contract the suite asserts
against — `test-user-a` carries 3 projections built from 2 readings, and specs
depend on exactly that. **The cohort is additive.** Nothing here edits, extends
or repurposes `test-user-a`, `-b`, `-c`, `-d` or `test-faculty`.

## The gradient

**Every persona covers every required reading.** Failing is not a student who
did less of the work — it is a student who did the work and read it badly. That
distinction is the whole fixture: a cohort where the weak student is simply
absent teaches a faculty member nothing except who showed up, and Loom's claim
is that it shows something about *how* somebody read.

So coverage is held constant and interpretation is the variable.

| | account | readings | passages | concepts | threads | projections |
| --- | --- | --- | --- | --- | --- | --- |
| **Expert** | `cohort-expert@loom.local` | all | ~150 | ~60 | ~45 | 2–3 per reading |
| **Strong** | `cohort-strong@loom.local` | all | ~110 | ~44 | ~30 | 2 per reading |
| **Middling** | `cohort-middling@loom.local` | all | ~80 | ~30 | ~14 | 1–2 per reading |
| **Struggling** | `cohort-struggling@loom.local` | all | ~55 | ~18 | ~5 | 1 per reading |
| **Failing** | `cohort-failing@loom.local` | all | ~40 | ~10 | 0–2 total | 1 per reading, empty |
| **Faculty** | `cohort-faculty@loom.local` | all | worked example | — | — | 1 rich per reading |

Volume still falls along the gradient — a struggling reader marks less — but it
is a consequence, never the mechanism. Two personas with identical counts must
still be told apart on any cohort screen.

### What actually separates them

Each dial below is visible somewhere in the product, and the authoring pass is
scored on these rather than on totals.

| Dial | Expert | Failing |
| --- | --- | --- |
| **What a span lands on** | a claim, an argued move, a definition being made | the furniture — a running header, a figure caption, a citation, the first sentence of a page regardless of what it says |
| **Span boundaries** | the sentence that carries the claim | half a sentence, or three paragraphs, or a span that stops mid-clause |
| **Unlabeled passages** | few — most are named | most — captured and never interpreted |
| **What a label says** | what the passage *does* — "translation without consensus" | what the passage *is about* — "design", "systems", or the reading's own title |
| **Concepts per passage** | often 2–3 | 0–1 |
| **Concept reuse across readings** | high — the same concept meets new evidence | none; near-duplicates instead, the same idea renamed each time it recurs |
| **Threads with a named link** | most | none — threads absent, or drawn and left unnamed |
| **Link glosses** | frequent, specific | absent |
| **Projection completeness** | tiers sorted, essence written, paragraph written | one tier holding everything, no essence, no paragraph |

**Failing is harder to author than expert, and must not be authored as
randomness.** A failing student's captures are plausible — they are the things
an eye lands on when it is skimming for something to highlight rather than
reading for an argument. Random spans would look like corruption; skim-shaped
spans look like a person, and that is what a faculty member needs to recognise.

**Concept reuse is the one to get right at the top.** A concept meeting its
second reading is Loom's central claim; a cohort where nobody does it cannot
demonstrate the tool. Expert and strong both carry concepts evidenced in three
or more readings — and the failing persona's *near-duplicates* are the contrast
that makes reuse legible as an achievement rather than an accident.

**Concept reuse is the one to get right.** A concept meeting its second reading
is Loom's central claim; a cohort where nobody does it cannot demonstrate the
tool. The expert and strong personas must both carry concepts evidenced in
three or more readings.

### Deliberate collisions

Cohort surfaces need overlap or they render five disjoint looms:

- Every core reading has **at least one passage captured by three or more**
  personas, so the passage heatmap has depth to show.
- At least **eight concept labels are shared by three or more** personas, and
  a further handful are near-misses in wording — the Vocabulary overlay exists
  to show a word arriving at several people, and near-misses are what make it
  interesting rather than tautological.
- At least **three concepts appear with different names for the same idea**
  across personas, which is the disagreement a faculty member should be able to
  see.

## The data

### Passages are located, never invented

A passage carries offsets into `source_page.textContent` and a content hash;
that is what makes it highlight in the viewer rather than float. So the split
is strict, and it is the same one the app keeps everywhere else:

- **The authoring pass decides** which span is worth quoting, what the concepts
  are called, what a link is labelled, how a projection is arranged.
- **Code computes** the page, the offsets and the hash, by locating the chosen
  span in the stored page text.

A span the resolver cannot find exactly is a failure, not a warning. Seeding a
passage whose offsets do not land is worse than not seeding it — it looks
correct in every count and is broken the moment anybody opens the reading.

### The fixture carries locators, not prose

`scripts/fixtures/cohort.json`, committed and reviewable. It stores **no
reading text**: the readings are published, copyrighted work and this repo is
public, so a fixture full of verbatim quotes would be publishing excerpts. It
stores where to look and what the text must hash to; the seeder reads the words
out of `source_page` at seed time and fails loudly if the hash no longer
matches — which is exactly what a re-ingest or an applied repair should cause.

```jsonc
{
  "generatedAt": "…",              // stamped after the pass, not by it
  "provenance": "agent-authored fixture; not student work",
  "course": "…",                   // the SLUG of the course every persona enrols in — named, never inherited
  "personas": [
    {
      "account": "cohort-expert@loom.local",
      "readings": [
        {
          "seedKey": "…",           // stable reading identity, never the title
          "passages": [
            {
              "page": 4,
              "startOffset": 1180,
              "endOffset": 1412,
              "contentHash": "…",   // of the page projection, verified at seed
              "concepts": ["boundary object", "translation"],
              "note": "…"           // the student's own words, authored
            }
          ],
          "threads": [
            { "from": "boundary object", "to": "translation", "link": "holds apart" }
          ],
          "projections": [
            { "essence": "…", "tiers": { "…": ["…"] }, "paragraph": "…" }
          ]
        }
      ]
    }
  ]
}
```

### The cohort names its course

`course` is a course slug, resolved at seed time; the seeder fails loudly
when the fixture omits it or the database does not hold it. Not "the oldest
course": that used to be the app's own silent rule for an account in several
courses, and it stopped being one on 2026-08-21 — the working course is a
per-user choice now (`course_membership.selectedAt`, migration 0027), one
account carrying several enrolments is a normal state (the course-switch
spec's fixture user does), and the environments this seeds into already hold
more than one course (the e2e fixture course among them). A cohort seeded by
ordering-accident lands beside whatever course happened to be created first
in that environment; a cohort that names its course lands where it was
pointed, in every environment, and the reviewer of this file can see where.

### Seeding is deterministic and has no model in it

`scripts/seed-cohort.ts` replays the fixture. No model call, no network beyond
the database, the same cohort every run — which is what lets it run in CI and
what lets two environments be compared at all.

Idempotent per the existing seed's pattern: rebuilt from scratch on every run,
so a half-finished run is not a state anyone has to reason about.

## Where it is seeded

| Environment | Cohort | Why |
| --- | --- | --- |
| **preview** | yes | the point — branch previews come up populated |
| **dev** | yes | testers see a populated cohort |
| **local** | yes | developers get one without inventing it |
| **ci** | not yet | it would add seeding time to every e2e run for assertions nothing makes yet |
| **production** | **never** | students' cohort is real students |

Seeding is per-environment, because a Neon branch copies data once and never
again: a cohort seeded into `dev` after `preview` was cut does not appear in
`preview`. Run the seeder against each database you want populated.

**One consequence to hold.** `dev` currently carries six real accounts and their
work. Seeding the cohort there puts synthetic students beside real ones on every
cohort surface — good for exercising those screens, misleading if anyone reads
them as real behaviour. Previews have no such problem: they are synthetic-only.
