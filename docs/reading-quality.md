# Reading quality — measuring it, diagnosing it, repairing it

Companion to [contracts.md](contracts.md) (the *what, exactly*) and
[loom-spec-v1.md](loom-spec-v1.md) (the *why*). This file covers one subsystem:
how Loom decides whether a reading is good enough for a student to quote from,
what it does when the answer is no, and which of those repairs are safe to run.

**As of:** `chore/alpha-foundation`, 2026-08-03.

---

## The problem this exists for

A scanned photocopy and a clean digital PDF look identical on a library card.
They stop looking identical the moment a student tries to select a sentence —
and by then the reading is on a syllabus, a cohort is working in it, and the
failure lands on the student rather than on the person who uploaded it.

The naive test, "does this PDF have a text layer?", is worthless. A file can
have a text layer that is silently garbage: fonts whose character map resolves
to the wrong letters, an old OCR pass with the spaces missing, a page that is
nothing but a repeated watermark. All of those answer "yes".

So Loom scores extraction quality, and the score is a gate on usability, not on
scholarship. A brilliant essay that extracted as mojibake scores 1. A dull memo
that extracted perfectly scores 5.

## The score

Four dimensions, 1–5, in [src/lib/readingScore.ts](../src/lib/readingScore.ts):

| Dimension | Measures | Source |
| --- | --- | --- |
| `coverage` | Share of pages with extractable text. | deterministic |
| `legibility` | Whether the characters read as language, and whether the words are still separated. | deterministic, refined by judge |
| `anchorability` | Enough text per page for highlight offsets to hold. | deterministic |
| `structure` | Whether extraction preserved reading order. | judge only |

Three properties hold across all of them, and are worth defending if you change
anything here.

**An unscored dimension abstains.** No key, a judge error, unparseable output,
or too little text all leave the dimension `null` — never a substituted default,
which would make "we didn't check" indistinguishable from "we checked and it was
fine". `pass` is therefore three-valued: `true`, `false`, or `null`, and the
library card renders the third as **Unverified** rather than as a quiet pass.

This matters more than it sounds. `legibility` used to be granted a 5 when there
was too little text to run the language check — which is how 693 characters of
OCR noise off a diagram scored 5/5/5 and passed. Not checked must not read as
checked and fine.

**The dimensions are not compensatory.** `pass` requires *every* scored
dimension to clear 3, and requires `coverage` and `legibility` to have values at
all. A PDF whose fonts carry no ToUnicode map scores 5 on coverage and
anchorability — every page is full of characters, and offsets anchor to them
fine — while being pure mojibake. Averaging calls that usable.

**A clean byte count is not legibility.** Counting junk bytes (U+FFFD, control
codes, private-use glyphs) catches only a font map that resolved to *no*
character. The commoner break resolves to the *wrong* character: ordinary ASCII,
zero junk bytes, unreadable. Any future tightening should be tested against text
that is valid characters in the wrong mapping, not just against mojibake.

### What caps legibility

Starting from the junk-byte band, four things can lower it and none can raise it:

- **Sparse pages.** A median under 200 characters per page caps at 3 — a page
  carrying a running header's worth of text extracts "cleanly" and is useless.
- **Language likeness.** Cosine similarity of the document's a–z profile against
  English, and the density of common English words. A broken letter distribution
  is strong evidence of mis-mapped characters in any Latin-script language, so
  it caps hard; missing English function words alone is weak evidence — French
  prose, a maths paper and a bibliography all look like that — so it only caps
  to "borderline, look at it". Real readings here score ~0.99 similarity and
  ~50 words per 1,000 characters, well clear of the 0.85 / 8 thresholds.
- **Run-together words.** See below.
- **Not enough text to judge.** Abstains rather than capping.

The language check samples evenly across the document. It reads a fixed
character budget, and it used to take that budget from the front — which on a
235-page book meant the first ten pages and nothing else, so damage at chapter
three was never looked at.

### Run-together words

The measure no other signal here can see: text that is real English, in real
proportions, with the spaces gone. `junkCharRatio` reads zero, the letter
distribution is perfect, every function word is present — and a student who
quotes a sentence gets `designismore thanastyle`.

Thresholds are calibrated against this library rather than chosen. Sixteen of
its readings sit at or below 0.4% over-long tokens; the damaged ones run 3% to
30%. Nothing lands in between.

The judge does **not** get to overrule this. It sees a few sampled pages, while
this is a whole-document count, so `judgeSourceScore` re-applies the same
deterministic ceiling over the judge's answer: the judge may lower legibility,
never raise it past what was measured.

## What the text cannot tell you

[src/lib/pdfStructure.ts](../src/lib/pdfStructure.ts) reads the *file* rather
than the text, because two defects are invisible to any string:

- **A two-page spread scanned as one landscape sheet** extracts a full page of
  clean, well-distributed English. It scores 5/5/5 while reading across the
  gutter and interleaving two pages of prose.
- **A font whose `/ToUnicode` map is missing** is either invisible in the
  extracted string or indistinguishable from a bad scan. At the glyph level it
  is unambiguous, and attributable to a specific font — which is what makes a
  surgical repair possible.

Two findings from measuring this library are baked into that file and are worth
not re-learning:

**Page geometry must come from the rotation-adjusted viewport, never the raw
page box.** One scan here has a `[0,0,792,612]` MediaBox — wider than tall, the
textbook spread signature — and `/Rotate 270`, so it renders as an ordinary
612×792 portrait page. The naive test would split it down the middle.

**`isInFont: false` is not a defect.** It means the glyph is not in the embedded
font program, which is routine: 617 of 3,624 glyphs on the first page of a
perfectly clean reading report it, every one mapping to correct Unicode. Gate on
the resolved character instead.

A page with no text is also not automatically a scan. The probe renders any
text-free page and measures ink before calling it one — without that, blank
leaves scanned along with a volume read as pages needing OCR. In one 163-page
book, eighteen of the nineteen such pages were blank and the nineteenth was the
cover.

## Diagnosis, and why remedies are ordered

A score is a verdict, and a verdict is not a plan. A 2 on legibility could be a
scanned page with no text, a broken character map, or a spread — three defects
whose correct treatments have nothing in common. Sending all three to OCR is the
mistake [src/lib/extractionDiagnosis.ts](../src/lib/extractionDiagnosis.ts)
exists to prevent: OCR on a PDF whose only fault is a broken map throws away a
perfect vector text layer and replaces it with a guess.

Remedies are ordered by how much they destroy, and the first that applies wins:

1. **`rebuild-tounicode`** — rewrites a font's character map. No pixels change,
   nothing reflows, the page renders identically. Only extraction changes.
2. **`split-spread`** — rewrites page boxes. Lossless where the text layer is
   already good.
3. **`ocr`** — replaces the text layer outright. Right when there is no text to
   save, wrong whenever there is.
4. **`manual-review`** — the honest output when the measurements do not agree,
   or when the cause is one no tool should decide unaided.

The diagnosis also reports what it could **not** measure. A structural defect
cannot be ruled out from stored page text alone, and saying so is not the same
as a clean bill of health.

## Running it

```
npm run diagnose:readings                    # the shared library, from the database
npm run diagnose:readings -- path/to.pdf     # a local file, no database or blob needed
npm run diagnose:readings -- --json out.json # machine-readable alongside the report
```

Read-only: it writes no rows, no blobs and no files. The local-file mode is the
way to try a PDF that is not in the library yet.

**Check the `database:` line it prints first.** Every script that touches library
data names the database it reached before saying anything about its contents,
because the library looks much the same in every environment and a report from
the wrong one is not obviously wrong.

Point it elsewhere with `LOOM_ENV_FILE`. In PowerShell, which is what this repo
is developed in, that is a statement rather than a prefix:

```powershell
$env:LOOM_ENV_FILE = '.env.production.pulled'
npm run diagnose:readings
$env:LOOM_ENV_FILE = $null
```

(The pulled file is kept as `.env.production.pulled`, not the name `vercel env
pull` gives it: Next auto-loads `.env.production.local` and its `[SENSITIVE]`
`NEXTAUTH_URL` breaks every local `next build`. See deployments.md.)

Note that `vercel env pull` writes the literal string `[SENSITIVE]` for variables
marked sensitive, `DATABASE_URL` among them, so a pulled production file is not
usable as-is — the connection string has to come from the Neon console.

## Applying a repair

Fixing a PDF changes nothing on its own. `extractPdfPageText` used to have a
single call site — the upload — so a reading's page text was frozen at the
moment it was added, and the improved text would live inside the file while
search, anchoring and the score all kept reading stale rows.
[src/lib/reingest.ts](../src/lib/reingest.ts) is the other half: it replaces the
stored pages, the cover and the score together, from the bytes as they stand.

```
npm run reingest:readings -- --dry-run       # what would change
npm run reingest:readings -- <sourceId>      # one reading
npm run reingest:readings -- --all           # every shared reading
npm run reingest:readings -- --all --force   # including ones with highlights
```

**When it is safe.** A reading nobody has highlighted can be re-ingested freely.
The batch script counts highlights per reading and holds rather than replacing
text underneath them; the admin **Rescore** button refuses outright and points
here. `--force` exists so that overriding is a deliberate act.

**What `--force` actually costs depends on why you are running it.** Re-ingesting
from *unchanged* bytes — to pick up a change in extraction itself — leaves the
browser's text-layer string exactly as it was, and `contentHash` is a hash of
that string, so no existing highlight moves or loses its match. Re-ingesting
after *repairing the PDF* is the dangerous one. The guard cannot tell the two
apart and holds for both; you have to know which you are doing.

**When it is not.** A byte captured before a repair keeps its old offsets and
its old `pageContentHash`. Both stop matching, the viewer falls back to fuzzy
matching, and for the very readings most worth repairing — the ones whose text
was mojibake — the fuzzy match has nothing to match against, because the byte's
own stored text *is* the mojibake.
[src/lib/offsetRemap.ts](../src/lib/offsetRemap.ts) decides whether a
`/ToUnicode` repair can carry existing highlights across at all; it refuses
unless every changed mapping stays in the same Unicode category, because
crossing that boundary restructures the glyph stream and would silently shift
every offset on the page.

The short version: repair before a cohort arrives, not during one.

## Two strings, and why

Stored page text is **not** the string highlight offsets index into.

pdf.js builds the browser text layer as one `<span>` per item plus a bare `<br>`
after each end-of-line item, and a `<br>` contributes nothing to `textContent`.
So the DOM string is the item strings concatenated with nothing between them —
and that is what `PdfViewer` hashes, and what every `startOffset`/`endOffset`
indexes into.

`extractPdfPageText` stores something different: the same items with the line
boundaries pdf.js already worked out. It does that for one concrete reason —
Postgres tokenises `CraftBuilding` as `craftbuild`, which matches neither
`craft` nor `building`, and 58–77% of line ends in this library's readings fused
two words. Reading search was silently missing them.

`textLayerProjection()` strips the separators back out and recovers the browser's
string exactly. **Anything reconciling a client capture against stored page text
must go through it**, and `source_page.contentHash` is a hash of the projection,
not of the stored column, so it still equals the hash the client computed.

The separator is a newline rather than a space precisely because it must be
removable: a space would be indistinguishable from the spaces pdf.js emits
itself, and the offset substrate would be unrecoverable. A page whose own items
already contain a newline keeps the old join for that reason, and
`npm run check:textlayer` asserts the round trip against real PDFs.

## Known limits

Stated plainly, because each is a place where the tool is quieter than it looks.

- **The spread rule is untested.** This library contains no genuine two-page
  spread — 1,237 of 1,238 pages render taller than wide, and the single
  exception is a landscape diagram. Any threshold would classify the corpus
  identically, so the rule has never met the thing it is for.
- **Whitespace share was rejected as a metric.** It looks like the natural way
  to catch lost spaces and it is not: it tracks words-per-line, so it measures
  layout rather than damage, and adding it would have routed a sound
  vector-text diagram to OCR — exactly the mistake the remedy ordering exists to
  prevent.
- **OCR was measured as unnecessary here.** Every page this library flagged as
  scanned is a cover, a blank leaf, or a figure. On the one figure with real
  ink, OCR at 400dpi produced 693 characters of noise at 34% confidence, of
  which nothing survived a per-word confidence floor. If you do reach for OCR:
  `tesseract.js` defaults to `SINGLE_BLOCK`, which assumes the image is one
  column of prose and is what manufactures that noise on a diagram.
- **`longTokenRatio` is prose-tuned.** Fusing long lines makes long tokens;
  fusing short labels does not. A diagram of one- and two-word labels can lose
  every boundary and stay under the threshold.
