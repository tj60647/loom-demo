/**
 * Seeds a fresh database with the three course readings: uploads each PDF to
 * Blob storage, registers it as a `sources` row, extracts its canonical per-page
 * text into `sourcePages`, and backfills `sourceId` on any existing `bytes` rows
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
import { sources, sourcePages, bytes } from "../src/db/schema"
import { eq } from "drizzle-orm"
import { extractPdfPageText, textLayerProjection } from "../src/lib/pdfText"
import { hashText } from "../src/lib/hash"
import { readingStorage } from "../src/lib/storage"

const READINGS: {
  title: string
  author: string
  sourceReference: string
  description: string
  isDescriptionVisible: boolean
  metadataProvenance: string
  file: string
  legacySourceLabels: string[]
}[] = [
  {
    title: "Object Worlds",
    author: "Bucciarelli — Designing Engineers",
    sourceReference: "Bucciarelli, Louis L. Designing Engineers.",
    description: "Explores how different disciplines inhabit their own \"worlds\" with distinct instruments and languages.",
    isDescriptionVisible: true,
    metadataProvenance: "Manual seed metadata written in scripts/seed-sources.ts.",
    file: "Bucciarelli-Designing Engineers.pdf",
    legacySourceLabels: ["Bucciarelli, Designing Engineers"],
  },
  {
    title: "Communities of Practice",
    author: "Wenger",
    sourceReference: "Wenger, Etienne. Communities of Practice.",
    description: "Details how shared vocabularies are learned by participating in a community.",
    isDescriptionVisible: true,
    metadataProvenance: "Manual seed metadata written in scripts/seed-sources.ts.",
    file: "Wenger_communities-of-practice.pdf",
    legacySourceLabels: ["Wenger, Communities of Practice"],
  },
  {
    title: "Boundary Objects",
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
    const buffer = await readSeedPdf(reading.file)
    const existing = await db
      .select()
      .from(sources)
      .where(eq(sources.title, reading.title))
      .limit(1)

    let source = existing[0]

    if (!source) {
      const storageKey = `${crypto.randomUUID()}.pdf`
      await readingStorage.put(storageKey, buffer)

      const [inserted] = await db
        .insert(sources)
        .values({
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
        await readingStorage.put(storageKey, buffer)
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

    if (existingPages.length === 0) {
      const pages = await extractPdfPageText(buffer)
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
        .update(bytes)
        .set({ sourceId: source.id })
        .where(eq(bytes.source, legacyLabel))
        .returning({ id: bytes.id })
      if (updated.length > 0) {
        console.log(`[seed-sources] Backfilled sourceId on ${updated.length} byte(s) with source="${legacyLabel}".`)
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
