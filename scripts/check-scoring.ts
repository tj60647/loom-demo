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
import { computeConsensus } from "../src/lib/repairConsensus"

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

console.log(
  failures === 0 ? "\n[check-scoring] all assertions passed\n" : `\n[check-scoring] ${failures} FAILED\n`
)
process.exit(failures === 0 ? 0 : 1)
