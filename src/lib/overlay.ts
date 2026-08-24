// Overlays — the arithmetic and the shapes behind the read-only cohort
// comparisons (docs/loom-model-build.md §2 "Overlays"; refactor spec P3.14,
// ruling 28).
//
// Everything here is counting over other people's rows: intervals merged by a
// sweep line, labels grouped by the string somebody typed. No model is
// anywhere near it (red line #1), and nothing scores, ranks or advises — a
// count is a fact about the marks, never a judgment of them (red line #3).
//
// The types live here rather than beside the actions because a `"use server"`
// module may only export async functions; the client imports the shapes from
// this file and the two functions from `src/actions/overlays.ts`.
//
// Kept pure so `scripts/check-overlay.ts` can assert it without a database.

/** The comparison set. There is no third band: "me + colleague" is not in v1. */
/**
 * Who the heat is OF.
 *
 * `student` joined section and cohort on 2026-08-22 (TJ, asking for a student
 * picker on the Heatmaps tab). It is the one band that resolves to a person,
 * which the other two are built never to do — see the ruling note at the top
 * of src/actions/overlays.ts.
 */
export type OverlayBand = "section" | "cohort" | "student"

/**
 * Why an overlay is showing nothing. Every one of these is a state the UI
 * names out loud: an empty overlay that does not say why reads as a bug, and
 * "code this reading yourself first" is the whole point of the gate.
 */
export type OverlayBlock =
  | "signed-out"
  | "not-enrolled"
  /**
   * Overlays are a FACULTY and ADMIN capability (TJ, 2026-08-08). Students do
   * not see them at all — they reach the rest of the workspace, not this.
   * Faculty get here through their own learner surfaces, which they hold
   * alongside the faculty view.
   */
  | "not-staff"
  /** The old student gate: you had not captured a passage in this reading yet.
   *  Retired with the student overlays, kept so a stored/typed value still
   *  renders a sentence rather than falling through the switch. */
  | "not-coded"
  | "no-section"
  | "no-peers"

/** One run of text and how many people marked it. Half-open: [start, end). */
export type HeatSpan = { start: number; end: number; count: number }

export type Interval = { start: number; end: number }

/**
 * ONE PERSON'S OWN CAPTURES, UNIONED into disjoint runs.
 *
 * `heatSpans` below counts INTERVALS, not people — it never sees a userId. So
 * the count means "how many students marked these words" only if each student
 * arrives as at most one interval over any character, and nothing stops a
 * student capturing overlapping text twice: `passage` carries no uniqueness
 * constraint on offsets and the capture path has no overlap guard.
 *
 * It was happening. Measured on the dev database 2026-08-23: 11 runs drew a
 * count higher than the number of people who marked them — The Mathematical
 * Theory of Communication p4 drew 5 where 3 students marked, and four other
 * readings drew 4 where 2 did. The legend prints that number with the word
 * "students" beside it, so the page was making a false claim, two steps too
 * dark, about how much a cohort agreed.
 *
 * TJ settled the semantics on 2026-08-23: "it is how many students
 * highlighted a passage. so 1 is a valid bincount."
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const clean = intervals
    .map(({ start, end }) => ({
      start: Math.max(0, Math.floor(Math.min(start, end))),
      end: Math.max(0, Math.ceil(Math.max(start, end))),
    }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const merged: Interval[] = []
  for (const run of clean) {
    const last = merged[merged.length - 1]
    // TOUCHING COUNTS AS ONE. Two captures that meet exactly at a boundary
    // (`last.end === run.start`) are one continuous run of text for this
    // person; left separate they open and close at the same offset, which the
    // sweep reads as a depth of one either side and never double-counts — but
    // it does emit a boundary, and a page of them is a payload that grows with
    // one person's habits rather than with what the cohort marked.
    if (last && run.start <= last.end) last.end = Math.max(last.end, run.end)
    else merged.push({ ...run })
  }
  return merged
}

/**
 * Disjoint runs carrying their overlap depth, from arbitrarily overlapping
 * captures. A sweep line: every capture opens at its start and closes at its
 * end, and the depth between two consecutive boundaries is how many INTERVALS
 * cover the characters in between.
 *
 * Intervals, not people — this function never sees a userId. Callers that want
 * a count of people must pass each person through `mergeIntervals` first; see
 * `getPassagesOverlay`, which is the only caller that draws a scale from it.
 *
 * Offsets index characters, so a run is whole characters: a fractional or
 * reversed pair is repaired to the widest sensible run rather than dropped —
 * the capture happened, and silently losing it would undercount the page.
 */
export function heatSpans(intervals: Interval[]): HeatSpan[] {
  const delta = new Map<number, number>()
  const bump = (at: number, by: number) => delta.set(at, (delta.get(at) ?? 0) + by)

  intervals.forEach(({ start, end }) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return
    const lo = Math.max(0, Math.floor(Math.min(start, end)))
    const hi = Math.max(0, Math.ceil(Math.max(start, end)))
    if (hi <= lo) return
    bump(lo, 1)
    bump(hi, -1)
  })

  const positions = [...delta.keys()].sort((a, b) => a - b)
  const spans: HeatSpan[] = []
  let depth = 0

  positions.forEach((at, i) => {
    depth += delta.get(at)!
    const next = positions[i + 1]
    if (next === undefined || depth === 0) return
    const last = spans[spans.length - 1]
    // Coalesce equal depths across a boundary. Without this, a page where
    // eleven people marked exactly the same sentence emits a span per
    // boundary — the same shade painted twice, and a payload that grows with
    // agreement rather than with the amount of marked text.
    if (last && last.end === at && last.count === depth) last.end = next
    else spans.push({ start: at, end: next, count: depth })
  })

  return spans
}

/** The comparison key for a label: the same words, however they were typed. */
export function overlayKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ")
}

export type OverlayTerm = {
  /** The most common surface form; ties broken by code point, so it is stable. */
  label: string
  /** How many DIFFERENT people used it — the unit an overlay reports in. */
  count: number
  /** Distinct descriptions people wrote for it, in the order they were written. */
  descriptions: string[]
  /** Descriptions past the ones returned. Surfaced, never silently dropped. */
  moreDescriptions: number
}

export type TermRow = { userId: string; label: string; description?: string | null }

export type GroupTermsOptions = {
  maxTerms?: number
  maxDescriptions?: number
  maxDescriptionChars?: number
}

/**
 * Labels grouped by the words in them, counted by person.
 *
 * Grouping by the normalized string is the honest limit of this view and the
 * UI says so: two people who typed the same words count as two, and nothing
 * here decides whether they meant the same thing. Homonyms (ruling 36) are
 * legal, so the same label genuinely can be two ideas — merging them into one
 * row would be the tool deciding what a student meant (red line #2), which is
 * why the count is of the WORD and the copy names it as such.
 *
 * Descriptions keep the caller's order (capture order at every call site here)
 * rather than being sorted by length: "longest first" would quietly reward
 * verbosity, which is a judgment.
 */
export function groupTerms(
  rows: TermRow[],
  { maxTerms = 40, maxDescriptions = 3, maxDescriptionChars = 240 }: GroupTermsOptions = {}
): { terms: OverlayTerm[]; moreTerms: number } {
  type Group = {
    key: string
    users: Set<string>
    forms: Map<string, number>
    descriptions: Map<string, string>
  }
  const groups = new Map<string, Group>()

  rows.forEach((row) => {
    const label = (row.label ?? "").trim()
    if (!label) return
    const key = overlayKey(label)
    let group = groups.get(key)
    if (!group) {
      group = { key, users: new Set(), forms: new Map(), descriptions: new Map() }
      groups.set(key, group)
    }
    group.users.add(row.userId)
    group.forms.set(label, (group.forms.get(label) ?? 0) + 1)

    const description = (row.description ?? "").trim()
    if (!description) return
    const descriptionKey = overlayKey(description)
    if (group.descriptions.has(descriptionKey)) return
    group.descriptions.set(
      descriptionKey,
      description.length > maxDescriptionChars
        ? `${description.slice(0, maxDescriptionChars - 1).trimEnd()}…`
        : description
    )
  })

  const terms: OverlayTerm[] = [...groups.values()]
    .map((group) => {
      // Code-point order, not localeCompare, for the tie-break: this decides
      // which spelling of the same words gets shown, and it must not change
      // with the collation the server happens to run under.
      const forms = [...group.forms.entries()].sort(
        (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
      )
      const descriptions = [...group.descriptions.values()]
      return {
        label: forms[0][0],
        count: group.users.size,
        descriptions: descriptions.slice(0, maxDescriptions),
        moreDescriptions: Math.max(0, descriptions.length - maxDescriptions),
      }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return { terms: terms.slice(0, maxTerms), moreTerms: Math.max(0, terms.length - maxTerms) }
}

/** One page of the Passages Overlay. */
export type PageHeat = {
  pageNumber: number
  /** Peer passages on this page, anchored or not. */
  count: number
  /**
   * The canonical page-text hash the spans were measured against. The client
   * shades only when its own rendered text layer hashes the same — the trust
   * rule PdfViewer already applies to the student's own anchors, applied to
   * marks it cannot fall back to fuzzy-matching because it never receives
   * their text.
   */
  contentHash: string
  spans: HeatSpan[]
}

export type PassagesOverlay = {
  band: OverlayBand
  blocked: OverlayBlock | null
  /** People in the band, excluding you and excluding faculty. */
  peers: number
  /** How many of them captured a passage in this reading. */
  contributors: number
  /** Their passages in this reading, in total. */
  passages: number
  pages: PageHeat[]
  /** Passages that count but cannot shade — no anchor, or a drifted page. */
  unanchored: number
  /** Spans dropped by the payload budget. Reported, never a silent cap. */
  droppedSpans: number
  /**
   * The densest run in the whole reading — how many people marked the same
   * words where most did. The top of the shading scale, and the reason the
   * scale cannot saturate: shades are this reading's own range, not an
   * absolute clamp that paints 5 people and 60 identically. Measured over
   * every span, including any the budget then dropped, so the scale does not
   * shift with the payload.
   */
  maxCount: number
}

export type VocabularyOverlay = {
  band: OverlayBand
  blocked: OverlayBlock | null
  peers: number
  /** Peers with at least one concept evidenced in the compared readings. */
  contributors: number
  /** How many readings the comparison covers — the ones you have coded. */
  readings: number
  concepts: OverlayTerm[]
  moreConcepts: number
  links: OverlayTerm[]
  moreLinks: number
  /** Their links with no label yet: visible as a count, not filtered away. */
  unlabeledLinks: number
}

export const emptyPassagesOverlay = (
  band: OverlayBand,
  blocked: OverlayBlock | null
): PassagesOverlay => ({
  band,
  blocked,
  peers: 0,
  contributors: 0,
  passages: 0,
  pages: [],
  unanchored: 0,
  droppedSpans: 0,
  maxCount: 0,
})

export const emptyVocabularyOverlay = (
  band: OverlayBand,
  blocked: OverlayBlock | null
): VocabularyOverlay => ({
  band,
  blocked,
  peers: 0,
  contributors: 0,
  readings: 0,
  concepts: [],
  moreConcepts: 0,
  links: [],
  moreLinks: 0,
  unlabeledLinks: 0,
})

/** The sentence under an overlay that is showing nothing, in the student's terms. */
export function overlayBlockMessage(block: OverlayBlock, band: OverlayBand): string {
  // "that section", not "your section": since the Overlays became a faculty
  // capability the viewer PICKS a section, and rarely their own (TJ, 2026-08-08).
  const set = band === "section" ? "that section" : "the cohort"
  switch (block) {
    case "signed-out":
      return "Sign in to compare."
    case "not-enrolled":
      return "An overlay compares you with a course you are enrolled in."
    case "not-staff":
      return "Overlays are part of the faculty view."
    case "not-coded":
      return "Your marks first — capture a passage here and the overlay opens."
    case "no-section":
      return "You are not placed in a discussion section yet. Try the cohort."
    case "no-peers":
      return `Nobody else is in ${set} yet.`
  }
}
