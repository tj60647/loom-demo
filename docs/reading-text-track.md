# The reading-text track — plan

**Why this is separate.** JC's punch list has nineteen items and one of them is
not like the others. Item 1 — *"corrupted OCR flows into captured passages…
hyphen fragments and dropped characters"* — is not a screen that needs a field.
It reaches from ingest, through scoring, through a repair pipeline, through
re-ingest and into anchored highlights that students have already laid down. It
has its own subsystem ([reading-quality.md](reading-quality.md)), its own
scripts, its own admin surface, and its own way of going wrong. Scheduled beside
"add a rename control" it would either dominate the list or be starved by it.

**Scope: three items.** Item **1** (bad text at both ends), item **10** (make
the captured passage editable in the modal), item **16** (a "text looks wrong"
flag at capture, feeding an instructor queue). Ten and sixteen sit here rather
than with the UI work because they are the same subject seen from the reader's
chair: what a person does when the machine got the page wrong. Item 1's
paste-tidy sub-item is executed in the other plan as
[1.5](qa-jc-2026-08-07.md) but must not be written until §4 below has been read.

Everything else is in [qa-jc-2026-08-07.md](qa-jc-2026-08-07.md).

**Status: plan only.**

---

## The finding that reorders this work

JC wrote that the extraction-score gate *"didn't catch this"*. It didn't, and
the reason is structural rather than a threshold set too loosely.

**The gate and the repair pipeline do not share their measures.**
[garble.ts](../src/lib/garble.ts) measures the share of a page's lowercase body
words that are not in an English dictionary. Its own header records the
calibration: *"A clean reading in this library measures 1-2%. A broken page
measures 30-80%."* It already handles the two false-alarm classes by design —
proper nouns drop out because they are capitalised, and line-break hyphenation
fragments are excused on short pages by a 40-body-word floor.

It is imported by [repairPipeline.ts](../src/lib/repairPipeline.ts),
[garbleRegion.ts](../src/lib/garbleRegion.ts) and
[repairs.ts](../src/actions/repairs.ts) — the machinery that *fixes* a reading.
It is imported by [readingScore.ts](../src/lib/readingScore.ts) nowhere. The
gate's own metrics are `coverage`, `junkCharRatio`, `medianChars`,
`longTokenRatio` and language likeness
([readingScore.ts:411–445](../src/lib/readingScore.ts#L411)).

Now put JC's two samples against that list:

- **"conc s shoul ierarchical"** — characters dropped mid-word. `junkCharRatio`
  sees nothing: every character present is ordinary ASCII, and `JUNK_CHAR`
  ([readingScore.ts:71](../src/lib/readingScore.ts#L71)) only matches
  replacement chars, C0/C1 controls and the private-use area. Language likeness
  sees a near-perfect a–z profile, because dropping letters barely perturbs a
  distribution. `longTokenRatio` is *inverted* against this damage: it exists to
  catch **fused** words and this damage makes tokens **shorter**.
- **"rop- _ositions"** — a hyphen fragment plus a dropped character. Same story,
  plus an underscore that is not junk by the pattern.

**So the gate has a measure for text with the spaces removed and no measure for
text with the letters removed** — and the repo already contains the missing
measure, wired to the wrong half of the system. `reading-quality.md` even names
the general shape of the trap: *"A clean byte count is not legibility… the
commoner break resolves to the wrong character: ordinary ASCII, zero junk bytes,
unreadable."* Dropped characters are the same trap one step further on.

This changes the sequence. Re-OCRing the affected readings is treating one
patient; the gate is why the ward has no thermometer.

---

## This track has a deadline, not a tension

[reading-quality.md](reading-quality.md) ends its re-ingest section with a
one-line rule: **"repair before a cohort arrives, not during one."**

**No cohort has arrived. One arrives in about two weeks** (TJ, 2026-08-11 —
so roughly 25 Aug; the real date should replace this line). Every capture in
the app today is a test: JC's 24 passages on the Novak reading, and whatever
else is on dev, is disposable data made to find exactly the bugs it found.

That is the single most important fact in this plan, and it points both ways.

**Right now, repair is free.** Every environment can be re-ingested without
weighing anything against it. `reingest.ts` and the batch script still refuse
where highlights exist, and `--force` still exists so that overriding is a
deliberate act — but the act costs nothing this fortnight, because the only
highlights it breaks are ours. No remapping, no re-anchoring, no student-facing
apology for a highlight that moved. Delete the test captures, repair, re-ingest,
re-capture to check the result.

**In two weeks it stops being free, for the rest of the term.** The moment a
cohort is in the readings, every remedy in Layer 2 acquires the whole apparatus
in §3 — and the sharp edge there is unavoidable: a passage captured before a
repair keeps its old offsets and its old `pageContentHash`, both stop matching,
the viewer falls back to fuzzy matching, and *for the readings most worth
repairing the fuzzy match has nothing to match against, because the passage's
own stored text is the damage.*
[offsetRemap.ts](../src/lib/offsetRemap.ts) can carry highlights across a
`/ToUnicode` repair and only that kind of repair. An OCR replacement is not
that.

So the rule to work to is plain: **every reading a student will touch this term
gets diagnosed and repaired before the cohort arrives.** Not the ones JC
screenshotted — all of them. A reading that fails the gate after the door closes
is a reading that stays broken until the term ends, or gets fixed at the cost of
someone's marked-up text.

That is also why Layer 1 comes first and is not optional: 1.4 is the sweep that
tells us which readings are in this fortnight's scope, and without the measure
in 1.1 that sweep returns the same clean bill of health it returned before JC
opened the app.

---

## Layer 1 — the gate learns to see this damage

Fix the instrument first. Everything downstream is judged by it, including
whether the repairs in Layer 2 worked.

**1.1 · Wire the garble rate into the score.** Add the dictionary-based rate as
a whole-document metric in `computeExtractionMetrics`, and let it cap
`legibility` the way `longTokenRatio` already does at
[readingScore.ts:387](../src/lib/readingScore.ts#L387). Keep the three
properties the file defends: an unscored dimension **abstains** rather than
defaulting; the dimensions are **not compensatory**; and the judge **may lower
legibility, never raise it** past what was measured. A dictionary rate is a
whole-document count and the judge sees a few sampled pages, so it belongs on
the deterministic-ceiling side of that rule, exactly like run-together words.

*Calibration is the actual work, not the wiring.* `garble.ts`'s thresholds
(`GARBLED_PAGE_RATE` 0.15, severe 0.5, `MIN_BODY_WORDS` 40) were tuned for
*"which region of this page do I send to a vision model"*, which is a different
question from *"is this reading fit for a student to quote from"*. Re-derive
against the library, and follow the file's own standard: thresholds calibrated
against this corpus, with the two populations shown to be separated, not
thresholds chosen.

**1.2 · Decide whether hyphen fragments get their own measure.** JC named them
first and they are the one damage class `garble.ts` deliberately forgives —
`edi-tions`, `infor-mation` read as garbage at 46% on a citation page, which is
why the 40-body-word floor exists. A separate, cheap count of `\w+-\s` and
`\w+-$` line-end fragments per page would distinguish *"this PDF hyphenates at
line ends and extraction kept the hyphen"* — normal, fixable at display time by
`tidy()` — from *"this text is shattered"*. Whether that is a scored dimension
or a diagnostic note is a judgement call; see the decisions.

**1.3 · Add a regression fixture, from JC's own strings.** The repo's habit is a
`scripts/check-*.ts` per invariant, thirteen of them in `npm run check`. Add
one: a page of `"rop- _ositions"`-class text and a page of `"conc s shoul
ierarchical"`-class text must both fail the gate, and a clean page and a
bibliography page must both pass it. `reading-quality.md`'s "Known limits"
section is the list of things this fixture should not accidentally start
failing — a maths paper, French prose, a diagram of one- and two-word labels.

**1.4 · Re-run the gate over every preloaded reading.** `npm run
diagnose:readings` is read-only and already exists. Run it against dev and
against production with the new measure, print the `database:` line each time
(the doc is emphatic about this and the reason is good), and produce the list
that Layer 2 works from. **This is the deliverable JC asked for in the second
half of item 1** — "run the extraction-score gate on every preloaded reading" —
and it is worth nothing until 1.1 lands.

---

## Layer 2 — repair the readings that fail

The machinery is built and the remedies are already ordered by how much they
destroy ([extractionDiagnosis.ts](../src/lib/extractionDiagnosis.ts)):
`rebuild-tounicode` → `split-spread` → `ocr` → `manual-review`, first match
wins. **Do not shortcut to OCR because JC's item says "re-OCR".** The whole
point of that ordering is that OCR on a PDF whose only fault is a broken
character map throws away a perfect vector text layer and replaces it with a
guess — and JC's samples are consistent with either cause.

**2.1 · Diagnose before choosing a remedy, per reading.** Take the Layer 1 list
and run the diagnosis. Record, per reading, which remedy it picked and what it
reported it could **not** measure — the file is careful that a structural defect
cannot be ruled out from stored page text alone, and that saying so is not a
clean bill of health.

**2.2 · Novak first, then everything else.** *Learning How to Learn — Chapter 1*
is the reading JC ran through and the one in every screenshot, so it is the
fastest way to know whether a remedy worked — we have a documented before. Do it
first, at full care, and let what is learned set the batch policy.

**Then do the whole library, not just the failures JC saw.** Per the deadline
above: any reading a student may open this term is in scope this fortnight,
because after the cohort arrives the cost of repairing one changes completely.
The sweep in 1.4 is the list.

**2.3 · For readings needing transcription, use the pipeline as built.** Region
location ([garbleRegion.ts](../src/lib/garbleRegion.ts)), crops at 300dpi capped
at 2560px, several vision readers, consensus
([repairConsensus.ts](../src/lib/repairConsensus.ts)), then a **human accepts a
proposal** — `source_repair.appliedAt` is the only thing that says a repair
reached a student. Two guards in there were bought with real damage and should
not be relaxed under schedule pressure:

- `acceptedTextMatchesReadings` ([repairReview.ts](../src/lib/repairReview.ts))
  requires 60% of the accepted text's words to appear in some reader's
  transcription. It exists because an adjudicator once returned a paragraph
  *describing* the readers' agreement, that paragraph was written into the page,
  and the damage score fell from 34.4% to 0.3% — because commentary is fluent
  English. The gibberish measure cannot catch that; only this can.
- `MAX_REGIONS_PER_SOURCE` is 12, and the comment is the policy: *"a reading
  with more damage than this needs a different remedy than transcription, and
  should be re-sourced instead."* Some of these readings may need a better
  scan, not a better model. That is a real outcome and should be reported as
  one, not worked around.

**2.4 · Report what was left broken.** Any reading whose diagnosis is
`manual-review`, or that exceeds the region cap, comes back to JC and TJ as a
named list with the reason. A silent partial pass on this track is exactly the
failure mode the punch list was written to end.

---

## Layer 3 — the captures on the page, before and after the door closes

**Before the cohort: this layer is three lines of policy, not a design
problem.** The captures on dev are test data. Re-ingest with `--force`, let the
anchors break, and re-capture a few passages afterwards as the check that the
repair landed. The only discipline needed is to say out loud which readings were
force-re-ingested and when, so a later "why did this highlight move" has an
answer.

**3.1 · Clear the test captures deliberately, don't let them rot.** A test
passage anchored into pre-repair text is not evidence of anything after the
repair, and left in place it will be read as a bug in Layer 1's verification.
Decide per reading whether to delete them or re-capture them, and do it in the
same pass as the re-ingest.

**3.2 · Verify by re-capture, not by inspection.** After a reading is repaired
and re-ingested, capture a passage from a page that was damaged and read what
lands in the modal, in Your Work, and in the export. That exercises the two
strings, the content hash and the offsets together — which reading the stored
column does not.

**After the cohort arrives, this layer becomes the hard part**, and it is worth
writing the plan for it now while nothing is at stake:

1. **Remap, where the repair permits it.**
   [offsetRemap.ts](../src/lib/offsetRemap.ts) already decides whether
   highlights survive a `rebuild-tounicode` repair, and refuses unless every
   changed mapping stays in the same Unicode category.
2. **Re-anchor by content.** [reanchor.ts](../src/lib/reanchor.ts) exists;
   whether it can work on this damage needs checking, because a badly damaged
   passage's stored text *is* the damage and there may be nothing to match on.
3. **Accept the break, and say so in the app.** Today a passage whose anchor
   stops matching falls back to fuzzy matching and, failing that, shades nothing
   — with a `console.warn` and a status line
   ([PdfViewer.tsx:753,803](../src/components/pdf/PdfViewer.tsx#L753)). A
   console warning is not a student-facing account of why their highlight
   vanished. Whenever a mid-term repair does become necessary, the reading has
   to tell the student their passage's text was corrected and the highlight
   needs re-placing, with the passage still readable and a way to re-find it.

**(3) is the only one of the three that is unbuilt, and it is the one that is
needed under pressure.** It does not have to ship this fortnight. It should be
scoped this fortnight, so that the first mid-term repair is not also a design
exercise.

**3.3 · Write the fortnight down.** `reading-quality.md`'s "Applying a repair"
section ends at *"repair before a cohort arrives, not during one."* It should
gain the sentence that names when this library's door closes, and a line
recording that every shared reading was diagnosed and repaired before it did —
or which ones were not, and why.

---

## Layer 4 — the human's fallback at the point of capture

Items 10 and 16, plus the paste-tidy. These are worth doing **whatever happens
above**, because no gate catches everything and JC's framing is right: when OCR
fails, the human is looking straight at the page.

**4.1 · Editable passage text in the capture modal (item 10).** Today the
passage is a read-only block
([CaptureModal.tsx:106](../src/components/pdf/CaptureModal.tsx#L106)). Make it
editable, and re-derive the word-chips from the edited text so the concept the
student builds comes from the words they can actually read.

*The catch, and it is the whole design of this item:* `content` is the passage's
text, and `startOffset`/`endOffset`/`pageContentHash` are its anchor into the
page. Editing the first must not be taken as editing the second. Keep the anchor
as captured — it still points at the right *place*, which is what
goto-provenance and the highlight need — and let `content` be the student's
corrected reading of that place. Then decide what the export says, since it will
now carry a passage whose text differs from the page. A flag on the row (this
was corrected by hand) is probably the honest answer, and `passage` already has
`note` for the reader's own words.

**4.2 · Tidy at capture, not in the substrate (item 1's second half).**
`tidy()` ([clothMath.ts:91](../src/lib/clothMath.ts#L91)) already rejoins
hyphenated line breaks and collapses newline runs; it is wired into exactly one
place, the paste handler at
[OpenTab.tsx:427](../src/components/tabs/OpenTab.tsx#L427). Capture-from-page
never calls it.

**Read "Two strings, and why" in [reading-quality.md](reading-quality.md) before
touching this.** Stored page text is *not* the string the offsets index into;
`textLayerProjection()` recovers the browser's string exactly, and
`source_page.contentHash` hashes the projection rather than the column. Tidying
anything in that chain moves every anchor on the page. The safe shape is
tidy **on the way into the modal's displayed text and its word-chips**, leaving
the captured `startOffset`/`endOffset` computed against the untidied substrate —
which also composes correctly with 4.1.

**4.3 · "This text looks wrong" at capture (item 16).** A student-side entry
into the repair queue that already exists —
[repairs.ts](../src/actions/repairs.ts), `source_repair`, and the admin
[RepairPanel.tsx](../src/components/library/RepairPanel.tsx). The student flags
a page from the capture modal; it lands where an instructor can see it, next to
the machine-detected regions.

Three things to get right. It must record the **page**, not just the reading —
the pipeline works in regions. It must be **counted, never scored**: this is a
report about the file, and it must not read to the student as an error they
made. And it should tell them what happens next, because a flag that vanishes
gets used once. *TJ's call:* whether a student flag can *trigger* detection on
that page automatically (detection is cheap, pure and repeatable, so this is
affordable) or only queue for a person.

---

## Decisions

Nothing here blocks starting. Each is needed by the layer it names.

1. **The date.** What is the cohort's actual first day? Everything above is
   sequenced against "about two weeks from 11 Aug" and deserves a real date.
   Also: which readings are on the syllabus for the term — if that list is
   shorter than the library, the fortnight's scope shrinks with it.
2. **§2.3 — re-source vs transcribe** for any reading over the 12-region cap.
   Costs money and time either way; the pipeline's own comment says re-source.
   Needed the moment 1.4's sweep names one.
3. **§1.2 — do hyphen fragments get their own measure**, or stay a diagnostic
   note under the garble rate.
4. **§4.1 — what a hand-corrected passage says in the export**, and whether the
   correction is visible to faculty.
5. **§4.3 — does a student flag trigger detection**, or only queue.
6. **§3, deferred — the mid-term repair story.** Not needed to ship, needed to
   have scoped before the first mid-term repair.

---

## Order

**Layers 1 → 2 → 3 are one fortnight's job and should be treated as one.** The
gate has to see the damage (1) before the sweep can name the readings (1.4)
before they can be repaired (2) and re-ingested while it is still free (3). That
chain is the deadline work, and it does not parallelise usefully — 1.1's
calibration is the slow part and everything waits on it.

**Layer 4 is independent and can run beside it, or first.** Items 10, 16 and the
paste-tidy don't touch scoring, diagnosis or re-ingest. They are also the only
part of this track a student feels regardless of how the repairs go, and 4.2
(tidy at capture) alone fixes the visible half of what JC screenshotted.

**Against the other plan:** the UI punch list has no deadline of its own — every
item in [qa-jc-2026-08-07.md](qa-jc-2026-08-07.md) can land during a term. This
track cannot. If the two compete for the same fortnight, this one wins on
everything except its own Layer 4, which shares
[CaptureModal.tsx](../src/components/pdf/CaptureModal.tsx) with that plan's Wave
1 and should be done in the same sitting.

One sequencing note against the other plan: **Layer 4 and the UI wave-1 items
touch the same file.** Items 4 (unlabeled passages), 7 (Note/Question), 9
(typeahead) and 10 (editable text) are all
[CaptureModal.tsx](../src/components/pdf/CaptureModal.tsx), a 195-line component
that would end up rewritten four times. Whoever takes the first of them should
take all four, and the two plans should agree on who that is before either wave
starts.
