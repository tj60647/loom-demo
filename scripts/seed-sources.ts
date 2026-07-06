/**
 * One-time migration: registers the three PDFs that used to live in
 * public/readings (now storage/readings, served only via the authenticated
 * /api/readings/[sourceId] route) as `sources` rows, extracts their
 * canonical per-page text into `sourcePages`, and backfills `sourceId` on
 * any existing `bytes` rows that reference them by their old free-text
 * `source` label.
 *
 * Usage: npx tsx scripts/seed-sources.ts
 * Requires DATABASE_URL to be set (via .env.local).
 */
import { readFile } from "fs/promises"
import path from "path"
import { db } from "../src/db"
import { sources, sourcePages, bytes } from "../src/db/schema"
import { eq } from "drizzle-orm"
import { extractPdfPageText } from "../src/lib/pdfText"
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

async function run() {
  for (const reading of READINGS) {
    const filePath = path.join(process.cwd(), "storage", "readings", reading.file)
    const buffer = await readFile(filePath)
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
      // run/deploy. If the file is missing, re-store it and update the key.
      let hasStoredFile = true
      try {
        await readingStorage.get(source.storageKey)
      } catch {
        hasStoredFile = false
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
            contentHash: hashText(p.textContent),
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
