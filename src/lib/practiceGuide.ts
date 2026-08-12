// The guide the practice loom walks a student through.
//
// TJ, 2026-08-11: *"the guide should walk through opening a reading,
// highlighting text, labeling a concept, building a thread, sorting the
// knowledge graph, making a projection, and saving materials for a concept
// map"* — and, on the last one, *"by saving i meant the kit."*
//
// Those are the beats below, with three corrections TJ made on 2026-08-12.
//
// Highlighting and labeling are kept as two beats because they are two
// decisions — which words to take, and what to call what they evidence — but
// they are not two screens: the second happens in the dialog the first opened,
// and the guide says so. Nor is the second compulsory. A passage may be kept
// with no concept at all ("i believe a passage does not require a concept"),
// so the beat asks for a name and says it can wait.
//
// Making a projection and sorting it are separate beats. Folded together, the
// guide asked for a press and then measured a tier, and the new projection
// arrives EMPTY on purpose so every chip pressed after it is a real press.
//
// Arranging the board is a beat of its own ("there needs to be a organize the
// board step"). Nothing else in the guide asked for the gesture that is most
// of the thinking.
//
// The cloth beat — say what you make of it — was removed: "it is a nice to
// have in a cloth not a must have."
//
// WHY THE BEATS ARE PREDICATES, NOT A SLIDESHOW. Every step knows how to tell
// whether the student has actually done it, from the loom's own state. A
// tutorial that advances on "Next" teaches the reading of instructions; one
// that advances when a passage appears teaches the gesture. It also means the
// guide cannot lie: it never ticks a step the student did not perform.
//
// Measured against a BASELINE taken when the guide starts, because the
// practice loom already holds a worked cloth (src/lib/practiceCloth.ts). The
// question is never "are there passages" — there are four — it is "is there
// one more than when you began".

import type { LoomState } from "./types"

/**
 * Where a beat happens. `library` is the practice loom's first stage — the
 * shelf, before a reading is open; the rest match Workbench's `Tab`.
 */
export type GuideStation = "library" | "reading" | "throw" | "map" | "read"

export type GuideStep = {
  key: string
  /** Short label for the rail. */
  label: string
  /** The tab this beat happens on; the guide moves there when it opens. */
  station: GuideStation
  /**
   * What the beat is talking about, in the order it is talked about — a chain
   * of CSS selectors, not one (TJ, 2026-08-12: several beats "seem out of
   * sync with the activities they describe", and the reason is that a beat
   * like the cloth is four gestures at four different controls). The guide
   * points at the first link still on screen, so the ring walks the move as
   * the student makes it.
   *
   * First match wins per selector. A link that is not on the page yet is
   * skipped — the capture dialog does not exist until it is opened.
   */
  targets: string[]
  /** The instruction, in the second person, naming the control. */
  say: string
  /** One line on why the move matters — the teaching, not the mechanics. */
  why: string
  /**
   * How the backdrop behaves. "mask" dims everything but the target — the
   * standard coach-mark constraint. "none" is for a beat whose target already
   * lives inside the app's own modal scrim: dimming twice just darkens the
   * dialog, and the dialog is already the constraint.
   */
  overlay: "mask" | "none"
  /**
   * Move on the instant this beat completes, rather than waiting for the
   * primary to be pressed.
   *
   * One beat wants it and only one: highlighting is finished by the capture
   * dialog OPENING, and the next beat is about that same dialog. Making the
   * student press "next" inside a modal that has just taken the screen is a
   * hand-off asked for twice. This is deliberately not the old blanket
   * auto-advance, which re-armed on any state change and threw you forward
   * again whenever you pressed Back.
   */
  handOff?: boolean
  /**
   * True when the beat is about the words on the page, so the viewer must be
   * showing a page that HAS words. `Oh, the Places You'll Go!` opens on two
   * covers, where "drag across a line or two" points at a picture.
   */
  needsText?: boolean
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    key: "arrive",
    label: "Open a reading",
    station: "library",
    targets: ["#practiceOpen"],
    overlay: "mask",
    say:
      "Press the glowing card. In the practice loom only this reading opens; on your own shelf every card does.",
    why: "A reading is the unit of work: one text, the passages you take from it, and what you make of them, all kept together.",
  },
  {
    key: "capture",
    label: "Highlight a passage",
    station: "reading",
    // The whole stage, not `.react-pdf__Page__textContent`: a two-page spread
    // has one text layer PER PAGE and `querySelector` takes the first, so a
    // cutout on the layer would light one page and dim the other — and a drag
    // across the spread would start lit and end in the dark.
    targets: [".pdf-stage", "#captureNow"],
    overlay: "mask",
    handOff: true,
    needsText: true,
    say:
      "Drag across a line or two of the text. When you let go, a “Capture as Passage” button appears at your cursor — press it.",
    why: "Choosing which words to take is itself the reading. The judgement is yours, and it is the work.",
  },
  {
    key: "name",
    label: "Keep it, and name it",
    station: "reading",
    targets: ["#captureConcept", "#capturePassageNote", "#capturePassageSave"],
    // The dialog brings its own scrim; a second one just darkens it twice.
    overlay: "none",
    needsText: true,
    say:
      "Name the concept those words evidence — or leave it blank and keep the passage unlabeled. Add a note if you want one. Then save.",
    why: "The passage is the evidence; the concept is what you claim it is evidence OF. Keeping the words and naming them are two acts, and the second can wait.",
  },
  {
    key: "thread",
    label: "Throw a thread",
    station: "throw",
    targets: ["#warp", "#throwBench", "#throwIt"],
    overlay: "mask",
    say:
      "Tap two concepts in the warp. The bench wakes: say how they hang together — long and awkward is fine — and throw it.",
    why: "The sentence IS the thread. A label is a convenience that lets one of your words recur; the claim is the sentence.",
  },
  {
    key: "project",
    label: "Make a projection",
    station: "map",
    targets: ["#newMap"],
    overlay: "mask",
    say: "Press + New projection. It arrives empty — an unsorted reading of the same cloth.",
    why: "A projection is one reading of your cloth. Keep several and each can say something different about the same material.",
  },
  {
    key: "sort",
    label: "Sort into tiers",
    station: "map",
    targets: ["#triageList"],
    overlay: "mask",
    say:
      "Give the concepts tiers — primary for what this projection hangs on, then secondary and tertiary. Sorted concepts land on the board below.",
    why: "The tiers are the claim about what matters here. Nothing is ranked for you, and another projection may rank them differently.",
  },
  {
    key: "board",
    label: "Arrange the board",
    station: "map",
    targets: ["#tableWrap"],
    overlay: "mask",
    say: "Drag the cards into an arrangement you can read — general above, specific below. The threads you threw are drawn for you.",
    why: "Arranging by hand is the thinking. Novak and Gowin used cards on a table; this is that, and the map you draw afterwards comes from it.",
  },
  {
    key: "kit",
    label: "Take the kit",
    station: "map",
    targets: ["#mapKit"],
    overlay: "mask",
    say:
      "Press the glowing button. It downloads your concepts, their threads and your tiers as a file.",
    why: "Arranging by hand is where the thinking happens — on paper, or in Figma. The kit is the material you do it with.",
  },
]

/** What the loom held when the guide began. Every test below is relative. */
export type GuideBaseline = {
  passages: number
  concepts: number
  edges: number
  maps: number
  /** Tier per concept, so a CHANGE is detectable — a count is not. */
  tiers: Record<string, string>
  /** Card positions per board, so a drag is detectable. */
  boards: Record<string, string>
}

/**
 * Every concept's tier, across every projection, keyed `mapId|conceptId`.
 *
 * A COUNT was the bug behind TJ's loudest "out of sync" (2026-08-12): the
 * worked cloth tiers every concept, so pressing a tier chip could not change
 * how many were tiered. Following the instruction did nothing, and pressing a
 * concept's CURRENT tier un-tiered it — which did change the count, so the
 * beat went green for undoing the example.
 */
function tiersOf(state: LoomState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const map of state.maps) {
    for (const [conceptId, tier] of Object.entries(map.tiers)) {
      if (tier) out[`${map.id}|${conceptId}`] = tier
    }
  }
  return out
}

/**
 * Did the student re-tier something? Compared over the keys BOTH sides have,
 * so deleting a concept — which strips its tier from every map — is not
 * mistaken for sorting.
 */
function reTiered(base: GuideBaseline, state: LoomState): boolean {
  const now = tiersOf(state)
  for (const key of Object.keys(base.tiers)) {
    if (key in now && now[key] !== base.tiers[key]) return true
  }
  // A tier where there was none is sorting too.
  return Object.keys(now).some((key) => !(key in base.tiers))
}

/** Every card's place on every board, keyed `viewKey|conceptId`. */
function boardsOf(state: LoomState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, view] of Object.entries(state.views)) {
    for (const [conceptId, at] of Object.entries(view.positions ?? {})) {
      out[`${key}|${conceptId}`] = `${at.x.toFixed(3)},${at.y.toFixed(1)}`
    }
  }
  return out
}

/** Has a card been moved, or newly placed? Positions are the only student
 *  gesture the graph does not otherwise record (red line 7 keeps derived
 *  layout out of the database; a DRAG is not derived). */
function movedACard(base: GuideBaseline, state: LoomState): boolean {
  const now = boardsOf(state)
  return Object.keys(now).some((key) => now[key] !== base.boards[key])
}

export function baselineOf(state: LoomState): GuideBaseline {
  return {
    passages: state.passages.length,
    concepts: state.concepts.length,
    edges: state.edges.length,
    maps: state.maps.length,
    tiers: tiersOf(state),
    boards: boardsOf(state),
  }
}

/** Signals the loom's state cannot carry, raised by the interface itself. */
export type GuideSignals = {
  /** The practice reading has been opened from the shelf. */
  readingOpened: boolean
  /**
   * The capture dialog is open RIGHT NOW. Not a latch: it used to be, and
   * cancelling the dialog left the highlight beat ticked and the guide
   * advanced to a beat about a field that no longer existed.
   */
  capturing: boolean
  /** The concept-map kit has been downloaded. */
  kitCopied: boolean
}

/**
 * Has this beat been performed?
 *
 * Every one of these is measured against the baseline frozen when the guide
 * began, because the practice loom opens holding a worked cloth: the question
 * is never "are there passages" but "is there one more than when you began".
 */
export function stepDone(
  key: string,
  base: GuideBaseline,
  state: LoomState,
  signals: GuideSignals
): boolean {
  switch (key) {
    case "arrive":
      return signals.readingOpened
    case "capture":
      // Opening the dialog IS the highlight — it cannot open without a
      // selection. Cancelling closes it again and the beat un-ticks, which is
      // the truth: nothing was captured.
      return signals.capturing || state.passages.length > base.passages
    case "name":
      // A PASSAGE landing, not a new concept. The dialog offers a datalist of
      // concepts you already own and its own copy invites reuse — so naming
      // an existing concept is the pedagogically right move, and it used to
      // leave this beat unfinished for ever.
      return state.passages.length > base.passages
    case "thread":
      return state.edges.length > base.edges
    case "project":
      return state.maps.length > base.maps
    case "sort":
      return reTiered(base, state)
    case "board":
      return movedACard(base, state)
    case "kit":
      return signals.kitCopied
    default:
      return false
  }
}

/**
 * Where the guide should be standing.
 *
 * The first move still outstanding — which, on arrival, is the first beat.
 * Every beat is a move now (TJ, 2026-08-12: the old first beat described
 * where you already were, "and the conflict is confusing"), so there is no
 * read-only case to skip past.
 */
export function standOn(
  base: GuideBaseline,
  state: LoomState,
  signals: GuideSignals
): number {
  const at = GUIDE_STEPS.findIndex((s) => !stepDone(s.key, base, state, signals))
  return at === -1 ? GUIDE_STEPS.length - 1 : at
}
