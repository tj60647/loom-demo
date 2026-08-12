// The guide the practice loom walks a student through.
//
// TJ, 2026-08-11: *"the guide should walk through opening a reading,
// highlighting text, labeling a concept, building a thread, sorting the
// knowledge graph, making a projection, and saving materials for a concept
// map"* — and, on the last one, *"by saving i meant the kit."*
//
// Those are the beats below, with one correction the interface forced.
// Highlighting and labeling are NOT two gestures: `CaptureModal` disables its
// Save button until a concept is named (`CaptureModal.tsx`), so a passage
// captured from the PDF always arrives labelled. Teaching them as two separate
// acts would describe an app that does not exist. They are kept as two beats
// because they are two decisions — which words to take, and what to call what
// they evidence — but the second happens in the dialog the first opened, and
// the guide says so.
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
   * What the beat is talking about (TJ, 2026-08-11: "the guide beats should
   * have pointers to what they are talking about, not vague directional
   * references"). A CSS selector the guide rings with a glow, and the copy
   * says "here" instead of "on the left" — which is wrong on a narrow screen
   * anyway. First match wins; a beat whose target is not on the page yet
   * simply has no ring until it appears.
   */
  target: string
  /** The instruction, in the second person, naming the control. */
  say: string
  /** One line on why the move matters — the teaching, not the mechanics. */
  why: string
  /**
   * True when a beat is a place to look rather than a move to make. These
   * advance on Next; everything else advances when the student acts.
   */
  readOnly?: boolean
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
    target: "#practiceOpen",
    say:
      "Press the glowing card. In the practice loom only this reading opens; on your own shelf every card does.",
    why: "A reading is the unit of work: one text, the passages you take from it, and what you make of them, all kept together.",
  },
  {
    key: "capture",
    label: "Highlight a passage",
    station: "reading",
    target: ".react-pdf__Page__textContent",
    needsText: true,
    say:
      "Drag across a line or two of the glowing text. When you let go, a “Capture as Passage” button appears at your cursor — press it.",
    why: "Choosing which words to take is itself the reading. The judgement is yours, and it is the work.",
  },
  {
    key: "name",
    label: "Name the concept",
    station: "reading",
    target: "#captureConcept",
    needsText: true,
    say:
      "Name the concept those words evidence in the glowing field — a short noun phrase, often the author's own term. Then Save Passage.",
    why: "The passage is the evidence; the concept is what you claim it is evidence OF. Naming it is the interpretation.",
  },
  {
    key: "cloth",
    label: "Say what you make of it",
    station: "reading",
    target: "#yourwork-toggle",
    say:
      "Open Your work here. At the head of the sheet, give the cloth a title: your own headline for this reading, not the author's.",
    why: "The cloth is your reading of the text as a whole. Everything else you make here is an arrangement of it.",
  },
  {
    key: "thread",
    label: "Throw a thread",
    station: "throw",
    target: "#warp",
    say:
      "Tap two concepts in the glowing warp, then say how they hang together and throw it. Long and awkward is fine.",
    why: "The sentence IS the thread. A label is a convenience that lets one of your words recur; the claim is the sentence.",
  },
  {
    key: "sort",
    label: "Sort and project",
    station: "map",
    target: "#triageList",
    say:
      "Give a concept a tier in the glowing list. That makes your first projection — name it, write its one-line, and arrange its board.",
    why: "A projection is one reading of your cloth. Keep several and each can say something different about the same material.",
  },
  {
    key: "kit",
    label: "Take the kit",
    station: "map",
    target: "#mapKit",
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
  tiered: number
  clothTitle: string
}

/** Concepts carrying a tier, across every projection — the signal that a
 *  student has sorted something, whichever projection they sorted it on. */
function tieredCount(state: LoomState): number {
  const ids = new Set<string>()
  for (const map of state.maps) {
    for (const [conceptId, tier] of Object.entries(map.tiers)) {
      if (tier) ids.add(conceptId)
    }
  }
  return ids.size
}

export function baselineOf(state: LoomState, scopeKey: string): GuideBaseline {
  return {
    passages: state.passages.length,
    concepts: state.concepts.length,
    edges: state.edges.length,
    maps: state.maps.length,
    tiered: tieredCount(state),
    clothTitle: state.cloths.find((c) => c.scopeKey === scopeKey)?.title ?? "",
  }
}

/** Signals the loom's state cannot carry, raised by the interface itself. */
export type GuideSignals = {
  /** The practice reading has been opened from the shelf. */
  readingOpened: boolean
  /** The capture dialog has been opened at least once. */
  captureOpened: boolean
  /** The concept-map kit has been downloaded. */
  kitCopied: boolean
}

/**
 * Has this beat been performed? Read-only beats are never "done" here — the
 * caller advances those on Next, because there is nothing to detect and
 * pretending otherwise would tick a step nobody took.
 */
export function stepDone(
  key: string,
  base: GuideBaseline,
  state: LoomState,
  scopeKey: string,
  signals: GuideSignals
): boolean {
  switch (key) {
    case "arrive":
      return signals.readingOpened
    case "capture":
      // The dialog opening IS the highlight — it only appears from a
      // selection. Counting passages here would leave this beat unfinished
      // until the NEXT one is done, since one dialog does both.
      return signals.captureOpened || state.passages.length > base.passages
    case "name":
      return state.passages.length > base.passages && state.concepts.length > base.concepts
    case "cloth": {
      const title = state.cloths.find((c) => c.scopeKey === scopeKey)?.title ?? ""
      return title.trim() !== base.clothTitle.trim() && title.trim() !== ""
    }
    case "thread":
      return state.edges.length > base.edges
    case "sort":
      return state.maps.length > base.maps || tieredCount(state) !== base.tiered
    case "kit":
      return signals.kitCopied
    default:
      return false
  }
}

/**
 * Where the guide should be standing.
 *
 * Nothing done yet means the beginning — beat 1, the arrival, which is a
 * read-only beat and therefore never "done". Asking only for the first UNDONE
 * beat skips it every time, which is how the guide opened on step 2 and never
 * said where the student was.
 *
 * Once anything has been done, stand on the first move still outstanding: a
 * student re-opening the guide half way through should find it where they
 * left off, not back at the start.
 */
export function standOn(
  base: GuideBaseline,
  state: LoomState,
  scopeKey: string,
  signals: GuideSignals
): number {
  const undone = (s: GuideStep) => !s.readOnly && !stepDone(s.key, base, state, scopeKey, signals)
  const anyDone = GUIDE_STEPS.some((s) => !s.readOnly && !undone(s))
  if (!anyDone) return 0
  const at = GUIDE_STEPS.findIndex(undone)
  return at === -1 ? GUIDE_STEPS.length - 1 : at
}
