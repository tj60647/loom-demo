/**
 * Assertions for the two scoring rules that carry no length threshold.
 *
 * Both replaced character floors, and both need to keep working in the
 * direction the floors were meant to protect — a document whose only text is a
 * repeated download stamp must still fail, or the score has no teeth. The
 * fixture below is exactly the case the old 120-character floor missed: the
 * stamp runs to ~159 characters a page, so the floor admitted it.
 *
 *   npx tsx scripts/check-scoring.ts
 */
import { countPagesWithContent } from "../src/lib/readingScore"
import { probeHighlights } from "../src/lib/highlightProbe"
import { acceptedTextMatchesReadings } from "../src/lib/repairReview"
import { computeBlockConsensus, computeConsensus, flattenBlocks, type TranscriptBlock } from "../src/lib/repairConsensus"
import { parseReading } from "../src/lib/repairReading"
import { measurePageGarble } from "../src/lib/garble"
import { locateQuote, planReanchor } from "../src/lib/reanchor"

let failures = 0
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
}

const page = (pageNumber: number, textContent: string) => ({ pageNumber, textContent })
const STAMP = "Downloaded from jou.sagepub.com at UNIV CALIFORNIA BERKELEY on March 3, 2016. All rights reserved."

console.log("\ncoverage — content vs page furniture, with no minimum length")

// The case the character floor was written for and did not catch.
check(
  "a document that is only a repeated download stamp has no content pages",
  countPagesWithContent(Array.from({ length: 10 }, (_, i) => page(i + 1, `${STAMP}\n${i + 1}`))),
  0
)

// The case the character floor wrongly excluded.
check(
  "a page whose only text is a caption counts, alongside pages of prose",
  countPagesWithContent([
    page(1, `${STAMP}\nFigure 1. Belief Systems, 2009.`),
    // Distinct per page, as real prose is — a fixture that repeats itself would
    // be furniture by this rule's own definition, and rightly so.
    ...Array.from({ length: 9 }, (_, i) => page(i + 2, `${STAMP}\nBody prose particular to page ${i + 2}.`)),
  ]),
  10
)

check(
  "a three-word heading counts",
  countPagesWithContent([
    page(1, "Why Systems Surprise Us"),
    page(2, "Body text here"),
    page(3, "More body text"),
    page(4, "Still more body text"),
  ]),
  4
)

check(
  "an empty page does not count",
  countPagesWithContent([page(1, "real text"), page(2, "   \n  "), page(3, "more"), page(4, "again")]),
  3
)

check(
  "a short document skips the repetition test rather than mistaking prose for furniture",
  countPagesWithContent([page(1, "Alpha"), page(2, "Alpha")]),
  2
)

console.log("\nanchorability — short captures are tested, not excluded")

const shortPage = [page(1, "Why Systems Surprise Us")]
const probeShort = probeHighlights(shortPage)
check("a 23-character page is still probed", probeShort.pagesTested, 1)
check("  and yields testable captures", probeShort.spansTested > 0, true)
check("  which anchor cleanly", probeShort.anchorRate, 1)

// Repetition is what actually breaks a short capture, and the probe must see it.
const repeated = [page(1, "the cat sat. ".repeat(40))]
const probeRepeat = probeHighlights(repeated)
check("a page of repeated phrases reports ambiguity", probeRepeat.ambiguous > 0, true)
check("  and scores below 1", (probeRepeat.anchorRate ?? 1) < 1, true)

const clean = [page(1, "Boundary objects are both plastic enough to adapt to local needs and robust enough to maintain a common identity across sites, which is what makes them work.")]
check("ordinary prose anchors cleanly", probeHighlights(clean).anchorRate, 1)

console.log("\nrepair acceptance — accepted text must come from the page")

const READINGS = [
  { reader: 1, text: "The President has called for swift passage of the Safeguards for a New Economy bill.", uncertain: [], illegibleShare: "some" as const },
  { reader: 2, text: "The President has called for swift passage of the Safeguards for a New Economy bill.", uncertain: [], illegibleShare: "some" as const },
]

check(
  "a faithful transcription is accepted",
  acceptedTextMatchesReadings("The President has called for swift passage of the Safeguards for a New Economy bill.", READINGS).ok,
  true
)
check(
  "a reviewer's corrections are still accepted",
  acceptedTextMatchesReadings("The President has called for the swift passage of the Safeguards for a New Economy (S.A.N.E.) bill.", READINGS).ok,
  true
)
// The failure this check exists for, measured on a real page.
check(
  "commentary about the readings is REFUSED",
  acceptedTextMatchesReadings(
    "All four readers agree the region is upright and is a photographic reproduction of a broadsheet newspaper front page with two body-text columns.",
    READINGS
  ).ok,
  false
)
check("empty text is refused", acceptedTextMatchesReadings("", READINGS).ok, false)

console.log("\nconsensus — agreement is computed, never narrated")

// The real disagreement, from four readers on a truncated caption.
const SADDA = computeConsensus([
  { reader: 1, text: "U.S. Army helicopters begin moving troops and equipment from Sadda" },
  { reader: 2, text: "U.S. Army helicopters begin moving troops and equipment from Sadda" },
  { reader: 3, text: "U.S. Army helicopters begin moving troops and equipment from Saddam" },
  { reader: 4, text: "U.S. Army helicopters begin moving troops and equipment from Sadda" },
])
check("a one-word divergence is surfaced, not averaged", SADDA.disagreements.length > 0, true)
check("  and the invented completion is not agreed text", SADDA.agreedText.includes("Saddam"), false)

const SAME = "The President has called for swift passage of the Safeguards for a New Economy bill."
const AGREE = computeConsensus([1, 2, 3, 4].map((reader) => ({ reader, text: SAME })))
check("four identical readings agree", AGREE.agreedText.trim(), SAME)
check("  with nothing disputed", AGREE.disagreements.length, 0)

// Every string it emits must be one a reader actually wrote.
const DIVERGE = computeConsensus([
  { reader: 1, text: "Markets make great servants, terrible leaders, and absurd religions." },
  { reader: 2, text: "Markets make great servants, terrible leaders, and absurd televisions." },
])
check("a substantive divergence is not merged into a new sentence", DIVERGE.agreedText, "")
check("  and both readings are kept", DIVERGE.disagreements[0].readings.length, 2)

check(
  "a single reading is never consensus",
  computeConsensus([{ reader: 1, text: SAME }]).agreedText,
  ""
)

console.log("\nmajority voting — one weak reader cannot veto four")

const GOOD = "Markets make great servants, terrible leaders, and absurd religions."
const BAD = "Markets make great servants, terrible leaders, and absurd televisions."
const FOUR_TO_ONE = computeConsensus([
  { reader: 1, text: GOOD },
  { reader: 2, text: GOOD },
  { reader: 3, text: GOOD },
  { reader: 4, text: GOOD },
  { reader: 5, text: BAD },
])
check("four of five carries the sentence", FOUR_TO_ONE.agreedText.trim(), GOOD)
check("  and the outvoted reading is still shown", FOUR_TO_ONE.disagreements.length, 1)
check("  needing 3 of 5", FOUR_TO_ONE.votes.majority, 3)

// The property unanimity got wrong: adding a reader must not destroy agreement.
const THREE = computeConsensus([1, 2, 3].map((reader) => ({ reader, text: GOOD })))
check("adding a dissenting fifth reader does not lower agreement", FOUR_TO_ONE.agreementRate >= 0.5, true)
check("  three agreeing readers carry too", THREE.agreedText.trim(), GOOD)

// A tie must not carry — 2 of 4 is not a majority.
const TIED = computeConsensus([
  { reader: 1, text: GOOD },
  { reader: 2, text: GOOD },
  { reader: 3, text: BAD },
  { reader: 4, text: BAD },
])
check("an even split carries nothing", TIED.agreedText, "")
check("  and needs 3 of 4", TIED.votes.majority, 3)

console.log("\nvoting stats — which reader is carrying the panel")

const STATS = FOUR_TO_ONE.votes
check("every reader is accounted for", STATS.perReader.length, 5)
check("the dissenting reader shows 0% agreement", STATS.perReader[4].agreementRate, 0)
check("  and its reading is marked solo", STATS.perReader[4].solo, 1)
check("a majority reader shows 100%", STATS.perReader[0].agreementRate, 1)
check("the vote distribution counts sentences by backing", STATS.distribution[4], 1)

console.log("\ngarble — a word broken across a line is one word, not two")

/**
 * The distortion garble.ts's own header names: hyphenation fragments left by a
 * line break read as garbage. It matters most where a repair is judged — a
 * faithful transcription keeps the page's hyphenation, so the corrected page
 * measured WORSE than the damaged one and the apply gate refused it.
 */
const HYPHENATED = [
  "The secret to solving problems is to find the bridge between the way things are",
  "and the way you want them to become. That bridge is your defini-",
  "tion, the link between the situation as already solved and its resolu-",
  "tion as you envision it to be. Definitions are individual points of view.",
].join("\n")
const HYPHEN_MEASURE = measurePageGarble(1, HYPHENATED)
check("a page whose only oddity is hyphenated line breaks measures clean", (HYPHEN_MEASURE?.rate ?? 1) < 0.05, true)
check("  the halves are not counted as words", HYPHEN_MEASURE?.sample.includes("defini"), false)
check("  nor is the other half", HYPHEN_MEASURE?.sample.includes("tion"), false)

// A hyphen INSIDE a line is a real compound, and joining it would invent a
// word: `problem-solving` is two words that are both words.
const COMPOUND = measurePageGarble(
  1,
  "The problem-solving guide is a soft-systems handbook about decision-making and self-reliance, " +
    "recoded and re-set for readers who want a well-known method they can follow without a teacher."
)
check("a hyphenated compound inside a line is left alone", (COMPOUND?.rate ?? 1) < 0.05, true)

// And real damage still reads as damage.
const DAMAGED = measurePageGarble(
  1,
  "ihe feacier refigian haa oiscourse innavation cultiral peuosiad paionnsuoo tvon reCa vsA " +
    "aDEWIGNAwCRITIQUE zD nsuoo qwertyu asdfgh zxcvbn plmokn ijnuhb"
)
check("genuine gibberish still measures as damage", (DAMAGED?.rate ?? 0) > 0.5, true)

console.log("\nblock consensus — a margin note votes beside the body, never inside it")

const BODY_A = "The secret to solving problems is to find the bridge between the way things are and the way you want them to become."
const BODY_B = "Definitions are individual points of view, and it is unlikely that everyone will have the same one."
const NOTE_BOX = { x: 0.02, y: 0.1, w: 0.3, h: 0.2 }
const noteBlock = (text: string): TranscriptBlock => ({ role: "margin", angle: 25, box: NOTE_BOX, text })
const bodyBlock = (text: string): TranscriptBlock => ({ role: "body", angle: 0, box: { x: 0.35, y: 0.05, w: 0.6, h: 0.9 }, text })

// Three readers agree on the body; the note is read two ways. The failure this
// exists to prevent: in a single stream the note lands mid-sentence, so a
// note-placement difference reads as a body disagreement and voids sentences
// every reader wrote identically.
const SPLIT_NOTE = computeBlockConsensus([
  { reader: 1, text: "", blocks: [bodyBlock(`${BODY_A}\n${BODY_B}`), noteBlock("it's time for a break")] },
  { reader: 2, text: "", blocks: [bodyBlock(`${BODY_A}\n${BODY_B}`), noteBlock("it's time for a break")] },
  { reader: 3, text: "", blocks: [bodyBlock(`${BODY_A}\n${BODY_B}`), noteBlock("it's time for a brick")] },
])
check("a disputed margin note does not void the body", SPLIT_NOTE.agreedText.includes(BODY_A), true)
check("  both body sentences carry", SPLIT_NOTE.agreedText.includes(BODY_B), true)
check("  the note carries by majority, in a backer's own words", SPLIT_NOTE.agreedText.includes("it's time for a break"), true)
check("  and the outvoted wording is still shown", SPLIT_NOTE.disagreements.some((d) => d.readings.some((r) => r.includes("brick"))), true)

// Two against one on the note itself: no majority, so the note is a
// disagreement — and ONLY the note.
const TIED_NOTE = computeBlockConsensus([
  { reader: 1, text: "", blocks: [bodyBlock(BODY_A), noteBlock("making too many mistakes")] },
  { reader: 2, text: "", blocks: [bodyBlock(BODY_A), noteBlock("marking too many mistakes")] },
])
check("a note split 1-1 carries nothing of the note", TIED_NOTE.agreedText.includes("mistakes"), false)
check("  but the body still carries", TIED_NOTE.agreedText.includes(BODY_A), true)
check("  and the dispute names the note's role", TIED_NOTE.disagreements.some((d) => d.passage.startsWith("[margin]")), true)

// A reader that ignored the block brief still votes: its whole text is body,
// which is what its format asserts. It backs no notes.
const MIXED = computeBlockConsensus([
  { reader: 1, text: "", blocks: [bodyBlock(BODY_A), noteBlock("it's time for a break")] },
  { reader: 2, text: "", blocks: [bodyBlock(BODY_A), noteBlock("it's time for a break")] },
  { reader: 3, text: BODY_A, blocks: null },
])
check("a flat-format reader still backs the body", MIXED.agreedText.includes(BODY_A), true)
check("  a note backed by 2 of 3 readers carries", MIXED.agreedText.includes("break"), true)

// The identity acceptance depends on: agreedText IS the flattening of the
// agreed blocks, so acceptance can recover blocks by string equality.
check("agreedText is exactly flattenBlocks(agreedBlocks)", SPLIT_NOTE.agreedText === flattenBlocks(SPLIT_NOTE.agreedBlocks), true)
check("  and the carried note keeps its backer's box and angle", SPLIT_NOTE.agreedBlocks.find((b) => b.role === "margin")?.box, NOTE_BOX)

// The bug an earlier version had: notes were grouped by SIMILARITY, greedily,
// in the order each reader listed its blocks — so two distinct labels whose
// words overlap could swap groups between readers, and neither reached a
// majority. Four readers, all reading both labels, two of them listing the
// second first: both labels must carry.
const LABEL_A = "hidden layer 1"
const LABEL_B = "hidden layer 2"
const labelBlock = (text: string, x: number): TranscriptBlock => ({
  role: "label",
  angle: 0,
  box: { x, y: 0.4, w: 0.15, h: 0.08 },
  text,
})
const ORDER_SPLIT = computeBlockConsensus([
  { reader: 1, text: "", blocks: [labelBlock(LABEL_A, 0.1), labelBlock(LABEL_B, 0.6)] },
  { reader: 2, text: "", blocks: [labelBlock(LABEL_B, 0.6), labelBlock(LABEL_A, 0.1)] },
  { reader: 3, text: "", blocks: [labelBlock(LABEL_A, 0.1), labelBlock(LABEL_B, 0.6)] },
  { reader: 4, text: "", blocks: [labelBlock(LABEL_B, 0.6), labelBlock(LABEL_A, 0.1)] },
])
check("two similar labels read by every reader both carry, whatever order they were listed in", ORDER_SPLIT.agreedText.includes(LABEL_A) && ORDER_SPLIT.agreedText.includes(LABEL_B), true)
check("  with nothing invented to disagree about", ORDER_SPLIT.disagreements.length, 0)

// Same words, different places: a page saying "see p.12" in two margins has
// two notes, and one reader reporting both is one voice, not two.
const TWICE = computeBlockConsensus([
  { reader: 1, text: "", blocks: [labelBlock("see p.12", 0.05), labelBlock("see p.12", 0.8)] },
  { reader: 2, text: "", blocks: [labelBlock("see p.12", 0.05)] },
])
check("the same words in two places are two notes, not one doubly-backed one", TWICE.agreedBlocks.filter((b) => b.text === "see p.12").length, 1)

// A concept map is labels and nothing else. The panel record must say five
// readers answered — reprocess-library refuses anything under three, so a
// body-only vote count would hold a unanimous page for a person forever.
const LABEL_ONLY = computeBlockConsensus(
  [1, 2, 3, 4, 5].map((reader) => ({
    reader,
    text: "",
    blocks: [labelBlock("food & shelter", 0.1), labelBlock("her future", 0.6)],
  }))
)
check("a page of labels alone still reports its readers", LABEL_ONLY.votes.readers, 5)
check("  needing 3 of them", LABEL_ONLY.votes.majority, 3)
check("  counts both labels as decided units", LABEL_ONLY.votes.distinctSentences, 2)
check("  carries them", LABEL_ONLY.agreedBlocks.length, 2)
check("  disputes nothing", LABEL_ONLY.disagreements.length, 0)
check("  and credits every reader with the agreement", LABEL_ONLY.votes.perReader.every((stat) => stat.agreementRate === 1), true)

console.log("\nreader replies — both formats parse, and the flat text is the blocks' flattening")

const FLAT_REPLY = parseReading('{"orientation":"upright","text":"Plain page text.","uncertain":[],"illegibleShare":"none"}')
check("the flat format still parses", FLAT_REPLY?.text, "Plain page text.")
check("  with no blocks", FLAT_REPLY?.blocks, null)
check("  and its orientation is no longer dropped", FLAT_REPLY?.orientation, "upright")

const BLOCK_REPLY = parseReading(
  '{"orientation":"body upright, margin note at ~25°","blocks":[' +
    '{"role":"body","angle":0,"box":{"x":0.35,"y":0.05,"w":0.6,"h":0.9},"text":"Body text."},' +
    '{"role":"margin","angle":25,"box":{"x":0.02,"y":0.1,"w":0.3,"h":0.2},"text":"a note"}],' +
    '"uncertain":[],"illegibleShare":"some"}'
)
check("a block reply parses its blocks", BLOCK_REPLY?.blocks?.length, 2)
check("  the flat text is the blocks' flattening, body first", BLOCK_REPLY?.text, "Body text.\na note")
check("  the note's angle survives", BLOCK_REPLY?.blocks?.[1]?.angle, 25)

// Percentages are the same answer in a dialect; pixels are unrecoverable.
const PERCENT_BOX = parseReading('{"blocks":[{"role":"margin","angle":0,"box":{"x":10,"y":20,"w":30,"h":15},"text":"note"}]}')
check("a percentage box is read as fractions", PERCENT_BOX?.blocks?.[0]?.box, { x: 0.1, y: 0.2, w: 0.3, h: 0.15 })
const PIXEL_BOX = parseReading('{"blocks":[{"role":"margin","angle":0,"box":{"x":140,"y":300,"w":420,"h":80},"text":"note"}]}')
check("a pixel box is dropped, never guessed at", PIXEL_BOX?.blocks?.[0]?.box, null)
check("  without dropping the block's text", PIXEL_BOX?.blocks?.[0]?.text, "note")

// A cut-off block reply: every finished block's text is salvaged, and the
// reading is marked truncated so the vote excludes it.
const TRUNCATED = parseReading('{"orientation":"upright","blocks":[{"role":"body","angle":0,"box":null,"text":"First block."},{"role":"margin","angle":20,"box":null,"text":"second blo')
check("a truncated block reply salvages every text it holds", TRUNCATED?.text, "First block.\nsecond blo")
check("  and is marked truncated", TRUNCATED?.truncated, true)

console.log("\nre-anchoring — carrying a highlight across a repaired page")

// The case that makes whitespace-insensitivity necessary rather than merely
// convenient: `Selection.toString()` renders pdf.js's end-of-line <br> as a
// newline, while the offsets index `textContent`, where it contributes nothing.
// Compared literally these match 12 of this library's 23 highlights; ignoring
// whitespace, all 23.
const PAGE = "Historicallyandtraditionally,it has been the task of the science disciplines."
const QUOTED = "Historically\nand\ntraditionally,\nit has been"
const FOUND = locateQuote(PAGE, QUOTED)
check("a quote whose newlines the page does not have is still found", FOUND.found, true)
check(
  "  and the span it returns is the real one",
  FOUND.found ? PAGE.slice(FOUND.startOffset, FOUND.endOffset) : null,
  "Historicallyandtraditionally,it has been"
)

check(
  "a passage that is simply absent is not placed",
  locateQuote(PAGE, "nothing of the sort appears here"),
  { found: false, why: "missing" }
)

// Ambiguity refuses rather than guesses: marking the wrong one of two identical
// sentences is worse than a highlight that visibly needs attention.
check(
  "a passage appearing twice is refused, not guessed at",
  locateQuote("the same words. and then the same words.", "the same words"),
  { found: false, why: "ambiguous" }
)

check("an empty quote anchors to nothing", locateQuote(PAGE, "   ").found, false)

const PLAN = planReanchor(
  [
    // Untouched page, still exactly where it was.
    { id: "a", content: "has been the task", pageNumber: 1, startOffset: 32, endOffset: 49 },
    // Repaired page: the passage moved, but is findable.
    { id: "b", content: "the task of the science", pageNumber: 2, startOffset: 0, endOffset: 5 },
    // Repaired page: the transcription does not contain it.
    { id: "c", content: "a sentence nobody transcribed", pageNumber: 2, startOffset: 0, endOffset: 5 },
  ],
  new Map([
    [1, PAGE],
    [2, PAGE],
  ]),
  [2]
)
check("a highlight that did not move is left alone", PLAN.unchanged, 1)
check("a highlight that moved is given its new span", PLAN.moves.length, 1)
check("  pointing at the passage it quoted", PAGE.slice(PLAN.moves[0]?.startOffset ?? 0, PLAN.moves[0]?.endOffset ?? 0), "the task of the science")
check("a highlight that cannot be placed is reported, not dropped", PLAN.lost.length, 1)
check("  and names the page it was on", PLAN.lost[0]?.pageNumber, 2)

console.log(
  failures === 0 ? "\n[check-scoring] all assertions passed\n" : `\n[check-scoring] ${failures} FAILED\n`
)
process.exit(failures === 0 ? 0 : 1)
