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
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
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

const QUIET: GuideSignals = { readingOpened: false, capturing: false, kitCopied: false }

console.log("\npractice guide — a beat ticks only when the student did it")

// --- the beats themselves ---
assert(GUIDE_STEPS.length === 8, "eight beats — the moves the work requires, and nothing optional", `got ${GUIDE_STEPS.length}`)
{
  const keys = GUIDE_STEPS.map((s) => s.key)
  assert(new Set(keys).size === keys.length, "each beat has its own key", keys.join(", "))
  assert(
    GUIDE_STEPS.every((s) => s.say.trim() !== "" && s.why.trim() !== ""),
    "every beat says what to do AND why it matters",
    "a beat is missing one of the two"
  )
  assert(
    GUIDE_STEPS.every((s) => s.overlay === "mask" || s.overlay === "none"),
    "every beat declares how the backdrop behaves",
    "a beat has no overlay mode"
  )
  assert(
    GUIDE_STEPS[0].station === "library" && GUIDE_STEPS[0].key === "arrive",
    "the guide opens on the shelf, where opening a reading is something you do",
    `first beat is ${GUIDE_STEPS[0].key} at ${GUIDE_STEPS[0].station}`
  )
  assert(
    GUIDE_STEPS.every((s) => s.targets.length > 0 && s.targets.every((t) => t.trim() !== "")),
    "every beat points at something",
    "a beat has an empty target chain"
  )
  // The order is the work's order, and the stations must not go backwards
  // through it — a guide that sends you to 03 and then back to 01 is teaching
  // the tabs, not the practice.
  const rank: Record<string, number> = { library: 0, reading: 1, throw: 2, map: 3, read: 4 }
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
  const base = baselineOf(state)
  const ticked = GUIDE_STEPS.filter((s) => stepDone(s.key, base, state, QUIET))
  assert(
    ticked.length === 0,
    "on arrival NOTHING is ticked — even though the worked cloth is already there",
    `${ticked.map((s) => s.key).join(", ")} ticked before the student did anything`
  )
  assert(
    standOn(base, state, QUIET) === 0,
    "the guide opens on the FIRST beat — the shelf, before anything is open",
    `stood on ${standOn(base, state, QUIET)}`
  )
  // Re-opening half way through should land where the work got to.
  const midway: LoomState = {
    ...state,
    passages: [...state.passages, passage("p5", ["c9"])],
    concepts: [...state.concepts, concept("c9")],
  }
  const midwaySignals = { ...QUIET, readingOpened: true }
  assert(
    standOn(base, midway, midwaySignals) === 3,
    "…but a student who has already opened, captured and named finds it at the next move",
    `stood on ${standOn(base, midway, midwaySignals)}`
  )
  assert(
    stepDone("arrive", base, state, { ...QUIET, readingOpened: true }),
    "opening the reading ticks the first beat",
    "the shelf card did not tick the beat that asks for it"
  )
}

// --- each beat ticks for its own gesture, and only its own ---
{
  const state = worked()
  const base = baselineOf(state)

  // Highlight: the capture dialog opening IS the gesture — it cannot open
  // without a selection, and the same dialog also does the naming, so waiting
  // for a passage would leave this beat unfinished until the next one is.
  assert(
    stepDone("capture", base, state, { ...QUIET, capturing: true }),
    "highlighting ticks when the capture dialog opens",
    "opening the dialog did not tick the highlight beat"
  )
  assert(
    !stepDone("name", base, state, { ...QUIET, capturing: true }),
    "…and opening it does NOT tick the naming beat",
    "the naming beat ticked on an unfinished capture"
  )
  // CANCELLING the dialog un-ticks it. It used to latch: cancel left the beat
  // green and the guide advanced to one about a field that no longer existed.
  assert(
    !stepDone("capture", base, state, QUIET),
    "…and cancelling the dialog un-ticks it — nothing was captured",
    "the highlight beat stayed green after a cancelled capture"
  )

  const captured: LoomState = {
    ...state,
    passages: [...state.passages, passage("p5", ["c9"])],
    concepts: [...state.concepts, concept("c9")],
  }
  assert(stepDone("name", base, captured, QUIET), "naming ticks when the passage and its concept land", "no tick")
  // REUSING a concept is the pedagogically right move — the dialog offers a
  // datalist of your own concepts and its copy invites it. Requiring a NEW
  // concept left this beat unfinishable for anyone who took the offer.
  const reused: LoomState = { ...state, passages: [...state.passages, passage("p6", ["c1"])] }
  assert(
    stepDone("name", base, reused, QUIET),
    "…and naming an EXISTING concept ticks it too — reuse is the point",
    "filing a passage under a concept you already own did not tick the beat"
  )
  assert(!stepDone("thread", base, captured, QUIET), "…and threading has not ticked yet", "threading ticked early")

  const threaded: LoomState = { ...state, edges: [...state.edges, edge("e3", "c1", "c3")] }
  assert(stepDone("thread", base, threaded, QUIET), "threading ticks on a new thread", "no tick")

  // Sorting is measured per concept, not by COUNTING tiered concepts — the
  // worked cloth tiers every one, so a count could not move when the student
  // followed the instruction, and DID move when they pressed a lit chip and
  // un-tiered it. The beat went green for undoing the example.
  const retiered: LoomState = { ...state, maps: [map("m1", { c1: "t", c2: "s" })] }
  assert(
    stepDone("sort", base, retiered, QUIET),
    "re-tiering an already-tiered concept ticks — the count would not have moved",
    "changing a concept's tier did not tick the sort beat"
  )
  const newlyTiered: LoomState = { ...state, maps: [map("m1", { c1: "p", c2: "s", c3: "t" })] }
  assert(stepDone("sort", base, newlyTiered, QUIET), "…so does tiering one that had none", "no tick")
  // Sorting and making a projection are separate beats now (TJ, 2026-08-12),
  // so neither may answer for the other: a new projection arrives EMPTY.
  const another: LoomState = { ...state, maps: [...state.maps, map("m2", {})] }
  assert(
    stepDone("project", base, another, QUIET) && !stepDone("sort", base, another, QUIET),
    "a new projection ticks MAKING one, and not sorting it",
    "making a projection was mistaken for sorting it"
  )
  // Arranging is its own gesture — and the only student act the graph does not
  // otherwise record, since red line 7 keeps DERIVED layout out of the
  // database and a drag is not derived.
  const dragged: LoomState = {
    ...state,
    views: { ...state.views, "map:m1": { positions: { c1: { x: 0.4, y: 96 } }, bends: {} } },
  }
  assert(
    stepDone("board", base, dragged, QUIET) && !stepDone("board", base, state, QUIET),
    "moving a card ticks arranging the board, and nothing else does",
    "the board beat did not follow a card"
  )
  // Deleting a concept strips its tier from every map. That is not sorting.
  const deleted: LoomState = {
    ...state,
    concepts: state.concepts.filter((c) => c.id !== "c2"),
    maps: [map("m1", { c1: "p" })],
  }
  assert(
    !stepDone("sort", base, deleted, QUIET),
    "…but deleting a concept is NOT — its tier vanishing is not a sort",
    "deleting a concept ticked the sort beat"
  )

  assert(stepDone("kit", base, state, { ...QUIET, kitCopied: true }), "the kit ticks when it is downloaded", "no tick")
  assert(!stepDone("kit", base, state, QUIET), "…and not before", "the kit ticked untaken")
}

// --- an EMPTY practice loom (the reading could not carry the example) ---
{
  const empty: LoomState = {
    concepts: [], passages: [], edges: [], links: [], maps: [], cloths: [],
    views: { cardTable: { positions: {}, bends: {} } },
  }
  const base = baselineOf(empty)
  const ticked = GUIDE_STEPS.filter((s) => stepDone(s.key, base, empty, QUIET))
  assert(ticked.length === 0, "an empty practice loom ticks nothing either", ticked.map((s) => s.key).join(", "))
  const one: LoomState = { ...empty, passages: [passage("p1", ["c1"])], concepts: [concept("c1")] }
  assert(stepDone("name", base, one, QUIET), "and the first capture still ticks", "no tick on an empty baseline")
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
    /loom:practice-station/.test(workbench) && /loom:practice-focus/.test(workbench),
    "the workbench answers the guide's station and page changes",
    "Workbench ignores loom:practice-station or loom:practice-focus"
  )
  // The guide is mounted by SandboxWorkbench, not Workbench, so that it spans
  // the shelf as well as the stations. That file cannot be reached from a real
  // reading, which is what keeps the guide out of a student's own work.
  const sandbox = readFileSync("src/components/SandboxWorkbench.tsx", "utf8")
  assert(
    /<PracticeGuide \/>/.test(sandbox) && !/<PracticeGuide \/>/.test(workbench),
    "the guide is mounted by the practice loom alone",
    "PracticeGuide is mounted outside SandboxWorkbench — it would coach a student through their real work"
  )
  assert(
    /loom:practice-opened/.test(sandbox),
    "opening the practice reading raises the signal the first beat waits on",
    "SandboxWorkbench no longer dispatches loom:practice-opened"
  )
}

// --- every target actually exists ---
//
// The failure this catches is the one that produced the review: a beat whose
// selector matches nothing renders no ring, and — now that there is a mask —
// would dim the screen with no hole in it. `target !== ""` was the only check
// before, so renaming an id left the guide pointing at nothing, and green.
{
  const sources = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => readFileSync(join("src", f), "utf8"))
    .join("\n")

  const inSources = (selector: string) =>
    // A compound like "#throwBench .form-row" is checked part by part.
    selector.split(/\s+/).every((part) =>
      part.startsWith("#")
        ? sources.includes(`id="${part.slice(1)}"`)
        : sources.includes(part.replace(/^\./, ""))
    )

  for (const step of GUIDE_STEPS) {
    for (const selector of step.targets) {
      assert(
        inSources(selector),
        `${step.key} → ${selector} exists in the app`,
        `nothing in src/ carries ${selector} — the beat would point at nothing, and the mask would dim the screen with no hole`
      )
    }

    // --- and every gesture inside a beat that has several ---
    if (!step.moves) continue
    assert(
      step.moves.length > 1,
      `${step.key} → a walked beat has more than one gesture`,
      "one move is just the beat; drop `moves` instead"
    )
    for (const move of step.moves) {
      assert(
        inSources(move.sel),
        `${step.key} → move "${move.say.slice(0, 24)}…" points at ${move.sel}`,
        `nothing in src/ carries ${move.sel} — the ring would sit on the whole beat instead of the gesture`
      )
    }
    assert(
      step.moves.slice(0, -1).every((m) => typeof m.done === "function"),
      `${step.key} → every gesture but the last says when it is finished`,
      "a move with no `done` swallows the ones after it — the ring would stop there for ever"
    )
    assert(
      step.moves[step.moves.length - 1].done === undefined,
      `${step.key} → the last gesture has no \`done\``,
      "nothing follows it; the beat's own predicate is what finishes the beat"
    )
  }
}

// --- a coupling `tests/sandbox.spec.ts` depends on ---
//
// That spec measures `.guideglow` and treats it as the CUTOUT: it checks the
// centre is live DOM and then overshoots past its edge to prove a drag can
// leave the hole. Since the ring walks the gestures of a beat that has
// `moves`, the two are only the same rect on a beat that has none. Give the
// capture beat moves and that spec starts measuring the ring, silently.
{
  const capture = GUIDE_STEPS.find((s) => s.key === "capture")
  assert(
    !!capture && !capture.moves,
    "the capture beat has no walked gestures — sandbox.spec reads .guideglow as the cutout",
    "give it `moves` and that spec measures the ring instead of the hole, and still passes"
  )
}

// --- the mask cannot eat what it is pointing at ---
{
  const css = readFileSync("src/app/globals.css", "utf8")
  const rung = (name: string) => {
    const rule = css.match(new RegExp(`${name.replace(".", "\.")}\{[^}]*\}`))
    const found = rule?.[0].match(/z-index:(\d+)/)
    return found ? Number(found[1]) : NaN
  }
  const mask = rung(".guidemask")
  const pop = rung(".guidepop")
  const scrim = rung(".info-scrim")
  // The in-app fullscreen (`.pdf-shell.fullscreen`, toggled by `f`) is gone
  // (2026-08-15): the reading station strips Loom's chrome itself, so there
  // is no takeover left for the mask to outrank — and no assertion to keep.
  // If a fullscreen mode ever returns, restore the rung-above-it check here.
  assert(
    !readFileSync("src/components/pdf/PdfViewer.tsx", "utf8").includes(".pdf-shell.fullscreen {"),
    "no in-app fullscreen stands under the guide",
    "PdfViewer grew a `.pdf-shell.fullscreen` rule back — restore the mask-above-fullscreen z-index assertion beside this one"
  )
  assert(
    mask < scrim && pop < scrim,
    "…and below the app's own modal scrim, which is its own constraint",
    `mask ${mask} / popover ${pop} vs scrim ${scrim}`
  )
  assert(
    /\.gpane\{[^}]*pointer-events:auto/.test(css),
    "the mask panes block by geometry",
    "a pane that takes no pointer events constrains nothing"
  )
  // The "you are in the guide" notice used to sit at 898, under the panes, so
  // the mask dimmed it and a cutout edge ran straight through the sentence.
  const band = rung(".practiceband")
  assert(
    band > mask && band > pop,
    "the guide's own notice rides above its mask",
    `band ${band} vs mask ${mask} / popover ${pop} — the mask would slice it`
  )
  assert(
    /\.practiceband\{[^}]*pointer-events:none/.test(css),
    "…and eats nothing, sitting that high over a live cutout",
    "fixed chrome above the mask with pointer events is an invisible click-eater"
  )
  // …with exactly one exception, which has to be an exception or it is a
  // picture of a button inside pointer-events:none chrome.
  assert(
    /\.practiceband \.bandexit\{[^}]*pointer-events:auto/.test(css),
    "the way out of the guide is pressable",
    "`.bandexit` inherits the band's pointer-events:none and cannot be clicked"
  )
  assert(
    !/\.practiceband\.yielded\{[^}]*opacity:/.test(css),
    "yielding fades the band's PROSE, never the whole band",
    "fading the band fades the exit with it — an escape hatch at 16% is worse than the occlusion"
  )
  assert(
    readFileSync("src/components/SandboxWorkbench.tsx", "utf8").includes('className="btn ghost mini bandexit"'),
    "the band carries the exit",
    "nothing else on /sandbox says the guide is a place you can leave"
  )
  assert(
    /\.guideglow\{[^}]*pointer-events:none/.test(css),
    "the ring never takes a click",
    "a tutorial that swallows the button it just told you to press is worse than no tutorial"
  )
  assert(
    !/\.gpane\{[^}]*box-shadow/.test(css),
    "the hole is empty DOM, not a box-shadow spread",
    "a box-shadow spread is not hit-tested: it would block the cutout and leak everything else"
  )
}

// --- the dialog beat suppresses the mask ---
{
  const modal = readFileSync("src/components/pdf/CaptureModal.tsx", "utf8")
  for (const step of GUIDE_STEPS) {
    const inDialog = step.targets.some((t) => t.startsWith("#") && modal.includes(`id="${t.slice(1)}"`))
    if (!inDialog) continue
    assert(
      step.overlay === "none",
      `${step.key} does not double-dim the capture dialog`,
      `${step.key} points inside .info-scrim and still asks for a mask`
    )
  }
  assert(
    /loom:capture-close/.test(modal),
    "the capture dialog says when it CLOSES",
    "CaptureModal no longer dispatches loom:capture-close — cancelling would leave the highlight beat ticked"
  )
}

console.log(`\n${checks} checks, ${failures} failing\n`)
if (failures > 0) process.exit(1)
