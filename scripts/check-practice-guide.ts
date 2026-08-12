/**
 * The guide's beats, asserted without a browser.
 *
 * The guide ticks a step when the student has DONE it, read off the practice
 * loom's own state. Two failures matter and neither looks broken: ticking a
 * beat nobody performed (the tutorial lies, and a student who believes it
 * moves on without the gesture), and never ticking one that was (the tutorial
 * stalls on a step already finished, which reads as the app being broken).
 *
 * The practice loom opens holding a worked cloth, so every test is relative to
 * a baseline. Getting that wrong is the specific bug this file exists for: an
 * absolute test — "are there passages?" — is true the instant the loom loads,
 * and the whole guide would tick itself green before the student touched
 * anything.
 *
 * Run: npx tsx scripts/check-practice-guide.ts   (part of `npm run check`)
 */
import { readFileSync } from "node:fs"
import {
  GUIDE_STEPS,
  baselineOf,
  standOn,
  stepDone,
  type GuideSignals,
} from "../src/lib/practiceGuide"
import type { Cloth, Concept, Edge, LoomMap, LoomState, Passage } from "../src/lib/types"

let failures = 0
let checks = 0

function ok(label: string) {
  checks++
  console.log(`  ok    ${label}`)
}

function fail(label: string, detail: string) {
  checks++
  failures++
  console.log(`  FAIL  ${label}\n        ${detail}`)
}

function assert(condition: boolean, label: string, detail: string) {
  if (condition) ok(label)
  else fail(label, detail)
}

const at = new Date("2026-08-11T12:00:00Z")
const SRC = "reading-1"

const concept = (id: string): Concept => ({
  id, courseId: null, userId: "u", label: id, def: "", note: "", createdAt: at,
})
const passage = (id: string, conceptIds: string[] = []): Passage => ({
  id, courseId: null, userId: "u", conceptIds, source: "S", sourceId: SRC, location: "p. 1",
  content: "text", pageNumber: 1, startOffset: 0, endOffset: 4, pageContentHash: null,
  note: "", question: "", isPullQuote: false, tier: "", createdAt: at,
})
const edge = (id: string, fromId: string, toId: string): Edge => ({
  id, courseId: null, userId: "u", fromId, toId, handle: "", linkId: null, sentence: "s", createdAt: at,
})
const map = (id: string, tiers: LoomMap["tiers"]): LoomMap => ({
  id, courseId: null, userId: "u", scopeKey: SRC, name: id, read: "", essence: "", tiers,
  createdAt: at, updatedAt: at,
})
const cloth = (title: string): Cloth => ({
  id: "cl", courseId: null, userId: "u", scopeKey: SRC, title, description: "", createdAt: at, updatedAt: at,
})

/** The loom as the practice example leaves it — never empty. */
const worked = (): LoomState => ({
  concepts: [concept("c1"), concept("c2"), concept("c3")],
  passages: [passage("p1", ["c1"]), passage("p2", ["c2"]), passage("p3", ["c3"]), passage("p4")],
  edges: [edge("e1", "c1", "c2"), edge("e2", "c2", "c3")],
  links: [],
  maps: [map("m1", { c1: "p", c2: "s" })],
  cloths: [cloth("Going, stopping, and going again")],
  views: { cardTable: { positions: {}, bends: {} } },
})

const QUIET: GuideSignals = { captureOpened: false, kitCopied: false }

console.log("\npractice guide — a beat ticks only when the student did it")

// --- the beats themselves ---
assert(GUIDE_STEPS.length === 7, "seven beats, as ruled", `got ${GUIDE_STEPS.length}`)
{
  const keys = GUIDE_STEPS.map((s) => s.key)
  assert(new Set(keys).size === keys.length, "each beat has its own key", keys.join(", "))
  assert(
    GUIDE_STEPS.every((s) => s.say.trim() !== "" && s.why.trim() !== ""),
    "every beat says what to do AND why it matters",
    "a beat is missing one of the two"
  )
  assert(
    GUIDE_STEPS.filter((s) => s.readOnly).length === 1,
    "exactly one beat is a place to look rather than a move — the arrival",
    `${GUIDE_STEPS.filter((s) => s.readOnly).map((s) => s.key).join(", ")}`
  )
  // The order is the work's order, and the stations must not go backwards
  // through it — a guide that sends you to 03 and then back to 01 is teaching
  // the tabs, not the practice.
  const rank: Record<string, number> = { reading: 0, throw: 1, map: 2, read: 3 }
  const stations = GUIDE_STEPS.map((s) => rank[s.station])
  assert(
    stations.every((r, i) => i === 0 || r >= stations[i - 1]),
    "the beats only ever move forward through the stations",
    stations.join(" → ")
  )
}

// --- nothing is done at the start, on a loom that is already full ---
{
  const state = worked()
  const base = baselineOf(state, SRC)
  const ticked = GUIDE_STEPS.filter((s) => stepDone(s.key, base, state, SRC, QUIET))
  assert(
    ticked.length === 0,
    "on arrival NOTHING is ticked — even though the worked cloth is already there",
    `${ticked.map((s) => s.key).join(", ")} ticked before the student did anything`
  )
  assert(
    standOn(base, state, SRC, QUIET) === 0,
    "the guide opens on the FIRST beat — the arrival is where a student starts, and it can never be 'done'",
    `stood on ${standOn(base, state, SRC, QUIET)}`
  )
  // Re-opening half way through should land where the work got to.
  const midway: LoomState = {
    ...state,
    passages: [...state.passages, passage("p5", ["c9"])],
    concepts: [...state.concepts, concept("c9")],
  }
  assert(
    standOn(base, midway, SRC, { ...QUIET, captureOpened: true }) === 3,
    "…but a student who has already captured and named finds it at the next move",
    `stood on ${standOn(base, midway, SRC, { ...QUIET, captureOpened: true })}`
  )
}

// --- each beat ticks for its own gesture, and only its own ---
{
  const state = worked()
  const base = baselineOf(state, SRC)

  // Highlight: the capture dialog opening IS the gesture — it cannot open
  // without a selection, and the same dialog also does the naming, so waiting
  // for a passage would leave this beat unfinished until the next one is.
  assert(
    stepDone("capture", base, state, SRC, { ...QUIET, captureOpened: true }),
    "highlighting ticks when the capture dialog opens",
    "opening the dialog did not tick the highlight beat"
  )
  assert(
    !stepDone("name", base, state, SRC, { ...QUIET, captureOpened: true }),
    "…and opening it does NOT tick the naming beat",
    "the naming beat ticked on an unfinished capture"
  )

  const captured: LoomState = {
    ...state,
    passages: [...state.passages, passage("p5", ["c9"])],
    concepts: [...state.concepts, concept("c9")],
  }
  assert(stepDone("name", base, captured, SRC, QUIET), "naming ticks when the passage and its concept land", "no tick")
  assert(!stepDone("thread", base, captured, SRC, QUIET), "…and threading has not ticked yet", "threading ticked early")

  const clothed: LoomState = { ...state, cloths: [cloth("My own headline")] }
  assert(stepDone("cloth", base, clothed, SRC, QUIET), "the cloth ticks when its title changes", "no tick")
  assert(
    !stepDone("cloth", base, { ...state, cloths: [cloth("")] }, SRC, QUIET),
    "…and clearing the title is not writing one",
    "an empty title ticked the cloth beat"
  )

  const threaded: LoomState = { ...state, edges: [...state.edges, edge("e3", "c1", "c3")] }
  assert(stepDone("thread", base, threaded, SRC, QUIET), "threading ticks on a new thread", "no tick")

  // Sorting: either a tier moved on the projection that is already there, or a
  // new projection appeared. Both are "you sorted something".
  const retiered: LoomState = { ...state, maps: [map("m1", { c1: "p", c2: "s", c3: "t" })] }
  assert(stepDone("sort", base, retiered, SRC, QUIET), "sorting ticks when a concept gains a tier", "no tick")
  const demoted: LoomState = { ...state, maps: [map("m1", { c1: "p" })] }
  assert(stepDone("sort", base, demoted, SRC, QUIET), "…and when one loses it — un-sorting is sorting", "no tick")
  const another: LoomState = { ...state, maps: [...state.maps, map("m2", {})] }
  assert(stepDone("sort", base, another, SRC, QUIET), "…and when a second projection is made", "no tick")

  assert(stepDone("kit", base, state, SRC, { ...QUIET, kitCopied: true }), "the kit ticks when it is downloaded", "no tick")
  assert(!stepDone("kit", base, state, SRC, QUIET), "…and not before", "the kit ticked untaken")
}

// --- an EMPTY practice loom (the reading could not carry the example) ---
{
  const empty: LoomState = {
    concepts: [], passages: [], edges: [], links: [], maps: [], cloths: [],
    views: { cardTable: { positions: {}, bends: {} } },
  }
  const base = baselineOf(empty, SRC)
  const ticked = GUIDE_STEPS.filter((s) => stepDone(s.key, base, empty, SRC, QUIET))
  assert(ticked.length === 0, "an empty practice loom ticks nothing either", ticked.map((s) => s.key).join(", "))
  const one: LoomState = { ...empty, passages: [passage("p1", ["c1"])], concepts: [concept("c1")] }
  assert(stepDone("name", base, one, SRC, QUIET), "and the first capture still ticks", "no tick on an empty baseline")
}

// --- the interface raises the two signals the state cannot carry ---
{
  const modal = readFileSync("src/components/pdf/CaptureModal.tsx", "utf8")
  assert(
    /loom:capture-open/.test(modal),
    "the capture dialog announces itself",
    "CaptureModal no longer dispatches loom:capture-open — the highlight beat can never tick"
  )
  const mapTab = readFileSync("src/components/tabs/MapTab.tsx", "utf8")
  assert(
    /loom:mapkit-taken/.test(mapTab),
    "downloading the kit announces itself",
    "MapTab no longer dispatches loom:mapkit-taken — the last beat can never tick"
  )
  const workbench = readFileSync("src/components/Workbench.tsx", "utf8")
  assert(
    /loom:practice-station/.test(workbench) && /<PracticeGuide \/>/.test(workbench),
    "the workbench mounts the guide and answers its station changes",
    "Workbench no longer renders PracticeGuide, or ignores loom:practice-station"
  )
  assert(
    /\{practice && <PracticeGuide \/>\}/.test(workbench),
    "…and mounts it ONLY in the practice loom",
    "PracticeGuide is rendered outside the practice loom — it would coach a student through their real work"
  )
}

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
