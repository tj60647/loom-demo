/**
 * Registers any PDF on disk as a library reading, for local development:
 * stores the bytes via readingStorage (the local-file fallback when no Blob
 * token is set), extracts canonical per-page text so highlight offsets anchor
 * precisely, and publishes it to the first course so it appears in the
 * learner-facing Library.
 *
 * Usage: npx tsx scripts/add-local-reading.ts <path-to.pdf> [title]
 */
import { readFile } from "fs/promises"
import path from "path"
import { asc, eq } from "drizzle-orm"
import { db } from "../src/db"
import { courses, courseSources, sources, sourcePages } from "../src/db/schema"
import { extractPdfPageText } from "../src/lib/pdfText"
import { hashText } from "../src/lib/hash"
import { readingStorage } from "../src/lib/storage"

async function run() {
  const [file, titleArg] = process.argv.slice(2)
  if (!file) {
    console.error("usage: npx tsx scripts/add-local-reading.ts <path-to.pdf> [title]")
    process.exit(1)
  }
  const buffer = await readFile(file)
  if (!buffer.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
    throw new Error(`${file} is not a PDF (missing %PDF- magic bytes)`)
  }
  const title = titleArg || path.basename(file, path.extname(file))

  const existing = await db.select().from(sources).where(eq(sources.title, title)).limit(1)
  if (existing.length > 0) {
    throw new Error(`A source titled "${title}" already exists — pass a different title.`)
  }

  const storageKey = `${crypto.randomUUID()}.pdf`
  await readingStorage.put(storageKey, buffer)
  const [source] = await db
    .insert(sources)
    .values({ title, storageKey, metadataProvenance: "Registered by scripts/add-local-reading.ts." })
    .returning()

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

  const [course] = await db.select().from(courses).orderBy(asc(courses.createdAt)).limit(1)
  if (course) {
    await db.insert(courseSources).values({ courseId: course.id, sourceId: source.id })
  }
  console.log(
    `[add-local-reading] "${title}" registered${course ? ` and published to "${course.name}"` : " (no course exists to publish to)"} — ${pages.length} page(s) extracted.`
  )
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[add-local-reading] Failed:", err)
    process.exit(1)
  })
