/**
 * What several independent readings of the same crop agree on.
 *
 * This was originally done by asking a model to compare the readings. It
 * returned a paragraph *describing* their agreement — "All four readers agree
 * the region is upright and is a photographic reproduction of a broadsheet…" —
 * which was duly written into a PDF's text layer, where it dropped the damage
 * score from 34.4% to 0.3% because commentary is fluent English. The gate
 * designed to catch garbage passed prose with nothing to do with the page.
 *
 * So agreement is computed here instead, mechanically. It cannot invent a
 * sentence, cannot summarise, and cannot be fluent — the only strings it can
 * emit are ones a reader actually wrote.
 *
 * MAJORITY, NOT UNANIMITY. Requiring every reader to agree sounds safer and is
 * not: agreement then falls monotonically as readers are added, so a bigger
 * panel produces *less* agreed text and more review work, and one weak reader
 * can veto a passage the other four read identically. Measured on a real
 * region, unanimity gave 65% agreement at four readers and 42% at five. A
 * majority uses the extra reader as evidence instead of as a veto — which is
 * the whole reason to have a panel — and the losing readings are still shown,
 * so nothing is hidden by being outvoted.
 *
 * The unit is a sentence. Readers differ constantly in whitespace, hyphenation
 * across line breaks and where they place a column break; they rarely differ
 * about a whole sentence unless they genuinely read it differently.
 */

/** Sentences shorter than this are fragments — headings, bylines, page numbers. */
const MIN_SENTENCE_CHARS = 12

export type ReaderText = { reader: number; text: string }

export type BlockRole = "body" | "margin" | "caption" | "label"

/**
 * One visually distinct run of text on a block-mode page, as a reader reported
 * it. The page's body is a block like any other; what makes the format worth
 * having is everything that is NOT body — the hand-lettered note angled across
 * a margin, the label inside a diagram — which a single text stream can only
 * record by splicing it into the middle of a sentence it does not belong to.
 */
export type TranscriptBlock = {
  role: BlockRole
  /** Degrees counterclockwise from horizontal, as the text appears on the page. */
  angle: number
  /**
   * Bounding box as fractions of the crop image the reader saw, origin at the
   * image's top-left. Fractions rather than pixels because every provider
   * resizes the image before the model reads it, so pixel coordinates would be
   * against a raster the reader never measured. Null when the reader gave none.
   */
  box: { x: number; y: number; w: number; h: number } | null
  text: string
}

/**
 * The one flat string a set of blocks stands for — body first, then the rest.
 *
 * This order is load-bearing, in three places that must agree exactly: a
 * reading's stored `text` is this flattening of its blocks, the consensus's
 * `agreedText` is this flattening of its agreed blocks, and the apply writes
 * blocks into the content stream in this order. The first two let acceptance
 * recover which blocks an accepted text stands for by string equality; the
 * third is why a copied paragraph never has a margin note spliced into it.
 */
export function flattenBlocks(blocks: TranscriptBlock[]) {
  const body = blocks.filter((block) => block.role === "body")
  const rest = blocks.filter((block) => block.role !== "body")
  return [...body, ...rest]
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n")
}

export type ReaderVoteStat = {
  reader: number
  /** Sentences this reader produced that a majority backed. */
  withMajority: number
  /** Sentences this reader produced that no majority backed. */
  outvoted: number
  /** Of those, ones NO other reader produced at all. */
  solo: number
  /** Share of this reader's sentences that carried the majority. */
  agreementRate: number
}

export type ConsensusVotes = {
  readers: number
  /** Backing needed to carry a sentence. */
  majority: number
  /** Distinct sentences seen across all readers. */
  distinctSentences: number
  /** How many sentences got exactly N votes; index is the vote count. */
  distribution: number[]
  /** Per reader — who carries the panel and who drifts. */
  perReader: ReaderVoteStat[]
}

/**
 * Backing a sentence needs to carry, given how many readers answered.
 *
 * A single reading is not agreement — one model's confident transcription is
 * precisely what the vote exists to avoid trusting — so it is asked for a
 * majority it cannot reach, and reported as wholly disputed rather than carried.
 */
export function requiredMajority(readerCount: number) {
  return readerCount === 1 ? 2 : Math.floor(readerCount / 2) + 1
}

/** How the vote is decided, for the panel's settings dialog. */
export function consensusSettings() {
  return {
    /** What a majority means at each panel size a run can actually end up with. */
    majorityBySize: [2, 3, 4, 5].map((readers) => ({
      readers,
      needed: requiredMajority(readers),
    })),
    decidedBy:
      "Exact match on the sentence's words, so `religions` and `televisions` never merge into one vote.",
    groupedBy:
      "Fuzzy similarity, so a reviewer sees both variants of a disputed passage together.",
    truncatedReadersExcluded:
      "A reader that ran out of room mid-transcription is recorded but kept out of the vote: it stopped early rather than disagreeing, and counting its silence as dissent would send a reviewer to passages nobody read differently.",
  }
}

export type Consensus = {
  /** Sentences a majority backed, in reading order. */
  agreedText: string
  /** Sentences no majority backed, with every reading of them. */
  disagreements: { passage: string; readings: string[] }[]
  /** Share of distinct sentences that carried a majority. */
  agreementRate: number
  votes: ConsensusVotes
}

/**
 * Split into sentences AFTER flattening the layout, not before.
 *
 * Readers place line and column breaks wherever they read them, and a document
 * set in newspaper columns gives them plenty of scope to differ. Splitting the
 * raw text meant one reader's "…said Krug-\nman stressed…" became different
 * sentences from another's "…said Krugman stressed…", and the comparison then
 * reported a disagreement about a word neither of them had misread. Measured on
 * one real page, that inflated disputes to 61 and dropped apparent agreement to
 * 42%. So the line breaks come out first — hyphenated ones joined, the rest
 * turned into spaces — and only then is the text cut into sentences.
 */
function sentencesOf(text: string) {
  const flattened = text
    .replace(/-\s*\n\s*/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")

  return flattened
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= MIN_SENTENCE_CHARS)
}

/**
 * A sentence reduced to the words it is made of, so that differences of
 * FORMATTING vanish and differences of WORDING do not. Readers legitimately
 * disagree about a hyphen joined across a line break or a curly quote
 * straightened; they do not legitimately disagree about a word.
 */
function normalisedWords(sentence: string) {
  return sentence
    .toLowerCase()
    .replace(/-\s+/g, "")
    .replace(/[’']/g, "'")
    .split(/[^a-z0-9']+/)
    .filter(Boolean)
}

/**
 * The key two readings share when they read the same sentence.
 *
 * Exact, after normalisation. An earlier version allowed 85% word overlap on
 * the theory that readers differ in small ways — but a one-word difference in
 * ten is 90% similar and IS the failure this exists to catch: three readers
 * wrote "from Sadda" and a fourth completed it to "from Saddam"; two wrote
 * "absurd religions" and "absurd televisions". The tolerance lives in the
 * normalisation, where it can only forgive things that are not words.
 */
function sentenceKey(sentence: string) {
  return normalisedWords(sentence).join(" ")
}

/**
 * Are these two contested readings variants of the SAME passage?
 *
 * Deliberately loose, and deliberately used only here. Deciding a vote is
 * exact — that is what stops "religions" and "televisions" being merged into
 * agreement. But once a passage has FAILED to carry, those two variants are the
 * same disputed sentence read two ways, and a reviewer needs them side by side
 * rather than as two unrelated one-vote entries. Strict where it decides, loose
 * where it only presents.
 */
function sameDisputedPassage(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return false
  const other = new Set(b)
  const shared = a.filter((word) => other.has(word)).length
  const overlap = shared / Math.max(a.length, b.length)
  return overlap >= 0.6
}

export function computeConsensus(readings: ReaderText[]): Consensus {
  const present = readings.filter((reading) => reading.text.trim().length > 0)
  const readerCount = present.length

  const empty: Consensus = {
    agreedText: "",
    disagreements: [],
    agreementRate: 0,
    votes: {
      readers: readerCount,
      majority: 0,
      distinctSentences: 0,
      distribution: [],
      perReader: [],
    },
  }
  if (readerCount === 0) return empty

  // A single reading is not agreement. One model's confident transcription is
  // precisely what the vote exists to avoid trusting, so it is reported as
  // wholly disputed rather than carried.
  const majority = requiredMajority(readerCount)

  const perReaderSentences = present.map((reading) => ({
    reader: reading.reader,
    sentences: sentencesOf(reading.text),
  }))

  // Cluster by normalised key. Each cluster records which READERS backed it —
  // a reader repeating itself is one voice, not several.
  type Cluster = { key: string; backers: Set<number>; wordings: Map<number, string>; firstSeenAt: number }
  const clusters = new Map<string, Cluster>()
  let order = 0

  for (const { reader, sentences } of perReaderSentences) {
    for (const sentence of sentences) {
      const key = sentenceKey(sentence)
      if (!key) continue
      let cluster = clusters.get(key)
      if (!cluster) {
        cluster = { key, backers: new Set(), wordings: new Map(), firstSeenAt: order++ }
        clusters.set(key, cluster)
      }
      cluster.backers.add(reader)
      if (!cluster.wordings.has(reader)) cluster.wordings.set(reader, sentence)
    }
  }

  const all = [...clusters.values()]
  const carried = all.filter((cluster) => cluster.backers.size >= majority)
  const contested = all.filter((cluster) => cluster.backers.size < majority)

  // Reading order comes from whichever reader backed the most carried
  // sentences: its ordering is the one best supported by the panel, and using a
  // real reader's sequence means the output is never assembled into an order
  // nobody read.
  const spine = perReaderSentences
    .map((entry) => ({
      reader: entry.reader,
      backing: entry.sentences.filter((sentence) => {
        const cluster = clusters.get(sentenceKey(sentence))
        return cluster ? cluster.backers.size >= majority : false
      }).length,
    }))
    .sort((a, b) => b.backing - a.backing)[0]

  const spineSentences =
    perReaderSentences.find((entry) => entry.reader === spine?.reader)?.sentences ?? []

  const ordered: string[] = []
  const used = new Set<string>()
  for (const sentence of spineSentences) {
    const key = sentenceKey(sentence)
    const cluster = clusters.get(key)
    if (!cluster || cluster.backers.size < majority || used.has(key)) continue
    used.add(key)
    // The spine reader's own wording, verbatim — never a merge of several.
    ordered.push(sentence)
  }
  // Carried sentences the spine reader did not have still belong in the output.
  for (const cluster of carried.sort((a, b) => a.firstSeenAt - b.firstSeenAt)) {
    if (used.has(cluster.key)) continue
    used.add(cluster.key)
    ordered.push([...cluster.wordings.values()][0])
  }

  const distribution = new Array(readerCount + 1).fill(0)
  for (const cluster of all) distribution[cluster.backers.size] += 1

  const perReader: ReaderVoteStat[] = perReaderSentences.map(({ reader, sentences }) => {
    const keys = [...new Set(sentences.map(sentenceKey).filter(Boolean))]
    let withMajority = 0
    let solo = 0
    for (const key of keys) {
      const cluster = clusters.get(key)
      if (!cluster) continue
      if (cluster.backers.size >= majority) withMajority += 1
      else if (cluster.backers.size === 1) solo += 1
    }
    return {
      reader,
      withMajority,
      outvoted: keys.length - withMajority,
      solo,
      agreementRate: keys.length > 0 ? withMajority / keys.length : 0,
    }
  })

  // Group the losers into one entry per disputed passage, so a reviewer sees
  // the variants together instead of hunting for their counterparts.
  const disputedGroups: { words: string[]; members: Cluster[] }[] = []
  for (const cluster of [...contested].sort((a, b) => a.firstSeenAt - b.firstSeenAt)) {
    const words = cluster.key.split(" ")
    const existing = disputedGroups.find((group) => sameDisputedPassage(group.words, words))
    if (existing) existing.members.push(cluster)
    else disputedGroups.push({ words, members: [cluster] })
  }

  return {
    agreedText: ordered.join("\n"),
    disagreements: disputedGroups.map((group) => ({
      passage: [...group.members[0].wordings.values()][0].slice(0, 160),
      readings: group.members.flatMap((cluster) =>
        [...cluster.wordings.entries()].map(([reader, wording]) => `Reader ${reader}: ${wording}`)
      ),
    })),
    agreementRate: all.length > 0 ? carried.length / all.length : 0,
    votes: {
      readers: readerCount,
      majority,
      distinctSentences: all.length,
      distribution,
      perReader,
    },
  }
}

export type ReaderBlocks = {
  reader: number
  /** The reading's flat text — flattenBlocks(blocks) when blocks were given. */
  text: string
  /** Null when this reader answered in the old single-stream format. */
  blocks: TranscriptBlock[] | null
}

export type BlockConsensus = Consensus & {
  /**
   * The carried blocks: one body block holding the sentence-voted body text,
   * then every non-body block a majority backed, each carrying the box and
   * angle of the reader whose wording carried it. `agreedText` is always
   * flattenBlocks of this list — see flattenBlocks for why that identity is
   * load-bearing.
   */
  agreedBlocks: TranscriptBlock[]
}

/**
 * Overlap of two note boxes, as a share of the smaller. The smaller rather
 * than the union (IoU) because readers disagree generously about how much
 * whitespace a note owns — one draws the words, another the whole margin —
 * and a tight box entirely inside a loose one is the same note, not a 30%
 * match.
 */
function boxOverlap(a: NonNullable<TranscriptBlock["box"]>, b: NonNullable<TranscriptBlock["box"]>) {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return 0
  const smaller = Math.min(a.w * a.h, b.w * b.h)
  return smaller > 0 ? (width * height) / smaller : 0
}

/**
 * Are two blocks carrying the SAME WORDS one note, or two?
 *
 * Only asked of blocks whose normalised words are identical, so it is not a
 * similarity test — it is the duplicate question: a page that says "see p.12"
 * in two margins has two notes, and one reader reporting both must not have
 * them collapsed into a single doubly-backed one. Boxes that miss each other
 * are that case; a missing box cannot rule anything out and defers.
 */
function sameNotePlace(a: TranscriptBlock, b: TranscriptBlock) {
  if (!a.box || !b.box) return true
  return boxOverlap(a.box, b.box) >= 0.4
}

/**
 * Consensus over a block-mode page: the body voted sentence by sentence
 * exactly as computeConsensus does, and each note voted as its own question.
 *
 * The separation is the point. In a single stream, a margin note lands inside
 * whatever body sentence the reader was mid-way through, so two readers who
 * agree on every word of the body and merely place a note differently produce
 * different sentences — and the vote reads their agreement as dispute. Voting
 * notes beside the body instead of inside it means a contested "cf. p.12" is
 * one disagreement about one note, and the body it was written next to still
 * carries.
 *
 * A reader that answered in the old single-stream format still votes: its
 * whole text is treated as body, which is exactly what its format asserts. It
 * backs no notes, which is also what it asserts.
 *
 * Notes are decided like sentences: exact match on normalised words, majority
 * of the full panel. The `votes` record covers BOTH — a page can legitimately
 * have no body at all (a concept map is labels and nothing else), and a votes
 * record built from the body alone would report zero readers on a page five
 * readers agreed about, which reads downstream as a panel that never answered.
 */
export function computeBlockConsensus(readings: ReaderBlocks[]): BlockConsensus {
  const present = readings.filter(
    (reading) => reading.text.trim().length > 0 || (reading.blocks?.length ?? 0) > 0
  )

  const bodyConsensus = computeConsensus(
    present.map((reading) => ({
      reader: reading.reader,
      text: reading.blocks
        ? reading.blocks
            .filter((block) => block.role === "body")
            .map((block) => block.text)
            .join("\n")
        : reading.text,
    }))
  )

  const majority = requiredMajority(present.length)

  /**
   * Every distinct note wording, with the readers who wrote it — the note-level
   * counterpart of the sentence clusters, and keyed the same way: role plus
   * exact normalised words.
   *
   * Keyed rather than clustered by similarity, and that is the whole design.
   * An earlier version grouped SIMILAR notes greedily, first-match in reader
   * order, then voted inside each group — which made the outcome depend on the
   * order readers happened to emit their blocks. Measured on the case that
   * breaks it: a diagram labelled "hidden layer 1" and "hidden layer 2" (0.67
   * word overlap, disjoint boxes), read identically by four readers, two of
   * whom listed the second label first. Each group ended up holding two of
   * each label, no wording reached 3 of 4, and BOTH unanimously-read labels
   * vanished while two disagreements were invented. Keying by the wording that
   * decides the vote cannot do that: a note carries iff a majority of the
   * panel wrote those exact words, whatever order anyone listed them in.
   */
  type NoteCandidate = { role: BlockRole; key: string; members: { reader: number; block: TranscriptBlock }[] }
  const candidates: NoteCandidate[] = []
  for (const reading of present) {
    for (const block of reading.blocks ?? []) {
      if (block.role === "body" || !block.text.trim()) continue
      const key = normalisedWords(block.text).join(" ")
      if (!key) continue
      // Same words, same role, same PLACE — a page carrying "see p.12" in two
      // margins has two notes, and one reader reporting both must not be read
      // as two readers agreeing on one. One voice per reader per candidate.
      const candidate = candidates.find(
        (existing) =>
          existing.role === block.role &&
          existing.key === key &&
          existing.members.every((member) => member.reader !== reading.reader) &&
          existing.members.every((member) => sameNotePlace(member.block, block))
      )
      if (candidate) candidate.members.push({ reader: reading.reader, block })
      else candidates.push({ role: block.role, key, members: [{ reader: reading.reader, block }] })
    }
  }

  const agreedNotes: TranscriptBlock[] = []
  const contestedNotes: NoteCandidate[] = []
  for (const candidate of candidates) {
    if (candidate.members.length >= majority) {
      // The lowest-numbered backer's block, verbatim — wording, box and angle
      // from one reader who actually wrote it, never a merge or an average.
      const representative = [...candidate.members].sort((a, b) => a.reader - b.reader)[0]
      agreedNotes.push(representative.block)
    } else {
      contestedNotes.push(candidate)
    }
  }

  /**
   * The losing wordings, grouped so a reviewer sees the variants of one note
   * together — loose where it only presents, exactly as the sentence vote is.
   * Strictness lives in the vote above, which has already been decided.
   */
  const noteDisagreements: Consensus["disagreements"] = []
  const groupedContested: NoteCandidate[][] = []
  for (const candidate of contestedNotes) {
    const words = candidate.key.split(" ")
    const group = groupedContested.find(
      (existing) =>
        existing[0].role === candidate.role &&
        sameDisputedPassage(existing[0].key.split(" "), words)
    )
    if (group) group.push(candidate)
    else groupedContested.push([candidate])
  }
  for (const group of groupedContested) {
    noteDisagreements.push({
      passage: `[${group[0].role}] ${group[0].members[0].block.text.slice(0, 160)}`,
      readings: group.flatMap((candidate) =>
        candidate.members.map((member) => `Reader ${member.reader}: ${member.block.text}`)
      ),
    })
  }

  /**
   * The agreed body block's geometry: the union of the body boxes of whichever
   * reader backed the most carried body sentences would be ideal, but the body
   * text is voted ACROSS readers and no longer corresponds to one reader's
   * boxes line by line. The union of every block-reporting reader's body boxes
   * is honest at the only resolution placement uses it for — keeping body
   * glyphs over the body columns and out of the margins.
   */
  let bodyBox: TranscriptBlock["box"] = null
  for (const reading of present) {
    for (const block of reading.blocks ?? []) {
      if (block.role !== "body" || !block.box) continue
      bodyBox = bodyBox
        ? {
            x: Math.min(bodyBox.x, block.box.x),
            y: Math.min(bodyBox.y, block.box.y),
            w: Math.max(bodyBox.x + bodyBox.w, block.box.x + block.box.w) - Math.min(bodyBox.x, block.box.x),
            h: Math.max(bodyBox.y + bodyBox.h, block.box.y + block.box.h) - Math.min(bodyBox.y, block.box.y),
          }
        : { ...block.box }
    }
  }

  const agreedBlocks: TranscriptBlock[] = [
    ...(bodyConsensus.agreedText.trim()
      ? [{ role: "body" as const, angle: 0, box: bodyBox, text: bodyConsensus.agreedText }]
      : []),
    ...agreedNotes,
  ]

  /**
   * The vote record, over the whole panel and both units.
   *
   * `readers` counts who answered, not who wrote body text — a concept map is
   * labels and nothing else, and reporting zero readers on a page five readers
   * agreed about is read downstream as a panel that never ran (reprocess-
   * library's strongConsensus refuses anything under three complete readers,
   * so such a page would be held for a person forever, unanimity and all).
   * Each note counts as one more voted unit, so distinctSentences, the backing
   * distribution and each reader's agreement rate describe everything the
   * panel actually decided here.
   */
  const noteStats = new Map<number, { withMajority: number; total: number; solo: number }>()
  const statOf = (reader: number) => {
    let stat = noteStats.get(reader)
    if (!stat) {
      stat = { withMajority: 0, total: 0, solo: 0 }
      noteStats.set(reader, stat)
    }
    return stat
  }
  const distribution = [...bodyConsensus.votes.distribution]
  while (distribution.length < present.length + 1) distribution.push(0)
  for (const candidate of candidates) {
    distribution[candidate.members.length] += 1
    for (const member of candidate.members) {
      const stat = statOf(member.reader)
      stat.total += 1
      if (candidate.members.length >= majority) stat.withMajority += 1
      else if (candidate.members.length === 1) stat.solo += 1
    }
  }

  const perReader: ReaderVoteStat[] = present.map((reading) => {
    const body = bodyConsensus.votes.perReader.find((stat) => stat.reader === reading.reader)
    const notes = noteStats.get(reading.reader) ?? { withMajority: 0, total: 0, solo: 0 }
    const withMajority = (body?.withMajority ?? 0) + notes.withMajority
    const total = (body ? body.withMajority + body.outvoted : 0) + notes.total
    return {
      reader: reading.reader,
      withMajority,
      outvoted: total - withMajority,
      solo: (body?.solo ?? 0) + notes.solo,
      agreementRate: total > 0 ? withMajority / total : 0,
    }
  })

  // Carried body sentences, recovered from the rate the body vote reported
  // over its own distinct count — both integers, so this is exact.
  const bodyDistinct = bodyConsensus.votes.distinctSentences
  const bodyCarried = Math.round(bodyConsensus.agreementRate * bodyDistinct)
  const allUnits = bodyDistinct + candidates.length

  return {
    ...bodyConsensus,
    agreedText: flattenBlocks(agreedBlocks),
    disagreements: [...bodyConsensus.disagreements, ...noteDisagreements],
    agreedBlocks,
    agreementRate: allUnits > 0 ? (bodyCarried + agreedNotes.length) / allUnits : 0,
    votes: {
      readers: present.length,
      majority,
      distinctSentences: allUnits,
      distribution,
      perReader,
    },
  }
}
