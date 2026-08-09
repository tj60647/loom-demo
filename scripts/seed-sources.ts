/**
 * Seeds a fresh database with the three course readings: uploads each PDF to
 * Blob storage, registers it as a `sources` row, extracts its canonical per-page
 * text into `sourcePages`, and backfills `sourceId` on any existing `passages` rows
 * that reference it by an old free-text `source` label.
 *
 * The PDFs are read from storage/readings/ but are NOT committed — see
 * storage/readings/.gitkeep. Supply your own copies before running.
 *
 * Usage: npx tsx scripts/seed-sources.ts
 * Requires DATABASE_URL and Blob credentials to be set (via .env.local).
 */
import { readFile } from "fs/promises"
import path from "path"
import { db } from "../src/db"
import { sources, sourcePages, passages } from "../src/db/schema"
import { eq } from "drizzle-orm"
import { extractPdfPageText, textLayerProjection } from "../src/lib/pdfText"
import { hashText } from "../src/lib/hash"
import { readingStorage } from "../src/lib/storage"

const READINGS: {
  /**
   * Stable identity, written to `source.seedKey`. Matching used to be by
   * `title`, which an admin edits: two of these three titles had already drifted
   * to full bibliographic form on one database, and since nothing constrains
   * `title` to be unique the next run would have inserted duplicates rather than
   * failing. A key nobody displays cannot drift.
   */
  seedKey: string
  title: string
  /**
   * Titles this reading is already filed under somewhere, so a row that drifted
   * before `seedKey` existed is adopted rather than duplicated.
   *
   * These are not guesses — they are what the dev and production databases
   * actually hold, after an admin expanded the short seed titles into full
   * bibliographic ones. Adoption writes the key, so each of these matters
   * exactly once per database and never again.
   */
  alsoKnownAs: string[]
  author: string
  sourceReference: string
  description: string
  isDescriptionVisible: boolean
  metadataProvenance: string
  file: string
  legacySourceLabels: string[]
}[] = [
  {
    seedKey: "object-worlds",
    title: "Object Worlds",
    alsoKnownAs: [],
    author: "Bucciarelli — Designing Engineers",
    sourceReference: "Bucciarelli, Louis L. Designing Engineers.",
    description: "Explores how different disciplines inhabit their own \"worlds\" with distinct instruments and languages.",
    isDescriptionVisible: true,
    metadataProvenance: "Manual seed metadata written in scripts/seed-sources.ts.",
    file: "Bucciarelli-Designing Engineers.pdf",
    legacySourceLabels: ["Bucciarelli, Designing Engineers"],
  },
  {
    seedKey: "communities-of-practice",
    title: "Communities of Practice",
    alsoKnownAs: ["Communities of practice and social learning systems: the career of a concept"],
    author: "Wenger",
    sourceReference: "Wenger, Etienne. Communities of Practice.",
    description: "Details how shared vocabularies are learned by participating in a community.",
    isDescriptionVisible: true,
    metadataProvenance: "Manual seed metadata written in scripts/seed-sources.ts.",
    file: "Wenger_communities-of-practice.pdf",
    legacySourceLabels: ["Wenger, Communities of Practice"],
  },
  {
    seedKey: "boundary-objects",
    title: "Boundary Objects",
    alsoKnownAs: ["This is Not a Boundary Object: Reflections on the Origin of a Concept"],
    author: "Star, 2010 — 'This Is Not A Boundary Object'",
    sourceReference: "Star, Susan Leigh. 2010. 'This Is Not a Boundary Object'.",
    description: "How distinct fields coordinate around one shared object without agreeing on its exact meaning.",
    isDescriptionVisible: true,
    metadataProvenance: "Manual seed metadata written in scripts/seed-sources.ts.",
    file: "Star, 2010 'This Is Not A Boundary Object'.pdf",
    legacySourceLabels: ["Star, This Is Not A Boundary Object"],
  },
]

/**
 * The seed PDFs are gitignored — they are published, copyrighted course readings
 * and this repo is public (see storage/readings/.gitkeep). So a fresh clone will
 * not have them, and the failure needs to name the file rather than surface as a
 * bare ENOENT from deep inside the loop.
 *
 * Read LAZILY, and that is the whole point: the passages are needed only to store a
 * file that is not stored yet. A database that already holds these readings —
 * CI's, which persists between runs, and any deployment — needs nothing from
 * disk, so seeding it is a metadata update that should not require copyrighted
 * files nobody has. Calling this eagerly is what turned the removal of those
 * PDFs from HEAD into a red `e2e` job the first time that commit reached a
 * branch CI watches.
 */
async function readSeedPdf(file: string) {
  const filePath = path.join(process.cwd(), "storage", "readings", file)
  try {
    return await readFile(filePath)
  } catch {
    throw new Error(
      `Missing seed PDF: storage/readings/${file}\n` +
        `These are not committed to the repo. Place your own copies of the three ` +
        `seed readings in storage/readings/ before running this script.`
    )
  }
}

async function run() {
  for (const reading of READINGS) {
    /**
     * By key, then — once — by title.
     *
     * The title fallback is how rows seeded before this column existed get
     * adopted rather than duplicated. It runs at most once per reading: the
     * adoption writes the key, and every later run matches on that instead, so a
     * subsequent retitle is invisible to seeding. A row that matches none of the
     * known titles is a genuinely new reading and is treated as one.
     */
    let source = (
      await db.select().from(sources).where(eq(sources.seedKey, reading.seedKey)).limit(1)
    )[0]

    if (!source) {
      for (const title of [reading.title, ...reading.alsoKnownAs]) {
        const byTitle = (
          await db.select().from(sources).where(eq(sources.title, title)).limit(1)
        )[0]
        if (!byTitle) continue
        // Already claimed by a different seed reading — adopting it would move
        // the key off a row that legitimately holds it.
        if (byTitle.seedKey) continue
        const [adopted] = await db
          .update(sources)
          .set({ seedKey: reading.seedKey })
          .where(eq(sources.id, byTitle.id))
          .returning()
        source = adopted
        console.log(`[seed-sources] Adopted "${title}" as ${reading.seedKey}.`)
        break
      }
    }

    if (!source) {
      const storageKey = `${crypto.randomUUID()}.pdf`
      await readingStorage.put(storageKey, await readSeedPdf(reading.file))

      const [inserted] = await db
        .insert(sources)
        .values({
          seedKey: reading.seedKey,
          title: reading.title,
          author: reading.author,
          sourceReference: reading.sourceReference,
          description: reading.description,
          isDescriptionVisible: reading.isDescriptionVisible,
          metadataProvenance: reading.metadataProvenance,
          storageKey,
        })
        .returning()
      source = inserted
      console.log(`[seed-sources] Registered source row for "${reading.title}".`)
    } else {
      // Existing row may reference a stale storage key from a previous local
      // run/deploy, or none at all (a reference-only card). Either way, if the
      // file is missing, re-store it and update the key.
      let hasStoredFile = !!source.storageKey
      if (source.storageKey) {
        try {
          await readingStorage.get(source.storageKey)
        } catch {
          hasStoredFile = false
        }
      }

      if (!hasStoredFile) {
        const storageKey = `${crypto.randomUUID()}.pdf`
        await readingStorage.put(storageKey, await readSeedPdf(reading.file))
        const [updated] = await db
          .update(sources)
          .set({
            storageKey,
            author: reading.author,
            sourceReference: reading.sourceReference,
            description: reading.description,
            isDescriptionVisible: reading.isDescriptionVisible,
            metadataProvenance: reading.metadataProvenance,
          })
          .where(eq(sources.id, source.id))
          .returning()
        source = updated
        console.log(`[seed-sources] Repaired missing storage file for "${reading.title}".`)
      } else {
        const [updated] = await db
          .update(sources)
          .set({
            author: reading.author,
            sourceReference: reading.sourceReference,
            description: reading.description,
            isDescriptionVisible: reading.isDescriptionVisible,
            metadataProvenance: reading.metadataProvenance,
          })
          .where(eq(sources.id, source.id))
          .returning()
        source = updated
        console.log(`[seed-sources] "${reading.title}" already exists.`)
      }
    }

    const existingPages = await db
      .select({ id: sourcePages.id })
      .from(sourcePages)
      .where(eq(sourcePages.sourceId, source.id))
      .limit(1)

    // From the STORED file rather than the local copy: by here the blob is
    // guaranteed present (just uploaded, or verified above), and it is the file
    // the app will actually serve — which is what page text has to describe.
    if (existingPages.length === 0 && source.storageKey) {
      const pages = await extractPdfPageText(await readingStorage.get(source.storageKey))
      if (pages.length > 0) {
        await db.insert(sourcePages).values(
          pages.map((p) => ({
            sourceId: source.id,
            pageNumber: p.pageNumber,
            textContent: p.textContent,
            contentHash: hashText(textLayerProjection(p.textContent)),
          }))
        )
      }
      console.log(`[seed-sources] Seeded ${pages.length} page(s) for "${reading.title}".`)
    }

    for (const legacyLabel of reading.legacySourceLabels) {
      const updated = await db
        .update(passages)
        .set({ sourceId: source.id })
        .where(eq(passages.source, legacyLabel))
        .returning({ id: passages.id })
      if (updated.length > 0) {
        console.log(`[seed-sources] Backfilled sourceId on ${updated.length} passage(s) with source="${legacyLabel}".`)
      }
    }
  }
}

run()
  .then(() => {
    console.log("[seed-sources] Done.")
    process.exit(0)
  })
  .catch((err) => {
    console.error("[seed-sources] Failed:", err)
    process.exit(1)
  })
