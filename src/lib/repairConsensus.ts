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
  const majority = readerCount === 1 ? 2 : Math.floor(readerCount / 2) + 1

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
