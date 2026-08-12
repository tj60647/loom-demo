// The worked cloth the practice loom opens with.
//
// TJ, 2026-08-11: *"the guide should always be available, like the tutorials
// in any game. if the sandbox is the guide, then it should be clearly
// accessible. it is the instructions, right? … the current guide/sandbox is
// not so helpful without the guide part. include a worked example … lets use
// Oh, the Places You'll Go!"*
//
// So the practice loom stops being an empty reading you cannot save and
// becomes a finished cloth you can take apart: four passages already
// captured, three concepts named, two threads thrown — one labelled, one left
// as a description — a Link with its own gloss, and a projection with tiers.
// A student sees what the end of the work looks like before doing any of it,
// and every gesture still works on top of it. Nothing is written anywhere; a
// refresh puts the example back exactly as it was, which is also the undo.
//
// WHY IT IS BUILT FROM THE READING'S OWN PAGES. The deleted worked example
// carried its own invented quotations. Here the passages are REAL substrings
// of this PDF's text layer, found at their true offsets, so they highlight in
// the actual text — the practice loom's whole argument is that the capture
// path is the genuine one, and a passage that did not come out of the page in
// front of you would teach the wrong thing about what a passage IS.
//
// WHY IT DEGRADES RATHER THAN THROWS. The offsets come from OCR'd page text
// that can change when a reading is re-ingested, and the practice loom must
// open on whatever reading the course actually has. Every quotation that
// cannot be found is simply dropped, along with anything left dangling; if
// too little survives, the caller gets null and the sandbox opens empty, the
// way it did before. A tutorial that 500s is worse than a tutorial that is
// briefly thin.

import { textLayerProjection } from "./pdfText"
import type { Concept, Edge, Link, LoomMap, LoomState, Passage, Tier } from "./types"

/** One page of stored text, as `source_page` holds it. */
export type PracticePage = {
  pageNumber: number
  textContent: string
  contentHash: string
}

/**
 * The example, written against *Oh, the Places You'll Go!* — quotations first,
 * because everything else hangs off what can actually be found in the text.
 *
 * Each `quote` must be an exact substring of some page's text-layer
 * projection. They were chosen for two things: they are clean of OCR damage
 * (this scan mangles many of its "You"s), and they carry an idea worth naming
 * rather than a line worth admiring.
 */
const QUOTES: {
  key: string
  quote: string
  /** Concept keys this passage evidences. Empty = an Unlabeled Passage. */
  concepts: string[]
  note?: string
}[] = [
  {
    key: "steer",
    quote: "You're on your own. And you know what you know.",
    concepts: ["agency"],
    note: "The whole book turns on this line — the going is yours to direct.",
  },
  {
    key: "slump",
    quote: "And when you're in a Slump,",
    concepts: ["stuckness"],
  },
  {
    key: "waiting",
    quote: "headed, I fear, toward a most useless place.",
    concepts: ["stuckness", "waiting"],
    note: "Useless is the judgement, and it is the narrator's, not mine.",
  },
  {
    key: "onward",
    quote: "But on you will go",
    concepts: [],
    note: "Captured before I knew what to call it. An unlabeled passage is a legal capture — you can name it later, or never.",
  },
]

const CONCEPTS: { key: string; label: string; def: string }[] = [
  {
    key: "agency",
    label: "steering yourself",
    def: "Choosing a direction rather than being carried in one. The book keeps handing the decision back to the reader.",
  },
  {
    key: "stuckness",
    label: "the Slump",
    def: "Being stopped, and finding that being stopped is its own condition rather than a pause in the going.",
  },
  {
    key: "waiting",
    label: "the Waiting Place",
    def: "Stuckness turned into a destination — a place people arrive at and stay, waiting for something outside themselves to move.",
  },
]

const THREADS: { from: string; to: string; sentence: string; label?: string }[] = [
  {
    from: "stuckness",
    to: "waiting",
    sentence:
      "A Slump you sit in long enough becomes the Waiting Place: the same stopping, but now with an address.",
    label: "hardens into",
  },
  {
    from: "agency",
    to: "waiting",
    // Deliberately unlabelled — the second state of a thread, and the one the
    // coin-time row on 02 exists for.
    sentence:
      "The book's answer to waiting is not a plan or a rescue. It is simply going, which is the same steering it opened with.",
  },
]

const LINK_GLOSS = "the first, left alone, sets into the second"

const CLOTH_TITLE = "Going, stopping, and going again"
const CLOTH_READ =
  "Seuss writes the going as a decision you keep making, then spends the middle of the book on everything that stops it. The Slump and the Waiting Place are the same stopping at two magnifications — one an accident, one an address — and the answer offered to both is not a plan but movement itself."

const PROJECTION_NAME = "What stops the going"
const PROJECTION_ESSENCE = "Getting stuck is a condition, not a pause; the way out is the going itself."

const now = () => new Date()

/** Deterministic ids: the practice loom is remade on every page load, and
 *  stable ids keep React's keys and the board's geometry from churning. */
const id = (kind: string, key: string) => `practice-${kind}-${key}`

/** Locate a quotation in the pages, at the offsets the browser's text layer
 *  will use. Returns null when the text has moved on. */
function findQuote(pages: PracticePage[], quote: string) {
  for (const page of pages) {
    const projected = textLayerProjection(page.textContent)
    const start = projected.indexOf(quote)
    if (start >= 0) {
      return {
        pageNumber: page.pageNumber,
        startOffset: start,
        endOffset: start + quote.length,
        pageContentHash: page.contentHash,
      }
    }
  }
  return null
}

/** How many quotations must survive for the example to be worth showing. */
const MINIMUM_PASSAGES = 2

/**
 * Build the practice cloth, or null when the reading cannot carry it.
 *
 * `sourceLabel` is what a passage cites — the same string a real capture
 * stores, so the cards read the way real ones do.
 */
export function buildPracticeCloth(
  pages: PracticePage[],
  sourceId: string,
  sourceLabel: string
): LoomState | null {
  const at = now()

  const found = QUOTES.map((q) => ({ q, anchor: findQuote(pages, q.quote) })).filter(
    (row): row is { q: (typeof QUOTES)[number]; anchor: NonNullable<ReturnType<typeof findQuote>> } =>
      row.anchor !== null
  )
  if (found.length < MINIMUM_PASSAGES) return null

  // Only concepts something found actually evidences — a concept with no
  // passage is legal in the app, but here it would look like a loose end
  // rather than a designation.
  const evidenced = new Set(found.flatMap((row) => row.q.concepts))
  const concepts: Concept[] = CONCEPTS.filter((c) => evidenced.has(c.key)).map((c) => ({
    id: id("concept", c.key),
    courseId: null,
    userId: "practice",
    label: c.label,
    def: c.def,
    note: "",
    createdAt: at,
  }))
  const conceptIds = new Set(concepts.map((c) => c.id))

  const passages: Passage[] = found.map(({ q, anchor }) => ({
    id: id("passage", q.key),
    courseId: null,
    userId: "practice",
    conceptIds: q.concepts.map((k) => id("concept", k)).filter((cid) => conceptIds.has(cid)),
    source: sourceLabel,
    sourceId,
    location: `p. ${anchor.pageNumber}`,
    content: q.quote,
    pageNumber: anchor.pageNumber,
    startOffset: anchor.startOffset,
    endOffset: anchor.endOffset,
    pageContentHash: anchor.pageContentHash,
    note: q.note ?? "",
    question: "",
    isPullQuote: false,
    tier: "",
    createdAt: at,
  }))

  // A thread needs both ends. Dropping one whose concept did not survive is
  // the same rule the real app enforces, applied here so a thinned example
  // cannot render a thread into nothing.
  const links: Link[] = []
  const edges: Edge[] = []
  for (const t of THREADS) {
    const fromId = id("concept", t.from)
    const toId = id("concept", t.to)
    if (!conceptIds.has(fromId) || !conceptIds.has(toId)) continue
    let linkId: string | null = null
    if (t.label) {
      const existing = links.find((l) => l.label === t.label)
      if (existing) {
        linkId = existing.id
      } else {
        const link: Link = {
          id: id("link", t.label.replace(/\s+/g, "-")),
          courseId: null,
          userId: "practice",
          label: t.label,
          description: LINK_GLOSS,
          createdAt: at,
        }
        links.push(link)
        linkId = link.id
      }
    }
    edges.push({
      id: id("edge", `${t.from}-${t.to}`),
      courseId: null,
      userId: "practice",
      fromId,
      toId,
      handle: t.label ?? "",
      linkId,
      sentence: t.sentence,
      createdAt: at,
    })
  }

  // Tiers, so 03 opens on a sorted list rather than an undifferentiated one.
  const tiers: Record<string, Tier> = {}
  concepts.forEach((c) => {
    tiers[c.id] = c.id === id("concept", "waiting") ? "p" : "s"
  })

  const map: LoomMap = {
    id: id("map", "1"),
    courseId: null,
    userId: "practice",
    scopeKey: sourceId,
    name: PROJECTION_NAME,
    read: CLOTH_READ,
    essence: PROJECTION_ESSENCE,
    tiers,
    createdAt: at,
    updatedAt: at,
  }

  // Board geometry: x is a proportion of the width, y is absolute on the
  // 560px three-band surface — the shape `saveView` stores for a real board.
  const positions: Record<string, { x: number; y: number }> = {}
  const primary = concepts.filter((c) => tiers[c.id] === "p")
  const secondary = concepts.filter((c) => tiers[c.id] !== "p")
  primary.forEach((c, i) => {
    positions[c.id] = { x: (i + 1) / (primary.length + 1), y: 96 }
  })
  secondary.forEach((c, i) => {
    positions[c.id] = { x: (i + 1) / (secondary.length + 1), y: 268 }
  })

  return {
    concepts,
    passages,
    edges,
    links,
    maps: [map],
    cloths: [
      {
        id: id("cloth", "1"),
        courseId: null,
        userId: "practice",
        scopeKey: sourceId,
        title: CLOTH_TITLE,
        description: CLOTH_READ,
        createdAt: at,
        updatedAt: at,
      },
    ],
    views: {
      cardTable: { positions: {}, bends: {} },
      [`map:${map.id}`]: { positions, bends: {}, order: concepts.map((c) => c.id), pins: [] },
    },
  }
}
