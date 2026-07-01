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

const READINGS: { title: string; author: string; description: string; file: string; legacySourceLabels: string[] }[] = [
  {
    title: "Object Worlds",
    author: "Bucciarelli — Designing Engineers",
    description: "Explores how different disciplines inhabit their own \"worlds\" with distinct instruments and languages.",
    file: "Bucciarelli-Designing Engineers.pdf",
    legacySourceLabels: ["Bucciarelli, Designing Engineers"],
  },
  {
    title: "Communities of Practice",
    author: "Wenger",
    description: "Details how shared vocabularies are learned by participating in a community.",
    file: "Wenger_communities-of-practice.pdf",
    legacySourceLabels: ["Wenger, Communities of Practice"],
  },
  {
    title: "Boundary Objects",
    author: "Star, 2010 — 'This Is Not A Boundary Object'",
    description: "How distinct fields coordinate around one shared object without agreeing on its exact meaning.",
    file: "Star, 2010 'This Is Not A Boundary Object'.pdf",
    legacySourceLabels: ["Star, This Is Not A Boundary Object"],
  },
]

async function run() {
  for (const reading of READINGS) {
    const existing = await db.select().from(sources).where(eq(sources.title, reading.title)).limit(1)
    if (existing.length > 0) {
      console.log(`[seed-sources] "${reading.title}" already exists, skipping.`)
      continue
    }

    const filePath = path.join(process.cwd(), "storage", "readings", reading.file)
    const buffer = await readFile(filePath)

    const storageKey = `${crypto.randomUUID()}.pdf`
    await readingStorage.put(storageKey, buffer)

    const [source] = await db.insert(sources).values({
      title: reading.title,
      author: reading.author,
      description: reading.description,
      storageKey,
    }).returning()

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
    console.log(`[seed-sources] Registered "${reading.title}" (${pages.length} pages).`)

    for (const legacyLabel of reading.legacySourceLabels) {
      const updated = await db.update(bytes)
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
